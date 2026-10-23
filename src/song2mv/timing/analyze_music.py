"""Loudness curve and likely section boundaries of a song (librosa) — material for scene design: where the
energy builds, drops and peaks. `song2mv sync` writes the result to music.json.

The tempo is not reported here: librosa's beat_track said 123 BPM for a 90 BPM test song. grid.json (from
`song2mv sync` or `song2mv beats`) has the beat grid.

Usage: python -m song2mv.timing.analyze_music song.mp3 work/music.json
"""
from __future__ import annotations

import sys


def analyze(path: str) -> dict:
    import librosa
    import numpy as np

    y, sr = librosa.load(path, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 512

    # beat-synchronous frames only to segment the song (not reported as a tempo)
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop)
    beat_t = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)

    # loudness curve, dB per 0.5 s (0 dB = the loudest moment)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    rt = librosa.times_like(rms, sr=sr, hop_length=hop)
    db = librosa.amplitude_to_db(rms, ref=np.max)
    bins = np.arange(0, dur, 0.5)
    loud = [float(np.mean(db[(rt >= b) & (rt < b + 0.5)])) for b in bins]

    # section boundaries: checkerboard novelty on the beat-synced chroma+MFCC self-similarity matrix
    bounds: list[dict] = []
    if len(beat_frames) > 40:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
        feat = np.vstack([librosa.util.normalize(chroma, axis=0), librosa.util.normalize(mfcc, axis=1)])
        bs = librosa.util.sync(feat, beat_frames, aggregate=np.median)
        bs = bs / (np.linalg.norm(bs, axis=0, keepdims=True) + 1e-9)
        ssm = bs.T @ bs
        K = 16  # 16 beats = 4 bars
        g = np.outer(np.r_[-np.ones(K), np.ones(K)], np.r_[-np.ones(K), np.ones(K)])
        g *= np.outer(np.hanning(2 * K), np.hanning(2 * K))
        pad = np.pad(ssm, K, mode="edge")
        nov = np.array([np.sum(pad[i:i + 2 * K, i:i + 2 * K] * -g) for i in range(ssm.shape[0])])
        nov = (nov - nov.min()) / (np.ptp(nov) + 1e-9)
        peaks = [i for i in range(1, len(nov) - 1) if nov[i] > nov[i - 1] and nov[i] >= nov[i + 1] and nov[i] > 0.25]
        sel: list[int] = []
        for i in sorted(peaks, key=lambda i: -nov[i]):  # of peaks closer than 16 beats keep the larger
            if all(abs(i - j) >= 16 for j in sel):
                sel.append(i)
        bt_all = np.r_[beat_t, dur]
        bounds = [{"t": round(float(bt_all[i]), 2), "novelty": round(float(nov[i]), 2)} for i in sorted(sel)]

    return {"duration": round(dur, 2), "loudness_db_per_half_second": [round(v, 1) for v in loud], "boundaries": bounds}


def main() -> None:
    import json

    from ..contract import stamp
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    res = analyze(sys.argv[1])
    json.dump(stamp(res), open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{res['duration']} s, boundaries: {[(b['t'], b['novelty']) for b in res['boundaries']]}")


if __name__ == "__main__":
    main()
