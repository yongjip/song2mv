"""Align every whisper run to the lyric sheet and merge the runs into one time per lyric word.

Each run is matched to the whole sheet in order (lib.align: difflib, and a global alignment where difflib put a
repeated chorus on its other copy). In each run, the whisper word that a lyric line's first word matched is first cut
to the run's median word duration: whisper hears the pause before a line as part of that word (trim_first_words).
Then, for each line:
  1. a run takes part only if it matched at least half of the line's characters (a run that skipped
     the line, or caught two syllables of it by chance, stays out);
  2. runs whose line start is far (> 1 s) from the others are dropped — a run that missed chorus 1 can
     match chorus-1 lyrics to chorus-2 audio. With three or more runs the reference is the median start,
     with two it is the run that matched more of the line;
  3. each word takes the median time over the remaining runs.
Last, lines are kept in the sheet's order (keep_order): a line that starts before the lines above it, or after the
lines below it, is merged again from the runs that placed it between them, if any did.
Lines no run could place keep `wt` all None; reprompt.py listens to those gaps again. A word no run timed inside a
placed line is None too, and build_lyrics.py spreads it between the words around it; where those are far apart, that
is a guess (holes), and check_by_ear lists the line, as it does a line whose runs disagree on its start or on a
word's time (doubt), and a line two runs hear alike but not as the sheet has it (sung_differently). Words that two
runs agree on and no line matched are heard off the sheet (off_sheet), and where the sheet and the audio's lyrics tag
differ, sheet_vs_tag says which one the runs support.

Usage: python -m song2mv.timing.align work/lyrics.txt work/asr/run1.json work/asr/run2.json ... --out work/merged.json
"""
from __future__ import annotations

import argparse
import difflib
import json
import statistics

from .lib import ORDER_SLACK, align, in_order, norm, parse_lyrics, write_json

MIN_COVERAGE = 0.5
MAX_SPREAD = 1.0
FIRST_WORD = 1.0  # a line's first whisper word is cut to this many median word durations of its run (0: not cut)
MAX_MEDIAN = 0.7  # faster-whisper caps the median word duration at 0.7 s when it shortens words itself
HOLE = 1.0  # words no run timed, between timed words more than this many seconds apart per word, are a guess
DISAGREE = 0.7  # seconds between the earliest and the latest start the kept runs give a line
UNSUPPORTED = 0.5  # seconds from a word's merged time to the nearest time a kept run gives that word
OFF_SHEET = 1.5  # seconds of words that two runs agree on and no lyric line matched: reported as heard off the sheet
JOIN = 1.0  # words a run heard closer together than this (seconds) are one stretch
SUNG = 0.7  # below this difflib ratio between a line's letters and what the runs heard over it, they heard it differently
AGREE = 0.9  # at or above it, two runs heard a line alike, or heard it as written


def trim_first_words(lines: list[dict], words: list[dict]) -> list[dict]:
    """Whisper leaves no gap between words, so the pause before a sung line becomes part of the line's first word: the
    word ends where it is sung but starts where the word before it ended. On the JamendoLyrics benchmark that word
    started a median 0.34 s early while its end was 0.07 s off, and half of all lines started more than 0.3 s off
    (docs/benchmark.md). faster-whisper shortens such a word only after a sentence-end mark or a pause between
    segments, and lyric lines rarely end in one.

    So the whisper word each lyric line's first word matched is cut to FIRST_WORD × the run's median word duration (at
    most 0.7 s), keeping its end. A first word that really is sung long now starts late. The duration was chosen on
    the benchmark's English songs and checked on the German, Spanish and French ones. Returns new words; `words` is
    not changed."""
    d = [w["e"] - w["s"] for w in words if w["e"] > w["s"]]
    longest = FIRST_WORD * min(MAX_MEDIAN, statistics.median(d)) if d else 0.0
    if not longest:
        return words
    first, _ = align(lines, words, word_index=True)  # the index of the whisper word each line's first word matched
    out = [dict(w) for w in words]
    for li in range(len(lines)):
        if (li, 0) in first:
            w = out[int(first[(li, 0)])]
            if w["e"] - w["s"] > longest:
                w["s"] = round(w["e"] - longest, 3)
    return out


def _merge_line(ln: dict, cands: list[dict], cov: list[float]) -> dict:
    """One lyric line from the runs that placed it (steps 1–3 above)."""
    n = len(ln["words"])
    good = [c for c in cands if c["cov"] >= MIN_COVERAGE]
    if not good and cands:  # nothing convincing: keep the best partial match, flagged by its low coverage
        good = [max(cands, key=lambda c: c["cov"])]
    rec: dict = dict(ln, coverage=cov, runs_used=[], heard=[], spread=None, unsupported=None, wt=[None] * n, source=None)
    if good:
        if len(good) >= 3:
            ref = statistics.median_low([c["start"] for c in good])
        else:
            ref = max(good, key=lambda c: (c["cov"], -c["run"]))["start"]
        kept = [c for c in good if abs(c["start"] - ref) <= MAX_SPREAD]
        rec["wt"] = [round(statistics.median(v), 3) if (v := [c["ts"][wi] for c in kept if c["ts"][wi] is not None]) else None
                     for wi in range(n)]
        far = [(min(abs(t - c["ts"][wi]) for c in kept if c["ts"][wi] is not None), wi) for wi, t in enumerate(rec["wt"])
               if t is not None]
        worst = max(far, default=(0.0, 0))
        rec["unsupported"] = [worst[1], round(worst[0], 3)] if worst[0] > 0.001 else None
        rec["runs_used"] = [c["run"] for c in kept]
        rec["heard"] = [c["heard"] for c in kept]
        rec["spread"] = round(max(c["start"] for c in kept) - min(c["start"] for c in kept), 2)
        rec["source"] = "asr"
    return rec


def _start(rec: dict) -> float | None:
    known = [t for t in rec["wt"] if t is not None]
    return min(known) if known else None


def keep_order(lines: list[dict], merged: list[dict], cands: list[list[dict]]) -> list[dict]:
    """Lines are sung in the order of the sheet, give or take ORDER_SLACK. Runs that disagree on which copy of a
    repeated line they heard can still leave a merged line on another copy: then it starts before the lines above it,
    or after the lines below it. Such a line, off the longest chain of lines in order (lib.in_order), is merged again
    from only the runs that placed it between its neighbours on the chain. If none did, it stays where it is, and
    check_by_ear lists it. merged.json notes the move in `reordered` (the start it had)."""
    starts = [_start(r) for r in merged]
    chain = in_order(starts, ORDER_SLACK)
    out = list(merged)
    for li, s in enumerate(starts):
        if s is None or li in chain:
            continue
        above = [_start(out[k]) for k in range(li) if k in chain or "reordered" in out[k]]
        below = [starts[k] for k in range(li + 1, len(lines)) if k in chain]
        lo = above[-1] - ORDER_SLACK if above and above[-1] is not None else float("-inf")
        hi = below[0] + ORDER_SLACK if below and below[0] is not None else float("inf")
        fits = [c for c in cands[li] if lo <= c["start"] <= hi]
        if fits:
            out[li] = dict(_merge_line(lines[li], fits, merged[li]["coverage"]), reordered=s)
    return out


def merge_runs(lines: list[dict], runs: list[dict], heard: list[set[int]] | None = None) -> list[dict]:
    """The lyric lines with their merged word times. `heard` gets, per run, the indices of the words that matched a
    letter of the sheet."""
    per_run, said = [], []
    for r in runs:
        matched: set[int] = set()
        spans: dict[int, list[int]] = {}
        per_run.append(align(lines, trim_first_words(lines, r["words"]), heard=matched, spans=spans))
        said.append({li: " ".join(w["t"] for w in r["words"][a:b + 1]) for li, (a, b) in spans.items()})
        if heard is not None:
            heard.append(matched)
    out, cands = [], []
    for li, ln in enumerate(lines):
        n = len(ln["words"])
        cov = [round(c.get(li, 0.0), 2) for _, c in per_run]
        cs = []
        for k, (first, c) in enumerate(per_run):
            ts = [first.get((li, wi)) for wi in range(n)]
            if any(t is not None for t in ts):
                cs.append({"run": k + 1, "cov": c.get(li, 0.0), "ts": ts, "start": min(t for t in ts if t is not None),
                           "heard": said[k].get(li, "")})
        cands.append(cs)
        out.append(_merge_line(ln, cs, cov))
    return keep_order(lines, out, cands)


def _unmatched(words: list[dict], matched: set[int]) -> list[list[int]]:
    """Indices of the words of one run that matched no letter of the sheet, in stretches: a matched word or JOIN
    seconds without a word ends one. Numbers are left out: whisper writes "ten" as 10."""
    out: list[list[int]] = []
    last = None
    for i, w in enumerate(words):
        if i in matched:
            last = None
        elif norm(w["t"]) and not norm(w["t"]).isdigit():
            if last is None or w["s"] - words[last]["e"] > JOIN:
                out.append([])
            out[-1].append(i)
            last = i
    return out


def _within(words: list[dict], idx: list[int], a: float, b: float) -> list[int]:
    return [i for i in idx if a <= (words[i]["s"] + words[i]["e"]) / 2 <= b]


def _same_words(x: str, y: str) -> bool:
    """Two runs heard the same words: at least half the letters of the shorter match, in runs of two or more."""
    common = sum(n for *_, n in difflib.SequenceMatcher(None, x, y, autojunk=False).get_matching_blocks() if n >= 2)
    return min(len(x), len(y)) >= 2 and common >= 0.5 * min(len(x), len(y))


def off_sheet(runs: list[dict], heard: list[set[int]], lines: list[dict]) -> list[dict]:
    """Stretches of at least OFF_SHEET seconds where two or more runs agree on two or more words that matched no line
    of the lyric sheet: a chant or an ad-lib the sheet leaves out, a line sung differently, a repeat the sheet has
    once, or a line of the sheet the merge placed elsewhere. A stretch is left out when it holds at least half as many
    words of the timed lines (`lines`, as in lyrics.json) as words heard: there the runs misheard the sheet's own
    lines. [{from, to, runs, words, after}] in song time; `words` is what one of the runs heard, `after` the id of the
    last line that starts before the stretch (None before the first)."""
    unmatched = [_unmatched(r["words"], h) for r, h in zip(runs, heard)]
    spans = [(k, idx) for k, parts in enumerate(unmatched) for idx in parts]
    agreed = []
    for n, (ka, ia) in enumerate(spans):
        wa = runs[ka]["words"]
        for kb, ib in spans[n + 1:]:
            wb = runs[kb]["words"]
            a, b = max(wa[ia[0]]["s"], wb[ib[0]]["s"]), min(wa[ia[-1]]["e"], wb[ib[-1]]["e"])
            if kb != ka and b > a and _same_words("".join(norm(wa[i]["t"]) for i in _within(wa, ia, a, b)),
                                                  "".join(norm(wb[i]["t"]) for i in _within(wb, ib, a, b))):
                agreed.append([a, b, {ka, kb}])
    stretches: list[list] = []
    for a, b, ks in sorted(agreed, key=lambda x: x[0]):
        if stretches and a <= stretches[-1][1]:
            stretches[-1][1] = max(stretches[-1][1], b)
            stretches[-1][2] |= ks
        else:
            stretches.append([a, b, ks])
    timed = [w["t"] for r in lines for w in r["words"]]
    out = []
    for a, b, ks in stretches:
        words = {k: [runs[k]["words"][i]["t"] for idx in unmatched[k] for i in _within(runs[k]["words"], idx, a, b)]
                 for k in ks}
        k = max(sorted(ks), key=lambda k: len(norm("".join(words[k]))))
        if b - a < OFF_SHEET or len(words[k]) < 2 or 2 * sum(a <= t <= b for t in timed) >= len(words[k]):
            continue
        before = [r for r in lines if r["start"] <= a]
        out.append({"from": round(a, 2), "to": round(b, 2), "runs": [k + 1 for k in sorted(ks)], "words": " ".join(words[k]),
                    "after": max(before, key=lambda r: r["start"])["id"] if before else None})
    return out


def sung_differently(merged: list[dict]) -> list[dict]:
    """Repeated lines sung differently in one place: two or more runs hear a line alike (the letters of what each heard
    from the line's first matched word to its last within AGREE of each other, as a difflib ratio) and not as the sheet
    has it (below SUNG), while they hear another line with the same text as written (AGREE or more). Suno changes a
    repeat ("Back it, back it up" where its tag says "Beep, beep" again), and neither the off-sheet stretches nor a
    second sheet see it: the line's last words match, so it is placed where it is sung. Whisper also mishears a line
    the same way in every run, and without the same line heard right elsewhere that is far more common than a changed
    line: on the JamendoLyrics benchmark, whose lyric files hold what is sung, 44 lines heard alike and below SUNG,
    10 with a copy heard as written. Lines whose runs heard a number are left out: whisper writes "ten" as 10.
    [{id, heard, runs, as_written}], `heard` as the first of those runs wrote it, `as_written` the other line."""
    seen = {}
    for r in merged:
        heard = [h for h in r.get("heard") or [] if norm(h)]
        if r.get("source") == "asr" and heard and not any(c.isdigit() for h in heard for c in norm(h)):
            seen[r["id"]] = [norm(h) for h in heard]

    def best(r):
        return max(_ratio(norm(r["text"]), h) for h in seen[r["id"]])
    out = []
    for r in merged:
        letters = seen.get(r["id"]) or []
        if len(letters) < 2 or not all(_ratio(a, b) >= AGREE for i, a in enumerate(letters) for b in letters[i + 1:]):
            continue
        if best(r) >= SUNG:
            continue
        twin = next((o for o in merged if o is not r and o["id"] in seen and norm(o["text"]) == norm(r["text"])
                     and best(o) >= AGREE), None)
        if twin:
            out.append({"id": r["id"], "heard": next(h for h in r["heard"] if norm(h)), "runs": r["runs_used"],
                        "as_written": twin["id"]})
    return out


def _ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def _quote(lines: list[dict]) -> str:
    text = " / ".join(r["text"] for r in lines)
    return f'"{text if len(text) <= 80 else text[:79] + "…"}"'


def _ids(lines: list[dict]) -> str:
    return lines[0]["id"] + (f"–{lines[-1]['id']}" if len(lines) > 1 else "")


def _difference(sheet: list[dict], tag: list[dict], a: list[str], b: list[str], op: tuple) -> str:
    """One place where the sheet (a: its lines' letters) and the tag (b) differ, in words."""
    _, i1, i2, j1, j2 = op
    if i1 == i2:
        n = j2 - j1
        for at in (i1 - n, i1):
            if at >= 0 and a[at:at + n] == b[j1:j2]:
                return f"the audio's lyrics tag repeats {_ids(sheet[at:at + n])} {_quote(sheet[at:at + n])}, which the lyric sheet has once"
        where = f"after {sheet[i1 - 1]['id']}" if i1 else f"before {sheet[0]['id']}"
        return f"the audio's lyrics tag has {n} line{'s' * (n > 1)} the lyric sheet does not, {where}: {_quote(tag[j1:j2])}"
    if j1 == j2:
        n = i2 - i1
        if (i1 >= n and a[i1 - n:i1] == a[i1:i2]) or a[i2:i2 + n] == a[i1:i2]:
            return f"the lyric sheet repeats {_ids(sheet[i1:i2])} {_quote(sheet[i1:i2])}, which the audio's lyrics tag has once"
        return f"the lyric sheet has {_ids(sheet[i1:i2])} {_quote(sheet[i1:i2])}, which the audio's lyrics tag does not"
    return f"the lyric sheet has {_ids(sheet[i1:i2])} {_quote(sheet[i1:i2])} where the audio's lyrics tag has {_quote(tag[j1:j2])}"


def sheet_vs_tag(sheet: list[dict], tag: list[dict], runs: list[dict]) -> list[str]:
    """Where the lyric sheet and the audio's lyrics tag differ, and which of the two the whisper runs support there:
    one message per place, for the warnings. Each version is aligned to every run; around each place, a letter the
    runs matched counts +1 and a letter they left out −1, and the version that scores clearly higher (by a quarter of
    the letters that differ) is the one the runs heard. Lines that differ only in case or punctuation are the same."""
    a, b = [norm(r["text"]) for r in sheet], [norm(r["text"]) for r in tag]
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
    places = [n for n, op in enumerate(ops) if op[0] != "equal"]
    if not places or not runs:
        return []
    cov = {"sheet": [align(sheet, r["words"])[1] for r in runs], "tag": [align(tag, r["words"])[1] for r in runs]}

    def score(which, lines, lo, hi):
        return sum((2 * c.get(i, 0.0) - 1) * len(norm(lines[i]["text"])) for c in cov[which] for i in range(lo, hi)) / len(runs)

    out, votes = [], {"sheet": 0, "tag": 0, None: 0}
    for n in places:
        _, i1, i2, j1, j2 = ops[n]
        # the equal lines around the place count too, up to its size: with repeated lines, which copy the
        # difference is in is a guess
        k = max(i2 - i1, j2 - j1)
        before = min(k, ops[n - 1][2] - ops[n - 1][1]) if n and ops[n - 1][0] == "equal" else 0
        after = min(k, ops[n + 1][2] - ops[n + 1][1]) if n + 1 < len(ops) and ops[n + 1][0] == "equal" else 0
        d = score("tag", tag, j1 - before, j2 + after) - score("sheet", sheet, i1 - before, i2 + after)
        size = max(sum(map(len, a[i1:i2])), sum(map(len, b[j1:j2])))
        side = "tag" if d > size / 4 else "sheet" if d < -size / 4 else None
        votes[side] += 1
        if len(out) == 3 and len(places) > 4:
            continue
        out.append(f"{_difference(sheet, tag, a, b, ops[n])}; the whisper runs support "
                   f"{'the ' + side if side else 'neither clearly'} here")
    if len(places) > 4:
        out.append(f"the lyric sheet and the audio's lyrics tag differ in {len(places) - 3} more places; in all "
                   f"{len(places)}, the whisper runs support the sheet in {votes['sheet']}, the tag in {votes['tag']} and "
                   f"neither clearly in {votes[None]}")
    return out


def holes(wt: list[float | None]) -> list[tuple[int, int]]:
    """(a, b) for each pair of timed words a < b of a line with words no run timed between them and more than HOLE s
    apart per word. build_lyrics spreads those words evenly between a and b; on the JamendoLyrics benchmark 2–8 % of
    such words were then more than 1 s off, but half of them where a and b were more than 1 s apart per word (a held
    note, or a wrong time on one side). Words before a line's first timed word or after its last are not counted."""
    known = [(k, t) for k, t in enumerate(wt) if t is not None]
    return [(ka, kb) for (ka, ta), (kb, tb) in zip(known, known[1:]) if kb - ka > 1 and tb - ta > HOLE * (kb - ka)]


def doubt(r: dict) -> str | None:
    """Why the merge doubts a whisper line's word times, or None: a word no run timed between words far apart (holes);
    a word whose merged time is more than UNSUPPORTED s from every kept run's time for it, where two runs disagree on
    it and the median is their middle; or kept runs whose starts for the line disagree by more than DISAGREE s, such as
    one run timing a first word the others missed. On the JamendoLyrics benchmark, 47 of the 54 lines the last two
    add to check_by_ear have a word more than 0.3 s off; of all lines, 37 % have (docs/benchmark.md)."""
    if hs := holes(r["wt"]):
        a, b = hs[0]
        return f"no run timed \"{' '.join(r['words'][a + 1:b])}\", {r['wt'][b] - r['wt'][a]:.1f} s between the words around it"
    if r.get("unsupported") and r["unsupported"][1] > UNSUPPORTED:
        k, d = r["unsupported"]
        return f"no run times \"{r['words'][k]}\" near {r['wt'][k]:.2f}: the nearest is {d:.1f} s away"
    if (r.get("spread") or 0) > DISAGREE:
        return f"runs disagree by {r['spread']} s"
    return None


def report(merged: list[dict], n_runs: int) -> None:
    cur = None
    for r in merged:
        if r["section"] != cur:
            cur = r["section"]
            print(f"  ── [{r['section_name'] or cur}] → {cur} ({r['kind']})")
        known = [t for t in r["wt"] if t is not None]
        s = f"{min(known):7.2f}" if known else "      ?"
        flag = ""
        if not known:
            flag = "  ◀ no run found this line"
        elif "reordered" in r:
            flag = f"  ◀ back in lyric order (was at {r['reordered']:.2f})"
        elif len(r["runs_used"]) < max(2, n_runs // 2 + 1) and n_runs > 1:
            flag = f"  ◀ only run {r['runs_used']}"
        elif why := doubt(r):
            flag = f"  ◀ {why}"
        elif r["spread"] and r["spread"] > 0.4:
            flag = f"  ◀ runs disagree by {r['spread']} s"
        print(f"  {r['id']:7s} {s}  cov {' '.join(f'{c:.1f}' for c in r['coverage'])}  {r['text'][:40]}{flag}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lyrics")
    ap.add_argument("runs", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--keep-parenthesized-in", nargs="*", default=[])
    a = ap.parse_args()
    lines = parse_lyrics(a.lyrics, {"keep_parenthesized_in": a.keep_parenthesized_in})
    runs = [json.load(open(p, encoding="utf-8")) for p in a.runs]
    merged = merge_runs(lines, runs)
    write_json({"lines": merged}, a.out)
    report(merged, len(runs))
