"""song2mv command line: sync, beats, click, check, render.

Every command prints progress for people. With --json, progress goes to stderr and stdout carries exactly one
JSON object (with schema_version) for scripts and coding agents — also when the command fails.

Exit codes: 0 success; 1 `check` measured a failing goal; 2 an error (bad input, missing tool, usage).
"""
from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import os
import shutil
import sys
import traceback

from . import __version__
from .contract import stamp
from .errors import Song2mvError

INSTALL_DOCS = "https://github.com/yongjip/song2mv#install"


def _need(modules: list[str], extra: str) -> None:
    missing = [m for m in modules if importlib.util.find_spec(m) is None]
    if not missing:
        return
    hint = f"reinstall song2mv with the '{extra}' extra — see {INSTALL_DOCS}"
    if extra == "sync" and sys.version_info >= (3, 15):
        hint += (f". faster-whisper has no Python {sys.version_info.major}.{sys.version_info.minor} wheels yet: "
                 "install with --python 3.13")
    raise Song2mvError(f"this command needs {', '.join(missing)}", hint=hint)


def _need_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise Song2mvError(f"{tool} not found", hint="install ffmpeg (macOS: brew install ffmpeg, Debian/Ubuntu: apt install ffmpeg)")


def _bpm(v: str):
    """argparse type for --bpm: 'auto' or a positive number."""
    if v == "auto":
        return v
    try:
        bpm = float(v)
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not a number or 'auto'") from None
    if not 20 <= bpm <= 400:
        raise argparse.ArgumentTypeError(f"{v} BPM is outside 20–400")
    return bpm


def _runs(v: str) -> int:
    """argparse type for --runs: 1 to 20 whisper runs."""
    try:
        n = int(v)
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not a whole number") from None
    if not 1 <= n <= 20:
        raise argparse.ArgumentTypeError(f"{n} runs is outside 1–20")
    return n


def _check_language(code: str | None) -> None:
    if not code:
        return
    try:
        from faster_whisper.tokenizer import _LANGUAGE_CODES as codes
    except ImportError:
        return
    if code not in codes:
        raise Song2mvError(f"unknown language code '{code}'", hint="use a whisper language code such as en, ko, ja, es, fr, de, zh")


def _existing_file(path: str | None, what: str) -> None:
    if path and not os.path.isfile(path):
        raise Song2mvError(f"{what} not found: {path}")


def cmd_sync(a) -> dict:
    _need_ffmpeg()
    _need(["faster_whisper", "librosa"], "sync")
    _check_language(a.language)
    _existing_file(a.lyrics, "lyrics file")
    from .timing import pipeline
    song = a.song
    if os.path.isdir(song):
        if not os.path.isfile(os.path.join(song, "song.json")):
            raise Song2mvError(f"{song} is a folder without song.json", hint="pass an audio file, or the song.json of an earlier run")
        song = os.path.join(song, "song.json")
    over: dict = {}
    if a.bpm is not None:
        over["bpm"] = a.bpm
    if a.runs or a.model:
        over["whisper"] = {k: v for k, v in (("runs", a.runs), ("model", a.model)) if v}
    if song.lower().endswith(".json"):
        _existing_file(song, "song config")
        pipeline.update_config(song, a.lyrics, a.language, a.title, over)  # flags given on a rerun are saved
        cfg = song
        work = a.out
    else:
        _existing_file(song, "audio file")
        stem = os.path.splitext(os.path.basename(song))[0]
        work = a.out or os.path.join("song2mv-work", stem)
        cfg = pipeline.config_from_audio(song, work, a.lyrics, a.language, a.title, over)
    return pipeline.run(cfg, work, a.start)


def cmd_beats(a) -> dict:
    _need_ffmpeg()
    _need(["librosa"], "beats")
    _existing_file(a.audio, "audio file")
    from .timing import pipeline
    out = a.out or os.path.splitext(os.path.basename(a.audio))[0] + ".grid.json"
    return pipeline.beats(a.audio, out, a.bpm, a.downbeat)


def cmd_click(a) -> dict:
    _need_ffmpeg()
    _need(["librosa"], "beats")
    work = os.path.dirname(a.work) if a.work.lower().endswith(".json") else a.work
    from .timing.click_check import make_click
    return make_click(work, a.start, a.end, a.words, a.out)


def cmd_check(a) -> dict:
    _need_ffmpeg()
    _existing_file(a.video, "video")
    _existing_file(a.song, "mv.json")
    _existing_file(a.goals, "goals file")
    from .check.score import score
    return score(a.video, a.song, a.goals, a.start, a.end, a.src, a.quiet)


def cmd_render(a) -> dict:
    _existing_file(a.mv, "mv.json")
    _existing_file(a.audio, "audio file")
    from .render.runner import render
    return render(a.mv, a.out, a.template, a.start, a.end, a.aspect, a.hold, a.still, a.audio, a.name)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="song2mv",
        description="Song in, beat-synced lyric timing and a code-drawn music video out. Built for coding agents.",
        epilog="Docs: https://github.com/yongjip/song2mv  ·  Agent guide: https://github.com/yongjip/song2mv/blob/main/AGENTS.md")
    p.add_argument("--version", action="version", version=f"song2mv {__version__}")
    sub = p.add_subparsers(dest="command", metavar="COMMAND")

    s = sub.add_parser("sync", help="lyrics + audio → beat grid, word-timed lyrics, LRC, SRT, mv.json")
    s.add_argument("song", help="an audio file, or the song.json (or work folder) of an earlier run; "
                   "options given with a song.json are saved to it")
    s.add_argument("--lyrics", help="lyric sheet (text, [Section] lines allowed). Default: the audio's lyrics tag")
    s.add_argument("--language", help="whisper language code, e.g. en, ko, ja (set it — auto-detect often guesses wrong)")
    s.add_argument("--title", help="song title for LRC and video (default: file name)")
    s.add_argument("--out", help="work folder (default: ./song2mv-work/<file name>)")
    s.add_argument("--bpm", type=_bpm, help="force the tempo, or 'auto' (default)")
    s.add_argument("--runs", type=_runs, help="whisper runs to merge (default 3)")
    s.add_argument("--model", help="whisper model (default small; base is lighter, medium more accurate)")
    s.add_argument("--from", dest="start", choices=["lyrics", "asr", "align", "grid", "build"],
                   help="redo this step and every step after it")
    s.add_argument("--json", action="store_true", help="print one JSON result on stdout")
    s.set_defaults(func=cmd_sync)

    b = sub.add_parser("beats", help="audio → beat grid only (no lyrics, no whisper)")
    b.add_argument("audio")
    b.add_argument("--out", help="output file (default: ./<file name>.grid.json)")
    b.add_argument("--bpm", type=_bpm, default="auto", help="force the tempo, or 'auto' (default)")
    b.add_argument("--downbeat", type=int, choices=[0, 1, 2, 3], help="force which beat index (mod 4) starts a bar")
    b.add_argument("--json", action="store_true")
    b.set_defaults(func=cmd_beats)

    k = sub.add_parser("click", help="mix clicks (and word ticks) over a stretch of the song, to check the timing by ear")
    k.add_argument("work", help="the work folder of `song2mv sync` (or its song.json)")
    k.add_argument("--from", dest="start", type=float, default=0.0, help="song time to start at (seconds)")
    k.add_argument("--to", dest="end", type=float, default=None, help="song time to stop at (default: the end)")
    k.add_argument("--words", action="store_true", help="also tick on every lyric word")
    k.add_argument("--out", help="wav file (default: WORK/click-<from>-<to>.wav)")
    k.add_argument("--json", action="store_true")
    k.set_defaults(func=cmd_click)

    c = sub.add_parser("check", help="[experimental] measure a rendered video per sung line")
    c.add_argument("video")
    c.add_argument("--song", required=True, help="the mv.json the video was rendered from")
    c.add_argument("--from", dest="start", type=float, default=0.0, help="song time of the video's first frame")
    c.add_argument("--to", dest="end", type=float, default=None, help="song time of the video's end (default: from + video length)")
    c.add_argument("--goals", help="goals file; it only needs the values it changes (default: the bundled starting point)")
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
    r.add_argument("--still", type=float, help="write a PNG (one per aspect) at this song time instead of a video")
    r.add_argument("--audio", help="audio file (default: the one in mv.json)")
    r.add_argument("--name", help="output file name prefix")
    r.add_argument("--json", action="store_true")
    r.set_defaults(func=cmd_render)
    return p


def _error(a, message: str, hint: str | None, kind: str) -> int:
    print(f"song2mv {a.command}: error: {message}", file=sys.stderr)
    if hint:
        print(f"  hint: {hint}", file=sys.stderr)
    if a.json:
        err = {"message": message, "kind": kind}
        if hint:
            err["hint"] = hint
        print(json.dumps(stamp({"command": a.command, "ok": False, "error": err}), ensure_ascii=False))
    return 2


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    a = parser.parse_args(argv)  # usage errors exit 2 here
    if not getattr(a, "func", None):
        parser.print_help()
        return 0
    try:
        if a.json:
            with contextlib.redirect_stdout(sys.stderr):
                res = a.func(a)
        else:
            res = a.func(a)
    except Song2mvError as e:
        return _error(a, e.message, e.hint, "input")
    except KeyboardInterrupt:
        return _error(a, "interrupted", None, "interrupted")
    except SystemExit as e:  # a library or helper that exits with a message
        if isinstance(e.code, str):
            return _error(a, e.code, None, "input")
        raise
    except Exception as e:  # a bug: say so, and keep stdout parseable
        if os.environ.get("SONG2MV_DEBUG"):
            traceback.print_exc()
        return _error(a, f"{type(e).__name__}: {e}",
                      "this looks like a bug — rerun with SONG2MV_DEBUG=1 for the traceback and report it at "
                      "https://github.com/yongjip/song2mv/issues", "bug")
    res.setdefault("ok", True)
    if a.json:
        print(json.dumps(res, ensure_ascii=False))
    if a.command == "check" and not res.get("ok"):
        return 1
    return 0
