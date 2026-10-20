"""Where the fixed beat grid stops fitting. Synthetic click tracks (made like test_beats.py) with a tempo step and a
slow drift are flagged within a bar or two of where the beats leave the grid, a steady track is not, and lyric words
keep their own times only inside the flagged stretch."""
import contextlib
import io
import json

import numpy as np
import pytest

from song2mv.cli import main
from song2mv.timing.lib import DEFAULT_CONFIG

SR = 22050
FIRST = 0.5  # seconds before the first beat
SECONDS = 60.0


def steady_beats():
    return np.arange(FIRST, SECONDS - 0.1, 0.6)


def step_beats(at=30.0):
    """100 BPM, then 120 BPM from the first beat after `at` (30.5 s)."""
    t, out = FIRST, []
    while t < SECONDS - 0.1:
        out.append(t)
        t += 60 / (100 if t < at else 120)
    return np.array(out)


def drift_beats():
    """From 100 up to 106 BPM, evenly over the whole minute."""
    t, out = FIRST, []
    while t < SECONDS - 0.1:
        out.append(t)
        t += 60 / (100 + 6 * (t - FIRST) / (SECONDS - FIRST))
    return np.array(out)


def render(beats, path):
    """A click on every beat and a low kick on the first beat of each bar."""
    sf = pytest.importorskip("soundfile")
    y = np.zeros(int(SECONDS * SR), dtype=np.float32)
    t = np.arange(int(0.08 * SR)) / SR
    click = (np.sin(2 * np.pi * 2000 * t) * np.exp(-t / 0.01)).astype(np.float32)
    kick = (np.sin(2 * np.pi * 60 * t) * np.exp(-t / 0.03)).astype(np.float32)
    for k, b in enumerate(beats):
        i = int(b * SR)
        n = min(len(t), len(y) - i)
        y[i:i + n] += 0.5 * click[:n] + (0.9 * kick[:n] if k % 4 == 0 else 0)
    sf.write(path, y, SR)


@pytest.fixture(scope="module")
def runs(tmp_path_factory):
    """`song2mv beats --json` once per track: {name: (result, grid.json, true beat times)}."""
    pytest.importorskip("librosa")
    d = tmp_path_factory.mktemp("tempo")
    out = {}
    for name, beats in (("steady", steady_beats()), ("step", step_beats()), ("drift", drift_beats())):
        wav, grid = d / f"{name}.wav", d / f"{name}.grid.json"
        render(beats, str(wav))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            assert main(["beats", str(wav), "--out", str(grid), "--json"]) == 0
        out[name] = (json.loads(buf.getvalue()), json.loads(grid.read_text(encoding="utf-8")), beats)
    return out


def test_a_steady_track_fits_everywhere(runs):
    res, grid, _ = runs["steady"]
    assert abs(grid["bpm"] - 100) < 0.5
    assert grid["off_grid"] == [] and res["off_grid"] == [] and res["warnings"] == []
    assert grid["local_offsets"] and not any(w["fits"] is False for w in grid["local_offsets"])


def test_a_tempo_step_is_flagged_where_it_happens(runs):
    res, grid, _ = runs["step"]
    assert abs(grid["bpm"] - 100) < 0.5  # the grid is the first half's
    [s] = grid["off_grid"]
    assert s["kind"] == "tempo" and abs(s["bpm"] - 120) < 1
    assert abs(s["from"] - 30.5) <= grid["bar"] and s["to"] == grid["duration"]
    assert res["off_grid"] == grid["off_grid"]
    [msg] = res["warnings"]
    assert msg.startswith("the tempo changes near 0:3") and "(100 → 120 BPM): the beat grid fits only before that" in msg


def test_a_drift_is_flagged_once_the_beats_leave_the_grid(runs):
    res, grid, beats = runs["drift"]
    P, phi = grid["beat"], grid["phi"]
    # how far each beat is from the grid, followed beat by beat (past half a beat, unlike the distance to the nearest)
    off = np.abs(np.unwrap((beats - phi) - np.round((beats - phi) / P) * P, period=P))
    best = int(np.argmin(off))  # the grid fits the drift best here, and the beats leave it after
    half_16th = next(b for b, x in zip(beats[best:], off[best:]) if x > P / 8)
    a_16th = next(b for b, x in zip(beats[best:], off[best:]) if x > P / 4)
    [s] = grid["off_grid"]
    assert s["kind"] == "drift" and s["bpm_from"] < s["bpm_to"]
    assert abs(s["from"] - half_16th) <= 2 * grid["bar"] and s["from"] < a_16th
    assert s["to"] == grid["duration"]
    assert res["warnings"][0].startswith("the tempo drifts")


def line(id_, wt):
    return {"id": id_, "section": id_.split("-")[0], "section_name": id_.split("-")[0], "kind": "mid", "text": "w " * len(wt),
            "words": ["w"] * len(wt), "wt": wt, "source": "asr"}


def test_words_snap_only_where_the_grid_fits():
    from song2mv.timing.build_lyrics import build

    stretch = {"from": 30.5, "to": 60.0, "bpm": 120.0, "kind": "tempo", "offset_ms": None}
    grid = {"bpm": 100.0, "beat": 0.6, "phi": 0.5, "downbeat_mod4": 0, "bar0": 0.5, "off_grid": [stretch]}
    merged = [line("v1-01", [10.07, 10.33]), line("v1-02", [25.07]), line("v2-01", [40.07, 40.33])]
    lyrics, mv = build(merged, grid, {**DEFAULT_CONFIG, "audio": "song.wav"}, 60.0)
    words = {r["id"]: [w["t"] for w in r["words"]] for r in lyrics["lines"]}
    assert words["v1-01"] == [10.1, 10.4] and words["v1-02"] == [25.1]  # on the 16th-note grid (0.15 s from 0.5 s)
    assert words["v2-01"] == [40.07, 40.33]  # whisper's times
    assert lyrics["grid"]["off_grid"] == mv["grid"]["off_grid"] == [stretch]


def test_warnings_name_the_kind_of_misfit():
    from song2mv.timing.beat_grid import describe_off_grid

    def msg(*stretches):
        return [m.split(";")[0] for m in describe_off_grid({"bpm": 90.0, "duration": 290.0, "off_grid": list(stretches)})]

    assert msg() == []
    assert msg({"from": 182.0, "to": 250.0, "bpm": 90.0, "kind": "shift", "offset_ms": 175}) == [
        "from 3:02 to 4:10 the beats sit 0.17 s later than the beat grid (the same 90 BPM)"]
    assert msg({"from": 0.0, "to": 138.0, "bpm": 86.7, "kind": "tempo", "offset_ms": None}) == [
        "the tempo is about 86.7 BPM until 2:18, then 90 BPM: the beat grid fits only after that"]
    [whole] = msg({"from": 0.0, "to": 290.0, "bpm": 100.0, "kind": "tempo", "offset_ms": None})
    assert whole.startswith("the beat grid (90 BPM) does not fit this song") and "picked wrong — rerun with --bpm 100" in whole
