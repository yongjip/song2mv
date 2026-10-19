"""Mix a click track over a stretch of the song so a person can hear whether the beat grid is right.

High click = first beat of a bar, low click = other beats. Optionally a soft tick on every lyric word
(--words), to hear whether the lyric timing sits on the voice. Listen for flams: if the clicks drift
ahead of or behind the drums, the tempo or the first beat is off; if the high click is not on the
"one", set downbeat_mod4 in the song config.

Run it as `song2mv click WORK --from 90 --to 110 [--words]` (reads song.json, grid.json and lyrics.json from WORK
and writes WORK/click-<from>-<to>.wav). `python -m song2mv.timing.click_check` takes the same arguments.
"""
from __future__ import annotations

import argparse
import json
import os

from ..contract import stamp
from ..errors import Song2mvError
from .lib import load_config

SR = 44100
WHAT_TO_ASK = ("Listen: do the clicks sit on the drums (no flams)? Is the high click on the 'one' of each bar? "
               "With --words: do the soft ticks land on the sung syllables?")


def tone(freq: float, dur: float, gain: float):
    import numpy as np
    t = np.arange(int(dur * SR)) / SR
    return gain * np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur / 4))


def make_click(work: str, t0: float = 0.0, t1: float | None = None, words: bool = False, out: str | None = None) -> dict:
    for name in ("song.json", "grid.json") + (("lyrics.json",) if words else ()):
        if not os.path.isfile(os.path.join(work, name)):
            raise Song2mvError(f"{work} has no {name}", hint="run `song2mv sync` first; click takes its work folder")
    if t0 < 0 or (t1 is not None and t1 <= t0):
        raise Song2mvError(f"--from must be zero or more and --to after it (got --from {t0:g}, --to {t1})")
    import librosa
    import numpy as np
    from scipy.io import wavfile

    cfg = load_config(os.path.join(work, "song.json"))
    grid = json.load(open(os.path.join(work, "grid.json"), encoding="utf-8"))
    y, _ = librosa.load(cfg["audio"], sr=SR, mono=True, offset=t0, duration=None if t1 is None else t1 - t0)
    if not len(y):
        raise Song2mvError(f"nothing to play between {t0} and {t1} s (the song is shorter)")
    mix = 0.6 * y
    hi, lo, tick = tone(1760, 0.06, 0.5), tone(880, 0.05, 0.35), tone(3200, 0.02, 0.18)

    def add(t: float, snd) -> None:
        i = int(round((t - t0) * SR))
        if 0 <= i < len(mix):
            n = min(len(snd), len(mix) - i)
            mix[i:i + n] += snd[:n]

    P, phi, down = grid["beat"], grid["phi"], grid["downbeat_mod4"]
    end = t0 + len(mix) / SR
    k = int(np.ceil((t0 - phi) / P))
    while phi + k * P < end:
        add(phi + k * P, hi if k % 4 == down else lo)
        k += 1
    if words:
        for line in json.load(open(os.path.join(work, "lyrics.json"), encoding="utf-8"))["lines"]:
            for w in line["words"]:
                add(w["t"], tick)
    out = out or os.path.join(work, f"click-{t0:g}-{end:g}.wav")
    wavfile.write(out, SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    print(f"{out}  ({grid['bpm']} BPM, bar starts at beat % 4 == {down})")
    print(WHAT_TO_ASK)
    return stamp({"command": "click", "outputs": {os.path.basename(out): os.path.abspath(out)}, "from": t0,
                  "to": round(end, 3), "bpm": grid["bpm"], "downbeat_mod4": down, "ask_the_listener": WHAT_TO_ASK})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    ap.add_argument("--words", action="store_true")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    make_click(a.work, a.t0, a.t1, a.words, a.out)


if __name__ == "__main__":
    main()
