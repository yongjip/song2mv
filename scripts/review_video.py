"""Compare chosen encoded frames at native resolution. Developer tool, not a quality verdict."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import numpy as np

from song2mv.check import font
from song2mv.check.sheet import GAP, page, probe, write_png
from song2mv.errors import Song2mvError


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def native_frame(video: Path, index: int, crop: tuple[int, int, int, int]) -> np.ndarray:
    x, y, width, height = crop
    filters = f"select=eq(n\\,{index}),format=rgb24,crop={width}:{height}:{x}:{y}"
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf", filters, "-frames:v", "1", "-an", "-sn",
         "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True,
    )
    if len(result.stdout) != width * height * 3:
        raise ValueError(f"No complete frame {index} in {video}")
    return np.frombuffer(result.stdout, np.uint8).reshape(height, width, 3)


def compare_frames(before: Path, after: Path, frames: list[int], out: Path,
                   crop: tuple[int, int, int, int] | None = None) -> dict:
    sources = [before.resolve(), after.resolve()]
    infos = [probe(str(source)) for source in sources]
    info = infos[0]
    if not info["fps"] or any(any(other[key] != info[key] for key in ("w", "h", "fps", "frames")) for other in infos[1:]):
        raise ValueError("Compare exports with identical dimensions, frame rates, and frame counts")
    if not frames or len(frames) > 100 or any(type(n) is not int or n < 0 or n >= info["frames"] for n in frames):
        raise ValueError("Choose 1 to 100 frame indices inside both videos")
    x, y, width, height = crop or (0, 0, info["w"], info["h"])
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > info["w"] or y + height > info["h"]:
        raise ValueError("The crop must fit inside both videos")
    hashes = [sha256(source) for source in sources]
    out.mkdir(parents=True, exist_ok=False)
    started = perf_counter()
    records = []
    scale = 2 if width >= 400 else 1
    lay = {"tw": width, "th": height, "scale": scale, "row_h": height + (font.ROWS + 3) * scale + GAP}
    for index in frames:
        tiles = [native_frame(source, index, (x, y, width, height)) for source in sources]
        outputs = {}
        for name, tile in zip(("before", "after"), tiles):
            name = f"frame-{index:06d}-{name}.png"
            write_png(str(out / name), tile)
            outputs[name] = sha256(out / name)
        pair_name = f"frame-{index:06d}-pair.png"
        labels = [(f"frame {index} {float(index / info['fps']):.4f} s", side) for side in ("BEFORE", "AFTER")]
        write_png(str(out / pair_name), page(tiles, labels, 2, lay))
        outputs[pair_name] = sha256(out / pair_name)
        records.append({"frame": index, "video_time": float(index / info["fps"]), "outputs": outputs})
    if hashes != [sha256(source) for source in sources]:
        raise ValueError("A source changed during extraction. Repeat with immutable exports")
    record = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "unreviewed", "normal_speed_review": "unverified",
        "sources": [{"path": str(source), "sha256": digest} for source, digest in zip(sources, hashes)],
        "size": [info["w"], info["h"]], "fps": str(info["fps"]), "frame_count": info["frames"],
        "crop": [x, y, width, height], "scale": 1, "frames": records,
        "extraction_seconds": perf_counter() - started,
        "limits": "Frame indices are exact. Times use the average frame rate and assume constant frame rate. "
                  "Images and hashes establish provenance, not motion quality or naturalness.",
    }
    (out / "manifest.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--frames", required=True, help="Comma-separated, zero-based encoded frame indices")
    parser.add_argument("--crop", help="Native pixels: x,y,width,height. The same crop is used on both exports")
    parser.add_argument("--out", required=True, type=Path, help="A new directory outside the repository")
    args = parser.parse_args()
    try:
        frames = list(dict.fromkeys(int(n) for n in args.frames.split(",")))
        crop = tuple(int(n) for n in args.crop.split(",")) if args.crop else None
        if crop is not None and len(crop) != 4:
            raise ValueError("--crop takes x,y,width,height")
        result = compare_frames(args.before, args.after, frames, args.out, crop)
    except (ValueError, OSError, Song2mvError, subprocess.CalledProcessError) as error:
        parser.exit(2, f"review_video: {error}\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
