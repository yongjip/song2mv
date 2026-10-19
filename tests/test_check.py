"""`song2mv check` on a synthetic video: runs end to end and returns the machine contract."""
import json
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")

SONG = {
    "duration": 12.0,
    "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}, {"id": "ch1", "kind": "hot", "start": 6.0, "end": 12.0}],
    "lines": [
        {"id": "v1-01", "section": "v1", "text": "moving picture", "start": 1.0, "end": 4.0},
        {"id": "ch1-01", "section": "ch1", "text": "still picture", "start": 7.0, "end": 10.0},
    ],
}


def test_check_flags_a_still_line(tmp_path):
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    # 0–6 s: moving test pattern; 6–12 s: one frozen colour
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-f", "lavfi", "-i", "color=c=gray:size=320x180:rate=10:duration=6",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    song = tmp_path / "mv.json"
    song.write_text(json.dumps(SONG), encoding="utf-8")
    res = score(str(mp4), str(song), quiet=True)
    assert res["schema_version"] == 1 and res["command"] == "check"
    moving = {r["id"]: r["motion"] for r in res["per_line"]}
    assert moving["v1-01"] > moving["ch1-01"]
    assert res["results"]["motion.min"]["ok"] is False
    assert "ch1-01" in res["results"]["motion.min"]["msg"]
