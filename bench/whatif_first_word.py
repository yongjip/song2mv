"""What-if for docs/benchmark.md: shorten the whisper word each lyric line starts with, then merge and snap as sync does.

Whisper leaves no gap between words, so the pause before a line becomes part of the line's first word: the word
ends where it is sung but starts where the word before it ended. faster-whisper shortens such a word to twice the
median word duration itself, but only after a sentence-end mark or a pause between segments, and lyric lines
rarely end in one.

The rule measured here: in each whisper run, the word that a lyric line's first word was matched to is shortened to
FACTOR × the run's median word duration (at most 0.7 s, as faster-whisper caps it), keeping its end. FACTOR 1 was
chosen on the 20 English songs (2 and 1.5 were also tried) and then run unchanged on the 59 others. Everything else
is sync's own code on the cached work folders of bench/jamendolyrics.py: merge_runs, the re-heard gaps, estimates
and snapping. Nothing is transcribed, so a line the runs left unplaced keeps what sync's re-listening gave it. The
same code without the change must reproduce lyrics.json exactly; the script stops if it does not.

  python -I bench/whatif_first_word.py                 # every song with a finished run, per language
  python -I bench/whatif_first_word.py --lang en --factor 2
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I leaves the script's folder off the path
import jamendolyrics as bench  # noqa: E402

HELD_OUT = "de+es+fr"  # the songs the rule was not chosen on


def groups(song: dict) -> list[str]:
    return [song["lang"], *([HELD_OUT] if song["lang"] != "en" else []), "all"]


def shorten_first_words(lines: list[dict], run: dict, factor: float) -> dict:
    from song2mv.timing import lib
    words = [dict(w) for w in run["words"]]
    first, _ = lib.align(lines, words)
    d = [w["e"] - w["s"] for w in words if w["e"] > w["s"]]
    longest = factor * min(0.7, statistics.median(d)) if d else 0.0
    for li in range(len(lines)):
        t = first.get((li, 0))  # the time of the line's first matched letter lies inside the whisper word it came from
        w = next((w for w in words if w["s"] - 1e-6 <= t <= w["e"] + 1e-6), None) if t is not None else None
        if w is not None and longest and w["e"] - w["s"] > longest:
            w["s"] = round(w["e"] - longest, 3)
    return dict(run, words=words)


def variant(work: str, factor: float | None) -> list[dict]:
    """Final lines for a work folder, with the first words shortened (factor) or as sync made them (None)."""
    from song2mv.timing import lib
    from song2mv.timing.align import merge_runs
    cfg, heard, grid, end_song = bench.refill(work)
    lines = lib.parse_lyrics(os.path.join(work, "lyrics.txt"), cfg)
    runs = [json.load(open(os.path.join(work, "asr", f"run{k}.json"), encoding="utf-8")) for k in range(1, int(cfg["whisper"]["runs"]) + 1)]
    if factor is not None:
        runs = [shorten_first_words(lines, r, factor) for r in runs]
    with contextlib.redirect_stdout(io.StringIO()):
        merged = merge_runs(lines, runs)
    heard = {r["id"]: r for r in heard}
    for r in merged:  # lines no run placed: what sync's re-listening heard (its windows depend on the neighbours' times)
        if not any(t is not None for t in r["wt"]) and heard[r["id"]].get("source") == "reprompt":
            r["wt"], r["source"] = list(heard[r["id"]]["wt"]), "reprompt"
    return bench.finish_lines(merged, cfg, grid, end_song)


def errors(song: dict, lines: list[dict]) -> dict:
    ref = bench.reference(song)
    out = {"words": [], "first": [], "starts": []}
    for r, x in zip(lines, ref, strict=True):
        if r["text"] != x["text"]:
            raise SystemExit(f"{song['name']} {r['id']}: line text differs from the reference — run bench/jamendolyrics.py first")
        for k, (w, rw) in enumerate(zip(r["words"], x["words"], strict=True)):
            out["words"].append(w["t"] - rw["s"])
            if k == 0:
                out["first"].append(w["t"] - rw["s"])
        out["starts"].append(r["start"] - x["words"][0]["s"])
    return out


def spans(song: dict, work: str) -> dict:
    """Per whisper run, for each lyric word a run placed (lines the run matched at least half of): the start and end
    of the whisper word its time came from, minus the annotated start and end. Split into lines' first words and
    the rest."""
    from song2mv.timing import lib
    cfg = lib.load_config(os.path.join(work, "song.json"))
    lines, ref = lib.parse_lyrics(os.path.join(work, "lyrics.txt"), cfg), bench.reference(song)
    out = {"first": [], "later": []}
    for k in range(1, int(cfg["whisper"]["runs"]) + 1):
        words = json.load(open(os.path.join(work, "asr", f"run{k}.json"), encoding="utf-8"))["words"]
        first, cov = lib.align(lines, words)
        for li, x in enumerate(ref):
            if cov.get(li, 0) < 0.5:
                continue
            for wi, rw in enumerate(x["words"]):
                t = first.get((li, wi))
                w = next((w for w in words if w["s"] - 1e-6 <= t <= w["e"] + 1e-6), None) if t is not None else None
                if w is not None:
                    out["first" if wi == 0 else "later"].append((w["s"] - rw["s"], w["e"] - rw["e"], w["e"] - w["s"], rw["e"] - rw["s"]))
    return out


def row(e: dict) -> dict:
    s, f, n = bench.stats(e["words"]), bench.stats(e["first"]), len(e["starts"])
    return {"words": s["n"], "mean": s["mean"], "median": s["median"], "le0.1": s["le0.1"], "le0.3": s["le0.3"], "le1": s["le1"],
            "first_le0.3": f["le0.3"], "lines": n, "off_0.3": sum(abs(x) > bench.WRONG for x in e["starts"]),
            "early_0.3": sum(x < -bench.WRONG for x in e["starts"]), "late_0.3": sum(x > bench.WRONG for x in e["starts"]),
            "off_1": sum(abs(x) > bench.BAD for x in e["starts"])}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/song2mv-bench"))
    ap.add_argument("--lang", nargs="+", default=list(bench.LANGS.values()), choices=list(bench.LANGS.values()))
    ap.add_argument("--factor", type=float, default=1.0, help="longest first word, in median word durations (default 1)")
    a = ap.parse_args()
    data, runs = os.path.join(a.cache, "jamendolyrics"), os.path.join(a.cache, "runs")
    acc: dict = {}
    seen: dict = {}
    for s in bench.songs(data, a.lang, None):
        work = os.path.join(runs, s["name"])
        rec = os.path.join(work, "bench", "run.json")
        if not os.path.exists(rec) or not json.load(open(rec, encoding="utf-8")).get("ok"):
            continue
        now = variant(work, None)
        real = json.load(open(os.path.join(work, "lyrics.json"), encoding="utf-8"))["lines"]
        if [[w["t"] for w in r["words"]] for r in now] != [[w["t"] for w in r["words"]] for r in real]:
            raise SystemExit(f"{s['name']}: the unchanged rebuild does not reproduce lyrics.json")
        for key, lines in (("now", now), ("shortened", variant(work, a.factor))):
            e = errors(s, lines)
            for lang in groups(s):
                d = acc.setdefault(lang, {}).setdefault(key, {"words": [], "first": [], "starts": [], "songs": 0})
                for k in ("words", "first", "starts"):
                    d[k] += e[k]
                d["songs"] += 1
        for kind, rows in spans(s, work).items():
            for lang in groups(s):
                seen.setdefault(lang, {}).setdefault(kind, []).extend(rows)
    present = [lg for lg in bench.LANGS.values() if lg in acc]
    langs = present + [HELD_OUT] * (sum(lg != "en" for lg in present) > 1) + ["all"] * (len(present) > 1)
    print("| whisper word vs annotated word, per run | words | start: median, s | start within 0.3 s | end: median, s | "
          "end within 0.3 s | duration: whisper / annotated (median), s |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    within = lambda xs: sum(abs(x) <= bench.WRONG for x in xs) / len(xs)  # noqa: E731
    for lang in langs:
        for kind, label in (("first", "a line's first word"), ("later", "the other words")):
            ds, de, dw, dr = zip(*seen[lang][kind])
            print(f"| {lang}: {label} | {len(ds)} | {statistics.median(ds):+.2f} | {bench.pct(within(ds))} | "
                  f"{statistics.median(de):+.2f} | {bench.pct(within(de))} | {statistics.median(dw):.2f} / {statistics.median(dr):.2f} |")
    print()
    print(f"| first word ≤ {a.factor:g} × median word duration | songs | words within 0.1 / 0.3 / 1 s | median / mean abs error, s | "
          "a line's first word within 0.3 s | lines > 0.3 s off (early / late) | lines > 1 s off |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for lang in langs:
        for key in ("now", "shortened"):
            r, n = row(acc[lang][key]), acc[lang][key]["songs"]
            print(f"| {lang}: {key} | {n} | {bench.pct(r['le0.1'])} / {bench.pct(r['le0.3'])} / {bench.pct(r['le1'])} | "
                  f"{r['median']:.3f} / {r['mean']:.3f} | {bench.pct(r['first_le0.3'])} | "
                  f"{r['off_0.3']} of {r['lines']} ({bench.pct(r['off_0.3'] / r['lines'])}; {r['early_0.3']} / {r['late_0.3']}) | "
                  f"{r['off_1']} ({bench.pct(r['off_1'] / r['lines'])}) |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
