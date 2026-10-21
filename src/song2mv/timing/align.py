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
is a guess (holes), and check_by_ear lists the line.

Usage: python -m song2mv.timing.align work/lyrics.txt work/asr/run1.json work/asr/run2.json ... --out work/merged.json
"""
from __future__ import annotations

import argparse
import json
import statistics

from .lib import ORDER_SLACK, align, in_order, parse_lyrics, write_json

MIN_COVERAGE = 0.5
MAX_SPREAD = 1.0
FIRST_WORD = 1.0  # a line's first whisper word is cut to this many median word durations of its run (0: not cut)
MAX_MEDIAN = 0.7  # faster-whisper caps the median word duration at 0.7 s when it shortens words itself
HOLE = 1.0  # words no run timed, between timed words more than this many seconds apart per word, are a guess


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
    rec: dict = dict(ln, coverage=cov, runs_used=[], spread=None, wt=[None] * n, source=None)
    if good:
        if len(good) >= 3:
            ref = statistics.median_low([c["start"] for c in good])
        else:
            ref = max(good, key=lambda c: (c["cov"], -c["run"]))["start"]
        kept = [c for c in good if abs(c["start"] - ref) <= MAX_SPREAD]
        rec["wt"] = [round(statistics.median(v), 3) if (v := [c["ts"][wi] for c in kept if c["ts"][wi] is not None]) else None
                     for wi in range(n)]
        rec["runs_used"] = [c["run"] for c in kept]
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


def merge_runs(lines: list[dict], runs: list[dict]) -> list[dict]:
    per_run = [align(lines, trim_first_words(lines, r["words"])) for r in runs]
    out, cands = [], []
    for li, ln in enumerate(lines):
        n = len(ln["words"])
        cov = [round(c.get(li, 0.0), 2) for _, c in per_run]
        cs = []
        for k, (first, c) in enumerate(per_run):
            ts = [first.get((li, wi)) for wi in range(n)]
            if any(t is not None for t in ts):
                cs.append({"run": k + 1, "cov": c.get(li, 0.0), "ts": ts, "start": min(t for t in ts if t is not None)})
        cands.append(cs)
        out.append(_merge_line(ln, cs, cov))
    return keep_order(lines, out, cands)


def holes(wt: list[float | None]) -> list[tuple[int, int]]:
    """(a, b) for each pair of timed words a < b of a line with words no run timed between them and more than HOLE s
    apart per word. build_lyrics spreads those words evenly between a and b; on the JamendoLyrics benchmark 2–8 % of
    such words were then more than 1 s off, but half of them where a and b were more than 1 s apart per word (a held
    note, or a wrong time on one side). Words before a line's first timed word or after its last are not counted."""
    known = [(k, t) for k, t in enumerate(wt) if t is not None]
    return [(ka, kb) for (ka, ta), (kb, tb) in zip(known, known[1:]) if kb - ka > 1 and tb - ta > HOLE * (kb - ka)]


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
        elif hs := holes(r["wt"]):
            a, b = hs[0]
            flag = f"  ◀ no run timed \"{' '.join(r['words'][a + 1:b])}\", {r['wt'][b] - r['wt'][a]:.1f} s between the words around it"
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
