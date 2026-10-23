"""A contact sheet of a rendered video: frames at chosen song times, tiled and labelled with their song time and, given
the song's mv.json, the line sung then (or the section between lines). It shows the video as it was rendered, captions,
title and strips included; the template's `Contact` composition draws the bare scenes before a render.

Each tile is the frame on screen at its time: the last frame that starts at or before it. Needs ffmpeg and numpy;
the labels are a built-in bitmap font, so no drawtext filter and no image library.
"""
from __future__ import annotations

import json
import math
import os
import re
import struct
import subprocess
import zlib
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction

import numpy as np

from ..contract import load_mv, stamp
from ..errors import Song2mvError
from . import font

CUT_DELAY = 0.3
SHEET_W, GAP, PAGE_H = 1920, 12, 2400
BG, INK, DIM = (32, 33, 36), (255, 255, 255), (154, 160, 166)
MAX_TILES = 400
JOBS = 4
STRETCH = re.compile(r"-(?:16x9|9x16)-(\d+(?:\.\d+)?)-(?:\d+(?:\.\d+)?|end)(?:-draft)?\.mp4$")


def _number(v) -> Fraction:
    try:
        return Fraction(str(v))
    except (ValueError, ZeroDivisionError):
        return Fraction(0)


def probe(video: str) -> dict:
    """Size, frame rate, frame count and length of the video stream. A variable frame rate is taken at its average, so
    a frame may come one late there."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,avg_frame_rate,r_frame_rate,duration,nb_frames:format=duration", "-of", "json", video],
                       capture_output=True, text=True)
    try:
        info = json.loads(r.stdout)
        s = info["streams"][0]
        w, h = int(s["width"]), int(s["height"])
    except (ValueError, KeyError, IndexError):
        detail = (r.stderr.strip().splitlines() or ["no video stream"])[-1]
        raise Song2mvError(f"ffprobe could not read a video stream from {video}: {detail}") from None
    fps = next((f for f in map(_number, (s.get("avg_frame_rate"), s.get("r_frame_rate"))) if f > 0), None)
    duration = next((float(d) for d in map(_number, (s.get("duration"), info.get("format", {}).get("duration"))) if d > 0), 0.0)
    frames = int(s["nb_frames"]) if str(s.get("nb_frames", "")).isdigit() else round(duration * fps) if fps else 0
    if not duration and fps and frames:
        duration = float(frames / fps)
    if not duration:
        raise Song2mvError(f"ffprobe found no length for the video stream of {video}")
    return {"w": w, "h": h, "fps": fps if frames else None, "frames": frames, "duration": duration}


def read_check(path: str) -> dict:
    try:
        with open(path, encoding="utf-8-sig") as f:
            res = json.load(f)
    except FileNotFoundError:
        raise Song2mvError(f"check result not found: {path}") from None
    except ValueError as e:
        raise Song2mvError(f"{path} is not valid JSON: {e}") from None
    hint = "save one with `song2mv check VIDEO --song mv.json --json > check.json`"
    if isinstance(res, dict) and isinstance(res.get("error"), dict):
        raise Song2mvError(f"{path} holds a check that failed with an error: {res['error'].get('message')}", hint=hint)
    if not isinstance(res, dict) or res.get("command") != "check" or not isinstance(res.get("cuts"), list):
        raise Song2mvError(f"{path} is not the result of `song2mv check --json`", hint=hint)
    return res


def start_in_name(video: str) -> float | None:
    """The song time of a stretch's first frame, from the name `song2mv render` gives it: NAME-ASPECT-FROM-TO.mp4"""
    m = STRETCH.search(os.path.basename(video))
    return float(m.group(1)) if m else None


def sung_at(song: dict, t: float) -> str:
    """The ids of the lines sung at song time t (mv.json's start ≤ t < end), else the id of the section it is in."""
    ids = [r["id"] for r in sorted(song["lines"], key=lambda r: r["start"]) if r["start"] <= t < r.get("end", r["start"])]
    return " ".join(ids) or next((s["id"] for s in song["sections"] if s["start"] <= t < s["end"]), "")


def grab(video: str, info: dict, v: float, vf: str, size: tuple[int, int]) -> np.ndarray:
    """The frame on screen at video time v. ffmpeg's input seek returns the first frame at or after the time it is
    given, so it is given a quarter frame before the start of the frame that shows at v."""
    seek = v
    if info["fps"]:
        n = min(math.floor(v * info["fps"] + 1e-6), info["frames"] - 1)
        seek = max(0.0, (n - 0.25) / float(info["fps"]))
    w, h = size
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{seek:.6f}", "-i", video, "-frames:v", "1", "-an", "-sn",
                        "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, stdin=subprocess.DEVNULL)
    if len(r.stdout) < w * h * 3:
        detail = (r.stderr.decode(errors="replace").strip().splitlines() or ["no frame"])[-1]
        raise Song2mvError(f"ffmpeg returned no frame at {v:.3f} s of {video}: {detail}")
    return np.frombuffer(r.stdout[: w * h * 3], np.uint8).reshape(h, w, 3)


def write_png(path: str, img: np.ndarray) -> None:
    h, w, _ = img.shape
    rows = np.empty((h, 1 + 3 * w), np.uint8)
    rows[:, 0] = 2  # PNG's "up" filter: each row as its difference from the row above
    flat = img.reshape(h, 3 * w)
    rows[0, 1:] = flat[0]
    rows[1:, 1:] = flat[1:] - flat[:-1]

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(rows.tobytes(), 6)) + chunk(b"IEND", b""))


def tile_times(info: dict, t0: float, every: float | None, times: list[float]) -> list[float]:
    end = t0 + info["duration"]
    if every:
        out: list[float] = []
        while t0 + (len(out) + 0.5) * every < end - 1e-9:
            out.append(round(t0 + (len(out) + 0.5) * every, 6))
        if not out:
            raise Song2mvError(f"--every {every:g} leaves no frame in a {info['duration']:.1f} s video",
                               hint="give a step under half the video's length, or --times")
    else:
        out = list(times)
    if len(out) > MAX_TILES:
        raise Song2mvError(f"{len(out)} frames: a sheet takes at most {MAX_TILES}",
                           hint="use a longer --every, or a shorter video")
    for t in out:
        if t < t0 - 1e-6 or t > end + 0.5:
            raise Song2mvError(f"song time {t:g} is outside the video, which shows song time {t0:g}–{end:.2f} s",
                               hint="--from is the song time of the video's first frame (the --from it was rendered with)")
    return out


def layout(info: dict, cols: int, crop: tuple[int, int, int, int] | None) -> dict:
    x, y, cw, ch = crop or (0, 0, info["w"], info["h"])
    tw = (SHEET_W - GAP * (cols + 1)) // cols
    th = max(1, round(tw * ch / cw))
    zoom = tw / cw
    scale = 3 if tw >= 400 else 2 if tw >= 200 else 1
    vf = (f"format=rgb24,crop={cw}:{ch}:{x}:{y}," if crop else "") + f"scale={tw}:{th}:flags={'neighbor' if zoom >= 1 else 'area'}"
    row_h = th + (font.ROWS + 3) * scale + GAP
    return {"tw": tw, "th": th, "zoom": zoom, "scale": scale, "vf": vf, "row_h": row_h,
            "per_page": cols * max(1, (PAGE_H - GAP) // row_h)}


def page(tiles: list[np.ndarray], labels: list[tuple[str, str]], cols: int, lay: dict) -> np.ndarray:
    tw, th, scale, row_h = lay["tw"], lay["th"], lay["scale"], lay["row_h"]
    rows = math.ceil(len(tiles) / cols)
    img = np.empty((GAP + rows * row_h, GAP + cols * (tw + GAP), 3), np.uint8)
    img[:] = BG
    for i, (tile, (when, what)) in enumerate(zip(tiles, labels)):
        x, y = GAP + (i % cols) * (tw + GAP), GAP + (i // cols) * row_h
        img[y: y + th, x: x + tw] = tile
        ly = y + th + scale
        after = font.draw(img, x, ly, when, INK, scale, x + tw)
        if what:
            font.draw(img, after + font.ADVANCE * scale, ly, what, DIM, scale, x + tw)
    return img


def sheet(video: str, song_path: str | None = None, every: float | None = None, times: list[float] | None = None,
          cuts: str | None = None, t0: float | None = None, cols: int | None = None,
          crop: tuple[int, int, int, int] | None = None, out: str | None = None) -> dict:
    out = out or os.path.splitext(video)[0] + "-sheet.png"
    if not out.lower().endswith(".png"):
        raise Song2mvError(f"--out {out}: the sheet is a PNG file", hint="give --out a name ending in .png")
    warnings: list[str] = []
    check = read_check(cuts) if cuts else None
    if check:
        start = float(check.get("from", t0 or 0.0))
        times = [round(t + CUT_DELAY, 6) for t in [start, *map(float, check["cuts"])]]
        if t0 is None:
            t0 = start
        if song_path is None and check.get("song"):
            if os.path.isfile(check["song"]):
                song_path = check["song"]
            else:
                warnings.append(f"the check result's mv.json is gone ({check['song']}): the labels show times only")
    if t0 is None and (t0 := start_in_name(video)) is not None:
        print(f"sheet: the video starts at song time {t0:g} s, as its name says (--from sets another)")
    t0 = t0 or 0.0
    song = load_mv(song_path, keys=("duration", "sections", "lines")) if song_path else None

    info = probe(video)
    if crop:
        x, y, w, h = crop
        if x >= info["w"] or y >= info["h"]:
            raise Song2mvError(f"--crop {x},{y},{w},{h} starts outside the {info['w']}x{info['h']} video")
        crop = (x, y, min(w, info["w"] - x), min(h, info["h"] - y))
    cols = cols or (6 if info["h"] > info["w"] else 4)
    lay = layout(info, cols, crop)
    when = tile_times(info, t0, every, times or [])
    print(f"sheet: {len(when)} frames of {video}")
    with ThreadPoolExecutor(JOBS) as pool:
        tiles = list(pool.map(lambda t: grab(video, info, t - t0, lay["vf"], (lay["tw"], lay["th"])), when))

    zoom = f" · {lay['zoom']:.2f}×" if crop else ""
    labels = [(f"{t:.2f} s{zoom}", sung_at(song, t) if song else "") for t in when]
    stem = os.path.splitext(out)[0]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    outputs = {}
    for k in range(0, len(when), lay["per_page"]):
        path = out if k == 0 else f"{stem}-{k // lay['per_page'] + 1}.png"
        img = page(tiles[k: k + lay["per_page"]], labels[k: k + lay["per_page"]], cols, lay)
        write_png(path, img)
        outputs[os.path.basename(path)] = os.path.abspath(path)
        print(f"wrote {path} ({img.shape[1]}x{img.shape[0]}, {len(tiles[k: k + lay['per_page']])} frames)")
    for msg in warnings:
        print(f"  ! {msg}")
    return stamp({
        "command": "sheet",
        "video": os.path.abspath(video),
        "song": os.path.abspath(song_path) if song_path else None,
        "from": t0,
        "to": round(t0 + info["duration"], 3),
        "times": when,
        "outputs": outputs,
        "warnings": warnings,
    })
