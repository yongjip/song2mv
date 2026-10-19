"""Turn merged word times into the final lyric timing: manual values, estimates for anything still
missing, in-line interpolation, snapping to the beat grid, line ends. Writes

  lyrics.json — every line and word with its time, where the time came from, and how the runs agreed
  mv.json     — the song config the Remotion template reads (lyrics + grid + sections + theme)

Times come from, in order of trust:
  manual    — the config's "manual" values (word start times, seconds)
  asr       — whisper runs merged by align.py
  reprompt  — reprompt.py re-listening with the expected words as a prompt
  estimated — no source at all: spread evenly between the neighbouring lines. Check these by ear.
Words without their own time inside a placed line are interpolated between their neighbours.

Usage: run through `song2mv sync` (step "build").
"""
from __future__ import annotations

import os


def _known(r):
    return [t for t in r["wt"] if t is not None]


def apply_manual(lines: list[dict], manual: dict) -> None:
    ids = {r["id"] for r in lines}
    for k in manual:
        if k not in ids:
            print(f"  !! manual value for unknown line id {k!r}")
    for r in lines:
        if r["id"] in manual:
            v = manual[r["id"]]
            r["wt"] = [float(v[i]) if i < len(v) and v[i] is not None else None for i in range(len(r["words"]))]
            r["source"] = "manual"


def estimate(lines: list[dict], end_song: float) -> None:
    i = 0
    while i < len(lines):
        if _known(lines[i]):
            i += 1
            continue
        j = i
        while j < len(lines) and not _known(lines[j]):
            j += 1
        prev = next((max(_known(lines[k])) + 0.4 for k in range(i - 1, -1, -1) if _known(lines[k])), 0.0)
        nxt = next((min(_known(lines[k])) for k in range(j, len(lines)) if _known(lines[k])), end_song)
        n = j - i
        room = nxt - prev
        # Never drop a sung line: with too little room (a line written after one it is sung before, or a gap of a
        # fraction of a second) squeeze it in at 0.3 s per line. It stays "estimated", so it is listed under
        # check_by_ear and the user can pin it in "manual".
        sl = room / n if room >= 0.6 * n else 0.3
        if room < 0.6 * n:
            print(f"  ~ squeezed {n} unplaced line(s) into {max(room, 0):.2f} s after {prev:.2f}: "
                  + ", ".join(lines[k]["id"] for k in range(i, j)))
        for m, k in enumerate(range(i, j)):
            nw = len(lines[k]["words"])
            a = prev + m * sl
            lines[k]["wt"] = [a + 0.8 * sl * q / nw for q in range(nw)]
            lines[k]["source"] = "estimated"
        i = j


def finish(lines: list[dict], grid: dict, snap_per_beat: int, end_song: float) -> list[dict]:
    P, phi = grid["beat"], grid["phi"]
    S = P / snap_per_beat if snap_per_beat else 0
    snap = (lambda t: round(phi + round((t - phi) / S) * S, 3)) if S else (lambda t: round(t, 3))
    starts = {i: min(_known(r)) for i, r in enumerate(lines) if _known(r)}
    out = []
    for i, r in enumerate(lines):
        wt = list(r["wt"])
        if i not in starts:
            print(f"  !! no timing, line dropped: {r['id']} {r['text']}")
            continue
        my0 = starts[i]
        # the next line by time, not by list order — backing vocals can be written after a line they precede
        nxt_start = min([t for j, t in starts.items() if j != i and t > my0 + 0.3], default=end_song)
        known = [(k, t) for k, t in enumerate(wt) if t is not None]
        k0, t0 = known[0]
        for k in range(k0):  # words before the first placed one: 0.3 s apart
            wt[k] = t0 - (k0 - k) * 0.3
        for (ka, ta), (kb, tb) in zip(known, known[1:]):
            for k in range(ka + 1, kb):
                wt[k] = ta + (tb - ta) * (k - ka) / (kb - ka)
        kl, tl = known[-1]
        tail = min(nxt_start - 0.25, tl + 0.45 * (len(wt) - kl))
        for k in range(kl + 1, len(wt)):
            wt[k] = tl + (tail - tl) * (k - kl) / (len(wt) - kl)
        wt = [snap(max(0.0, t)) for t in wt]
        end = snap(min(nxt_start - 0.15, wt[-1] + 0.9))
        if end <= wt[0]:
            end = round(wt[0] + max(S, 0.3), 3)
        out.append({
            "id": r["id"], "section": r["section"], "section_name": r["section_name"], "kind": r["kind"],
            "text": r["text"], "start": wt[0], "end": end, "source": r.get("source"),
            "runs_used": r.get("runs_used", []), "coverage": r.get("coverage", []),
            "words": [{"w": w, "t": t} for w, t in zip(r["words"], wt)],
        })
    return out


def sections(lines: list[dict], grid: dict, duration: float) -> list[dict]:
    P, bar0 = grid["beat"], grid["bar0"]
    first: dict = {}
    for r in lines:
        s = first.setdefault(r["section"], {"id": r["section"], "name": r["section_name"], "kind": r["kind"], "start": r["start"]})
        s["start"] = min(s["start"], r["start"])
    secs = sorted(first.values(), key=lambda s: s["start"])
    if not secs:
        return []
    late_start = secs[0]["start"] > 4.0 and secs[0]["kind"] != "calm"
    for s in secs:  # start the section on the bar line next to its first lyric (pickups, late entries)
        k = round((s["start"] - bar0) / (4 * P))
        d = bar0 + k * 4 * P
        if s["start"] - 2 * P <= d <= s["start"] + 1.5 * P:
            s["start"] = round(max(0.0, d), 3)
    if late_start:  # music before the first sung section gets a quiet section of its own
        secs.insert(0, {"id": "intro", "name": "(instrumental)", "kind": "calm", "start": 0.0})
    secs[0]["start"] = 0.0
    for a, b in zip(secs, secs[1:]):
        b["start"] = max(b["start"], round(a["start"] + P, 3))
        a["end"] = b["start"]
    secs[-1]["end"] = round(duration, 3)
    return secs


def onset_report(lines: list[dict], audio: str) -> None:
    """For lines not timed by the merged runs: each word's time and the strongest vocal onset within ±0.45 s."""
    check = [r for r in lines if r["source"] in ("manual", "reprompt", "estimated")]
    if not check:
        return
    import librosa
    import numpy as np
    y, sr = librosa.load(audio, sr=22050, mono=True)
    yh = librosa.effects.harmonic(y, margin=3.0)
    hop = 110
    db = librosa.amplitude_to_db(librosa.feature.rms(y=yh, frame_length=1024, hop_length=hop)[0] + 1e-6)
    tt = librosa.times_like(db, sr=sr, hop_length=hop)

    def near(c, w=0.45):
        idx = np.where((tt > c - w) & (tt < c + w))[0]
        idx = idx[idx + 4 < len(db)]
        if not len(idx):
            return "-"
        d = db[idx + 4] - db[idx]  # rise over the next 20 ms
        j = idx[int(np.argmax(d))]
        return f"{tt[j]:.2f}(+{d.max():.0f}dB)"
    print("  lines not timed by the runs — word@time → nearest vocal onset. Pin wrong ones in \"manual\":")
    for r in check:
        print(f"    {r['id']:7s} [{r['source']}] " + "  ".join(f"{w['w']}@{w['t']:.2f}→{near(w['t'])}" for w in r["words"]))


def build(merged: list[dict], grid: dict, cfg: dict, duration: float) -> tuple[dict, dict]:
    end_song = float(cfg.get("end") or duration)
    apply_manual(merged, cfg.get("manual") or {})
    estimate(merged, end_song)
    lines = finish(merged, grid, int(cfg.get("snap_per_beat") or 0), end_song)
    secs = sections(lines, grid, duration)
    g = {k: grid[k] for k in ("bpm", "beat", "phi", "downbeat_mod4", "bar0")}
    lyrics = {"title": cfg.get("title", ""), "duration": round(duration, 3), "grid": g, "sections": secs, "lines": lines}
    mv = {
        "title": cfg.get("title", ""), "subtitle": cfg.get("subtitle", ""),
        "audio": os.path.basename(cfg["audio"]), "audio_path": os.path.abspath(cfg["audio"]),
        "duration": round(duration, 3), "grid": g, "sections": secs,
        "lines": [{k: r[k] for k in ("id", "section", "text", "start", "end", "words")} for r in lines],
        "captions": {"hide": [], "from_word": {}, "whisper": []},
        "theme": cfg.get("theme") or {},
    }
    src = {}
    for r in lines:
        src[r["source"]] = src.get(r["source"], 0) + 1
    print(f"  {len(lines)}/{len(merged)} lines timed — " + ", ".join(f"{v} {k}" for k, v in src.items()))
    onset_report(lines, cfg["audio"])
    return lyrics, mv
