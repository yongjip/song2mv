"""The bundled template rendered through render.mjs: needs Node, ffmpeg and `npm ci` in the template (CI's template job)."""
import json
import os
import shutil
import subprocess

import numpy as np
import pytest

from song2mv.check.score import decode_gray
from song2mv.render.runner import BUNDLED

pytestmark = pytest.mark.skipif(
    not (shutil.which("node") and shutil.which("ffmpeg") and os.path.isdir(os.path.join(BUNDLED, "node_modules", "@remotion", "cli"))),
    reason="needs node, ffmpeg and the template installed (npm ci in src/song2mv/render/template)")


@pytest.mark.parametrize("to", ["2.0333", "2.0667", "2.1"])
def test_check_measures_a_draft_on_as_many_frames_as_its_full_render(tmp_path, to):
    # check measures N frames at 30 fps at each tenth of a second, ceil(N / 3) of them: 21 of the 61 in 2.0333 s
    manifest = tmp_path / "wrote.txt"
    for extra in ([], ["--draft"]):
        subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", to,
                        "--out", str(tmp_path), "--manifest", str(manifest), *extra],
                       cwd=BUNDLED, check=True, capture_output=True)
    full, draft = manifest.read_text(encoding="utf-8").split()
    assert draft.endswith("-draft.mp4")
    assert len(decode_gray(draft, 64, 36)) == len(decode_gray(full, 64, 36)) == -(-round(float(to) * 30) // 3)


VERTICAL_SCENES = """
import React from "react";
import { Svg, Song, pixel, verticalView } from "../kit";

const SUBJECTS = [[1000, 600], [1900, 600], [1003, 597]];
const view = (i: number, x: number, y: number) =>
  i < 2 ? verticalView({ x, y, zoom: 2 }) : pixel.cameraAt(0, [{ t: 0, x, y, zoom: 2.4 }], { px: 8, vertical: true });

export const Scene: React.FC<{ T: number }> = () => null;
export const linesDrawnByScene = (_song: Song) => new Set<string>();
export const VerticalScene: React.FC<{ T: number }> = ({ T }) => {
  const [x, y] = SUBJECTS[Math.round(T)];
  return (
    <Svg w={1080} h={1920}>
      <g transform={view(Math.round(T), x, y).svg}>
        <rect x={0} y={0} width={1920} height={1080} fill="#203040" />
        <rect x={x - 5} y={y - 5} width={10} height={10} fill="#ff0000" />
      </g>
    </Svg>
  );
};
"""


def test_vertical_view_puts_the_subject_in_the_picture_area_and_keeps_the_frame_on_the_stage(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(VERTICAL_SCENES, encoding="utf-8")
    (tmp_path / "sheet.json").write_text('{"times": [0, 1, 2], "cols": 3, "vertical": true}', encoding="utf-8")
    subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Contact",
                    "--props", str(tmp_path / "sheet.json"), "--out", str(tmp_path), "--name", "v"],
                   cwd=template, check=True, capture_output=True)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp_path / "v-Contact.png"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(-1, 1920, 3).astype(int)
    red = (rgb[..., 0] > 200) & (rgb[..., 1] < 60) & (rgb[..., 2] < 60)
    gap, tile = 12, (1920 - 12 * 4) / 3
    scale = tile / 1080
    found = []
    for i in range(3):
        ys, xs = np.nonzero(red[:, round(gap + i * (tile + gap)):round(gap + i * (tile + gap) + tile)])
        found.append((xs.mean() / scale, (ys.mean() - gap) / scale))
    # the subject on the picture area's middle; at the stage's right edge the frame stops there; a pixel scene on 16 px blocks
    for (x, y), (ex, ey) in zip(found, [(540, 674.5), (1040, 674.5), (534, 682)]):
        assert abs(x - ex) < 3 and abs(y - ey) < 3, found


PIXEL_PROBE = """
import { cameraAt } from "%s";

const RUNS = {
  glide: [{ t: 0, x: 960, y: 540, zoom: 2 }, { t: 2, x: 700, y: 500, zoom: 1, glide: 1 }],
  drift: [{ t: 0, x: 960, y: 540, zoom: 1, to: { zoom: 1.8 } }, { t: 4, x: 960, y: 540 }],
};
const zooms = (shots: typeof RUNS.glide) => Array.from({ length: 81 }, (_, k) => k / 20)
  .map((T) => [T, cameraAt(T, shots, { px: 8 }).zoom, cameraAt(T, shots, { px: 8, vertical: true }).zoom]);
console.log(JSON.stringify({ glide: zooms(RUNS.glide), drift: zooms(RUNS.drift) }));
"""


def test_a_pixel_short_changes_zoom_when_its_16x9_version_does(tmp_path):
    probe = tmp_path / "probe.ts"
    probe.write_text(PIXEL_PROBE % os.path.join(BUNDLED, "src", "kit", "styles", "pixel"), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    runs = json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)
    # a glide from zoom 2 to 1 cuts on its shot's time in both frames; a drift in zoom shows in neither
    assert [(T, wide) for T, wide, _ in runs["glide"]] == [(T, 2 if T < 2 else 1) for T, _, _ in runs["glide"]]
    assert all(wide == tall for _, wide, tall in runs["glide"]), runs["glide"]
    assert {(wide, tall) for _, wide, tall in runs["drift"]} == {(1, 1)}, runs["drift"]
