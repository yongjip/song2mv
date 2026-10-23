"""Where the fixed beat grid stops fitting. Synthetic click tracks (made like test_beats.py) with a tempo step and a
slow drift are flagged within a bar or two of where the beats leave the grid, a steady track is not. A flagged track
gets a beat map that follows its beats, and lyric words snap to it; without a map they keep their own times inside
the flagged stretch."""
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
    assert "beats" not in grid  # one tempo fits: no beat map, grid.json as before


def map_error(grid, beats):
    """Seconds from each of the track's beats to the nearest beat of the map (the onset envelope puts beats ~15 ms late)."""
    m = np.array(grid["beats"])
    return np.array([np.abs(m - b).min() for b in beats])


@pytest.mark.parametrize("name", ["step", "drift"])
def test_a_flagged_track_gets_a_beat_map_that_follows_it(runs, name):
    res, grid, beats = runs[name]
    err = map_error(grid, beats)
    assert np.median(err) < 0.03 and err.max() < 0.06
    fixed = np.abs(beats - (grid["phi"] + np.round((beats - grid["phi"]) / grid["beat"]) * grid["beat"]))
    assert fixed.max() > 0.1  # the one tempo misses
    m = np.array(grid["beats"])
    bars = m[grid["downbeat_mod4"]::4]
    assert grid["bar0"] == bars[0] and np.abs(bars[:, None] - beats[None, ::4]).min(axis=1).max() < 0.06  # on the kicks
    assert "beat map in grid.json (`beats`) follows the music there" in res["warnings"][0]


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


def test_words_snap_to_the_beat_map_and_pinned_words_stay():
    from song2mv.timing.build_lyrics import apply_manual, finish, sections

    beats = list(np.round(0.5 + np.cumsum(np.r_[0, np.linspace(0.6, 0.5, 109)]), 3))  # 100 → 120 BPM
    stretch = {"from": 30.0, "to": 60.0, "bpm": 116.0, "kind": "drift", "offset_ms": None, "bpm_from": 110.0, "bpm_to": 120.0}
    grid = {"bpm": 100.0, "beat": 0.6, "phi": 0.5, "downbeat_mod4": 1, "bar0": beats[1], "off_grid": [stretch], "beats": beats}
    k = 80  # a beat inside the stretch
    q = (beats[k + 1] - beats[k]) / 4
    merged = [line("v1-01", [beats[10] + 0.02, beats[12] + 0.5 * q + 0.01]), line("v2-01", [beats[k] + q + 0.02]),
              line("v2-02", [beats[k + 4] + 0.02, beats[k + 5] + 0.03])]
    apply_manual(merged, {"v2-02": [beats[k + 4] + 0.02, beats[k + 5] + 0.03]})
    out = {r["id"]: [w["t"] for w in r["words"]] for r in finish(merged, grid, 4, 60.0)}
    assert out["v1-01"] == [beats[10], round(beats[12] + (beats[13] - beats[12]) / 4, 3)]  # 16ths of the map's beats
    assert out["v2-01"] == [round(beats[k] + q, 3)]  # inside the stretch too
    assert out["v2-02"] == [round(beats[k + 4] + 0.02, 3), round(beats[k + 5] + 0.03, 3)]  # pinned: kept
    lines = [{"id": "v1-01", "section": "v1", "section_name": "Verse 1", "kind": "mid", "start": beats[9] + 0.1},
             {"id": "ch-01", "section": "ch", "section_name": "Chorus", "kind": "hot", "start": beats[81] - 0.2}]
    secs = sections(lines, grid, 60.0)
    assert [s["start"] for s in secs] == [0.0, beats[9], beats[81]]  # on the map's bar lines (beats 9 and 81: % 4 == 1)


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

    def msg(*stretches, **grid):
        return [m.split(";")[0] for m in describe_off_grid({"bpm": 90.0, "duration": 290.0, "off_grid": list(stretches), **grid})]

    assert msg() == []
    assert msg({"from": 182.0, "to": 250.0, "bpm": 90.0, "kind": "shift", "offset_ms": 175}) == [
        "from 3:02 to 4:10 the beats sit 0.17 s later than the beat grid (the same 90 BPM)"]
    assert msg({"from": 0.0, "to": 138.0, "bpm": 86.7, "kind": "tempo", "offset_ms": None}) == [
        "the tempo is about 86.7 BPM until 2:18, then 90 BPM: the beat grid fits only after that"]
    [whole] = msg({"from": 0.0, "to": 290.0, "bpm": 100.0, "kind": "tempo", "offset_ms": None})
    assert whole.startswith("the beat grid (90 BPM) does not fit this song") and "picked wrong — rerun with --bpm 100" in whole
    # a drift everywhere: no single --bpm to rerun with
    [whole] = msg({"from": 0.0, "to": 290.0, "bpm": 80.0, "kind": "drift", "offset_ms": None, "bpm_from": 78.5, "bpm_to": 80.9})
    assert "drifts (78.5 → 80.9 BPM)" in whole and "--bpm 80" not in whole and "--bpm 81" not in whole
    # with a beat map the stretch is still named, and the map follows it
    shift = {"from": 182.0, "to": 250.0, "bpm": 90.0, "kind": "shift", "offset_ms": 175}
    [mapped] = describe_off_grid({"bpm": 90.0, "duration": 290.0, "off_grid": [shift], "beats": [0.1, 0.77, 1.43]})
    assert mapped.startswith("from 3:02 to 4:10 the beats sit 0.17 s later") and "the beat map in grid.json (`beats`) follows" in mapped


def test_a_tempo_pick_against_the_strongest_onsets_is_called_uncertain():
    from song2mv.timing.beat_grid import describe_pick

    cands = [{"P": 0.5084, "bpm": 118.02, "score": 0.18, "line_fit": 0.25}, {"P": 0.6778, "bpm": 88.52, "score": 0.12, "line_fit": 0.37}]
    [w] = describe_pick({"bpm": 88.522, "beat": 0.6778, "candidates": cands})
    assert w.startswith("the tempo pick is uncertain: the onsets fit 118.02 BPM best") and "(37% against 25%)" in w
    assert describe_pick({"bpm": 118.02, "beat": 0.5084, "candidates": cands}) == []  # the strongest one won
    given = [{k: v for k, v in c.items() if k != "line_fit"} for c in cands]
    assert describe_pick({"bpm": 88.52, "beat": 0.6778, "candidates": given}) == []  # given, or no lyric lines to vote
