"""Swing, on synthetic drum loops: a kick or a snare on every beat, and hats on the beat, on the 8th note and on the 2nd
and 4th 16th notes. Where the 16ths come clearly late, grid.json has `swing` and lyric words snap to those 16ths; a
straight, a lightly swung and a sextuplet groove get no `swing`."""
import contextlib
import io
import json

import numpy as np
import pytest

from song2mv.cli import main
from song2mv.timing.lib import DEFAULT_CONFIG

SR = 22050
BPM = 92
FIRST = 0.5


def hats(s1, s3):
    return [(0.0, 0.5), (s1, 0.25), (0.5, 0.4), (s3, 0.25)]


def loop(path, hits, beats=None, seconds=20.0):
    """A hit of the hat at each (position inside the beat, gain) of `hits`, on `beats` (times) or at BPM."""
    sf = pytest.importorskip("soundfile")
    rng = np.random.default_rng(0)
    beats = np.arange(FIRST, seconds - 1, 60 / BPM) if beats is None else beats
    t = np.arange(int(0.2 * SR)) / SR
    kick = np.sin(2 * np.pi * (50 + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.08)
    snare = 0.6 * rng.standard_normal(len(t)) * np.exp(-t / 0.06) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    hat = np.diff(rng.standard_normal(len(t) + 1)) * np.exp(-t / 0.025)
    y = np.zeros(int(seconds * SR))
    for k, (b, nxt) in enumerate(zip(beats, beats[1:])):
        for at, sound, gain in [(0.0, kick if k % 2 == 0 else snare, 0.8)] + [(q, hat, g) for q, g in hits]:
            i = int((b + at * (nxt - b)) * SR)
            y[i:i + len(t)] += gain * sound[:len(y) - i]
    sf.write(path, (0.9 * y / np.abs(y).max()).astype(np.float32), SR)


@pytest.fixture(scope="module")
def grids(tmp_path_factory):
    """`song2mv beats --json` once per loop: {name: grid.json}."""
    pytest.importorskip("librosa")
    d = tmp_path_factory.mktemp("swing")
    loops = {"swung": hats(0.33, 0.83), "straight": hats(0.25, 0.75), "light": hats(0.27, 0.77),
             "sextuplets": [(j / 6, 0.5 if j % 3 == 0 else 0.25) for j in range(6)]}
    out = {}
    for name, hits in loops.items():
        wav, grid = d / f"{name}.wav", d / f"{name}.grid.json"
        loop(str(wav), hits)
        with contextlib.redirect_stdout(io.StringIO()):
            assert main(["beats", str(wav), "--out", str(grid), "--json"]) == 0
        out[name] = json.loads(grid.read_text(encoding="utf-8"))
    return out


def test_late_16ths_are_measured_from_the_beat(grids):
    g = grids["swung"]
    assert abs(g["bpm"] - BPM) < 0.5
    assert g["swing"] == pytest.approx([0.33, 0.83], abs=0.01)


@pytest.mark.parametrize("name", ["straight", "light", "sextuplets"])
def test_straight_light_and_sextuplet_grooves_have_no_swing(grids, name):
    assert abs(grids[name]["bpm"] - BPM) < 0.5
    assert "swing" not in grids[name]


def test_swing_is_measured_on_the_beat_map(tmp_path):
    librosa = pytest.importorskip("librosa")
    from song2mv.timing.beat_grid import map_number, swing

    t, beats = FIRST, []
    while t < 39.9:
        beats.append(t)
        t += 60 / (100 + 6 * (t - FIRST) / 39.5)  # 100 → 106 BPM
    loop(str(tmp_path / "drift.wav"), hats(0.33, 0.83), np.array(beats), seconds=40.0)
    y, sr = librosa.load(str(tmp_path / "drift.wav"), sr=SR)
    yp = librosa.effects.hpss(y, margin=3.0)[1]
    with contextlib.redirect_stdout(io.StringIO()):
        measured = swing(yp, sr, lambda t: map_number(beats, t), lambda t: np.ones(len(t), bool))
    assert measured == pytest.approx([0.33, 0.83], abs=0.01)


def line(id_, wt):
    return {"id": id_, "section": id_.split("-")[0], "section_name": id_.split("-")[0], "kind": "mid", "text": "w " * len(wt),
            "words": ["w"] * len(wt), "wt": wt, "source": "asr"}


GRID = {"bpm": 100.0, "beat": 0.6, "phi": 0.5, "downbeat_mod4": 0, "bar0": 0.5, "off_grid": []}


def test_words_snap_to_the_swung_16ths():
    from song2mv.timing.build_lyrics import build

    b = 0.5 + 10 * 0.6  # beat 10
    at = lambda q: round(b + q * 0.6, 3)  # noqa: E731
    merged = [line("v1-01", [b + 0.01, at(0.25), at(0.47), at(0.75), at(0.95)]), line("v1-02", [at(4.16), at(4.2)]),
              line("v1-03", [at(8.3), at(8.8)])]
    cfg = {**DEFAULT_CONFIG, "audio": "song.wav"}
    swung = {**GRID, "swing": [0.33, 0.83]}
    lyrics, mv = build(merged, swung, cfg, 60.0)
    words = {r["id"]: [w["t"] for w in r["words"]] for r in lyrics["lines"]}
    assert words["v1-01"] == [b, at(0.33), at(0.5), at(0.83), at(1)]  # a straight 16th's time goes to the swung one
    assert words["v1-02"] == [at(4), at(4.33)]  # halfway between the beat and the 2nd 16th is 0.165
    assert words["v1-03"] == [at(8.33), at(8.83)]
    assert lyrics["grid"]["swing"] == mv["grid"]["swing"] == [0.33, 0.83]
    eighths, _ = build(merged, swung, {**cfg, "snap_per_beat": 2}, 60.0)
    assert [w["t"] for w in eighths["lines"][2]["words"]] == [at(8.5), at(9)]  # 8th notes stay straight
    straight, _ = build(merged, GRID, cfg, 60.0)
    assert [w["t"] for w in straight["lines"][0]["words"]] == [b, at(0.25), at(0.5), at(0.75), at(1)]
    assert "swing" not in straight["grid"] and eighths["grid"]["swing"] == [0.33, 0.83]  # the song's, for the template


def test_swung_16ths_follow_the_beat_map_and_pins_stay():
    from song2mv.timing.build_lyrics import apply_manual, finish

    beats = list(np.round(0.5 + np.cumsum(np.r_[0, np.linspace(0.6, 0.5, 109)]), 3))
    grid = {**GRID, "bar0": beats[0], "beats": beats, "swing": [0.33, 0.83],
            "off_grid": [{"from": 30.0, "to": 60.0, "bpm": 116.0, "kind": "drift", "offset_ms": None}]}
    k = 80
    q = beats[k + 1] - beats[k]
    merged = [line("v2-01", [beats[k] + 0.27 * q, beats[k] + 0.78 * q]), line("v2-02", [beats[k + 4] + 0.27 * q])]
    apply_manual(merged, {"v2-02": [beats[k + 4] + 0.27 * q]})
    out = {r["id"]: [w["t"] for w in r["words"]] for r in finish(merged, grid, 4, 60.0)}
    assert out["v2-01"] == pytest.approx([beats[k] + 0.33 * q, beats[k] + 0.83 * q], abs=0.0011)
    assert out["v2-02"] == [round(beats[k + 4] + 0.27 * q, 3)]
