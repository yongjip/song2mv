"""Check a rendered music / lyric video against goals: measure the mp4 per sung line.

What it catches is the floor, not the fun: lines sung over a frozen picture, empty black screens, a second
chorus that looks like the first, long stretches without a cut. A coding agent cannot watch the video, so these
numbers tell it where to look. Passing is necessary, not proof of fun — a person still judges that.

Measures, per sung line (from the song's mv.json):
  motion     — mean frame difference (is anything moving?)
  coverage   — share of lit pixels (is the screen empty?)
  variation  — repeated sections (chorus 1 vs chorus 2) should not look the same
  cuts       — uneven cut rhythm inside verses; no long stretch without a cut
  text       — no tiny font sizes in scene sources (only with --src)

The default goals.json is a starting point measured on one video. Copy it, adjust it to your song and say why.
Needs ffmpeg and numpy. Exit code 0 only when every check passes.

  python -m song2mv.check.score out/my-song-16x9.mp4 --song work/my-song/mv.json [--from 92 --to 102]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np

from ..contract import stamp
from ..errors import Song2mvError

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_GOALS = os.path.join(HERE, "goals.json")


def load_lines(song: dict) -> list[dict]:
    kind = {s["id"]: s["kind"] for s in song["sections"]}
    rows = sorted(song["lines"], key=lambda r: r["start"])
    out = []
    for k, r in enumerate(rows):
        nxt = rows[k + 1]["start"] if k + 1 < len(rows) else song["duration"]
        out.append({"id": r["id"], "sec": r["section"], "kind": kind.get(r["section"], "mid"), "start": r["start"],
                    "end": max(min(r["end"], nxt), r["start"] + 1.5), "text": r["text"]})
    return out


def probe_size(mp4: str) -> tuple[int, int]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", mp4],
                       capture_output=True, text=True)
    try:
        w, h = r.stdout.strip().split(",")[:2]
        return int(w), int(h)
    except ValueError:
        detail = (r.stderr.strip().splitlines() or ["no video stream"])[-1]
        raise Song2mvError(f"ffprobe could not read a video stream from {mp4}: {detail}") from None


def decode_gray(mp4: str, W: int, H: int) -> np.ndarray:
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"fps=10,scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
                         stdout=subprocess.PIPE, bufsize=10**8)
    assert p.stdout
    buf = p.stdout.read()
    n = len(buf) // (W * H)
    return np.frombuffer(buf[: n * W * H], np.uint8).reshape(n, H, W).astype(np.int16)


def lint_text(pattern: str, min_px: int) -> list[str]:
    offenders = []
    for f in glob.glob(pattern, recursive=True):
        src = open(f, encoding="utf-8").read()
        for m in re.finditer(r"(?:size=\{|size: |fontSize: )(\d+)(?![\d.])", src):
            if int(m.group(1)) < min_px:
                offenders.append(f"{f}:{src[: m.start()].count(chr(10)) + 1} {m.group(1)}px")
    return offenders


def score(mp4: str, song_path: str, goals_path: str | None = None, t0: float = 0.0, t1: float | None = None,
          src_glob: str | None = None, quiet: bool = False) -> dict:
    goals = json.load(open(goals_path or DEFAULT_GOALS, encoding="utf-8"))
    song = json.load(open(song_path, encoding="utf-8"))
    t_end = t1 if t1 is not None else song["duration"]
    lines = [r for r in load_lines(song) if r["start"] >= t0 and r["end"] <= t_end + 0.01]
    secs = song["sections"]

    vw, vh = probe_size(mp4)
    portrait = vh > vw
    W, H = (180, 320) if portrait else (320, 180)
    body_frac = goals["frame"]["body_frac_9x16" if portrait else "body_frac_16x9"]
    F = decode_gray(mp4, W, H)
    body = F[:, : int(H * body_frac), :]
    diff = np.abs(np.diff(body, axis=0)).mean(axis=(1, 2))
    cover = (body > 40).mean(axis=(1, 2))
    idx = lambda t: int(round((t - t0) * 10))  # noqa: E731

    results: dict[str, dict] = {}

    def check(name, ok, msg):
        results[name] = {"ok": bool(ok), "msg": str(msg)}

    # motion · coverage
    g, gc = goals["motion"], goals["coverage"]
    per = []
    for r in lines:
        i0, i1 = idx(r["start"]), min(len(diff), idx(r["end"]))
        if i1 - i0 < 3:
            continue
        per.append((r, float(diff[i0:i1].mean()), float(cover[i0:i1].mean())))
    quiet_line = lambda r: r["kind"] in g["quiet_kinds"] or r["id"] in g["quiet_allow"]  # noqa: E731
    low = [(r["id"], round(m, 2)) for r, m, c in per if m < (g["quiet_min"] if quiet_line(r) else g["min_per_line"])]
    high = [(r["id"], round(m, 2)) for r, m, c in per if r["kind"] in g["max_kinds"] and m > g["max_per_line"]]
    check("motion.min", not low, f"{len(low)} still lines {low[:12]}")
    check("motion.max", not high, f"{len(high)} frantic lines {high[:12]}")
    empty = [(r["id"], round(c, 3)) for r, m, c in per if c < gc["min_per_line"]]
    med = float(np.median([c for _, _, c in per])) if per else 0.0
    check("coverage.min", not empty, f"{len(empty)} empty-screen lines {empty[:12]}")
    check("coverage.median", med >= gc["median_min"], f"median {med:.3f} (goal ≥ {gc['median_min']})")

    # variation: sections whose ids differ only by the trailing number are repeats (ch1, ch2)
    gv = goals["variation"]
    groups: dict[str, list[str]] = {}
    for s in secs:
        if re.search(r"\d+$", s["id"]):
            groups.setdefault(re.sub(r"\d+$", "", s["id"]), []).append(s["id"])
    by_sec: dict[str, list[dict]] = {}
    for r in sorted(lines, key=lambda r: r["id"]):
        by_sec.setdefault(r["sec"], []).append(r)
    pairs = []
    for ids in groups.values():
        for other in ids[1:]:
            for r1, r2 in zip(by_sec.get(ids[0], []), by_sec.get(other, [])):
                cs = []
                for off in (0.5, 1.0, 1.5, 2.0):
                    i, j = idx(r1["start"] + off), idx(r2["start"] + off)
                    if not (0 <= i < len(body) and 0 <= j < len(body)):
                        continue
                    f1, f2 = body[i].astype(float), body[j].astype(float)
                    f1 -= f1.mean()
                    f2 -= f2.mean()
                    cs.append(float((f1 * f2).sum() / (np.sqrt((f1 ** 2).sum() * (f2 ** 2).sum()) + 1e-9)))
                if cs:
                    pairs.append((f"{r1['id']}~{r2['id']}", round(float(np.mean(cs)), 2)))
    if pairs:
        m = float(np.mean([c for _, c in pairs]))
        check("variation.repeats", m <= gv["repeat_corr_max_mean"], f"mean correlation {m:.2f} {pairs[:8]} (goal ≤ {gv['repeat_corr_max_mean']})")

    # cuts: a cut is a frame whose correlation with the previous one collapses
    gk = goals["cuts"]
    small = body[:, ::2, ::2].astype(np.float32)
    small -= small.mean(axis=(1, 2), keepdims=True)
    num = (small[1:] * small[:-1]).sum(axis=(1, 2))
    den = np.sqrt((small[1:] ** 2).sum(axis=(1, 2)) * (small[:-1] ** 2).sum(axis=(1, 2))) + 1e-6
    corr = num / den
    # pair k is frames (k, k+1); the cut is at k+1. Thresholds: real cuts < 0.6, within-scene 5th percentile 0.70
    raw = [k + 1 for k in range(len(diff)) if corr[k] < 0.62 and diff[k] > 2.5]
    cut_idx: list[int] = []
    for i in raw:  # cuts within 0.3 s count once
        if not cut_idx or i - cut_idx[-1] > 3:
            cut_idx.append(i)
    cut_t = [t0 + i / 10 for i in cut_idx]
    for s in secs:
        if s["kind"] not in gk["cv_kinds"]:
            continue
        inside = [t for t in cut_t if s["start"] <= t <= s["end"]]
        if len(inside) >= 4:
            iv = np.diff(inside)
            cv = float(iv.std() / iv.mean())
            check(f"cuts.rhythm.{s['id']}", cv >= gk["interval_cv_min"], f"cut interval CV {cv:.2f} over {len(inside)} cuts (goal ≥ {gk['interval_cv_min']})")
    gaps = []
    edges = [t0] + cut_t + [t_end]
    for s0, e0 in zip(edges, edges[1:]):
        if e0 - s0 > gk["max_gap_sec"]:
            kinds = {s["kind"] for s in secs if s["start"] < e0 and s["end"] > s0}
            if not kinds <= set(gk["gap_exempt_kinds"]):
                gaps.append((round(s0, 1), round(e0, 1)))
    check("cuts.max_gap", not gaps, f"{len(gaps)} stretches over {gk['max_gap_sec']} s without a cut {gaps[:10]}")

    # text lint — only when scene sources are given
    if src_glob:
        gt = goals["text"]
        off = lint_text(src_glob, gt["min_font_px"])
        check("text.min_font", not off, f"{len(off)} sizes under {gt['min_font_px']}px {off[:10]}")

    if not quiet:
        print(f"{'id':8s} {'move':>5s} {'cover':>6s}  text")
        flagged = {i for i, _ in low} | {i for i, _ in empty}
        for r, m, c in per:
            print(f"{r['id']:8s} {m:5.2f} {c:6.3f}  {r['text'][:28]}{' ◀' if r['id'] in flagged else ''}")
        print(f"cuts at: {[round(t, 1) for t in cut_t]}\n")
    for k, r in results.items():
        if not quiet or not r["ok"]:
            print(("PASS " if r["ok"] else "FAIL ") + k + " — " + r["msg"])
    passed = sum(r["ok"] for r in results.values())
    print(f"\n{passed}/{len(results)} passed")
    return stamp({
        "command": "check",
        "video": os.path.abspath(mp4),
        "song": os.path.abspath(song_path),
        "goals": os.path.abspath(goals_path or DEFAULT_GOALS),
        "passed": passed,
        "total": len(results),
        "ok": passed == len(results),
        "results": results,
        "per_line": [{"id": r["id"], "motion": round(m, 3), "coverage": round(c, 4)} for r, m, c in per],
        "cuts": [round(t, 2) for t in cut_t],
    })


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mp4")
    ap.add_argument("--song", required=True, help="the mv.json the video was rendered from")
    ap.add_argument("--goals", default=None)
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    ap.add_argument("--src", default=None)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    res = score(a.mp4, a.song, a.goals, a.t0, a.t1, a.src, a.quiet)
    sys.exit(0 if res["ok"] else 1)


if __name__ == "__main__":
    main()
