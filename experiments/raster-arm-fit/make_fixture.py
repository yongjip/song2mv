"""Create a synthetic translation input for a solver smoke test outside the repository."""

import argparse
import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path, help="A new directory outside the repository")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    frames = args.out / "target-arm-frames"
    frames.mkdir()
    cx, cy, radius = 112, 56, 22
    k = radius * 0.55228475
    points = [
        [cx + radius, cy],
        [cx + radius, cy + k],
        [cx + k, cy + radius],
        [cx, cy + radius],
        [cx - k, cy + radius],
        [cx - radius, cy + k],
        [cx - radius, cy],
        [cx - radius, cy - k],
        [cx - k, cy - radius],
        [cx, cy - radius],
        [cx + k, cy - radius],
        [cx + radius, cy - k],
    ]
    initial = {
        "canvas": {"width": 256, "height": 112, "origin": [0, 0]},
        "paths": [{"id": "synthetic-disk", "group": 0, "closed": True, "width": 3, "color": [88 / 255, 73 / 255, 67 / 255, 1], "points": points}],
    }
    (args.out / "initial-arm.json").write_text(json.dumps(initial, indent=2) + "\n")
    for index in range(72):
        shift = round(12 * math.sin(index / 71 * math.pi))
        image = Image.new("RGB", (256, 112), "white")
        ImageDraw.Draw(image).ellipse((cx + shift - radius, cy - radius, cx + shift + radius, cy + radius), fill=(88, 73, 67), outline=(71, 60, 53), width=3)
        image.save(frames / f"{index:03d}.png")
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-framerate",
            "24",
            "-i",
            str(frames / "%03d.png"),
            "-c:v",
            "libx264",
            "-crf",
            "1",
            "-pix_fmt",
            "yuv444p",
            str(args.out / "target-arm.mp4"),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
