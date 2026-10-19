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

A line can be heard more often than the lyric sheet has it in the gap: a singer repeats a shout, a line written
elsewhere in the sheet is sung here, or the model smears the prompt over a stretch of music. Then the earliest
hearing with believable word timing wins, and the others are reported in the warnings. Whisper's word timing fails
in two visible ways: a word stretched over seconds of music (its start is not where it is sung) and a word of zero
length. On the test song the closing "천만닉스!" was heard at 266.2 s, stretched over 5.6 s, and at 283.1 s; taking
the first put the line 16 s early. Whisper's confidence is no guide here: in the same song the clearest "HEY! HEY!"
in one gap belonged to another line that is written later but sung there.

Usage: run through `song2mv sync` (step "build"). Standalone: python -m song2mv.timing.reprompt song.json work/merged.json work/reprompt.json
"""
from __future__ import annotations

import json
import os
import sys

from .lib import align, load_config, norm, warn, write_json

PAD = 0.3
MAX_SECONDS_PER_LETTER = 1.0  # a heard word longer than this per letter was stretched over music
MIN_WORD_SECONDS = 0.02  # shorter is a word whisper timed at zero length


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


def _hearings(words: list[dict], text: str) -> list[tuple[int, int]]:
    """Spans [i, j) of heard words whose letters spell `text` (normalised): the shortest span from each start."""
    target = norm(text)
    spans = []
    for i in range(len(words)):
        acc = ""
        for j in range(i, len(words)):
            acc += norm(words[j]["t"])
            if acc == target:
                spans.append((i, j + 1))
                break
            if not target.startswith(acc):
                break
    return spans


def _timing_problem(words: list[dict]) -> str | None:
    """Why the word timing of one hearing is not believable, or None."""
    for w in words:
        dur = w["e"] - w["s"]
        if dur < MIN_WORD_SECONDS:
            return "zero length"
        if dur > MAX_SECONDS_PER_LETTER * max(1, len(norm(w["t"]))):
            return f"stretched over {dur:.1f} s"
    return None


def pick_hearings(words: list[dict], targets: dict[int, str]) -> tuple[list[dict], dict[int, str]]:
    """When a target line's text was heard more often than the gap has lines with that text, keep the earliest
    hearings whose word timing is believable and drop the others before aligning. Returns (words to align,
    {line index: note on what was taken and what was not})."""
    by_text: dict[str, list[int]] = {}
    for k, text in targets.items():
        if norm(text):
            by_text.setdefault(norm(text), []).append(k)
    keep_idx: set[int] = set()
    drop_idx: set[int] = set()
    notes: dict[int, str] = {}
    for ks in by_text.values():
        spans = _hearings(words, targets[ks[0]])
        if len(spans) <= len(ks):
            continue
        problem = {sp: _timing_problem(words[sp[0]:sp[1]]) for sp in spans}
        kept: list[tuple[int, int]] = []
        for sp in sorted(spans, key=lambda sp: (problem[sp] is not None, sp[0])):  # believable first, then earliest
            if len(kept) < len(ks) and all(sp[1] <= o[0] or o[1] <= sp[0] for o in kept):
                kept.append(sp)
        for sp in spans:
            (keep_idx if sp in kept else drop_idx).update(range(*sp))
        took = ", ".join(f"{words[sp[0]]['s']:.1f} s" for sp in sorted(kept))
        rest = ", ".join(f"{words[sp[0]]['s']:.1f} s" + (f" ({problem[sp]})" if problem[sp] else "")
                         for sp in spans if sp not in kept)
        for k in ks:
            notes[k] = f"heard {len(spans)} times; took {took}, not {rest}"
    return [w for n, w in enumerate(words) if n not in drop_idx or n in keep_idx], notes


def fill_gaps(lines: list[dict], cfg: dict, duration: float, out_path: str, key: dict | None = None) -> list[dict]:
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
    # what earlier calls heard in the same window with the same prompt is reused — for the same audio and settings
    cache = {}
    if os.path.exists(out_path):
        for h in json.load(open(out_path, encoding="utf-8")):
            if key is None or h.get("key") == key:
                cache[(h["range"][0], h["range"][1], h["prompt"])] = h["words"]
    audio, sr = None, 16000
    heard = []
    for job in jobs:
        a, b = job["from"], job["to"]
        window = (round(a, 2), round(b, 2), job["prompt"])
        runs = cache.get(window)
        if runs is None:
            if audio is None:
                audio = decode(cfg["audio"])
            clip = audio[int(a * sr):int(b * sr)]
            runs = [transcribe_array(clip, cfg["whisper"], cfg.get("language"), offset=a, seed=seed, prompt=job["prompt"])["words"]
                    for seed in (1, 2)]
        heard.append({"range": [round(a, 2), round(b, 2)], "prompt": job["prompt"], "auto": job["auto"],
                      "words": runs, "key": key})
        print(f"  {a:6.2f}–{b:6.2f}  prompt: {job['prompt'][:50]}")
        print("      heard: " + "  ".join(f"{w['t']}@{w['s']:.2f}" for w in runs[0])[:160])
        targets = {k for k in job["lines"] if not _known(lines[k]) and lines[k]["id"] not in manual}
        if not targets:
            continue
        for words in runs:
            heard_here, notes = pick_hearings([w for w in words if a - 0.1 <= w["s"] <= b + 0.1],
                                              {k: lines[k]["text"] for k in targets if not _known(lines[k])})
            first, cov = align(lines, heard_here, only=targets)
            for k in sorted(targets):
                if _known(lines[k]) or cov.get(k, 0) < 0.3:
                    continue
                lines[k]["wt"] = [first.get((k, wi)) for wi in range(len(lines[k]["words"]))]
                if _known(lines[k]):
                    lines[k]["source"] = "reprompt"
                    print(f"      → {lines[k]['id']} {lines[k]['text'][:30]} @ {min(_known(lines[k])):.2f}")
                    if k in notes:
                        warn(f"{lines[k]['id']} '{lines[k]['text']}': {notes[k]} — check it by ear")
    write_json(heard, out_path)
    return lines


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    from .lib import audio_duration
    cfg = load_config(sys.argv[1])
    merged = json.load(open(sys.argv[2], encoding="utf-8"))["lines"]
    fill_gaps(merged, cfg, cfg.get("end") or audio_duration(cfg["audio"]), sys.argv[3])
