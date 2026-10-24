"""Find a fixed-tempo beat grid (beat length P, first beat phi) and which beat starts each bar.

Why not librosa.beat.beat_track: on our test song it reported 123 BPM; the song is 90 BPM (a dotted-8th
rhythm made a false peak). Here the grid is fitted directly to percussive onsets:
  1. autocorrelation peaks of percussive / full onsets — beat and bar length hints (printed only);
  2. a wide search over P = 0.30–0.75 s (80–200 BPM) for the grid that lands on the strongest onsets;
  3. picking the tempo: a number you give, or "auto" — lyric lines mostly start a whole number of bars
     apart, so among the candidates the ones where most line gaps are whole bars win, and the strongest
     onset score breaks the tie (90 vs 180 BPM fit the same lines; the onsets prefer the real beat). When the line
     gaps pick another tempo than the strongest onsets, both grids are fitted to the music (`fit_check`) and the one
     off the beat for less of the song wins;
  4. fine phase search, then the bar's first beat = the beat position with the strongest kick
     (harmony change is printed as a second opinion — off-beat chord changes can fool it);
  5. does the grid fit everywhere? Tempo and phase are fitted again in windows of 4 bars (`fit_check`); where the
     music's beats leave the grid — a tempo change, a drift, a beat that jumps — the stretch goes into `off_grid`;
  6. a song with such stretches gets a beat map (`beat_map`): the windows chained into one time per beat, so
     beats, bars and snapped words follow the music where the one tempo does not. The bar start is found again on it;
  7. is the groove swung? (`swing`): where the hats put the 2nd and 4th 16th notes of each beat.

Usage: python -m song2mv.timing.beat_grid song.mp3 work/grid.json [--bpm 90|auto] [--merged work/merged.json]
"""
from __future__ import annotations

import argparse
import json

from .lib import write_json

# fit_check: a window of FIT_BEATS beats every FIT_HOP beats; its own beat length is searched within ×/÷ FIT_RANGE
# of the grid's (100 → 80–125 BPM: a step to 120 is found, the 4:3 of a dotted rhythm is not).
FIT_BEATS = 16
FIT_HOP = 2
FIT_RANGE = 1.25
# A window is off the grid when its own grid lands on the onsets clearly better than the global one — by FIT_GAP
# standard deviations of all the grids tried there — and its beats are more than half a 16th note from the global
# grid's 8th notes. 8th notes, not beats: a section that accents the off-beat is not a tempo change. Measured on 79
# JamendoLyrics songs and the 90 BPM test song: below 6, intros without drums start to be flagged.
FIT_GAP = 6.0
FIT_LOOSE = 3.0  # below this the global grid does about as well as the window's own: the window fits

# beat_map chains the fit_check windows: each window's best grid puts a beat (or an off-beat) near its middle, and
# the next window sits a whole number of 8th notes later. A window joins when its pulse is clear (its best grid
# MAP_Z standard deviations above the mean of all it tried), its tempo is within MAP_TEMPO of the chain's (another
# tempo only when most of the next windows agree), and it lies within MAP_TOL of a whole number of 8th notes from the
# last one — MAP_SURE after more than MAP_GAP seconds without a clear window, where the count comes from the tempo
# on both sides. MAP_JUMP windows in a row that do not join mean the beat moved by part of an 8th note, or the count
# over a gap would be a guess: then there is no map, and the grid stays as it is. Measured on 12 Suno and the 9
# flagged JamendoLyrics songs: drifting songs chain cleanly; songs whose beat jumps, or whose pulse is weak, do not.
MAP_Z = 6.0
MAP_TEMPO = 0.04
MAP_TOL = 0.25
MAP_SURE = 0.1
MAP_JUMP = 4
MAP_GAP = 4.0

# swing folds the onsets of the hats (the percussive part above SWING_HZ) by position inside the beat, in SWING_BINS
# bins, and takes the highest peak on the beat, at the 8th note and at the 2nd and 4th 16th notes, each measured from
# the beat's own peak (the onset envelope's delay cancels: within 0.005 beat on synthetic swung drums). A groove is
# swung when the 8th note sits within SWING_8TH of halfway, both 16ths stand out from the fold by SWING_PEAK of its
# range and nothing else does (sextuplets would read as a 1/3–5/6 swing), and both 16ths are late: each by SWING_EACH
# of a beat, SWING_LATE on average (60:40 or more). Measured on 79 JamendoLyrics songs, 11 Suno songs and two demo
# songs: the 5 that come out swung are late by 0.055–0.077 on average, the most swung of the rest by 0.038. On the 3
# swung JamendoLyrics songs, words within 0.1 s of the annotations rose from 52 % to 63 %; snapping the lightly swung
# ones (0.026–0.027) to their 16ths gained 1.5 points there and lost 0.4 within 0.3 s.
SWING_HZ = 6000
SWING_BINS = 96
SWING_8TH = 0.02
SWING_PEAK = 0.1
SWING_EACH = 0.03
SWING_LATE = 0.05


def fit_check(oenv, ft, dur: float, P: float, phi: float) -> tuple[list[dict], list[dict], list[dict]]:
    """Fit tempo and phase per window and compare them with the global grid (beat P, first beat phi).

    Returns (local, off_grid, windows): `local` has one entry per 2 bars — {from, to, bpm, offset_ms (the window's
    beats against the grid's, at its middle), strength, fits (true, false, or null when the window cannot tell)} — and
    `off_grid` the stretches where the grid does not fit: {from, to, bpm (the music's tempo there), kind ("tempo",
    "drift" or "shift": the same tempo, the beat moved), offset_ms (for a shift)}. `windows` are every window's own
    fit, for beat_map."""
    import numpy as np

    W = max(6.0, FIT_BEATS * P)
    H = FIT_HOP * P
    if dur < W + H:
        return [], [], []

    def search(c, ratios):
        """The best (score, beat, phase from c) among these beat lengths, and the mean and spread of every grid's score."""
        best, tot, tot2, n = (-1.0, P, 0.0), 0.0, 0.0, 0
        for r in ratios:
            Pw = P * r
            k = np.arange(-int(W / 2 / Pw), int(W / 2 / Pw) + 1)
            phs = np.arange(-Pw / 2, Pw / 2, 0.004)
            s = np.interp(c + phs[:, None] + k[None, :] * Pw, ft, oenv).mean(axis=1)
            tot, tot2, n = tot + s.sum(), tot2 + (s * s).sum(), n + len(s)
            j = int(s.argmax())
            if s[j] > best[0]:
                best = (float(s[j]), float(Pw), float(phs[j]))
        return best, tot / n, max(tot2 / n - (tot / n) ** 2, 1e-12) ** 0.5

    def grid_score(lo, hi, shift):
        g = np.arange(phi + shift + np.ceil((lo - phi - shift) / P) * P, hi, P)
        return float(np.interp(g, ft, oenv).mean()) if len(g) else 0.0

    wins = []
    for c in np.arange(W / 2, dur - W / 2 + 1e-9, H):
        (s, Pw, ph), mean, sd = search(c, np.exp(np.arange(-np.log(FIT_RANGE), np.log(FIT_RANGE) + 1e-9, 0.005)))
        fine, _, _ = search(c, Pw / P * np.exp(np.arange(-0.005, 0.0051, 0.0005)))
        if fine[0] > s:
            s, Pw, ph = fine
        g8 = max(grid_score(c - W / 2, c + W / 2, 0.0), grid_score(c - W / 2, c + W / 2, P / 2))
        lb = c + ph + np.arange(np.ceil((-H / 2 - ph) / Pw), np.ceil((H / 2 - ph) / Pw)) * Pw  # its beats in the middle
        d8 = (lb - phi) - np.round((lb - phi) / (P / 2)) * (P / 2)
        off = (c + ph - phi) - round((c + ph - phi) / P) * P
        wins.append({"c": float(c), "s": s, "beat": Pw, "gap": (s - g8) / sd, "d8": float(np.abs(d8).max()) if len(d8) else 0.0,
                     "offset": float(off), "x": float(c + ph), "z": (s - mean) / sd})
    weak = 0.5 * float(np.median([w["s"] for w in wins]))
    for w in wins:
        same_tempo = abs(w["beat"] / P - 1) < 0.01
        if w["s"] < weak:
            w["fits"] = None  # no clear pulse (an intro, a break): no opinion
        elif w["gap"] >= FIT_GAP and w["d8"] > P / 8:
            w["fits"] = False
        elif w["gap"] < FIT_LOOSE or (same_tempo and w["d8"] <= P / 8):
            w["fits"] = True
        else:
            w["fits"] = None

    def local_list():
        return [{"from": round(w["c"] - W / 2, 2), "to": round(w["c"] + W / 2, 2), "bpm": round(60 / w["beat"], 1),
                 "offset_ms": int(round(w["offset"] * 1000)), "strength": round(w["s"], 2), "fits": w["fits"]}
                for w in wins[::4]]

    # the whole song at one other tempo: the grid's tempo is wrong (a pick off by up to ×/÷ FIT_RANGE); a "drift"
    # when that tempo also moves by more than 1 % from the first to the last quarter of the song
    clear = [w for w in wins if w["s"] >= weak]
    other = 60 / float(np.median([w["beat"] for w in clear]))
    if abs(other * P / 60 - 1) > 0.03 and sum(abs(60 / w["beat"] / other - 1) < 0.02 and w["gap"] >= FIT_LOOSE for w in clear) >= 0.75 * len(clear):
        whole = {"from": 0.0, "to": round(dur, 3), "bpm": round(other, 1), "kind": "tempo", "offset_ms": None}
        q = max(1, len(clear) // 4)
        first, last = (60 / float(np.median([w["beat"] for w in part])) for part in (clear[:q], clear[-q:]))
        if abs(last / first - 1) > 0.01:
            whole.update(kind="drift", bpm_from=round(first, 1), bpm_to=round(last, 1))
        return local_list(), [whole], wins

    # runs of off windows; a hole between two is bridged when it holds less than 2 bars of fitting windows, or when
    # a drift only passes an 8th note there (local tempo still off the same way, for no longer than that takes)
    runs: list[list[int]] = []
    for i, w in enumerate(wins):
        if w["fits"] is not False:
            continue
        if runs:
            a, b = runs[-1]
            fit = [x for x in wins[b + 1:i] if x["fits"]]
            sign = np.sign(np.median([P / x["beat"] - 1 for x in wins[a:b + 1] if x["fits"] is False]))
            drift = [(P / x["beat"] - 1) * sign for x in fit]
            passing = bool(drift) and min(drift) >= 0.01 and len(fit) * FIT_HOP <= 1 / (2 * float(np.median(drift)))
            if len(fit) * H < 2 * 4 * P or passing:
                runs[-1][1] = i
                continue
        runs.append([i, i])

    def stretch_tempo(lo, hi, bpm):
        """The windows only look within ×/÷ FIT_RANGE of the grid, so a stretch at a tempo outside that shows up as a
        3:4 or 2:3 relative inside it (95 BPM against a 130 BPM grid looks like 126.8). Over the whole stretch, take the
        relative whose grid lands on the onsets clearly best."""
        def score(b):
            best = (0.0, b)
            for Pc in 60 / b * np.exp(np.arange(-0.01, 0.0101, 0.001)):
                k = np.arange(0, int((hi - lo) / Pc))
                s = float(np.interp(lo + np.arange(0, Pc, 0.004)[:, None] + k[None, :] * Pc, ft, oenv).mean(axis=1).max())
                best = max(best, (s, 60 / Pc))
            return best
        own = score(bpm)
        alt = max([score(bpm * r) for r in (3 / 4, 4 / 3, 2 / 3, 3 / 2) if 40 <= bpm * r <= 250], default=own)
        return alt[1] if alt[0] > 1.1 * own[0] else bpm

    off_grid = []
    for a, b in runs:
        off = [x for x in wins[a:b + 1] if x["fits"] is False]
        if len(off) * FIT_HOP < 8:  # at least 2 bars of off windows
            continue
        bpm = 60 / float(np.median([x["beat"] for x in off]))
        first, last = (60 / float(np.median([x["beat"] for x in part])) for part in (off[:3], off[-3:]))
        kind = "shift" if abs(bpm * P / 60 - 1) < 0.01 else "drift" if abs(last / first - 1) > 0.02 else "tempo"
        if kind == "tempo":
            bpm = stretch_tempo(off[0]["c"] - H / 2, off[-1]["c"] + H / 2, bpm)
        offsets = np.array([x["offset"] for x in off])
        offset = float(np.median(offsets)) if np.percentile(offsets, 75) - np.percentile(offsets, 25) < P / 4 else None
        # nothing fits between the stretch and the start (or the end) of the song: it reaches there
        start = not any(x["fits"] for x in wins[:a])
        end = not any(x["fits"] for x in wins[b + 1:])
        off_grid.append({"from": 0.0 if start else round(wins[a]["c"] - H / 2, 3),
                         "to": round(dur, 3) if end else round(wins[b]["c"] + H / 2, 3),
                         "bpm": round(bpm, 1), "kind": kind,
                         "offset_ms": int(round(offset * 1000)) if kind == "shift" and offset is not None else None})
        if kind == "drift":
            off_grid[-1]["bpm_from"], off_grid[-1]["bpm_to"] = round(first, 1), round(last, 1)
    return local_list(), off_grid, wins


def whole_song(off_grid: list[dict], dur: float) -> bool:
    """Whether one off_grid stretch covers the whole song: the grid's tempo is wrong there, not changing."""
    return any(s["from"] <= 0.0 and s["to"] >= round(dur, 3) - 0.01 for s in off_grid)


def beat_map(wins: list[dict], dur: float, ft, oenv) -> list[float] | None:
    """Beat times that follow the music, from fit_check's windows (see MAP_* above), or None when they cannot be
    followed without a guess or fewer than 8 join the chain. Of the two 8th-note phases, the one on stronger onsets is
    the beat, as for the grid's phi."""
    import numpy as np

    clear = [w for w in wins if w["z"] >= MAP_Z]
    chain: list[dict] = []  # m: 8th notes since the first window, x: the window's beat, u: its 8th-note length
    miss = 0
    for j, w in enumerate(clear):
        u = w["beat"] / 2
        if not chain:
            chain.append({"m": 0, "x": w["x"], "u": u})
            continue
        recent = float(np.median([a["u"] for a in chain[-8:]]))
        new_tempo = abs(u / recent - 1) > MAP_TEMPO
        if new_tempo and sum(abs(c["beat"] / w["beat"] - 1) < 0.015 for c in clear[j + 1:j + 9]) < 5:
            continue
        last = chain[-1]
        dt = w["x"] - last["x"]
        gap = dt > MAP_GAP
        ub = 0.5 * (recent + float(np.median([c["beat"] / 2 for c in clear[j:j + 8]]))) if gap else 0.5 * (u + last["u"])
        k = int(np.rint(dt / ub))
        if abs(dt / ub - k) > (MAP_SURE if gap or new_tempo else MAP_TOL):
            miss += 1
            if miss >= MAP_JUMP:
                return None
            continue
        miss = 0
        chain.append({"m": last["m"] + k, "x": w["x"], "u": u})
    if len(chain) < 8:
        return None
    m = np.array([a["m"] for a in chain], float)
    x = np.array([a["x"] for a in chain])
    u = float(np.median([a["u"] for a in chain]))
    teeth = np.arange(m[0] - np.ceil(x[0] / u) - 2, m[-1] + np.ceil((dur - x[-1]) / u) + 3)
    e = min(5, len(m) - 1)
    head, tail = (x[e] - x[0]) / (m[e] - m[0]), (x[-1] - x[-1 - e]) / (m[-1] - m[-1 - e])
    t = np.interp(teeth, m, x)
    t = np.where(teeth < m[0], x[0] + (teeth - m[0]) * head, t)
    t = np.where(teeth > m[-1], x[-1] + (teeth - m[-1]) * tail, t)
    inner = (t > 0.3) & (t < dur - 0.3)
    beat = int(np.argmax([np.interp(t[inner & (teeth % 2 == p)], ft, oenv).mean() for p in (0, 1)]))
    t = t[teeth % 2 == beat]
    return [round(float(b), 3) for b in t[(t >= 0) & (t <= dur)]]


def map_time(beats: list[float], b):
    """Time of beat number b (whole or fractional) on a beat map: straight between its beats, and at the first and
    last beat's length before and after them."""
    import numpy as np

    n = len(beats) - 1
    b = np.asarray(b, float)
    t = np.interp(b, np.arange(n + 1), beats)
    t = np.where(b < 0, beats[0] + b * (beats[1] - beats[0]), t)
    return np.where(b > n, beats[n] + (b - n) * (beats[n] - beats[n - 1]), t)


def map_number(beats: list[float], t):
    """Beat number (fractional) at time t on a beat map; the inverse of map_time."""
    import numpy as np

    n = len(beats) - 1
    t = np.asarray(t, float)
    b = np.interp(t, beats, np.arange(n + 1))
    b = np.where(t < beats[0], (t - beats[0]) / (beats[1] - beats[0]), b)
    return np.where(t > beats[n], n + (t - beats[n]) / (beats[n] - beats[n - 1]), b)


def swing(yp, sr: int, beat_number, fits) -> list[float] | None:
    """Where the hats put the 2nd and 4th 16th notes of each beat, as fractions of a beat from the beat, when the groove
    is clearly swung (see SWING_*); None otherwise. `beat_number(t)` is the fractional beat number at times t and
    `fits(t)` says where those beats follow the music."""
    import librosa
    import numpy as np

    n_fft, hop, n = 1024, 128, SWING_BINS
    S = np.abs(librosa.stft(yp, n_fft=n_fft, hop_length=hop))
    hats = librosa.amplitude_to_db(S[librosa.fft_frequencies(sr=sr, n_fft=n_fft) > SWING_HZ])
    env = librosa.onset.onset_strength(S=hats, sr=sr, hop_length=hop, n_fft=n_fft)
    t = librosa.times_like(env, sr=sr, hop_length=hop)
    keep = fits(t)
    k = np.minimum((np.asarray(beat_number(t[keep])) % 1.0 * n).astype(int), n - 1)
    h = np.bincount(k, env[keep], n) / np.maximum(np.bincount(k, minlength=n), 1)
    h = np.convolve(np.r_[h[-1:], h, h[:1]], [0.25, 0.5, 0.25], "valid")
    span = float(h.max() - h.min())
    tops = [i for i in range(n) if h[i] > h[i - 1] and h[i] >= h[(i + 1) % n]]

    def top(lo, hi):
        inside = [i for i in tops if lo <= (i / n + 0.5) % 1 - 0.5 < hi] if lo < 0 else [i for i in tops if lo <= i / n < hi]
        return max(inside, key=lambda i: h[i]) if inside else None

    def at(i):
        a, b, c = h[i - 1], h[i], h[(i + 1) % n]
        return (i + 0.5 + 0.5 * (a - c) / (a - 2 * b + c)) / n

    def rise(i, a, b):
        """How far bin i stands above the lowest points between bins a and i and between i and b, going forward."""
        left = min(h[j % n] for j in range(a, a + (i - a) % n + 1))
        right = min(h[j % n] for j in range(i, i + (b - i) % n + 1))
        return h[i] - max(left, right)

    peaks = [top(-0.08, 0.08), top(0.2, 0.42), top(0.42, 0.58), top(0.7, 0.92)]
    clear = False
    if None not in peaks and span > 0:
        c0, c1, c2, c3 = peaks
        others = [rise(i, a, b) for a, b in zip(peaks, peaks[1:] + peaks[:1]) for i in tops
                  if i not in peaks and 0 < (i - a) % n < (b - a) % n]
        clear = min(rise(c1, c0, c2), rise(c3, c2, c0)) >= SWING_PEAK * span > max(others, default=0.0)
    if not clear:
        print("  swing: none (no clear 16th notes in the hats)")
        return None
    x0 = (at(c0) + 0.5) % 1 - 0.5
    s1, e8, s3 = at(c1) - x0, at(c2) - x0, at(c3) - x0
    late = (s1 - 0.25, s3 - 0.75)
    if abs(e8 - 0.5) <= SWING_8TH and min(late) >= SWING_EACH and sum(late) / 2 >= SWING_LATE:
        print(f"  swing: the hats put the 2nd and 4th 16th notes of each beat at {s1:.3f} and {s3:.3f} of a beat "
              "(straight: 0.25 and 0.75)")
        return [round(float(s1), 3), round(float(s3), 3)]
    print(f"  swing: none (the hats' 2nd 16th, 8th and 4th 16th notes at {s1:.3f}, {e8:.3f} and {s3:.3f} of a beat)")
    return None


def swung(b: float, swing: list[float]) -> float:
    """Beat number b moved to the nearest 16th note of a swung beat: the beat, its 8th note and the 2nd and 4th 16th
    notes where `swing` puts them."""
    import math

    n = math.floor(b)
    return n + min((0.0, swing[0], 0.5, swing[1], 1.0), key=lambda q: abs(b - n - q))


def _mmss(t: float) -> str:
    return f"{int(t // 60)}:{int(t % 60):02d}"


def describe_off_grid(grid: dict) -> list[str]:
    """One warning per stretch where the beat grid does not fit, for the --json `warnings`."""
    stretches = grid.get("off_grid") or []
    dur, g = grid["duration"], round(grid["bpm"], 1)
    if grid.get("beats"):
        tail = "the beat map in grid.json (`beats`) follows the music there, and lyric words are snapped to it; hear it with `song2mv click`"
    else:
        tail = ("lyric words there keep whisper's times (no snapping), and beat effects drawn from grid.json will miss the "
                "music there; hear it with `song2mv click`")
    if stretches and not grid.get("beats") and sum(s["to"] - s["from"] for s in stretches) > 0.8 * dur:
        longest = max(stretches, key=lambda s: s["to"] - s["from"])
        bpm = longest["bpm"]
        wrong = "The tempo given is probably wrong" if grid.get("why") == "given" else "The tempo was probably picked wrong"
        if longest["kind"] == "drift":
            return [f"the beat grid ({g:g} BPM) does not fit this song: almost everywhere its beats move at another tempo, and "
                    f"that tempo drifts ({longest['bpm_from']:g} → {longest['bpm_to']:g} BPM), so no --bpm taken from it fits. "
                    f"{wrong} — find the song's tempo by ear among grid.json's `candidates` and rerun with it as --bpm: sync "
                    "then follows the drift; until then " + tail.replace(" there", "")]
        return [f"the beat grid ({g:g} BPM) does not fit this song: almost everywhere its beats move at about {bpm:g} BPM. "
                f"{wrong} — rerun with --bpm {round(bpm)} and check by ear; until then " + tail.replace(" there", "")]
    out = []
    for s in stretches:
        a, b = _mmss(s["from"]), _mmss(s["to"])
        to_end, from_start = s["to"] >= dur - 0.01, s["from"] <= 0.01
        where = f"until {b}" if from_start else f"from {a} on" if to_end else f"from {a} to {b}"
        if s["kind"] == "shift":
            ms = s.get("offset_ms")
            how = f"{abs(ms) / 1000:.2f} s {'later' if ms > 0 else 'earlier'} than the beat grid" if ms is not None else "off the beat grid"
            msg = (f"near {a} the beat moves {how} (still {s['bpm']:g} BPM): the grid fits only before that" if to_end and not from_start
                   else f"{where} the beats sit {how} (the same {s['bpm']:g} BPM)")
        elif s["kind"] == "drift":
            msg = (f"the tempo drifts ({s['bpm_from']:g} → {s['bpm_to']:g} BPM; the grid has {g:g}): {where} the beats are more "
                   "than half a 16th note off the beat grid")
        elif from_start:
            msg = f"the tempo is about {s['bpm']:g} BPM until {b}, then {g:g} BPM: the beat grid fits only after that"
        elif to_end:
            msg = f"the tempo changes near {a} ({g:g} → {s['bpm']:g} BPM): the beat grid fits only before that"
        else:
            msg = f"the tempo changes near {a} ({g:g} → {s['bpm']:g} BPM) and back near {b}: the beat grid does not fit in between"
        out.append(msg + "; " + tail)
    return out


def describe_pick(grid: dict) -> list[str]:
    """A warning when the lyric line gaps chose another tempo than the one the onsets fit best."""
    cands = grid.get("candidates") or []
    if not cands or "line_fit" not in cands[0] or abs(cands[0]["P"] / grid["beat"] - 1) < 0.01:
        return []
    top, pick = cands[0], min(cands, key=lambda c: abs(c["P"] / grid["beat"] - 1))
    return [f"the tempo pick is uncertain: the onsets fit {top['bpm']:g} BPM best, but more lyric line gaps are whole bars at "
            f"{pick['bpm']:g} BPM ({pick['line_fit']:.0%} against {top['line_fit']:.0%}), so the grid has {grid['bpm']:g} BPM; "
            "hear it with `song2mv click`, and set \"bpm\" in song.json if the clicks miss the drums"]


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

    def fit_phase(P):
        phis = np.arange(0, P, 0.001)
        K = np.arange(0, int(span / P))
        s = np.interp(phis[:, None] + K[None, :] * P, ft, oenv).mean(axis=1)
        return float(phis[s.argmax()]), float(s.max())

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
            if pick is not cands[0]:
                off = [sum(s["to"] - s["from"] for s in fit_check(oenv, ft, dur, c["P"], fit_phase(c["P"])[0])[1]) for c in (pick, cands[0])]
                if off[1] < off[0]:
                    P = cands[0]["P"]
                    why = (f"best onset score, whose grid is off the music for {off[1]:.0f} s of the song against {off[0]:.0f} s at "
                           f"{pick['bpm']:g} BPM, where {pick['line_fit']:.0%} of lyric line gaps are whole bars")
        else:
            why += " (too few lyric line starts to cross-check)"

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
    chroma = librosa.feature.chroma_cqt(y=yh, sr=sr, hop_length=hop)
    S = np.abs(librosa.stft(yp, hop_length=hop))
    fr = librosa.fft_frequencies(sr=sr)
    low = S[fr < 120].sum(axis=0)
    lowon = np.maximum(0, np.diff(low, prepend=0))
    mid = S[(fr > 1500) & (fr < 5000)].sum(axis=0)
    midon = np.maximum(0, np.diff(mid, prepend=0))
    win = lambda arr, f: arr[max(0, f - 2):f + 3].max()  # noqa: E731

    def bar_start(beats) -> tuple[list[dict], int]:
        """Chord change, kick and snare per beat position mod 4, and the bar's first beat: the strongest kick."""
        bf = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
        bf = bf[bf < chroma.shape[1]]
        cs = librosa.util.sync(chroma, bf, aggregate=np.median)
        cs = cs / (np.linalg.norm(cs, axis=0, keepdims=True) + 1e-9)
        chg = np.r_[0, 1 - np.sum(cs[:, 1:] * cs[:, :-1], axis=0)]
        kick = np.array([win(lowon, f) for f in bf])
        snare = np.array([win(midon, f) for f in bf])
        n = min(len(chg), len(kick))
        stats = []
        for p in range(4):
            st = {"beat_mod4": p, "chord_change": round(float(chg[p:n:4].mean()), 3),
                  "low_onset": round(float(kick[p:n:4].mean()), 1), "mid_onset": round(float(snare[p:n:4].mean()), 1)}
            stats.append(st)
            print(f"  beat % 4 == {p}: chord change {st['chord_change']:.3f}  kick {st['low_onset']:7.1f}  snare {st['mid_onset']:7.1f}")
        kick_pick = int(np.argmax([st["low_onset"] for st in stats]))
        chord_pick = int(np.argmax([st["chord_change"] for st in stats]))
        down = kick_pick if downbeat is None else int(downbeat)
        print(f"  bar starts at beat % 4 == {down}" + (" (given)" if downbeat is not None else
              f" (strongest kick; harmony change says {chord_pick}) — confirm by ear"))
        return stats, down

    phase_stats, down = bar_start(np.arange(phi, dur, P))

    hist = None
    if line_starts:
        frac = np.array([(t - phi) / P for t in line_starts]) % 4
        hist = np.histogram(frac, bins=8, range=(0, 4))[0].tolist()
        print("  where lyric lines start inside the bar (8 bins of half a beat, from beat 0):", hist)

    # 5) does the grid fit everywhere?
    local, off_grid, wins = fit_check(oenv, ft, dur, P, phi)
    tempos = sorted(x["bpm"] for x in local if x["fits"] is not None) or sorted(x["bpm"] for x in local)
    print(f"  grid fit, 4-bar windows (local tempo {tempos[len(tempos) // 10]:g}–{tempos[len(tempos) * 9 // 10]:g} BPM): "
          + (", ".join(f"off {_mmss(s['from'])}–{_mmss(s['to'])} ({s['kind']}, {s['bpm']:g} BPM)" for s in off_grid) or "fits everywhere")
          if tempos else "  grid fit: too short to check")

    # 6) where it does not, a beat map
    out = {"bpm": round(60 / P, 3), "beat": P, "phi": round(phi, 3), "downbeat_mod4": down, "bar0": round(phi + down * P, 3),
           "bar": 4 * P, "duration": round(dur, 3), "why": why, "candidates": cands, "phase_stats": phase_stats,
           "line_start_hist": hist, "local_offsets": local, "off_grid": off_grid}
    if off_grid:
        beats = None if whole_song(off_grid, dur) else beat_map(wins, dur, ft, oenv)
        out["beats"] = beats
        if beats:
            ends = [60 / float(np.median(np.diff(part))) for part in (beats[:40], beats[-40:])]
            print(f"  beat map: {len(beats)} beats, {ends[0]:.1f} → {ends[1]:.1f} BPM at the start and the end; on it:")
            out["phase_stats"], out["downbeat_mod4"] = bar_start(np.array(beats))
            out["bar0"] = beats[out["downbeat_mod4"]]
        else:
            print("  no beat map: the windows cannot be followed without a guess (a beat that jumps, a weak pulse, or the "
                  "tempo is wrong everywhere)")

    # 7) swing, on the beat map when there is one, and without one only where the grid fits
    beats = out.get("beats")

    def fits(t):
        ok = np.ones(len(t), bool)
        if not beats:
            for s in off_grid:
                ok &= (t < s["from"]) | (t >= s["to"])
        return ok
    sw = swing(yp, sr, (lambda t: map_number(beats, t)) if beats else (lambda t: (t - phi) / P), fits)
    if sw:
        out["swing"] = sw
    return out


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
