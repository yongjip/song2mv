"""Work folders and caches are tied to the audio's content and the transcription settings."""
import json
import shutil

import pytest

from song2mv.errors import Song2mvError
from song2mv.timing import transcribe
from song2mv.timing.lib import asr_key, file_sha256, key_change, write_json
from song2mv.timing.pipeline import STATE, claim_folder, config_from_audio

CFG = {"language": "ko", "whisper": {"model": "small", "compute_type": "int8", "beam_size": 5, "runs": 2}}


def song(tmp_path, name, data=b"a"):
    p = tmp_path / name
    p.write_bytes(data)
    return p


def test_folder_of_another_song_is_refused(tmp_path):
    a, b = song(tmp_path, "a.mp3", b"song a"), song(tmp_path, "b.mp3", b"song b")
    work = tmp_path / "work"
    config_from_audio(str(a), str(work))
    with pytest.raises(Song2mvError) as e:
        config_from_audio(str(b), str(work))
    assert "another audio file" in e.value.message


def test_moved_audio_with_the_same_content_is_accepted(tmp_path):
    a = song(tmp_path, "a.mp3", b"song a")
    work = tmp_path / "work"
    config_from_audio(str(a), str(work))
    write_json({"audio": str(a), "audio_sha256": file_sha256(str(a)), "lyrics_from": "tag"}, str(work / STATE))
    moved = tmp_path / "moved.mp3"
    shutil.move(str(a), str(moved))
    claim_folder(str(work), str(moved))  # no error
    path = config_from_audio(str(moved), str(work))
    assert json.loads(open(path, encoding="utf-8").read())["audio"] == str(moved)


def test_key_change_says_why():
    old = asr_key(CFG, "aaa")
    assert key_change(None, old) == "made by an older song2mv"
    assert key_change(old, asr_key(CFG, "bbb")) == "the audio changed"
    other = {**CFG, "language": "en", "whisper": {**CFG["whisper"], "model": "medium"}}
    msg = key_change(old, asr_key(other, "aaa"))
    assert "model 'small' → 'medium'" in msg and "language 'ko' → 'en'" in msg


def test_cached_runs_are_reused_only_for_the_same_key(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(transcribe, "decode", lambda path: [0.0])
    monkeypatch.setattr(transcribe, "transcribe_array",
                        lambda audio, w, language, pad=0.0, seed=None: calls.append(seed) or
                        {"language": language, "segments": [], "words": []})
    out = tmp_path / "asr"
    key = asr_key(CFG, "aaa")
    transcribe.run_all("x.mp3", str(out), CFG["whisper"], "ko", key=key)
    assert calls == [1, 2]
    transcribe.run_all("x.mp3", str(out), CFG["whisper"], "ko", key=key)
    assert calls == [1, 2]  # same audio and settings: both runs reused
    transcribe.run_all("x.mp3", str(out), CFG["whisper"], "ko", key=asr_key(CFG, "bbb"))
    assert calls == [1, 2, 1, 2]  # the audio changed: both runs redone
    assert json.loads((out / "run1.json").read_text(encoding="utf-8"))["key"]["audio_sha256"] == "bbb"
