"""Developer tools use real subprocesses and synthetic encoded frames."""
import hashlib
import json
import os
import runpy
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pytest

from song2mv.check.sheet import probe

ROOT = Path(__file__).resolve().parents[1]
compare_frames = runpy.run_path(str(ROOT / "scripts/review_video.py"))["compare_frames"]
run_timed = runpy.run_path(str(ROOT / "scripts/time_command.py"))["run_timed"]


def test_timing_preserves_failure_log_and_exit_status(tmp_path):
    out = tmp_path / "failed"
    record = run_timed([sys.executable, "-c", "import sys; print('measured'); sys.exit(7)"], out, tmp_path)
    assert record["returncode"] == 7
    assert record["seconds"] >= 0
    assert "measured" in (out / "command.log").read_text()
    assert json.loads((out / "timing.json").read_text()) == record
    with pytest.raises(FileExistsError):
        run_timed([sys.executable, "-c", "pass"], out, tmp_path)
    assert "measured" in (out / "command.log").read_text()


def test_timing_missing_command_is_recorded(tmp_path):
    assert run_timed([str(tmp_path / "missing-program")], tmp_path / "missing", tmp_path)["returncode"] == 127
    with pytest.raises(ValueError, match="command"):
        run_timed([], tmp_path / "empty", tmp_path)
    assert not (tmp_path / "empty").exists()


def test_timing_cli_returns_child_failure(tmp_path):
    result = subprocess.run([sys.executable, str(ROOT / "scripts/time_command.py"), "--out", str(tmp_path / "cli"),
                             "--", sys.executable, "-c", "raise SystemExit(4)"], capture_output=True, text=True)
    assert result.returncode == 4
    assert json.loads(result.stdout)["returncode"] == 4


@pytest.mark.skipif(os.name == "nt", reason="uses POSIX SIGINT delivery")
def test_interrupted_timing_keeps_elapsed_time_and_reaps_child(tmp_path):
    out = tmp_path / "interrupted"
    child = "import os,time; print(os.getpid(), flush=True); time.sleep(30)"
    process = subprocess.Popen([sys.executable, str(ROOT / "scripts/time_command.py"), "--out", str(out),
                                "--", sys.executable, "-c", child], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic() + 10
        log = out / "command.log"
        while not log.exists() or not log.read_text().strip():
            if time.monotonic() > deadline:
                pytest.fail("The timed child did not start")
            time.sleep(0.01)
        child_pid = int(log.read_text().strip())
        process.send_signal(signal.SIGINT)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 130, stderr
        record = json.loads(stdout)
        assert record["interrupted"] is True
        assert record["seconds"] >= 0
        assert json.loads((out / "timing.json").read_text()) == record
        with pytest.raises(ProcessLookupError):
            os.kill(child_pid, 0)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def make_video(tmp_path, name="source.mp4", fps=24):
    values = np.zeros((6, 24, 40, 3), np.uint8)
    for index, frame in enumerate(values):
        frame[:] = (20 + index * 30, 40, 60)
        frame[5:15, 10:22] = (120, 80 + index * 20, 200)
    video = tmp_path / name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "40x24", "-r", str(fps),
                    "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", str(video)], input=values.tobytes(), check=True)
    return video


def decode(path):
    size = probe(str(path)) if path.suffix == ".mp4" else None
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            capture_output=True, check=True)
    return np.frombuffer(result.stdout, np.uint8).reshape(-1, 24, 40, 3) if size else result.stdout


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_review_extracts_exact_encoded_frames_without_resizing(tmp_path):
    video = make_video(tmp_path)
    frames = decode(video)
    out = tmp_path / "native"
    record = compare_frames(video, video, [0, 2, 5], out, (10, 5, 12, 10))
    assert record["status"] == "unreviewed"
    assert record["normal_speed_review"] == "unverified"
    assert record["scale"] == 1
    assert record["sources"][0]["sha256"] == hashlib.sha256(video.read_bytes()).hexdigest()
    for index in [0, 2, 5]:
        image = out / f"frame-{index:06d}-before.png"
        assert decode(image) == frames[index, 5:15, 10:22].tobytes()
        assert image.read_bytes() == (out / f"frame-{index:06d}-after.png").read_bytes()
        pair = out / f"frame-{index:06d}-pair.png"
        data = decode(pair)
        assert len(data) > 2 * 12 * 10 * 3
    assert json.loads((out / "manifest.json").read_text()) == record
    with pytest.raises(FileExistsError):
        compare_frames(video, video, [0], out)


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_review_rejects_mismatched_exports_and_invalid_regions(tmp_path):
    video = make_video(tmp_path)
    other = make_video(tmp_path, "other.mp4", fps=30)
    out = tmp_path / "rejected"
    with pytest.raises(ValueError, match="identical"):
        compare_frames(video, other, [0], out)
    for crop in [(-1, 0, 2, 2), (0, 0, 41, 24), (0, 0, 0, 2)]:
        with pytest.raises(ValueError, match="crop"):
            compare_frames(video, video, [0], out, crop)
    for frames in [[-1], [6], []]:
        with pytest.raises(ValueError, match="indices"):
            compare_frames(video, video, frames, out)
    assert not out.exists()


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_review_cli_rejects_malformed_crop(tmp_path):
    video = make_video(tmp_path)
    env = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
    result = subprocess.run([sys.executable, str(ROOT / "scripts/review_video.py"), str(video), str(video),
                             "--frames", "0", "--crop", "1,2,3", "--out", str(tmp_path / "bad")],
                            capture_output=True, text=True, env=env)
    assert result.returncode == 2
    assert "--crop takes" in result.stderr
    assert "Traceback" not in result.stderr
