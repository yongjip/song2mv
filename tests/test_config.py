import json

from song2mv.timing.lib import load_config
from song2mv.timing.pipeline import config_from_audio


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
