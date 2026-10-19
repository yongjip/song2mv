"""Find a fixed-tempo beat grid (beat length P, first beat phi) and which beat starts each bar.

Why not librosa.beat.beat_track: on our test song it reported 123 BPM; the song is 90 BPM (a dotted-8th
rhythm made a false peak). Here the grid is fitted directly to percussive onsets:
  1. autocorrelation peaks of percussive / full onsets — beat and bar length hints (printed only);
  2. a wide search over P = 0.30–0.75 s (80–200 BPM) for the grid that lands on the strongest onsets;
  3. picking the tempo: a number you give, or "auto" — lyric lines mostly start a whole number of bars
     apart, so among the candidates the ones where most line gaps are whole bars win, and the strongest
     onset score breaks the tie (90 vs 180 BPM fit the same lines; the onsets prefer the real beat);
  4. fine phase search, then the bar's first beat = the beat position with the strongest kick
     (harmony change is printed as a second opinion — off-beat chord changes can fool it);
  5. 20-second windows checked against the global grid, to see whether the tempo really is constant.

Usage: python -m song2mv.timing.beat_grid song.mp3 work/grid.json [--bpm 90|auto] [--merged work/merged.json]
"""
from __future__ import annotations

import argparse
import json

from .lib import write_json


def bar_gaps(line_starts: list[float]) -> list[float]:
    """Gaps between consecutive lyric line starts, 1–12 s (shorter are ad-libs, longer are instrumentals)."""
    s = sorted(line_starts)
    return [b - a for a, b in zip(s, s[1:]) if 1.0 < b - a < 12.0]


def find_grid(audio: str, bpm: str | float | None = "auto", line_starts: list[float] | None = None, downbeat: int | None = None) -> dict:
    import librosa
    import numpy as np

    y, sr = librosa.load(audio, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 256
    yh, yp = librosa.effects.hpss(y, margin=3.0)

    # 1) autocorrelation hints
    envs = {}
    for name, sig in [("perc", yp), ("full", y)]:
        env = librosa.onset.onset_strength(y=sig, sr=sr, hop_length=hop)
        env /= env.max()
        envs[name] = env
        x = env - env.mean()
        ac = np.correlate(x, x, mode="full")[len(x) - 1:]
        ac /= ac[0]
        lags = np.arange(len(ac)) * hop / sr
        idx = np.where((lags > 0.25) & (lags < 3.0))[0]
        pk = [i for i in idx[1:-1] if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1]]
        pk = sorted(pk, key=lambda i: -float(ac[i]))[:8]
        print(f"  {name} autocorrelation peaks (s, r):", [(round(float(lags[i]), 3), round(float(ac[i]), 3)) for i in sorted(pk)])

    # 2) wide grid search
    oenv = envs["perc"]
    ft = librosa.times_like(oenv, sr=sr, hop_length=hop)
    span = max(10.0, dur - 10)
    res = []
    for P in np.arange(0.30, 0.75, 0.0002):
        phis = np.arange(0, P, 0.004)
        K = np.arange(0, int(span / P))
        s = np.interp(phis[:, None] + K[None, :] * P, ft, oenv).mean(axis=1)
        res.append((float(s.max()), float(P), float(phis[s.argmax()])))
    res.sort(reverse=True)
    cands, seen = [], []
    for s, P, phi in res:
        if all(abs(P - q) > 0.01 for q in seen):
            seen.append(P)
            cands.append({"P": round(P, 4), "bpm": round(60 / P, 2), "phi": round(phi, 3), "score": round(s, 3)})
        if len(seen) >= 6:
            break
    print("  tempo candidates:", ", ".join(f"{c['bpm']} BPM ({c['score']})" for c in cands))

    # 3) pick the tempo
    why = ""
    if bpm not in (None, "auto"):
        P = 60 / float(bpm)
        why = "given"
    else:
        gaps = bar_gaps(line_starts or [])
        P, why = cands[0]["P"], "best onset score"
        if len(gaps) >= 6:
            # lyric lines mostly start a whole number of bars apart; count how many gaps do at each tempo
            for c in cands:
                c["line_fit"] = round(float(np.mean([abs(g / (4 * c["P"]) - round(g / (4 * c["P"]))) < 0.1 for g in gaps])), 2)
            best_fit = max(c["line_fit"] for c in cands)
            pick = max((c for c in cands if c["line_fit"] >= best_fit - 0.1), key=lambda c: c["score"])
            P = pick["P"]
            why = (f"{pick['line_fit']:.0%} of lyric line gaps are whole bars at this tempo "
                   f"(others: {', '.join(f'''{c['bpm']}→{c['line_fit']:.0%}''' for c in cands if c is not pick)})")
        else:
            why += " (too few lyric line starts to cross-check)"

    def fit_phase(P):
        phis = np.arange(0, P, 0.001)
        K = np.arange(0, int(span / P))
        s = np.interp(phis[:, None] + K[None, :] * P, ft, oenv).mean(axis=1)
        return float(phis[s.argmax()]), float(s.max())
    phi, sc = fit_phase(P)
    if why != "given":
        # produced music is almost always at a whole BPM; a 0.02 BPM error drifts ~60 ms over a song
        Pi = 60 / round(60 / P)
        phi_i, sc_i = fit_phase(Pi)
        if abs(Pi - P) / P < 0.003 and sc_i >= 0.98 * sc:
            P, phi = Pi, phi_i
            why += f"; rounded to a whole BPM (onset score {sc_i:.3f} vs {sc:.3f})"
    print(f"  → {60 / P:.2f} BPM (beat {P:.4f} s, first beat {phi:.3f} s) — {why}")

    # 4) bar start
    beats = np.arange(phi, dur, P)
    bf = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
    chroma = librosa.feature.chroma_cqt(y=yh, sr=sr, hop_length=hop)
    bf = bf[bf < chroma.shape[1]]
    cs = librosa.util.sync(chroma, bf, aggregate=np.median)
    cs = cs / (np.linalg.norm(cs, axis=0, keepdims=True) + 1e-9)
    chg = np.r_[0, 1 - np.sum(cs[:, 1:] * cs[:, :-1], axis=0)]
    S = np.abs(librosa.stft(yp, hop_length=hop))
    fr = librosa.fft_frequencies(sr=sr)
    low = S[fr < 120].sum(axis=0)
    lowon = np.maximum(0, np.diff(low, prepend=0))
    mid = S[(fr > 1500) & (fr < 5000)].sum(axis=0)
    midon = np.maximum(0, np.diff(mid, prepend=0))
    win = lambda arr, f: arr[max(0, f - 2):f + 3].max()  # noqa: E731
    kick = np.array([win(lowon, f) for f in bf])
    snare = np.array([win(midon, f) for f in bf])
    n = min(len(chg), len(kick))
    phase_stats = []
    for p in range(4):
        st = {"beat_mod4": p, "chord_change": round(float(chg[p:n:4].mean()), 3),
              "low_onset": round(float(kick[p:n:4].mean()), 1), "mid_onset": round(float(snare[p:n:4].mean()), 1)}
        phase_stats.append(st)
        print(f"  beat % 4 == {p}: chord change {st['chord_change']:.3f}  kick {st['low_onset']:7.1f}  snare {st['mid_onset']:7.1f}")
    kick_pick = int(np.argmax([st["low_onset"] for st in phase_stats]))
    chord_pick = int(np.argmax([st["chord_change"] for st in phase_stats]))
    down = kick_pick if downbeat is None else int(downbeat)
    print(f"  bar starts at beat % 4 == {down}" + (" (given)" if downbeat is not None else
          f" (strongest kick; harmony change says {chord_pick}) — confirm by ear"))

    hist = None
    if line_starts:
        frac = np.array([(t - phi) / P for t in line_starts]) % 4
        hist = np.histogram(frac, bins=8, range=(0, 4))[0].tolist()
        print("  where lyric lines start inside the bar (8 bins of half a beat, from beat 0):", hist)

    # 5) local drift
    def score(lo, hi, d):
        g = np.arange(phi + d + np.ceil((lo - phi - d) / P) * P, hi, P)
        return np.interp(g, ft, oenv).mean() if len(g) else 0.0
    local = []
    for lo in range(0, int(dur), 20):
        ds = np.arange(-0.15, 0.15, 0.002)
        vals = [score(lo, lo + 20, d) for d in ds]
        local.append({"from": lo, "offset_ms": int(round(float(ds[int(np.argmax(vals))]) * 1000)), "strength": round(float(max(vals)), 2)})
    drift = [x for x in local if abs(x["offset_ms"]) > 40 and x["strength"] > 0.15]
    print("  local drift: " + ("none over 40 ms" if not drift else ", ".join(f"{x['from']}s {x['offset_ms']:+d}ms" for x in drift)))

    bar0 = phi + down * P
    return {"bpm": round(60 / P, 3), "beat": P, "phi": round(phi, 3), "downbeat_mod4": down, "bar0": round(bar0, 3),
            "bar": 4 * P, "duration": round(dur, 3), "why": why, "candidates": cands, "phase_stats": phase_stats,
            "line_start_hist": hist, "local_offsets": local}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--bpm", default="auto")
    ap.add_argument("--downbeat", type=int, default=None)
    ap.add_argument("--merged", default=None, help="merged.json from align.py, for line spacing")
    a = ap.parse_args()
    starts = None
    if a.merged:
        starts = [min(t for t in r["wt"] if t is not None) for r in json.load(open(a.merged))["lines"] if any(t is not None for t in r["wt"])]
    write_json(find_grid(a.audio, a.bpm, starts, a.downbeat), a.out)
