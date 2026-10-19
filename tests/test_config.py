import json

import pytest

from song2mv import cli
from song2mv.timing import pipeline
from song2mv.timing.lib import load_config, write_json
from song2mv.timing.pipeline import config_from_audio, update_config


def test_config_from_audio_writes_song_json_and_keeps_hand_edits(tmp_path):
    audio = tmp_path / "My Song.mp3"
    audio.write_bytes(b"")
    work = tmp_path / "work"
    path = config_from_audio(str(audio), str(work), language="en", overrides={"whisper": {"runs": 5}})
    cfg = json.loads(open(path, encoding="utf-8").read())
    assert cfg["title"] == "My Song" and cfg["language"] == "en" and cfg["whisper"]["runs"] == 5

    cfg["manual"] = {"ch1-01": [98.5]}
    cfg["bpm"] = 90
    open(path, "w", encoding="utf-8").write(json.dumps(cfg))
    config_from_audio(str(audio), str(work), language="en")  # a rerun must not drop hand edits
    again = load_config(path)
    assert again["manual"] == {"ch1-01": [98.5]} and again["bpm"] == 90
    assert again["whisper"]["model"] == "small"  # defaults filled in


def test_update_config_saves_options_and_says_what_changed(tmp_path):
    path = tmp_path / "song.json"
    write_json({"audio": "a.mp3", "whisper": {"model": "small"}, "manual": {"v1-01": [1.0]}}, str(path))
    changed = update_config(str(path), language="ko", overrides={"bpm": 90.0, "whisper": {"runs": 5, "model": "small"}})
    assert changed == ["language", "bpm", "whisper.runs"]
    cfg = json.loads(path.read_text(encoding="utf-8"))
    assert cfg["whisper"] == {"model": "small", "runs": 5} and cfg["bpm"] == 90.0
    assert cfg["manual"] == {"v1-01": [1.0]}  # hand edits stay
    assert update_config(str(path), language="ko", overrides={"bpm": 90.0}) == []


def test_sync_rerun_on_a_song_json_applies_the_options(tmp_path, monkeypatch):
    path = tmp_path / "song.json"
    write_json({"audio": "a.mp3"}, str(path))
    monkeypatch.setattr(cli, "_need", lambda *a: None)
    monkeypatch.setattr(cli, "_need_ffmpeg", lambda: None)
    seen = {}
    monkeypatch.setattr(pipeline, "run", lambda cfg, work, start: seen.update(cfg=cfg, start=start) or {"command": "sync"})
    assert cli.main(["sync", str(tmp_path), "--runs", "5", "--model", "medium", "--from", "asr"]) == 0
    assert json.loads(path.read_text(encoding="utf-8"))["whisper"] == {"runs": 5, "model": "medium"}
    assert seen == {"cfg": str(path), "start": "asr"}


@pytest.mark.parametrize("runs", ["0", "-1", "two", "50"])
def test_runs_must_be_a_sensible_count(runs):
    with pytest.raises(SystemExit) as e:
        cli.main(["sync", "song.mp3", "--runs", runs])
    assert e.value.code == 2
