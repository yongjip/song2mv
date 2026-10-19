"""Mix a click track over a stretch of the song so a person can hear whether the beat grid is right.

High click = first beat of a bar, low click = other beats. Optionally a soft tick on every lyric word
(--words), to hear whether the lyric timing sits on the voice. Listen for flams: if the clicks drift
ahead of or behind the drums, the tempo or the first beat is off; if the high click is not on the
"one", set downbeat_mod4 in the song config.

Usage: python -m song2mv.timing.click_check work/my-song --from 90 --to 110 [--words] [--out work/my-song/click.wav]
(reads song.json, grid.json and lyrics.json from that folder)
"""
from __future__ import annotations

import argparse
import json
import os

from .lib import load_config

SR = 44100


def tone(freq: float, dur: float, gain: float):
    import numpy as np
    t = np.arange(int(dur * SR)) / SR
    return gain * np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur / 4))


def main() -> None:
    import librosa
    import numpy as np
    from scipy.io import wavfile

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    ap.add_argument("--words", action="store_true")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    cfg = load_config(os.path.join(a.work, "song.json"))
    grid = json.load(open(os.path.join(a.work, "grid.json")))
    y, _ = librosa.load(cfg["audio"], sr=SR, mono=True, offset=a.t0, duration=None if a.t1 is None else a.t1 - a.t0)
    mix = 0.6 * y
    hi, lo, tick = tone(1760, 0.06, 0.5), tone(880, 0.05, 0.35), tone(3200, 0.02, 0.18)

    def add(t: float, snd) -> None:
        i = int(round((t - a.t0) * SR))
        if 0 <= i < len(mix):
            n = min(len(snd), len(mix) - i)
            mix[i:i + n] += snd[:n]

    P, phi, down = grid["beat"], grid["phi"], grid["downbeat_mod4"]
    end = a.t0 + len(mix) / SR
    k = int(np.ceil((a.t0 - phi) / P))
    while phi + k * P < end:
        add(phi + k * P, hi if k % 4 == down else lo)
        k += 1
    if a.words:
        for line in json.load(open(os.path.join(a.work, "lyrics.json")))["lines"]:
            for w in line["words"]:
                add(w["t"], tick)
    out = a.out or os.path.join(a.work, f"click-{a.t0:g}-{end:g}.wav")
    wavfile.write(out, SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    print(f"{out}  ({grid['bpm']} BPM, bar starts at beat % 4 == {down})")


if __name__ == "__main__":
    main()
