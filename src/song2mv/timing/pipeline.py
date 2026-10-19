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
          music.json     loudness curve and likely section boundaries (cached by the audio's content)

`start` redoes that step and everything after it, even where results exist ("asr" re-transcribes).
Edit "manual", "bpm" or "downbeat_mod4" in song.json and run again: only the cheap steps rerun.
"""
from __future__ import annotations

import json
import os
import shutil
import time

from ..contract import SCHEMA_VERSION, stamp
from ..errors import Song2mvError
from . import lib
from .lib import asr_key, audio_duration, file_sha256, load_config, parse_lyrics, warn, write_json

STEPS = ["lyrics", "asr", "align", "grid", "build"]
OUTPUTS = ["grid.json", "lyrics.json", "mv.json", "song.lrc", "song.words.lrc", "song.srt", "music.json"]
STATE = "state.json"  # which audio (by content) this work folder belongs to, and where its lyric sheet came from


def _state(work: str) -> dict | None:
    try:
        return json.load(open(os.path.join(work, STATE), encoding="utf-8"))
    except (OSError, ValueError):
        return None


def claim_folder(work: str, audio: str) -> None:
    """A work folder belongs to one audio file. Refuse to mix another song's lyrics, whisper runs and grid into it."""
    path = os.path.join(work, "song.json")
    try:
        old = json.load(open(path, encoding="utf-8")).get("audio")
    except (OSError, ValueError, AttributeError):
        return
    if not old:
        return
    old_abs = old if os.path.isabs(old) else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(path)), old))
    new_abs = os.path.abspath(audio)
    if old_abs == new_abs:
        return
    st = _state(work)
    if st and st.get("audio_sha256") == file_sha256(new_abs):
        warn(f"the audio moved: {old_abs} → {new_abs} (same content); song.json updated")
        return
    raise Song2mvError(f"{work} already holds the work for another audio file: {old_abs}",
                       hint="pass another --out for this song, or delete that folder to start over")


def _apply(cfg: dict, lyrics: str | None, language: str | None, title: str | None, overrides: dict | None) -> list[str]:
    """Set command-line values in a song config. Returns the keys that changed."""
    changed = []
    if lyrics and cfg.get("lyrics") != os.path.abspath(lyrics):
        cfg["lyrics"] = os.path.abspath(lyrics)
        changed.append("lyrics")
    if language and cfg.get("language") != language:
        cfg["language"] = language
        changed.append("language")
    if title and cfg.get("title") != title:
        cfg["title"] = title
        changed.append("title")
    for k, v in (overrides or {}).items():
        if k == "whisper":
            w = cfg.setdefault("whisper", {})
            for wk, wv in v.items():
                if w.get(wk) != wv:
                    w[wk] = wv
                    changed.append(f"whisper.{wk}")
        elif cfg.get(k) != v:
            cfg[k] = v
            changed.append(k)
    return changed


def config_from_audio(audio: str, work: str, lyrics: str | None = None, language: str | None = None,
                      title: str | None = None, overrides: dict | None = None) -> str:
    """Write work/song.json for an audio file and return its path. An existing song.json is kept and only
    the given values are updated, so hand edits ("manual", "bpm" ...) survive a rerun."""
    claim_folder(work, audio)
    os.makedirs(work, exist_ok=True)
    path = os.path.join(work, "song.json")
    cfg = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    cfg["audio"] = os.path.abspath(audio)
    if not cfg.get("title") and not title:
        cfg["title"] = os.path.splitext(os.path.basename(audio))[0]
    _apply(cfg, lyrics, language, title, overrides)
    write_json(cfg, path)
    return path


def update_config(path: str, lyrics: str | None = None, language: str | None = None, title: str | None = None,
                  overrides: dict | None = None) -> list[str]:
    """Apply command-line values to an existing song.json (`sync WORK/song.json --runs 5`) and save it."""
    try:
        cfg = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Song2mvError(f"cannot read {path}: {e}") from None
    changed = _apply(cfg, lyrics, language, title, overrides)
    if changed:
        write_json(cfg, path)
        print(f"  song.json updated: {', '.join(changed)}")
    return changed


def run(config_path: str, work: str | None = None, start: str | None = None) -> dict:
    """Run the timing steps for one song config. Returns a summary for --json."""
    lib.WARNINGS.clear()
    cfg = load_config(config_path)
    work = work or os.path.dirname(os.path.abspath(config_path))
    os.makedirs(work, exist_ok=True)
    redo = set(STEPS[STEPS.index(start):]) if start else set()
    P = lambda name: os.path.join(work, name)  # noqa: E731
    t_all = time.time()
    duration = audio_duration(cfg["audio"])
    sha = file_sha256(cfg["audio"])
    state = _state(work)
    changed = bool(state) and state.get("audio_sha256") != sha
    if changed:
        warn("the audio file's content changed since the last run in this folder: whisper runs, the beat grid "
             "and re-listened gaps are redone. Check that 'manual' values still fit.")
    if not cfg.get("language"):
        warn("no language set: whisper guesses it from the first 30 s, often wrongly — pass --language")
    key = asr_key(cfg, sha)

    print(f"[lyrics] {os.path.basename(cfg['audio'])} ({duration:.1f} s)")
    if cfg.get("lyrics"):
        lyrics_from = "file"
        if not os.path.isfile(cfg["lyrics"]):
            raise Song2mvError(f"lyrics file not found: {cfg['lyrics']}")
        if os.path.abspath(cfg["lyrics"]) != os.path.abspath(P("lyrics.txt")):
            src = open(cfg["lyrics"], encoding="utf-8-sig").read()
            if os.path.exists(P("lyrics.txt")) and open(P("lyrics.txt"), encoding="utf-8-sig").read() != src:
                warn(f"lyrics.txt in the work folder differed from {cfg['lyrics']} and was replaced — edit that file instead")
            shutil.copyfile(cfg["lyrics"], P("lyrics.txt"))
    else:
        lyrics_from = "tag"
        stale = changed or (state is not None and state.get("lyrics_from") != "tag")
        if "lyrics" in redo or not os.path.exists(P("lyrics.txt")) or stale:
            if stale and os.path.exists(P("lyrics.txt")):
                warn("lyrics.txt was read again from the audio's lyrics tag; earlier edits to it are replaced")
            from .extract_lyrics import extract
            extract(cfg["audio"], P("lyrics.txt"))
    lines = parse_lyrics(P("lyrics.txt"), cfg)
    if not lines:
        raise Song2mvError(f"no sung lines in {P('lyrics.txt')}",
                           hint="one lyric line per text line; [Verse], [Chorus] … lines name sections")
    print(f"  {len(lines)} sung lines in {len(dict.fromkeys(r['section'] for r in lines))} sections")

    print(f"[asr] faster-whisper {cfg['whisper']['model']} × {cfg['whisper']['runs']}, language {cfg.get('language') or 'auto'}")
    from .transcribe import run_all
    paths = run_all(cfg["audio"], P("asr"), cfg["whisper"], cfg.get("language"), force="asr" in redo, key=key)
    runs = [json.load(open(p, encoding="utf-8")) for p in paths]

    print("[align] lyric sheet ↔ each run, merged per word")
    from .align import merge_runs, report
    merged = merge_runs(lines, runs)
    write_json({"lines": merged}, P("merged.json"))
    report(merged, len(runs))

    print("[grid] beat grid")
    request = {"bpm": cfg.get("bpm"), "downbeat_mod4": cfg.get("downbeat_mod4"), "audio_sha256": sha}
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
    merged = fill_gaps(merged, cfg, float(cfg.get("end") or duration), P("reprompt.json"), key=key)
    lyrics, mv = build(merged, grid, cfg, duration)
    write_json(stamp(lyrics), P("lyrics.json"))
    write_json(stamp(mv), P("mv.json"))
    meta = {"ti": cfg.get("title"), "length": f"{int(duration // 60)}:{int(duration % 60):02d}"}
    to_lrc(lyrics["lines"], P("song.lrc"), meta=meta)
    to_lrc(lyrics["lines"], P("song.words.lrc"), words=True, meta=meta)
    to_srt(lyrics["lines"], P("song.srt"))
    try:
        old_music = json.load(open(P("music.json"), encoding="utf-8"))
    except (OSError, ValueError):
        old_music = None
    if not old_music or old_music.get("audio_sha256") != sha or old_music.get("schema_version") != SCHEMA_VERSION:
        print("[music] loudness curve and section boundaries (for scene design)")
        from .analyze_music import analyze
        write_json(stamp({**analyze(cfg["audio"]), "audio_sha256": sha}), P("music.json"))
    write_json(stamp({"audio": os.path.abspath(cfg["audio"]), "audio_sha256": sha, "lyrics_from": lyrics_from}), P(STATE))
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
        "language": cfg.get("language") or (runs[0].get("language") if runs else None),
        "warnings": list(lib.WARNINGS),
        "seconds": round(secs, 1),
    })


def beats(audio: str, out: str, bpm: str | float | None = "auto", downbeat: int | None = None) -> dict:
    """Beat grid only — no lyrics, no whisper."""
    from .beat_grid import find_grid
    lib.WARNINGS.clear()
    audio_duration(audio)  # a readable audio file, or a clear error
    print(f"[beats] {os.path.basename(audio)}")
    grid = stamp(find_grid(audio, bpm, None, downbeat))
    write_json(grid, out)
    print(f"\n{grid['bpm']} BPM, first beat {grid['phi']} s, bar starts at beat % 4 == {grid['downbeat_mod4']} → {out}")
    return stamp({"command": "beats", "outputs": {os.path.basename(out): os.path.abspath(out)}, "bpm": grid["bpm"],
                  "beat": grid["beat"], "phi": grid["phi"], "downbeat_mod4": grid["downbeat_mod4"], "bar0": grid["bar0"],
                  "bar": grid["bar"], "duration": grid["duration"], "warnings": list(lib.WARNINGS)})
