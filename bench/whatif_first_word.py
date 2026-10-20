"""What-if for docs/benchmark.md: sync's first-word rule at another duration, or off.

Whisper leaves no gap between words, so the pause before a line becomes part of the line's first word: the word ends
where it is sung but starts where the word before it ended. faster-whisper shortens such a word to twice the median
word duration itself, but only after a sentence-end mark or a pause between segments, and lyric lines rarely end in
one. So sync cuts the whisper word that each lyric line's first word matched to the run's median word duration (at
most 0.7 s, as faster-whisper caps it), keeping its end: song2mv.timing.align.trim_first_words, FIRST_WORD = 1.

This script rebuilds every song's lines with FIRST_WORD set to --factor instead (0 turns the rule off) and compares
them with the lines sync wrote. That is how 1 was chosen: on the 20 English songs, against the rule off, with 2 and
1.5 also tried; then it was run unchanged on the 59 others. Everything else is sync's own code on the cached work
folders of bench/jamendolyrics.py: merge_runs, the re-heard gaps, estimates and snapping. Nothing is transcribed, so a
line the runs left unplaced keeps what sync's re-listening gave it. The rebuild at sync's own FIRST_WORD must
reproduce lyrics.json exactly; the script stops if it does not (after a change to song2mv, run
bench/jamendolyrics.py --rerun first).

  python -I bench/whatif_first_word.py                 # every song with a finished run: sync vs the rule off
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


def variant(work: str, factor: float | None) -> list[dict]:
    """Final lines for a work folder, as sync makes them (None) or with first words cut to `factor` median word
    durations (0: not cut)."""
    from song2mv.timing import align, lib
    cfg, heard, grid, end_song = bench.refill(work)
    lines = lib.parse_lyrics(os.path.join(work, "lyrics.txt"), cfg)
    runs = [json.load(open(os.path.join(work, "asr", f"run{k}.json"), encoding="utf-8")) for k in range(1, int(cfg["whisper"]["runs"]) + 1)]
    shipped = align.FIRST_WORD
    align.FIRST_WORD = shipped if factor is None else factor
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            merged = align.merge_runs(lines, runs)
    finally:
        align.FIRST_WORD = shipped
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
        # aligned on word positions, as trim_first_words does: a matched letter's "time" is its whisper word's index
        first, cov = lib.align(lines, [dict(w, s=n, e=n + 1) for n, w in enumerate(words)])
        for li, x in enumerate(ref):
            if cov.get(li, 0) < 0.5:
                continue
            for wi, rw in enumerate(x["words"]):
                if (li, wi) in first:
                    w = words[int(first[(li, wi)])]
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
    ap.add_argument("--factor", type=float, default=0.0, help="cut a line's first whisper word to this many median word "
                    "durations instead of sync's own; 0 (the default) turns the rule off")
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
            raise SystemExit(f"{s['name']}: the rebuild does not reproduce lyrics.json (after a change to song2mv, "
                             "run bench/jamendolyrics.py --rerun first)")
        for key, lines in (("sync", now), ("variant", variant(work, a.factor))):
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
    from song2mv.timing.align import FIRST_WORD
    label = {"sync": f"sync, {FIRST_WORD:g} ×", "variant": f"{a.factor:g} ×" if a.factor else "rule off"}
    print("| a line's first whisper word cut to N × the median word duration | songs | words within 0.1 / 0.3 / 1 s | "
          "median / mean abs error, s | a line's first word within 0.3 s | lines > 0.3 s off (early / late) | lines > 1 s off |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for lang in langs:
        for key in ("variant", "sync"):
            r, n = row(acc[lang][key]), acc[lang][key]["songs"]
            print(f"| {lang}: {label[key]} | {n} | {bench.pct(r['le0.1'])} / {bench.pct(r['le0.3'])} / {bench.pct(r['le1'])} | "
                  f"{r['median']:.3f} / {r['mean']:.3f} | {bench.pct(r['first_le0.3'])} | "
                  f"{r['off_0.3']} of {r['lines']} ({bench.pct(r['off_0.3'] / r['lines'])}; {r['early_0.3']} / {r['late_0.3']}) | "
                  f"{r['off_1']} ({bench.pct(r['off_1'] / r['lines'])}) |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
