"""song2mv command line: sync, beats, check, render.

Every command prints progress for people. With --json, progress goes to stderr and stdout carries exactly one
JSON object (with schema_version) for scripts and coding agents.
"""
from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import os
import shutil
import sys

from . import __version__

EXTRA_HINT = "uv tool install 'song2mv[{extra}]'   (or: pip install 'song2mv[{extra}]')"


def _need(modules: list[str], extra: str) -> None:
    missing = [m for m in modules if importlib.util.find_spec(m) is None]
    if missing:
        raise SystemExit(f"this command needs {', '.join(missing)}. Install the '{extra}' extra:\n  "
                         + EXTRA_HINT.format(extra=extra))


def _need_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"{tool} not found. Install ffmpeg (macOS: brew install ffmpeg, Debian/Ubuntu: apt install ffmpeg).")


def _bpm(v: str):
    return v if v == "auto" else float(v)


def cmd_sync(a) -> dict:
    _need_ffmpeg()
    _need(["faster_whisper", "librosa"], "sync")
    from .timing import pipeline
    if a.song.lower().endswith(".json"):
        cfg = a.song
        work = a.out
    else:
        stem = os.path.splitext(os.path.basename(a.song))[0]
        work = a.out or os.path.join("song2mv-work", stem)
        over: dict = {}
        if a.bpm is not None:
            over["bpm"] = _bpm(a.bpm)
        if a.runs or a.model:
            over["whisper"] = {k: v for k, v in (("runs", a.runs), ("model", a.model)) if v}
        cfg = pipeline.config_from_audio(a.song, work, a.lyrics, a.language, a.title, over)
    return pipeline.run(cfg, work, a.start)


def cmd_beats(a) -> dict:
    _need_ffmpeg()
    _need(["librosa"], "beats")
    from .timing import pipeline
    out = a.out or os.path.splitext(os.path.basename(a.audio))[0] + ".grid.json"
    return pipeline.beats(a.audio, out, _bpm(a.bpm), a.downbeat)


def cmd_check(a) -> dict:
    _need_ffmpeg()
    from .check.score import score
    return score(a.video, a.song, a.goals, a.start, a.end, a.src, a.quiet)


def cmd_render(a) -> dict:
    from .render.runner import render
    return render(a.mv, a.out, a.template, a.start, a.end, a.aspect, a.hold, a.still, a.audio, a.name)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="song2mv",
        description="Song in, beat-synced lyric timing and a code-drawn music video out. Built for coding agents.",
        epilog="Docs: https://github.com/yongjip/song2mv  ·  Agents: read AGENTS.md")
    p.add_argument("--version", action="version", version=f"song2mv {__version__}")
    sub = p.add_subparsers(dest="command", metavar="COMMAND")

    s = sub.add_parser("sync", help="lyrics + audio → beat grid, word-timed lyrics, LRC, SRT, mv.json")
    s.add_argument("song", help="an audio file, or a song.json config from an earlier run")
    s.add_argument("--lyrics", help="lyric sheet (text, [Section] lines allowed). Default: the audio's lyrics tag")
    s.add_argument("--language", help="whisper language code, e.g. en, ko, ja (set it — auto-detect often guesses wrong)")
    s.add_argument("--title", help="song title for LRC and video (default: file name)")
    s.add_argument("--out", help="work folder (default: song2mv-work/<file name>)")
    s.add_argument("--bpm", help="force the tempo, or 'auto' (default)")
    s.add_argument("--runs", type=int, help="whisper runs to merge (default 3)")
    s.add_argument("--model", help="whisper model (default small; base is lighter, medium more accurate)")
    s.add_argument("--from", dest="start", choices=["lyrics", "asr", "align", "grid", "build"],
                   help="redo this step and every step after it")
    s.add_argument("--json", action="store_true", help="print one JSON result on stdout")
    s.set_defaults(func=cmd_sync)

    b = sub.add_parser("beats", help="audio → beat grid only (no lyrics, no whisper)")
    b.add_argument("audio")
    b.add_argument("--out", help="output file (default: <file name>.grid.json)")
    b.add_argument("--bpm", default="auto", help="force the tempo, or 'auto' (default)")
    b.add_argument("--downbeat", type=int, choices=[0, 1, 2, 3], help="force which beat index (mod 4) starts a bar")
    b.add_argument("--json", action="store_true")
    b.set_defaults(func=cmd_beats)

    c = sub.add_parser("check", help="[experimental] measure a rendered video per sung line")
    c.add_argument("video")
    c.add_argument("--song", required=True, help="the mv.json the video was rendered from")
    c.add_argument("--from", dest="start", type=float, default=0.0, help="song time of the video's first frame")
    c.add_argument("--to", dest="end", type=float, default=None, help="song time of the video's end")
    c.add_argument("--goals", help="goals file (default: the bundled starting point)")
    c.add_argument("--src", help="glob of scene sources to check font sizes in, e.g. 'video/src/scenes/**/*.tsx'")
    c.add_argument("--quiet", action="store_true", help="print failures only")
    c.add_argument("--json", action="store_true")
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("render", help="[experimental] render mv.json with the Remotion template (needs Node)")
    r.add_argument("mv", help="mv.json from `song2mv sync`")
    r.add_argument("--template", help="your own template folder (created on first use); write scenes in src/scenes")
    r.add_argument("--out", help="output folder (default: renders/ next to mv.json)")
    r.add_argument("--from", dest="start", type=float)
    r.add_argument("--to", dest="end", type=float)
    r.add_argument("--aspect", default="16x9", choices=["16x9", "9x16", "both"])
    r.add_argument("--hold", type=float, help="freeze the first HOLD seconds on the picture at from+hold (hook cuts)")
    r.add_argument("--still", type=float, help="write one PNG at this song time instead of a video")
    r.add_argument("--audio", help="audio file (default: the one in mv.json)")
    r.add_argument("--name", help="output file name prefix")
    r.add_argument("--json", action="store_true")
    r.set_defaults(func=cmd_render)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    a = parser.parse_args(argv)
    if not getattr(a, "func", None):
        parser.print_help()
        return 0
    if a.json:
        with contextlib.redirect_stdout(sys.stderr):
            res = a.func(a)
        print(json.dumps(res, ensure_ascii=False))
    else:
        res = a.func(a)
    if a.command == "check" and not res.get("ok"):
        return 1
    return 0
