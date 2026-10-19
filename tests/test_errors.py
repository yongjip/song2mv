"""Errors: one message on stderr, one JSON object on stdout under --json, exit 2. A failing check alone exits 1."""
import json
import shutil

import pytest

from song2mv.cli import main
from song2mv.errors import Song2mvError

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffprobe"), reason="needs ffmpeg")


def run_json(capsys, argv):
    code = main(argv + ["--json"])
    out = capsys.readouterr().out.strip().splitlines()
    assert len(out) == 1, out  # exactly one JSON object on stdout
    return code, json.loads(out[0])


@needs_ffmpeg
def test_missing_video_is_an_error_not_a_failed_check(capsys, tmp_path):
    song = tmp_path / "mv.json"
    song.write_text("{}", encoding="utf-8")
    code, res = run_json(capsys, ["check", str(tmp_path / "nope.mp4"), "--song", str(song)])
    assert code == 2
    assert res["schema_version"] == 1 and res["ok"] is False and "not found" in res["error"]["message"]


def test_missing_mv_json_for_render(capsys, tmp_path):
    code, res = run_json(capsys, ["render", str(tmp_path / "missing.json")])
    assert code == 2 and res["command"] == "render" and res["ok"] is False


@needs_ffmpeg
def test_missing_audio_writes_nothing(capsys, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    code = main(["sync", "nope.mp3", "--language", "en"])
    assert code == 2
    assert "error" in capsys.readouterr().err
    assert not (tmp_path / "song2mv-work").exists()  # no junk song.json


def test_bad_bpm_is_a_usage_error():
    with pytest.raises(SystemExit) as e:
        main(["beats", "x.wav", "--bpm", "abc"])
    assert e.value.code == 2


def test_manual_values_accept_a_number_and_name_bad_ids():
    from song2mv.timing.build_lyrics import apply_manual
    lines = [{"id": "v1-01", "words": ["a", "b"], "wt": [None, None]}]
    apply_manual(lines, {"v1-01": 98.5})
    assert lines[0]["wt"] == [98.5, None] and lines[0]["source"] == "manual"
    with pytest.raises(Song2mvError) as e:
        apply_manual(lines, {"v1-01": "soon"})
    assert "v1-01" in e.value.message
