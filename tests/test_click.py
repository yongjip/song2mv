"""`song2mv click`: a click track over a stretch of the song, for a person to check the timing by ear."""
import json

import numpy as np
import pytest

from song2mv.cli import main
from song2mv.timing.lib import write_json

pytest.importorskip("librosa")
sf = pytest.importorskip("soundfile")

SR = 44100


def work_folder(tmp_path, seconds=4.0):
    """A sync work folder for 4 s of silence: 120 BPM, first beat at 0.25 s, bars start on beat 0."""
    sf.write(tmp_path / "song.wav", np.zeros(int(seconds * SR), dtype=np.float32), SR)
    write_json({"audio": "song.wav"}, str(tmp_path / "song.json"))
    write_json({"bpm": 120.0, "beat": 0.5, "phi": 0.25, "downbeat_mod4": 0}, str(tmp_path / "grid.json"))
    write_json({"lines": [{"id": "v1-01", "words": [{"w": "la", "t": 1.0}, {"w": "la", "t": 1.5}]}]},
               str(tmp_path / "lyrics.json"))
    return tmp_path


def test_high_click_on_each_bar_low_click_on_beats_tick_on_words(tmp_path):
    from song2mv.timing.click_check import make_click

    res = make_click(str(work_folder(tmp_path)), 1.0, 3.0, words=True)
    assert list(res["outputs"]) == ["click-1-3.wav"] and res["to"] == 3.0
    y, sr = sf.read(res["outputs"]["click-1-3.wav"])
    assert sr == SR and len(y) == 2 * SR

    def peak(t):
        i = int((t - 1.0) * sr)
        return float(np.abs(y[i:i + int(0.04 * sr)]).max())

    assert peak(2.25) > 0.45                          # beat 4 starts bar 2: high click
    assert 0.3 < peak(1.25) < 0.4 and 0.3 < peak(2.75) < 0.4  # other beats: low click
    assert 0.12 < peak(1.0) < 0.2 and 0.12 < peak(1.5) < 0.2  # lyric words: soft tick
    assert peak(2.0) < 0.01                           # nothing between


def test_click_command_takes_the_song_json_and_prints_one_json(tmp_path, capsys):
    work = work_folder(tmp_path)
    assert main(["click", str(work / "song.json"), "--from", "1", "--to", "2", "--json"]) == 0
    res = json.loads(capsys.readouterr().out)
    assert res["ok"] and res["command"] == "click" and res["bpm"] == 120.0 and "ask_the_listener" in res
    assert (work / "click-1-2.wav").exists()


def test_click_needs_a_sync_work_folder_and_a_real_stretch(tmp_path, capsys):
    assert main(["click", str(tmp_path), "--json"]) == 2
    err = json.loads(capsys.readouterr().out)["error"]
    assert "song.json" in err["message"] and "sync" in err["hint"]
    work = work_folder(tmp_path)
    assert main(["click", str(work), "--from", "3", "--to", "2"]) == 2
    assert main(["click", str(work), "--from", "-1"]) == 2
    assert main(["click", str(work), "--from", "10"]) == 2  # past the end of a 4 s song
