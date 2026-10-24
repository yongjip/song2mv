"""The beat grid on a synthetic click track: 100 BPM, a low kick on the first beat of every bar."""
import numpy as np
import pytest

librosa = pytest.importorskip("librosa")
sf = pytest.importorskip("soundfile")

SR = 22050
BPM = 100
FIRST = 0.5  # seconds before the first beat


def click_track(path, seconds=40.0):
    y = np.zeros(int(seconds * SR), dtype=np.float32)
    beat = 60 / BPM
    n = int((seconds - FIRST) / beat)
    t = np.arange(int(0.08 * SR)) / SR
    click = (np.sin(2 * np.pi * 2000 * t) * np.exp(-t / 0.01)).astype(np.float32)
    kick = (np.sin(2 * np.pi * 60 * t) * np.exp(-t / 0.03)).astype(np.float32)
    for k in range(n):
        i = int((FIRST + k * beat) * SR)
        y[i:i + len(t)] += 0.5 * click
        if k % 4 == 0:
            y[i:i + len(t)] += 0.9 * kick
    sf.write(path, y, SR)


def test_grid_finds_tempo_phase_and_bar(tmp_path):
    from song2mv.timing.beat_grid import find_grid

    wav = tmp_path / "click.wav"
    click_track(str(wav))
    g = find_grid(str(wav), "auto", None, None)
    assert abs(g["bpm"] - BPM) < 1.0
    assert abs(g["phi"] - FIRST) < 0.03
    assert g["downbeat_mod4"] == 0
    assert g["off_grid"] == []  # one tempo throughout: nothing flagged


@pytest.mark.parametrize("spacing, bpm", [(3.0, 100), (1.2, 200)])
def test_lyric_line_gaps_choose_the_tempo_only_when_its_grid_fits_the_music(tmp_path, spacing, bpm):
    # Lines 3 s apart are whole bars at 80 BPM, not at the clicks' 100: an 80 BPM grid misses the clicks, so it loses.
    # Lines 1.2 s apart are whole bars at 200 BPM, whose grid fits the clicks as well as 100 does: the line gaps keep it.
    from song2mv.timing.beat_grid import find_grid

    wav = tmp_path / "click.wav"
    click_track(str(wav))
    g = find_grid(str(wav), "auto", [FIRST + k * spacing for k in range(int(36 / spacing))], None)
    assert round(g["bpm"]) == bpm, g["why"]
