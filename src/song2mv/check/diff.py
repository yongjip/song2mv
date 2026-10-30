"""What changed between two renders of the same video, frame by frame: each stretch where they differ, in song time,
how much of the frame changed at its peak and the box round every change in it, and a sheet with the peak frame of
each stretch before and after, side by side.

A fix to one character piece also moves what its anchors place in other shots: render the whole video before and
after the fix with the same options and look at every stretch the fix was not meant to touch. Both videos are read in
grey at 480 px on their long side, and a pixel changed when it differs by more than 24 levels. Frames with a changed
pixel and less than 0.15 s of unchanged frames between them make one stretch, which ends at a cut in either video, so
that every shot that changed shows on the sheet. A stretch whose frames change fewer pixels in all than 0.02 % of one
frame, a stray pixel or two, is left out. Needs ffmpeg and numpy.
"""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from ..contract import load_mv, stamp
from ..errors import Song2mvError
from .score import CUT_CORR, CUT_DIFF
from .sheet import JOBS, grab, layout, page, probe, start_in_name, write_png

LONG_SIDE, PIXEL, MIN_CHANGE, MERGE = 480, 24, 0.0002, 0.15
CHUNK = 64
MAX_PAIRS = 40
OUTLINE = (255, 0, 255)
SAME = "render both with the same options (--from, --to, --aspect, --draft), before and after the change"


def same_settings(before: str, after: str) -> dict:
    a, b = probe(before), probe(after)
    for video, info in ((before, a), (after, b)):
        if not info["fps"]:
            raise Song2mvError(f"ffprobe found no frames in {video}")
    if (a["w"], a["h"]) != (b["w"], b["h"]):
        raise Song2mvError(f"the videos differ in size: {before} is {a['w']}x{a['h']}, {after} {b['w']}x{b['h']}", hint=SAME)
    if a["fps"] != b["fps"]:
        raise Song2mvError(f"the videos differ in frame rate: {before} has {float(a['fps']):g} fps, {after} "
                           f"{float(b['fps']):g}", hint=SAME)
    if a["frames"] != b["frames"]:
        raise Song2mvError(f"the videos differ in length: {before} has {a['frames']} frames ({a['duration']:.2f} s), "
                           f"{after} {b['frames']} ({b['duration']:.2f} s)", hint=SAME)
    return a


def gray(video: str, size: tuple[int, int], err) -> subprocess.Popen:
    w, h = size
    return subprocess.Popen(["ffmpeg", "-v", "error", "-i", video, "-an", "-sn", "-vf", f"scale={w}:{h}", "-f", "rawvideo",
                             "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE, stderr=err, stdin=subprocess.DEVNULL)


def cut_frames(chunk: np.ndarray, last: np.ndarray | None, first: int) -> list[int]:
    """The frames of a chunk that cut to another shot, as `check` counts a cut; the chunk's first frame is `first`."""
    f = chunk if last is None else np.concatenate([last[None], chunk])
    x = f[:, ::2, ::2].astype(np.float32)
    x -= x.mean(axis=(1, 2), keepdims=True)
    corr = (x[1:] * x[:-1]).sum(axis=(1, 2)) / (np.sqrt((x[1:] ** 2).sum(axis=(1, 2)) * (x[:-1] ** 2).sum(axis=(1, 2))) + 1e-6)
    step = np.abs(np.diff(f.astype(np.int16), axis=0)).mean(axis=(1, 2))
    return [first + int(i) + (last is None) for i in np.flatnonzero((corr < CUT_CORR) & (step > CUT_DIFF))]


def changes(before: str, after: str, size: tuple[int, int]) -> tuple[list[int], dict[int, tuple[int, int, int, int]], set[int]]:
    """The pixels changed in each frame; for each frame with a changed pixel, the box round them, (x0, y0, x1, y1) in
    decoded pixels with the ends excluded; and the frames where either video cuts. Both videos stream through ffmpeg side by
    side, a chunk of frames at a time."""
    w, h = size
    n = w * h
    counts: list[int] = []
    boxes: dict[int, tuple[int, int, int, int]] = {}
    cuts: set[int] = set()
    frames = [0, 0]
    last: list[np.ndarray | None] = [None, None]
    with tempfile.TemporaryFile() as err_a, tempfile.TemporaryFile() as err_b, ThreadPoolExecutor(2) as pool:
        with gray(before, size, err_a) as pa, gray(after, size, err_b) as pb:
            while True:
                a, b = pool.map(lambda p: p.stdout.read(CHUNK * n), (pa, pb))
                if not a and not b:
                    break
                frames[0] += len(a) // n
                frames[1] += len(b) // n
                k = min(len(a), len(b)) // n
                if not k:
                    continue
                pair = [np.frombuffer(c, np.uint8, k * n).reshape(k, h, w) for c in (a, b)]
                for j, chunk in enumerate(pair):
                    cuts.update(cut_frames(chunk, last[j], len(counts)))
                    last[j] = chunk[-1]
                changed = np.abs(pair[0].astype(np.int16) - pair[1]) > PIXEL
                count = changed.sum(axis=(1, 2))
                for i in np.flatnonzero(count):
                    ys, xs = np.flatnonzero(changed[i].any(axis=1)), np.flatnonzero(changed[i].any(axis=0))
                    boxes[len(counts) + int(i)] = (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)
                counts.extend(count.tolist())
        for p, video, err in ((pa, before, err_a), (pb, after, err_b)):
            if p.returncode:
                err.seek(0)
                detail = (err.read().decode(errors="replace").strip().splitlines() or [f"exit code {p.returncode}"])[-1]
                raise Song2mvError(f"ffmpeg could not read {video}: {detail}")
    if frames[0] != frames[1]:
        raise Song2mvError(f"the videos differ in length: {before} has {frames[0]} frames, {after} {frames[1]}", hint=SAME)
    return counts, boxes, cuts


def stretches(boxes: dict[int, tuple[int, int, int, int]], cuts: set[int], fps: float) -> list[list[int]]:
    groups: list[list[int]] = []
    for k in boxes:
        if groups and (k - groups[-1][-1] - 1) / fps < MERGE and not cuts.intersection(range(groups[-1][-1] + 1, k + 1)):
            groups[-1].append(k)
        else:
            groups.append([k])
    return groups


def sung_in(song: dict, a: float, b: float) -> list[str]:
    """The ids of the lines sung between song times a and b, else of the sections there."""
    ids = [r["id"] for r in sorted(song["lines"], key=lambda r: r["start"]) if r["start"] < b and r.get("end", r["start"]) > a]
    return ids or [s["id"] for s in song["sections"] if s["start"] < b and s["end"] > a]


def outline(tile: np.ndarray, box: list[int], info: dict) -> np.ndarray:
    th, tw = tile.shape[:2]
    x, y, w, h = box
    x0, y0 = max(0, math.floor(x * tw / info["w"]) - 2), max(0, math.floor(y * th / info["h"]) - 2)
    x1, y1 = min(tw, math.ceil((x + w) * tw / info["w"]) + 2), min(th, math.ceil((y + h) * th / info["h"]) + 2)
    tile = tile.copy()
    tile[y0: y0 + 2, x0: x1] = tile[y1 - 2: y1, x0: x1] = OUTLINE
    tile[y0: y1, x0: x0 + 2] = tile[y0: y1, x1 - 2: x1] = OUTLINE
    return tile


def write_sheet(found: list[dict], before: str, after: str, info: dict, t0: float, stem: str) -> dict:
    cols = 4 if info["h"] > info["w"] else 2
    lay = layout(info, cols, None)
    jobs = [(video, s) for s in found for video in (before, after)]
    with ThreadPoolExecutor(JOBS) as pool:
        tiles = list(pool.map(lambda j: outline(grab(j[0], info, j[1]["at"] - t0, lay["vf"], (lay["tw"], lay["th"])),
                                                j[1]["box"], info), jobs))
    labels = []
    for s in found:
        labels.append((f"before {s['at']:.2f} s", " ".join(s["lines"])))
        labels.append((f"after {s['at']:.2f} s", f"{100 * s['peak']:.2f} %"))
    os.makedirs(os.path.dirname(stem), exist_ok=True)
    outputs = {}
    per = lay["per_page"]
    for k in range(0, len(tiles), per):
        path = f"{stem}.png" if k == 0 else f"{stem}-{k // per + 1}.png"
        img = page(tiles[k: k + per], labels[k: k + per], cols, lay)
        write_png(path, img)
        outputs[os.path.basename(path)] = os.path.abspath(path)
        print(f"wrote {path} ({img.shape[1]}x{img.shape[0]}, {len(tiles[k: k + per]) // 2} stretches)")
    return outputs


def diff(before: str, after: str, song_path: str | None = None, t0: float | None = None, out: str | None = None) -> dict:
    if out and (out.lower().endswith(".png") or os.path.isfile(out)):
        raise Song2mvError(f"--out {out}: diff writes its sheet into a folder", hint="give --out a folder; the sheet is "
                           "named after AFTER (AFTER-diff.png)")
    info = same_settings(before, after)
    if t0 is None:
        named = {start_in_name(v) for v in (before, after)} - {None}
        if len(named) > 1:
            raise Song2mvError(f"the names of {before} and {after} say they start at different song times "
                               f"({' and '.join(f'{t:g} s' for t in sorted(named))})",
                               hint="compare two renders of the same stretch, or give --from")
        if named:
            t0 = named.pop()
            print(f"diff: the videos start at song time {t0:g} s, as their names say (--from sets another)")
    t0 = t0 or 0.0
    song = load_mv(song_path, keys=("duration", "sections", "lines")) if song_path else None
    fps = float(info["fps"])
    scale = min(1.0, LONG_SIDE / max(info["w"], info["h"]))
    size = (max(1, round(info["w"] * scale)), max(1, round(info["h"] * scale)))
    print(f"diff: {info['frames']} frames of {before} and {after} ({info['w']}x{info['h']}, {fps:g} fps)")
    counts, boxes, cuts = changes(before, after, size)
    sx, sy = info["w"] / size[0], info["h"] / size[1]
    found = []
    groups = stretches(boxes, cuts, fps)
    kept = [g for g in groups if sum(counts[k] for k in g) > MIN_CHANGE * size[0] * size[1]]
    for group in kept:
        peak = max(group, key=counts.__getitem__)
        x0, y0 = math.floor(min(boxes[k][0] for k in group) * sx), math.floor(min(boxes[k][1] for k in group) * sy)
        x1 = min(info["w"], math.ceil(max(boxes[k][2] for k in group) * sx))
        y1 = min(info["h"], math.ceil(max(boxes[k][3] for k in group) * sy))
        a, b = t0 + group[0] / fps, t0 + (group[-1] + 1) / fps
        found.append({"from": round(a, 3), "to": round(b, 3), "peak": round(counts[peak] / (size[0] * size[1]), 5),
                      "at": round(t0 + (peak + 0.5) / fps, 3), "box": [x0, y0, x1 - x0, y1 - y0],
                      "lines": sung_in(song, a, b) if song else []})
    faint = len(boxes) - sum(len(g) for g in kept)
    print(f"stretches that changed: {len(found)}" if found else "no frame changed")
    if faint:
        print(f"frames left out, with only a stray pixel or two changed: {faint}")
    for s in found:
        print(f"  {s['from']:7.2f}–{s['to']:7.2f} s  {100 * s['peak']:5.2f} % at {s['at']:.2f} s  box "
              f"{','.join(map(str, s['box']))}  {' '.join(s['lines'])}".rstrip())
    warnings = []
    if len(found) > MAX_PAIRS:
        warnings.append(f"{len(found)} stretches changed and the sheet shows the first {MAX_PAIRS}: compare a shorter "
                        "stretch, or look at the rest by their times")
    stem = os.path.join(out or os.path.dirname(os.path.abspath(after)), os.path.splitext(os.path.basename(after))[0] + "-diff")
    outputs = write_sheet(found[:MAX_PAIRS], before, after, info, t0, stem) if found else {}
    for msg in warnings:
        print(f"  ! {msg}")
    return stamp({
        "command": "diff",
        "before": os.path.abspath(before),
        "after": os.path.abspath(after),
        "song": os.path.abspath(song_path) if song_path else None,
        "from": t0,
        "to": round(t0 + len(counts) / fps, 3),
        "frames": len(counts),
        "faint": faint,
        "stretches": found,
        "outputs": outputs,
        "warnings": warnings,
    })
