"""Listen again to the places where no whisper run found a lyric line, with that line as the prompt.

Shouts, crowd chants and whispers are what whisper misses most. Cutting out just the gap and telling
the model what words to expect (initial_prompt) often recovers them. Two kinds of windows:
  - automatic: each run of consecutive unplaced lines, from the end of the line before to the start of
    the line after. A line pinned in "manual" counts as placed: it splits a gap and bounds its windows;
  - from the config ("reprompt": [{"from", "to", "prompt"}]): for places you found by ear. Results only
    fill lines that are still unplaced and whose text appears in the prompt.
A prompted model can also just echo the prompt, so lines filled here are marked source "reprompt" and
build_lyrics.py prints the nearest vocal onset next to them — check those by ear and pin them in
"manual" if they are off. Everything heard is saved to reprompt.json for that purpose, with the lines each
hearing was for ("lines") and the lines it timed ("placed").

A pin only constrains. Pinning a line changes the windows around it, and a window heard again with another prompt
can put a line that was right somewhere else: on a test song, pinning the two lines before a re-heard line moved it
1.2 s early, into the pinned line above it. So a line an earlier hearing timed keeps that time while it still fits
the window it would be heard in now, from the last word of the placed or pinned line above it to the start of the
one below. Only the lines that no longer fit, and the lines no hearing timed, are heard again. The
earlier time comes from the saved hearing in reprompt.json, worked out again from the words heard (as merged.json is
from the whisper runs), not from lyrics.json: that one is snapped to the beat grid, fills in words nobody heard and
is not tied to the audio and whisper settings the way a saved hearing is.

A line can be heard more often than the lyric sheet has it in the gap: a singer repeats a shout, a line written
elsewhere in the sheet is sung here, or the model smears the prompt over a stretch of music. Then the earliest
hearing with believable word timing wins, and the others are reported in the warnings. Whisper's word timing fails
in two visible ways: a word stretched over seconds of music (its start is not where it is sung) and a word of zero
length. On the test song the closing shout was heard at 266.2 s, stretched over 5.6 s, and at 283.1 s; taking
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


def _runs(lines: list[dict], skip: set[str]) -> list[tuple[int, int]]:
    """(i, j) for each run lines[i:j] of consecutive lines without a time and not in skip."""
    out, i = [], 0
    while i < len(lines):
        if _known(lines[i]) or lines[i]["id"] in skip:
            i += 1
            continue
        j = i
        while j < len(lines) and not _known(lines[j]) and lines[j]["id"] not in skip:
            j += 1
        out.append((i, j))
        i = j
    return out


def _bounds(lines: list[dict], i: int, j: int, duration: float) -> tuple[float, float, float]:
    """(from, to, next) of the window for lines[i:j]: from just before the last word of the nearest line above with a
    time to just after `next`, the start of the nearest line below with one."""
    prev = next((max(_known(lines[k])) for k in range(i - 1, -1, -1) if _known(lines[k])), 0.0)
    nxt = next((min(_known(lines[k])) for k in range(j, len(lines)) if _known(lines[k])), duration)
    return max(0.0, prev + 0.2 - PAD), min(duration, nxt + PAD), nxt


def gap_windows(lines: list[dict], duration: float, skip: set[str]) -> list[tuple[float, float, list[int]]]:
    """[(from, to, [line indices])] for each run of consecutive unplaced lines (file order)."""
    out = []
    for i, j in _runs(lines, skip):
        a, b, _ = _bounds(lines, i, j, duration)
        if b - a > 0.8:
            out.append((a, b, list(range(i, j))))
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


def _place(lines: list[dict], runs: list[list[dict]], a: float, b: float, targets: set[int]) -> tuple[dict, dict]:
    """What one hearing of the window a–b says about the target lines: ({line index: word times}, {line index: note}).
    Each whisper run (seed) times the targets the runs before it left without a time. `lines` is not changed."""
    times: dict[int, list] = {}
    notes: dict[int, str] = {}
    for words in runs:
        heard_here, why = pick_hearings([w for w in words if a - 0.1 <= w["s"] <= b + 0.1],
                                        {k: lines[k]["text"] for k in targets if k not in times})
        first, cov = align(lines, heard_here, only=targets)
        for k in sorted(targets):
            if k in times or cov.get(k, 0) < 0.3:
                continue
            wt = [first.get((k, wi)) for wi in range(len(lines[k]["words"]))]
            if any(t is not None for t in wt):
                times[k] = wt
                if k in why:
                    notes[k] = why[k]
    return times, notes


def _heard_for(lines: list[dict], h: dict, duration: float) -> set[int] | None:
    """The lines a saved hearing was made for, or None when the lyric sheet no longer has them. `lines` holds only what
    the whisper runs placed. A hearing saved by an older song2mv has no "lines"; an automatic one is found by its prompt
    and window, which pins did not bound then: a run of lines the runs left out, between lines they placed."""
    if "lines" in h:
        at = {r["id"]: k for k, r in enumerate(lines)}
        if not all(i in at for i in h["lines"]):
            return None
        idx = sorted(at[i] for i in h["lines"])
        if h.get("auto") and " ".join(lines[k]["text"] for k in idx) != h["prompt"]:
            return None
        return set(idx)
    if not h.get("auto"):
        return None
    for i, j in _runs(lines, set()):
        for s in range(i, j):
            text = ""
            for e in range(s, j):
                text = f"{text} {lines[e]['text']}" if text else lines[e]["text"]
                if not h["prompt"].startswith(text):
                    break
                a, b, _ = _bounds(lines, s, e + 1, duration)
                if text == h["prompt"] and [round(a, 2), round(b, 2)] == h["range"]:
                    return set(range(s, e + 1))
    return None


def fill_gaps(lines: list[dict], cfg: dict, duration: float, out_path: str, key: dict | None = None) -> list[dict]:
    from .build_lyrics import manual_times
    from .transcribe import decode, transcribe_array
    manual = cfg.get("manual") or {}
    pins = {k: manual_times(r, manual[r["id"]]) for k, r in enumerate(lines) if r["id"] in manual}
    # what re-heard lines go between: the lines the whisper runs placed, and the pins
    fixed = [{"id": r["id"], "wt": pins.get(k, r["wt"])} for k, r in enumerate(lines)]
    auto = cfg.get("auto_reprompt", True)
    jobs = []
    if auto:
        for a, b, idx in gap_windows(fixed, duration, set(manual)):
            jobs.append({"from": a, "to": b, "lines": idx, "prompt": " ".join(lines[k]["text"] for k in idx), "auto": True})
    for w in cfg.get("reprompt") or []:
        p = norm(w["prompt"])
        idx = [k for k, r in enumerate(lines) if norm(r["text"]) and norm(r["text"]) in p]
        jobs.append({"from": float(w["from"]), "to": float(w["to"]), "lines": idx, "prompt": w["prompt"], "auto": False})
    # what earlier calls heard in the same window with the same prompt is reused — for the same audio and settings
    cache = {}
    if os.path.exists(out_path):
        for h in json.load(open(out_path, encoding="utf-8")):
            if key is None or h.get("key") == key:
                cache[(h["range"][0], h["range"][1], h["prompt"])] = h
    # what each saved hearing (of a kind still asked for) says about its lines, and which one timed each line last time
    asked = {(round(j["from"], 2), round(j["to"], 2), j["prompt"]) for j in jobs if not j["auto"]}
    given: dict[tuple, tuple[set[int], dict, dict]] = {}
    earlier: dict[int, tuple] = {}
    for window, h in cache.items():
        targets = _heard_for(lines, h, duration) if (auto if h.get("auto") else window in asked) else None
        if targets is None:
            continue
        given[window] = (targets, *_place(lines, h["words"], window[0], window[1], targets))
        for k in given[window][1]:
            if (lines[k]["id"] in h["placed"]) if "placed" in h else k not in earlier:  # older files: the first one
                earlier[k] = window
    if not jobs and not earlier:
        return lines
    saved: dict[tuple, dict] = {}  # the hearings used, in the order used: they go back to reprompt.json

    def save(window, h, targets, placed):
        entry = saved.setdefault(window, {"range": [window[0], window[1]], "prompt": window[2], "auto": h["auto"],
                                          "words": h["words"], "key": h.get("key", key),
                                          "lines": [lines[k]["id"] for k in sorted(targets)], "placed": []})
        entry["placed"] += [lines[k]["id"] for k in placed]

    def fill(k, wt, note, mark, why=""):
        lines[k]["wt"] = list(wt)
        lines[k]["source"] = "reprompt"
        print(f"      {mark} {lines[k]['id']} {lines[k]['text'][:30]} @ {min(_known(lines[k])):.2f}{why}")
        if note:
            warn(f"{lines[k]['id']} '{lines[k]['text']}': {note} — check it by ear")

    # A line keeps its earlier time while that still fits the window it would be heard in now, between the placed and
    # pinned lines around it. Lines kept here are not heard again; they stay in their window's prompt.
    for i, j in _runs(fixed, set(manual)):
        a, b, nxt = _bounds(fixed, i, j, duration)
        for k in range(i, j):
            if k not in earlier:
                continue
            targets, times, notes = given[earlier[k]]
            t = [x for x in times[k] if x is not None]
            if a <= min(t) < nxt and max(t) <= b:
                fill(k, times[k], notes.get(k), "=", f" (as heard before in {earlier[k][0]:.2f}–{earlier[k][1]:.2f})")
                save(earlier[k], cache[earlier[k]], targets, [k])
    audio, sr = None, 16000
    for job in jobs:
        a, b = job["from"], job["to"]
        window = (round(a, 2), round(b, 2), job["prompt"])
        need = {k for k in job["lines"] if not _known(lines[k]) and k not in pins}
        if job["auto"] and not need:
            continue  # all its lines kept their earlier times
        h = cache.get(window)
        if h is None:
            if audio is None:
                audio = decode(cfg["audio"])
            clip = audio[int(a * sr):int(b * sr)]
            h = {"auto": job["auto"], "key": key,
                 "words": [transcribe_array(clip, cfg["whisper"], cfg.get("language"), offset=a, seed=seed, prompt=job["prompt"])["words"]
                           for seed in (1, 2)]}
        print(f"  {a:6.2f}–{b:6.2f}  prompt: {job['prompt'][:50]}")
        print("      heard: " + "  ".join(f"{w['t']}@{w['s']:.2f}" for w in h["words"][0])[:160])
        # a saved hearing gives its lines what it gave them before; a new one is for the lines still without a time
        targets, times, notes = given.get(window, (set(), {}, {}))
        if not need <= targets:
            targets = set(job["lines"]) if job["auto"] else need
            times, notes = _place(lines, h["words"], a, b, targets)
        placed = [k for k in sorted(times) if k in need]
        for k in placed:
            fill(k, times[k], notes.get(k), "→")
        save(window, h, targets, placed)
    if jobs or saved:
        write_json(list(saved.values()), out_path)
    return lines


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    from .lib import audio_duration
    cfg = load_config(sys.argv[1])
    merged = json.load(open(sys.argv[2], encoding="utf-8"))["lines"]
    fill_gaps(merged, cfg, cfg.get("end") or audio_duration(cfg["audio"]), sys.argv[3])
