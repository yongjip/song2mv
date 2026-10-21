"""The bundled template rendered through render.mjs: needs Node, ffmpeg and `npm ci` in the template (CI's template job)."""
import os
import shutil
import subprocess

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
