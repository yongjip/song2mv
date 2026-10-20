"""Align every whisper run to the lyric sheet and merge the runs into one time per lyric word.

In each run, the whisper word that a lyric line's first word matched is first cut to the run's median word duration:
whisper hears the pause before a line as part of that word (trim_first_words). Then, for each line:
  1. a run takes part only if it matched at least half of the line's characters (a run that skipped
     the line, or caught two syllables of it by chance, stays out);
  2. runs whose line start is far (> 1 s) from the others are dropped — a run that missed chorus 1 can
     match chorus-1 lyrics to chorus-2 audio. With three or more runs the reference is the median start,
     with two it is the run that matched more of the line;
  3. each word takes the median time over the remaining runs.
Lines no run could place keep `wt` all None; reprompt.py listens to those gaps again.

Usage: python -m song2mv.timing.align work/lyrics.txt work/asr/run1.json work/asr/run2.json ... --out work/merged.json
"""
from __future__ import annotations

import argparse
import json
import statistics

from .lib import align, parse_lyrics, write_json

MIN_COVERAGE = 0.5
MAX_SPREAD = 1.0
FIRST_WORD = 1.0  # a line's first whisper word is cut to this many median word durations of its run (0: not cut)
MAX_MEDIAN = 0.7  # faster-whisper caps the median word duration at 0.7 s when it shortens words itself


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
    # aligned on word positions instead of times, a line's first matched letter gives the index of its whisper word
    first, _ = align(lines, [dict(w, s=k, e=k + 1) for k, w in enumerate(words)])
    out = [dict(w) for w in words]
    for li in range(len(lines)):
        if (li, 0) in first:
            w = out[int(first[(li, 0)])]
            if w["e"] - w["s"] > longest:
                w["s"] = round(w["e"] - longest, 3)
    return out


def merge_runs(lines: list[dict], runs: list[dict]) -> list[dict]:
    per_run = [align(lines, trim_first_words(lines, r["words"])) for r in runs]
    out = []
    for li, ln in enumerate(lines):
        n = len(ln["words"])
        cov = [round(c.get(li, 0.0), 2) for _, c in per_run]
        cands = []
        for k, (first, c) in enumerate(per_run):
            ts = [first.get((li, wi)) for wi in range(n)]
            if any(t is not None for t in ts):
                cands.append({"run": k + 1, "cov": c.get(li, 0.0), "ts": ts, "start": min(t for t in ts if t is not None)})
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
        out.append(rec)
    return out


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
        elif len(r["runs_used"]) < max(2, n_runs // 2 + 1) and n_runs > 1:
            flag = f"  ◀ only run {r['runs_used']}"
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
