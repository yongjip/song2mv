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

The default goals.json is a starting point measured on one video. Copy it, adjust it to your song and say why;
a goals file of your own only needs the values it changes. Checks that cannot run on this stretch (no repeated
section, too few cuts, no --src) are listed under "skipped". Needs ffmpeg and numpy. Exit code 0 only when every
check passes.

  python -m song2mv.check.score out/my-song-16x9.mp4 --song work/my-song/mv.json [--from 92 --to 102]
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import subprocess
import sys

import numpy as np

from ..contract import load_mv, stamp
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
    """Frame k is the picture at k / 10 s: ffmpeg's default rounding would take the one 1/30 s later from a 30 fps video,
    so a draft rendered at 10 fps would be measured on other frames than its full render."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"fps=10:round=up,scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
                       capture_output=True)
    n = len(r.stdout) // (W * H)
    if n < 2:
        detail = (r.stderr.decode(errors="replace").strip().splitlines() or ["no frames"])[-1]
        raise Song2mvError(f"{mp4} has no frames to measure: {detail}")
    return np.frombuffer(r.stdout[: n * W * H], np.uint8).reshape(n, H, W).astype(np.int16)


FONT_SIZE = re.compile(r"\bfontSize\s*[:=]\s*\{?\s*[\"']?(\d+)(?![\d.])"
                       r"|<(?:comic\.)?(?:Slam|Quiet|Captions|Balloon|Caption|Sfx)\b[^>]*?\bsize=\{?\s*[\"']?(\d+)(?![\d.])")


def lint_text(pattern: str, min_px: int) -> tuple[int, list[int], list[str]]:
    """Font sizes in scene sources, `fontSize` and `size` on the kit's text: (files, sizes, offenders)."""
    files = glob.glob(pattern, recursive=True)
    sizes, offenders = [], []
    for f in files:
        src = open(f, encoding="utf-8").read()
        for m in FONT_SIZE.finditer(src):
            px = int(m.group(1) or m.group(2))
            sizes.append(px)
            if px < min_px:
                offenders.append(f"{f}:{src[: m.start()].count(chr(10)) + 1} {px}px")
    return len(files), sizes, offenders


def load_goals(path: str | None) -> dict:
    """The bundled goals, with a goals file of your own laid over them: it only needs the values it changes."""
    goals = json.load(open(DEFAULT_GOALS, encoding="utf-8"))
    if path:
        try:
            mine = json.load(open(path, encoding="utf-8-sig"))
        except FileNotFoundError:
            raise Song2mvError(f"goals file not found: {path}") from None
        except ValueError as e:
            raise Song2mvError(f"{path} is not valid JSON: {e}") from None
        for k, v in mine.items():
            if isinstance(v, dict) and isinstance(goals.get(k), dict):
                goals[k].update(v)
            else:
                goals[k] = v
    return goals


def score(mp4: str, song_path: str, goals_path: str | None = None, t0: float = 0.0, t1: float | None = None,
          src_glob: str | None = None, quiet: bool = False, report: bool = True) -> dict:
    if t0 < 0 or (t1 is not None and t1 <= t0):
        raise Song2mvError(f"--from must be zero or more and --to after it (got --from {t0:g}, --to {t1})")
    goals = load_goals(goals_path)
    song = load_mv(song_path, keys=("duration", "sections", "lines"))
    secs = song["sections"]
    warnings: list[str] = []

    vw, vh = probe_size(mp4)
    portrait = vh > vw
    W, H = (180, 320) if portrait else (320, 180)
    body_frac = goals["frame"]["body_frac_9x16" if portrait else "body_frac_16x9"]
    F = decode_gray(mp4, W, H)
    # the measured stretch, in song time: from the video's first frame to its last (or --to, if earlier)
    video_end = t0 + len(F) / 10
    if t1 is not None and t1 > video_end + 0.5:
        warnings.append(f"--to {t1:g} is after the video's end (song time {video_end:.1f} s); measured up to there")
    t_end = min(video_end if t1 is None else t1, video_end, float(song["duration"]))
    lines = [r for r in load_lines(song) if r["start"] >= t0 and r["end"] <= t_end + 0.01]

    body = F[:, : int(H * body_frac), :]
    diff = np.abs(np.diff(body, axis=0)).mean(axis=(1, 2))
    cover = (body > 40).mean(axis=(1, 2))
    idx = lambda t: int(round((t - t0) * 10))  # noqa: E731

    # cuts: a cut is a frame whose correlation with the previous one collapses
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

    # A line sung into the next section is measured up to that section's start, or up to the last cut in the beat
    # before it: a scene hits the downbeat it hears, which can lead mv.json's bar line.
    beat = song.get("grid", {}).get("beat", 0.5)
    ordered = sorted(secs, key=lambda s: s["start"])
    stop = {}  # section id → the first frame change (index into diff) that belongs to the next section
    for s, nxt in zip(ordered, ordered[1:]):
        hits = [t for t in cut_t if nxt["start"] - beat <= t <= nxt["start"]]
        stop[s["id"]] = math.ceil(round(((hits[-1] if hits else nxt["start"]) - t0) * 10, 6)) - 1

    per = []
    span = {}  # line id → (i0, i1): it is measured on the frame changes diff[i0:i1], frames i0 … i1
    for r in lines:
        i0, i1 = idx(r["start"]), min(len(diff), idx(r["end"]), stop.get(r["sec"], len(diff)))
        if i1 - i0 < 3:
            continue
        per.append((r, float(diff[i0:i1].mean()), float(cover[i0:i1].mean())))
        span[r["id"]] = (i0, i1)
    if not per:
        raise Song2mvError(f"no sung line lies inside song time {t0:g}–{t_end:.1f} s, so there is nothing to measure",
                           hint="--from is the song time of the video's first frame (the --from it was rendered with)")

    # every result: ok, value (the measured number), goal ({"min": x} or {"max": x}), msg; per-line checks count the
    # failing lines (goal: none) and list each with its own value and goal
    results: dict[str, dict] = {}
    skipped: dict[str, str] = {}

    def check(name, ok, value, goal, msg, **detail):
        results[name] = {"ok": bool(ok), "value": value, "goal": goal, "msg": str(msg), **detail}

    def failing(rows):
        return [(x["id"], x["value"]) for x in rows][:12]

    song_t = lambda i: round(t0 + i / 10, 2)  # noqa: E731
    cut_set = set(cut_idx)

    def under_goal(series, i0, i1, goal):
        """The longest part of series[i0:i1] whose every second (all of it, when shorter) is under the goal, or else
        its lowest second, without the frames at its ends that reach the goal: (first index, end index, mean)."""
        n = min(10, i1 - i0)
        c = np.cumsum(np.r_[0.0, series[i0:i1]])
        means = (c[n:] - c[:-n]) / n
        a = b = int(np.argmin(means))  # first and last one-second window of the stretch
        start = None
        for k, m in enumerate([*means, np.inf]):
            if m < goal and start is None:
                start = k
            elif m >= goal and start is not None:
                if k - 1 - start > b - a:
                    a, b = start, k - 1
                start = None
        lo, hi = i0 + a, i0 + b + n
        while hi - lo > 1 and series[lo] >= goal:
            lo += 1
        while hi - lo > 1 and series[hi - 1] >= goal:
            hi -= 1
        return lo, hi, float(series[lo:hi].mean())

    def where(x, name):
        """Where a failing line failed: its measured stretch, the cuts in it, and the part or moment behind the number."""
        i0, i1 = span[x["id"]]
        cuts = [i for i in cut_idx if i0 < i <= i1]
        x.update({"from": song_t(i0), "to": song_t(i1), "cuts": [song_t(i) for i in cuts]})
        (bound, goal), = x["goal"].items()
        said = [f"{song_t(i0):.1f}–{song_t(i1):.1f} s: {x['value']} (goal {'≥' if bound == 'min' else '≤'} {goal})"]
        if name == "motion.max":
            k = i0 + int(np.argmax(diff[i0:i1]))
            rest = [diff[j] for j in range(i0, i1) if j + 1 not in cut_set]
            x["peak"] = {"t": song_t(k + 1), "value": round(float(diff[k]), 2)}
            x["without_cuts"] = round(float(np.mean(rest)) if rest else 0.0, 2)
            said.append(f"biggest change at {song_t(k + 1):.1f} s ({diff[k]:.1f}{', a cut' if k + 1 in cut_set else ''})")
        else:
            series, word, digits = (diff, "still", 2) if name == "motion.min" else (cover, "empty", 3)
            a, b, v = under_goal(series, i0, i1, goal)
            x["stretch"] = {"from": song_t(a), "to": song_t(b), "value": round(v, digits)}
            said.append(f"{word} throughout" if (a, b) == (i0, i1) else f"{word} {song_t(a):.1f}–{song_t(b):.1f} s ({v:.{digits}f})")
        said.append("cuts at " + ", ".join(f"{song_t(i):.1f}" for i in cuts) if cuts else "no cut")
        if name == "motion.max" and cuts:
            said.append(f"{x['without_cuts']} without the cuts")
        x["msg"] = "; ".join(said)
        return x

    # motion · coverage
    g, gc = goals["motion"], goals["coverage"]
    floor = lambda r: g["quiet_min"] if r["kind"] in g["quiet_kinds"] or r["id"] in g["quiet_allow"] else g["min_per_line"]  # noqa: E731
    low = [where({"id": r["id"], "value": round(m, 2), "goal": {"min": floor(r)}}, "motion.min") for r, m, c in per if m < floor(r)]
    high = [where({"id": r["id"], "value": round(m, 2), "goal": {"max": g["max_per_line"]}}, "motion.max")
            for r, m, c in per if r["kind"] in g["max_kinds"] and m > g["max_per_line"]]
    check("motion.min", not low, len(low), {"max": 0}, f"{len(low)} still lines {failing(low)}", lines=low)
    check("motion.max", not high, len(high), {"max": 0}, f"{len(high)} frantic lines {failing(high)}", lines=high)
    empty = [where({"id": r["id"], "value": round(c, 3), "goal": {"min": gc["min_per_line"]}}, "coverage.min")
             for r, m, c in per if c < gc["min_per_line"]]
    med = float(np.median([c for _, _, c in per]))
    check("coverage.min", not empty, len(empty), {"max": 0}, f"{len(empty)} empty-screen lines {failing(empty)}", lines=empty)
    check("coverage.median", med >= gc["median_min"], round(med, 3), {"min": gc["median_min"]},
          f"median {med:.3f} (goal ≥ {gc['median_min']})")

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
                    pairs.append((f"{r1['id']}~{r2['id']}", float(np.mean(cs)), "hot" in (r1["kind"], r2["kind"])))
    if pairs:
        # a verse may come back to the same place, but no chorus line may look like its first copy
        goal = gv["repeat_corr_max_mean"]
        pairs.sort(key=lambda p: -p[1])
        m = float(np.mean([c for _, c, _ in pairs]))
        hot = [(name, c) for name, c, is_hot in pairs if is_hot]
        worst = max(m, hot[0][1]) if hot else m
        chorus = f", worst chorus pair {hot[0][0]} {hot[0][1]:.2f}" if hot else ""
        shown = [(name, round(c, 2)) for name, c, _ in pairs]
        check("variation.repeats", worst <= goal, round(worst, 2), {"max": goal},
              f"mean correlation {m:.2f}{chorus} (goal ≤ {goal}); worst first {shown[:8]}", pairs=shown)
    else:
        skipped["variation.repeats"] = "no repeated section (ch1 and ch2 …) has lines in both copies in this stretch"

    # cuts: uneven inside cv_kinds sections, and never too far apart
    gk = goals["cuts"]
    for s in secs:
        if s["kind"] not in gk["cv_kinds"] or s["end"] <= t0 or s["start"] >= t_end:
            continue
        inside = [t for t in cut_t if s["start"] <= t <= s["end"]]
        if len(inside) >= 4:
            iv = np.diff(inside)
            cv = float(iv.std() / iv.mean())
            check(f"cuts.rhythm.{s['id']}", cv >= gk["interval_cv_min"], round(cv, 2), {"min": gk["interval_cv_min"]},
                  f"cut interval CV {cv:.2f} over {len(inside)} cuts (goal ≥ {gk['interval_cv_min']})")
        else:
            skipped[f"cuts.rhythm.{s['id']}"] = f"{len(inside)} cuts in this stretch of {s['id']} (the rhythm needs 4)"
    gaps, longest = [], 0.0
    edges = [t0] + cut_t + [t_end]
    for s0, e0 in zip(edges, edges[1:]):
        kinds = {s["kind"] for s in secs if s["start"] < e0 and s["end"] > s0}
        if kinds <= set(gk["gap_exempt_kinds"]):
            continue
        longest = max(longest, e0 - s0)
        if e0 - s0 > gk["max_gap_sec"]:
            gaps.append((round(s0, 1), round(e0, 1)))
    check("cuts.max_gap", not gaps, round(longest, 1), {"max": gk["max_gap_sec"]},
          f"{len(gaps)} stretches over {gk['max_gap_sec']} s without a cut {gaps[:10]}", gaps=gaps)

    # text lint — only when scene sources are given
    gt = goals["text"]
    if not src_glob:
        skipped["text.min_font"] = 'pass --src "DIR/src/scenes/**/*.tsx" to check font sizes in scene sources'
    else:
        n_files, sizes, off = lint_text(src_glob, gt["min_font_px"])
        if not n_files:
            skipped["text.min_font"] = f"no files match {src_glob}"
        else:
            check("text.min_font", not off, min(sizes) if sizes else None, {"min": gt["min_font_px"]},
                  f"{len(off)} sizes under {gt['min_font_px']}px {off[:10]}", offenders=off)

    passed = sum(r["ok"] for r in results.values())
    if report:
        for w in warnings:
            print(f"  ! {w}")
        if not quiet:
            print(f"{'id':8s} {'move':>5s} {'cover':>6s}  text")
            flagged = {x["id"] for x in low + high + empty}
            for r, m, c in per:
                print(f"{r['id']:8s} {m:5.2f} {c:6.3f}  {r['text'][:28]}{' ◀' if r['id'] in flagged else ''}")
            print(f"cuts at: {[round(t, 1) for t in cut_t]}\n")
        for k, r in results.items():
            if not quiet or not r["ok"]:
                print(("PASS " if r["ok"] else "FAIL ") + k + " — " + r["msg"])
                for x in r.get("lines", [])[:12]:
                    print(f"     {x['id']:8s} {x['msg']}")
                if len(r.get("lines", [])) > 12:
                    print(f"     … and {len(r['lines']) - 12} more (--json lists every line)")
        if not quiet:
            for k, why in skipped.items():
                print(f"SKIP {k} — {why}")
        print(f"\n{passed}/{len(results)} passed (song time {t0:g}–{t_end:.1f} s)")
    return stamp({
        "command": "check",
        "video": os.path.abspath(mp4),
        "song": os.path.abspath(song_path),
        "goals": os.path.abspath(goals_path or DEFAULT_GOALS),
        "from": t0,
        "to": round(t_end, 2),
        "passed": passed,
        "total": len(results),
        "ok": passed == len(results),
        "results": results,
        "skipped": skipped,
        "per_line": [{"id": r["id"], "motion": round(m, 3), "coverage": round(c, 4)} for r, m, c in per],
        "cuts": [round(t, 2) for t in cut_t],
        "warnings": warnings,
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
