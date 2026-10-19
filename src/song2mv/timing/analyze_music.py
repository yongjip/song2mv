"""Loudness curve and likely section boundaries of a song (librosa) — material for scene design:
where the energy builds, drops and peaks.

Do not trust the tempo_bpm printed here: it is librosa's beat_track, which said 123 BPM for our 90 BPM
test song. `song2mv beats` finds the beat grid.

Usage: python -m song2mv.timing.analyze_music song.mp3 work/music.json
"""
import json
import sys

import librosa
import numpy as np


def main() -> None:
    path, out = sys.argv[1], sys.argv[2]
    y, sr = librosa.load(path, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 512

    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop)
    beat_t = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    ibi = np.diff(beat_t)
    # downbeat phase: the beat position with the most low-end (kick) energy
    S = np.abs(librosa.stft(y, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr)
    low = S[freqs < 150].sum(axis=0)
    phase_score = [low[beat_frames[p::4]].mean() for p in range(4)]
    p0 = int(np.argmax(phase_score))
    downbeats = beat_t[p0::4]

    # loudness curve, dB per 0.5 s
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    rt = librosa.times_like(rms, sr=sr, hop_length=hop)
    db = librosa.amplitude_to_db(rms, ref=np.max)
    bins = np.arange(0, dur, 0.5)
    loud = [float(np.mean(db[(rt >= b) & (rt < b + 0.5)])) for b in bins]

    # section boundaries: checkerboard novelty on the beat-synced chroma+MFCC self-similarity matrix
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
    # of peaks closer than 16 beats keep the larger
    sel = []
    for i in sorted(peaks, key=lambda i: -nov[i]):
        if all(abs(i - j) >= 16 for j in sel):
            sel.append(i)
    sel.sort()
    bt_all = np.r_[beat_t, dur]
    bounds = [{"t": round(float(bt_all[i]), 2), "novelty": round(float(nov[i]), 2)} for i in sel]

    json.dump({
        "duration": round(dur, 2),
        "tempo_bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "ibi_mean": round(float(ibi.mean()), 4), "ibi_std": round(float(ibi.std()), 4),
        "n_beats": int(len(beat_t)), "first_beat": round(float(beat_t[0]), 3),
        "downbeat_phase": p0, "phase_score": [round(float(s), 1) for s in phase_score],
        "beats": [round(float(t), 3) for t in beat_t],
        "downbeats": [round(float(t), 3) for t in downbeats],
        "loudness_0p5s": [round(v, 1) for v in loud],
        "boundaries": bounds,
    }, open(out, "w"), ensure_ascii=False)
    print(f"dur {dur:.1f}s  tempo {float(np.atleast_1d(tempo)[0]):.1f}  beats {len(beat_t)}  ibi {ibi.mean():.3f}±{ibi.std():.3f}  phase {p0} {phase_score}")
    print("boundaries:", [(b['t'], b['novelty']) for b in bounds])


if __name__ == "__main__":
    main()
