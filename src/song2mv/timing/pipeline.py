"""Song → beat grid, word-timed lyrics, LRC and SRT.

Steps (outputs go to the work folder):
  lyrics  lyrics.txt     the lyric sheet (the config's "lyrics" file, or the audio's lyrics tag)
  asr     asr/runN.json  whisper runs; finished runs are kept and reused
  align   merged.json    runs aligned to the lyric sheet and merged per word
  grid    grid.json      tempo, first beat, bar start (reused while bpm / downbeat settings are unchanged)
  build   lyrics.json    final word and line times (+ reprompt.json from re-listening to gaps)
          mv.json        the song config the render template reads
          song.lrc       line-timed LRC; song.words.lrc adds word timestamps
          song.srt       line-timed subtitles for video editors

`start` redoes that step and everything after it, even where results exist ("asr" re-transcribes).
Edit "manual", "bpm" or "downbeat_mod4" in song.json and run again: only the cheap steps rerun.
"""
from __future__ import annotations

import json
import os
import shutil
import time

from ..contract import SCHEMA_VERSION, stamp
from .lib import audio_duration, load_config, parse_lyrics, write_json

STEPS = ["lyrics", "asr", "align", "grid", "build"]
OUTPUTS = ["grid.json", "lyrics.json", "mv.json", "song.lrc", "song.words.lrc", "song.srt"]


def config_from_audio(audio: str, work: str, lyrics: str | None = None, language: str | None = None,
                      title: str | None = None, overrides: dict | None = None) -> str:
    """Write work/song.json for an audio file and return its path. An existing song.json is kept and only
    the given values are updated, so hand edits ("manual", "bpm" ...) survive a rerun."""
    os.makedirs(work, exist_ok=True)
    path = os.path.join(work, "song.json")
    cfg = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    cfg["audio"] = os.path.abspath(audio)
    if lyrics:
        cfg["lyrics"] = os.path.abspath(lyrics)
    if language:
        cfg["language"] = language
    if title or not cfg.get("title"):
        cfg["title"] = title or os.path.splitext(os.path.basename(audio))[0]
    for k, v in (overrides or {}).items():
        if k == "whisper":
            cfg.setdefault("whisper", {}).update(v)
        else:
            cfg[k] = v
    write_json(cfg, path)
    return path


def run(config_path: str, work: str | None = None, start: str | None = None) -> dict:
    """Run the timing steps for one song config. Returns a summary for --json."""
    cfg = load_config(config_path)
    work = work or os.path.dirname(os.path.abspath(config_path))
    os.makedirs(work, exist_ok=True)
    redo = set(STEPS[STEPS.index(start):]) if start else set()
    P = lambda name: os.path.join(work, name)  # noqa: E731
    t_all = time.time()
    duration = audio_duration(cfg["audio"])

    print(f"[lyrics] {os.path.basename(cfg['audio'])} ({duration:.1f} s)")
    if cfg.get("lyrics"):
        if os.path.abspath(cfg["lyrics"]) != os.path.abspath(P("lyrics.txt")):
            shutil.copyfile(cfg["lyrics"], P("lyrics.txt"))
    elif "lyrics" in redo or not os.path.exists(P("lyrics.txt")):
        from .extract_lyrics import extract
        extract(cfg["audio"], P("lyrics.txt"))
    lines = parse_lyrics(P("lyrics.txt"), cfg)
    print(f"  {len(lines)} sung lines in {len(dict.fromkeys(r['section'] for r in lines))} sections")

    print(f"[asr] faster-whisper {cfg['whisper']['model']} × {cfg['whisper']['runs']}")
    from .transcribe import run_all
    paths = run_all(cfg["audio"], P("asr"), cfg["whisper"], cfg.get("language"), force="asr" in redo)
    runs = [json.load(open(p, encoding="utf-8")) for p in paths]

    print("[align] lyric sheet ↔ each run, merged per word")
    from .align import merge_runs, report
    merged = merge_runs(lines, runs)
    write_json({"lines": merged}, P("merged.json"))
    report(merged, len(runs))

    print("[grid] beat grid")
    request = {"bpm": cfg.get("bpm"), "downbeat_mod4": cfg.get("downbeat_mod4")}
    old = json.load(open(P("grid.json"))) if os.path.exists(P("grid.json")) else None
    if old and old.get("request") == request and old.get("schema_version") == SCHEMA_VERSION and "grid" not in redo:
        grid = old
        print(f"  cached: {grid['bpm']} BPM, first beat {grid['phi']} s, bar starts at beat % 4 == {grid['downbeat_mod4']}")
    else:
        from .beat_grid import find_grid
        starts = [min(t for t in r["wt"] if t is not None) for r in merged if any(t is not None for t in r["wt"])]
        grid = stamp(find_grid(cfg["audio"], cfg.get("bpm"), starts, cfg.get("downbeat_mod4")))
        grid["request"] = request
        write_json(grid, P("grid.json"))

    print("[build] gaps, manual values, snapping")
    from .build_lyrics import build
    from .reprompt import fill_gaps
    from .to_lrc import to_lrc
    from .to_srt import to_srt
    merged = fill_gaps(merged, cfg, float(cfg.get("end") or duration), P("reprompt.json"))
    lyrics, mv = build(merged, grid, cfg, duration)
    write_json(stamp(lyrics), P("lyrics.json"))
    write_json(stamp(mv), P("mv.json"))
    meta = {"ti": cfg.get("title"), "length": f"{int(duration // 60)}:{int(duration % 60):02d}"}
    to_lrc(lyrics["lines"], P("song.lrc"), meta=meta)
    to_lrc(lyrics["lines"], P("song.words.lrc"), words=True, meta=meta)
    to_srt(lyrics["lines"], P("song.srt"))
    secs = time.time() - t_all
    print(f"\ndone in {secs:.0f} s → {work}")
    for f in OUTPUTS:
        print(f"  {f}")

    sources: dict[str, int] = {}
    for r in lyrics["lines"]:
        sources[r.get("source", "?")] = sources.get(r.get("source", "?"), 0) + 1
    return stamp({
        "command": "sync",
        "work": os.path.abspath(work),
        "config": os.path.abspath(config_path),
        "outputs": {f: os.path.abspath(P(f)) for f in OUTPUTS},
        "duration": round(duration, 3),
        "bpm": grid["bpm"],
        "lines": len(lyrics["lines"]),
        "line_sources": sources,
        "check_by_ear": [r["id"] for r in lyrics["lines"] if r.get("source") in ("reprompt", "estimated")],
        "dropped": [r["id"] for r in lines if r["id"] not in {x["id"] for x in lyrics["lines"]}],
        "seconds": round(secs, 1),
    })


def beats(audio: str, out: str, bpm: str | float | None = "auto", downbeat: int | None = None) -> dict:
    """Beat grid only — no lyrics, no whisper."""
    from .beat_grid import find_grid
    print(f"[beats] {os.path.basename(audio)}")
    grid = stamp(find_grid(audio, bpm, None, downbeat))
    write_json(grid, out)
    print(f"\n{grid['bpm']} BPM, first beat {grid['phi']} s, bar starts at beat % 4 == {grid['downbeat_mod4']} → {out}")
    return stamp({"command": "beats", "outputs": {"grid.json": os.path.abspath(out)}, "bpm": grid["bpm"],
                  "phi": grid["phi"], "downbeat_mod4": grid["downbeat_mod4"], "bar0": grid["bar0"]})
