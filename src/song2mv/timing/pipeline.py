"""Song → beat grid, word-timed lyrics, LRC and SRT.

Steps (outputs go to the work folder):
  lyrics  lyrics.txt     the lyric sheet (the config's "lyrics" file, or the audio's lyrics tag)
  asr     asr/runN.json  whisper runs; finished runs are kept and reused
  align   merged.json    runs aligned to the lyric sheet and merged per word
  grid    grid.json      tempo, first beat, bar start, stretches where it does not fit and there a beat map, swing
                         (reused while bpm / downbeat settings are unchanged)
  build   lyrics.json    final word and line times (+ reprompt.json from re-listening to gaps)
          mv.json        the song config the render template reads
          song.lrc       line-timed LRC; song.words.lrc adds word timestamps
          song.srt       line-timed subtitles for video editors
          music.json     loudness curve and likely section boundaries (cached by the audio's content); a section named
                         calm that is about as loud as the mid sections becomes mid

`start` redoes that step and everything after it, even where results exist ("asr" re-transcribes).
Edit "manual", "bpm" or "downbeat_mod4" in song.json and run again: only the cheap steps rerun. A pin in "manual" only
constrains: re-heard lines keep their times while they fit between the pins, and only lines a pin contradicts are heard
again (reprompt.py).
"""
from __future__ import annotations

import json
import os
import shutil
import statistics
import time
from collections.abc import Sequence

from ..contract import SCHEMA_VERSION, stamp
from ..errors import Song2mvError
from . import lib
from .lib import asr_key, audio_duration, file_sha256, in_order, load_config, lyric_lines, parse_lyrics, warn, write_json

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


GAP = 3.0  # seconds between two neighbouring words of a line
SPAN = 2.5  # a line lasting this many times its word count × the song's median time from one word to the next
STACK = 0.1  # seconds holding three words of a line


def stretched(lines: list[dict], off: Sequence[dict] = ()) -> dict[str, str]:
    """Lines whose words are spread over far more time than such a line is sung in, with the reason: two neighbouring
    words more than GAP s apart, the line lasting (first word to last) more than SPAN × its word count × the song's
    median time from one word to the next in a line, or words the runs heard off the lyric sheet (`off`,
    align.off_sheet) between its first word and its last. Such a line was usually matched in two places: its words are
    split between two copies of a repeat the sheet has once."""
    steps = [b["t"] - a["t"] for r in lines for a, b in zip(r.get("words") or [], (r.get("words") or [])[1:]) if b["t"] > a["t"]]
    step = statistics.median(steps) if steps else 0.0
    out = {}
    for r in lines:
        w = r.get("words") or []
        if len(w) < 2:
            continue
        k = max(range(len(w) - 1), key=lambda k: w[k + 1]["t"] - w[k]["t"])
        inside = [x for x in off if w[0]["t"] < x["from"] and x["to"] < w[-1]["t"]]
        if w[k + 1]["t"] - w[k]["t"] > GAP:
            out[r["id"]] = f'{w[k + 1]["t"] - w[k]["t"]:.1f} s between "{w[k]["w"]}" and "{w[k + 1]["w"]}"'
        elif step and w[-1]["t"] - w[0]["t"] > SPAN * len(w) * step:
            out[r["id"]] = f"{len(w)} words over {w[-1]['t'] - w[0]['t']:.1f} s"
        elif inside:
            out[r["id"]] = f"words heard off the lyric sheet at {inside[0]['from']:.1f}–{inside[0]['to']:.1f} s lie between its words"
    return out


def stacked(lines: list[dict]) -> dict[str, str]:
    """Lines with three neighbouring words inside STACK s, with the reason. No one sings three words that fast: the
    words between two timed ones were spread over almost no time, or the runs timed the line's first words on a later
    one ("Beep, beep" on "Brooklyn"). On the JamendoLyrics benchmark the annotations had such three words 0.15–4.2 s
    apart, and in 25 of 29 lines one of them was more than 0.3 s off (in 11, more than 1 s)."""
    out = {}
    for r in lines:
        t = [w["t"] for w in r.get("words") or []]
        k = next((k for k in range(len(t) - 2) if t[k + 2] - t[k] <= STACK), None)
        if k is not None:
            out[r["id"]] = f'"{" ".join(w["w"] for w in r["words"][k:k + 3])}" within {t[k + 2] - t[k]:.2f} s at {t[k]:.2f}'
    return out


def check_by_ear(lines: list[dict], n_runs: int, doubtful: set[str] | frozenset[str] = frozenset(),
                 off: Sequence[dict] = ()) -> list[str]:
    """Line ids most likely to be wrong: re-heard or estimated lines, lines only one of several whisper runs placed —
    one run alone can put a line seconds off (12.7 s once on the test song) — lines out of the lyric sheet's order
    (lib.in_order), where a repeated line was placed on another copy of its words, the whisper lines in `doubtful`
    (align.doubt: a word no run timed between words far apart, runs that disagree on its start or on a word's time;
    align.sung_differently), whisper lines spread over far more time than they are sung in (stretched, with the
    stretches heard off the sheet in `off`) and whisper lines with three words at almost one time (stacked). Lines
    pinned in "manual" are not listed."""
    def one_run(r):
        return n_runs > 1 and r.get("source") == "asr" and len(r.get("runs_used") or []) < 2
    starts = [r.get("start") for r in lines]
    order = in_order(starts)
    odd = stretched(lines, off).keys() | stacked(lines).keys() | set(doubtful)
    return [r["id"] for i, r in enumerate(lines) if r.get("source") in ("reprompt", "estimated") or one_run(r)
            or (starts[i] is not None and i not in order and r.get("source") != "manual")
            or (r["id"] in odd and r.get("source") == "asr")]


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
    from .align import doubt, merge_runs, off_sheet, report, sheet_vs_tag, sung_differently
    heard: list[set[int]] = []
    merged = merge_runs(lines, runs, heard)
    write_json({"lines": merged}, P("merged.json"))
    report(merged, len(runs))
    if lyrics_from == "file":
        from .extract_lyrics import lyrics_tag
        tag = lyrics_tag(cfg["audio"])
        tag_lines = lyric_lines(tag[1], cfg) if tag else []
        if tag_lines:
            for msg in sheet_vs_tag(lines, tag_lines, runs):
                warn(msg)
    changed = sung_differently(merged)
    text = {r["id"]: r["text"] for r in merged}
    for x in changed:
        warn(f"{x['id']} \"{text[x['id']]}\" is heard as \"{x['heard']}\" (runs {', '.join(map(str, x['runs']))}), and "
             f"{x['as_written']}, the same line, as written: if that is what is sung there, sync again with a sheet "
             "that has it")

    print("[grid] beat grid")
    from .beat_grid import describe_off_grid, describe_pick
    request = {"bpm": cfg.get("bpm"), "downbeat_mod4": cfg.get("downbeat_mod4"), "audio_sha256": sha}
    old = json.load(open(P("grid.json"))) if os.path.exists(P("grid.json")) else None
    # a grid without off_grid was made before the fit check, and one with stretches but no "beats" before the beat
    # map: refit those
    current = bool(old) and "off_grid" in old and (not old["off_grid"] or "beats" in old)
    if current and old.get("request") == request and old.get("schema_version") == SCHEMA_VERSION and "grid" not in redo:
        grid = old
        print(f"  cached: {grid['bpm']} BPM, first beat {grid['phi']} s, bar starts at beat % 4 == {grid['downbeat_mod4']}"
              + (f", a beat map of {len(grid['beats'])} beats" if grid.get("beats") else "")
              + (f", 16th notes swung to {grid['swing'][0]:g} and {grid['swing'][1]:g} of a beat" if grid.get("swing") else ""))
    else:
        from .beat_grid import find_grid
        starts = [min(t for t in r["wt"] if t is not None) for r in merged if any(t is not None for t in r["wt"])]
        grid = stamp(find_grid(cfg["audio"], cfg.get("bpm"), starts, cfg.get("downbeat_mod4")))
        grid["request"] = request
        write_json(grid, P("grid.json"))
    for msg in describe_pick(grid) + describe_off_grid(grid):
        warn(msg)

    print("[build] gaps, manual values, snapping")
    from .build_lyrics import build, loud_calm
    from .reprompt import fill_gaps
    from .to_lrc import to_lrc
    from .to_srt import to_srt
    merged = fill_gaps(merged, cfg, float(cfg.get("end") or duration), P("reprompt.json"), key=key)
    doubtful = {r["id"] for r in merged if r.get("source") == "asr" and doubt(r)} | {x["id"] for x in changed}
    lyrics, mv = build(merged, grid, cfg, duration)
    try:
        music = json.load(open(P("music.json"), encoding="utf-8"))
    except (OSError, ValueError):
        music = None
    if not music or music.get("audio_sha256") != sha or music.get("schema_version") != SCHEMA_VERSION:
        print("[music] loudness curve and section boundaries (for scene design)")
        from .analyze_music import analyze
        music = stamp({**analyze(cfg["audio"]), "audio_sha256": sha})
        write_json(music, P("music.json"))
    for msg in loud_calm(lyrics, music["loudness_db_per_half_second"], cfg.get("section_kinds") or {}):
        warn(msg)
    not_on_sheet = off_sheet(runs, heard, lyrics["lines"])
    for x in not_on_sheet:
        words = x["words"] if len(x["words"]) <= 60 else x["words"][:59] + "…"
        warn(f"heard but not on the lyric sheet: {x['from']:.1f}–{x['to']:.1f} s"
             f"{', after ' + x['after'] if x['after'] else ''}, \"{words}\" (runs {', '.join(map(str, x['runs']))})")
    source = {r["id"]: r["source"] for r in lyrics["lines"]}
    for i, why in stretched(lyrics["lines"], not_on_sheet).items():
        if source[i] == "asr":
            print(f"  ◀ {i} spread out: {why}")
    for i, why in stacked(lyrics["lines"]).items():
        if source[i] == "asr":
            print(f"  ◀ {i} stacked: {why}")
    write_json(stamp(lyrics), P("lyrics.json"))
    write_json(stamp(mv), P("mv.json"))
    meta = {"ti": cfg.get("title"), "length": f"{int(duration // 60)}:{int(duration % 60):02d}"}
    to_lrc(lyrics["lines"], P("song.lrc"), meta=meta)
    to_lrc(lyrics["lines"], P("song.words.lrc"), words=True, meta=meta)
    to_srt(lyrics["lines"], P("song.srt"))
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
        "check_by_ear": check_by_ear(lyrics["lines"], len(runs), doubtful, not_on_sheet),
        "off_sheet": not_on_sheet,
        "dropped": [r["id"] for r in lines if r["id"] not in {x["id"] for x in lyrics["lines"]}],
        "language": cfg.get("language") or (runs[0].get("language") if runs else None),
        "warnings": list(lib.WARNINGS),
        "seconds": round(secs, 1),
    })


def beats(audio: str, out: str, bpm: str | float | None = "auto", downbeat: int | None = None) -> dict:
    """Beat grid only — no lyrics, no whisper."""
    from .beat_grid import describe_off_grid, find_grid
    lib.WARNINGS.clear()
    audio_duration(audio)  # a readable audio file, or a clear error
    print(f"[beats] {os.path.basename(audio)}")
    grid = stamp(find_grid(audio, bpm, None, downbeat))
    write_json(grid, out)
    for msg in describe_off_grid(grid):
        warn(msg)
    print(f"\n{grid['bpm']} BPM, first beat {grid['phi']} s, bar starts at beat % 4 == {grid['downbeat_mod4']} → {out}")
    return stamp({"command": "beats", "outputs": {os.path.basename(out): os.path.abspath(out)}, "bpm": grid["bpm"],
                  "beat": grid["beat"], "phi": grid["phi"], "downbeat_mod4": grid["downbeat_mod4"], "bar0": grid["bar0"],
                  "bar": grid["bar"], "duration": grid["duration"], "off_grid": grid["off_grid"], "warnings": list(lib.WARNINGS)})
