"""Listen again to the places where no whisper run found a lyric line, with that line as the prompt.

Shouts, crowd chants and whispers are what whisper misses most. Cutting out just the gap and telling
the model what words to expect (initial_prompt) often recovers them. Two kinds of windows:
  - automatic: each run of consecutive unplaced lines, from the end of the line before to the start of
    the line after;
  - from the config ("reprompt": [{"from", "to", "prompt"}]): for places you found by ear. Results only
    fill lines that are still unplaced and whose text appears in the prompt.
A prompted model can also just echo the prompt, so lines filled here are marked source "reprompt" and
build_lyrics.py prints the nearest vocal onset next to them — check those by ear and pin them in
"manual" if they are off. Everything heard is saved to reprompt.json for that purpose.

Usage: run through `song2mv sync` (step "build"). Standalone: python -m song2mv.timing.reprompt song.json work/merged.json work/reprompt.json
"""
from __future__ import annotations

import json
import os
import sys

from .lib import align, load_config, norm, write_json

PAD = 0.3


def _known(r):
    return [t for t in r["wt"] if t is not None]


def gap_windows(lines: list[dict], duration: float, skip: set[str]) -> list[tuple[float, float, list[int]]]:
    """[(from, to, [line indices])] for each run of consecutive unplaced lines (file order)."""
    out, i = [], 0
    while i < len(lines):
        if _known(lines[i]) or lines[i]["id"] in skip:
            i += 1
            continue
        j = i
        while j < len(lines) and not _known(lines[j]) and lines[j]["id"] not in skip:
            j += 1
        prev = next((max(_known(lines[k])) for k in range(i - 1, -1, -1) if _known(lines[k])), 0.0)
        nxt = next((min(_known(lines[k])) for k in range(j, len(lines)) if _known(lines[k])), duration)
        a, b = max(0.0, prev + 0.2 - PAD), min(duration, nxt + PAD)
        if b - a > 0.8:
            out.append((a, b, list(range(i, j))))
        i = j
    return out


def fill_gaps(lines: list[dict], cfg: dict, duration: float, out_path: str) -> list[dict]:
    from .transcribe import decode, transcribe_array
    manual = set(cfg.get("manual") or {})
    jobs = []
    if cfg.get("auto_reprompt", True):
        for a, b, idx in gap_windows(lines, duration, manual):
            jobs.append({"from": a, "to": b, "lines": idx, "prompt": " ".join(lines[k]["text"] for k in idx), "auto": True})
    for w in cfg.get("reprompt") or []:
        p = norm(w["prompt"])
        idx = [k for k, r in enumerate(lines) if norm(r["text"]) and norm(r["text"]) in p]
        jobs.append({"from": float(w["from"]), "to": float(w["to"]), "lines": idx, "prompt": w["prompt"], "auto": False})
    if not jobs:
        return lines
    # what earlier calls heard in the same window with the same prompt is reused
    cache = {}
    if os.path.exists(out_path):
        for h in json.load(open(out_path, encoding="utf-8")):
            cache[(h["range"][0], h["range"][1], h["prompt"])] = h["words"]
    audio, sr = None, 16000
    heard = []
    for job in jobs:
        a, b = job["from"], job["to"]
        key = (round(a, 2), round(b, 2), job["prompt"])
        runs = cache.get(key)
        if runs is None:
            if audio is None:
                audio = decode(cfg["audio"])
            clip = audio[int(a * sr):int(b * sr)]
            runs = [transcribe_array(clip, cfg["whisper"], cfg.get("language"), offset=a, seed=seed, prompt=job["prompt"])["words"]
                    for seed in (1, 2)]
        heard.append({"range": [round(a, 2), round(b, 2)], "prompt": job["prompt"], "auto": job["auto"],
                      "words": runs})
        print(f"  {a:6.2f}–{b:6.2f}  prompt: {job['prompt'][:50]}")
        print("      heard: " + "  ".join(f"{w['t']}@{w['s']:.2f}" for w in runs[0])[:160])
        targets = {k for k in job["lines"] if not _known(lines[k]) and lines[k]["id"] not in manual}
        if not targets:
            continue
        for words in runs:
            first, cov = align(lines, [w for w in words if a - 0.1 <= w["s"] <= b + 0.1], only=targets)
            for k in sorted(targets):
                if _known(lines[k]) or cov.get(k, 0) < 0.3:
                    continue
                lines[k]["wt"] = [first.get((k, wi)) for wi in range(len(lines[k]["words"]))]
                if _known(lines[k]):
                    lines[k]["source"] = "reprompt"
                    print(f"      → {lines[k]['id']} {lines[k]['text'][:30]} @ {min(_known(lines[k])):.2f}")
    write_json(heard, out_path)
    return lines


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    from .lib import audio_duration
    cfg = load_config(sys.argv[1])
    merged = json.load(open(sys.argv[2], encoding="utf-8"))["lines"]
    fill_gaps(merged, cfg, cfg.get("end") or audio_duration(cfg["audio"]), sys.argv[3])
