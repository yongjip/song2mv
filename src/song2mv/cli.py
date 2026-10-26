"""song2mv command line: sync, beats, click, check, sheet, render.

Every command prints progress for people. With --json, progress goes to stderr and stdout carries exactly one
JSON object (with schema_version) for scripts and coding agents — also when the command fails.

Exit codes: 0 success; 1 `check` measured a failing goal; 2 an error (bad input, missing tool, usage).
"""
from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import math
import os
import shutil
import sys
import traceback
from pathlib import Path

from . import __version__
from .contract import stamp
from .errors import Song2mvError

INSTALL_DOCS = "https://github.com/yongjip/song2mv#install"
GUIDE_URL = "https://github.com/yongjip/song2mv/blob/main/.claude/skills/song2mv/SKILL.md"


def guide_path() -> str:
    """The agent guide: in the package when installed from a wheel, else in the source checkout."""
    pkg = Path(__file__).resolve().parent
    for guide in (pkg / "guide" / "SKILL.md", pkg.parents[1] / ".claude" / "skills" / "song2mv" / "SKILL.md"):
        if guide.is_file():
            return str(guide)
    return GUIDE_URL


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


def _seconds(v: str) -> float:
    """argparse type for --every: a positive number of seconds."""
    try:
        s = float(v)
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not a number") from None
    if not 0 < s < math.inf:
        raise argparse.ArgumentTypeError(f"{v} is not a positive number of seconds")
    return s


def _times(v: str) -> list[float]:
    """argparse type for --times: song times separated by commas."""
    try:
        times = [float(t) for t in v.split(",") if t.strip()]
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not a list of song times such as 12,33.1") from None
    if not times or not all(math.isfinite(t) for t in times):
        raise argparse.ArgumentTypeError(f"'{v}' is not a list of song times such as 12,33.1")
    return times


def _ids(v: str) -> list[str]:
    """argparse type for --lines: line ids separated by commas."""
    ids = [i.strip() for i in v.split(",") if i.strip()]
    if not ids:
        raise argparse.ArgumentTypeError(f"'{v}' is not a list of line ids such as v1-03,ch1-02")
    return ids


def _cols(v: str) -> int:
    """argparse type for --cols: 1 to 12 frames per row."""
    try:
        n = int(v)
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not a whole number") from None
    if not 1 <= n <= 12:
        raise argparse.ArgumentTypeError(f"{n} frames per row is outside 1–12")
    return n


def _crop(v: str) -> tuple[int, int, int, int]:
    """argparse type for --crop: x,y,w,h in the video's pixels."""
    try:
        x, y, w, h = (int(p) for p in v.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{v}' is not x,y,w,h in whole pixels, such as 700,380,312,400") from None
    if min(x, y) < 0 or min(w, h) < 1:
        raise argparse.ArgumentTypeError(f"'{v}': x and y must be 0 or more, w and h 1 or more")
    return x, y, w, h


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
    return score(a.video, a.song, a.goals, a.start, a.end, a.src, a.quiet, report=not a.json)


def cmd_sheet(a) -> dict:
    _need_ffmpeg()
    _existing_file(a.video, "video")
    _existing_file(a.song, "mv.json")
    _existing_file(a.cuts, "check result")
    from .check.sheet import sheet
    return sheet(a.video, a.song, a.every, a.times, a.cuts, a.start, a.cols, a.crop, a.out, a.lines)


def cmd_render(a) -> dict:
    _existing_file(a.mv, "mv.json")
    _existing_file(a.audio, "audio file")
    from .render.runner import render
    return render(a.mv, a.out, a.template, a.start, a.end, a.aspect, a.hold, a.still, a.audio, a.name, a.draft,
                  a.max_mb, a.cover)


def build_parser() -> argparse.ArgumentParser:
    guide = f"Coding agent? Read this guide first, before running any command:\n  {guide_path()}"
    p = argparse.ArgumentParser(
        prog="song2mv",
        description="Song in, beat-synced lyric timing and a code-drawn music video out.\nBuilt for coding agents.",
        epilog=f"{guide}\nDocs: https://github.com/yongjip/song2mv",
        formatter_class=argparse.RawDescriptionHelpFormatter)  # keeps the guide's path on one line, unbroken
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
    c.add_argument("--src", help='glob of scene sources to check font sizes in, e.g. "video/src/scenes/**/*.tsx"')
    c.add_argument("--quiet", action="store_true", help="print failures only")
    c.add_argument("--json", action="store_true", help="print only the JSON result on stdout, no table")
    c.set_defaults(func=cmd_check)

    h = sub.add_parser("sheet", help="a contact sheet of a rendered video: its frames at song times, labelled")
    h.add_argument("video")
    h.add_argument("--song", help="the mv.json the video was rendered from: each label then names the line sung (or the section)")
    pick = h.add_mutually_exclusive_group(required=True)
    pick.add_argument("--every", type=_seconds, metavar="S", help="a frame from the middle of every S seconds of the video")
    pick.add_argument("--times", type=_times, metavar="T,T,…", help="frames at these song times, e.g. 12,33.1,47.5")
    pick.add_argument("--lines", type=_ids, metavar="ID,ID,…", help="a frame in the last word of each of these lines "
                      "(their middle without word times), e.g. v1-03,ch1-02 (needs --song)")
    pick.add_argument("--cuts", metavar="CHECK_JSON", help="a frame 0.3 s into each shot: the start and the cuts of a "
                      "saved `song2mv check --json` result, whose from and song are then the defaults")
    h.add_argument("--from", dest="start", type=float, help="song time of the video's first frame (default: the start "
                   "in a stretch's name as render writes it, NAME-ASPECT-FROM-TO.mp4, else 0)")
    h.add_argument("--cols", type=_cols, help="frames per row (default 4, 6 for a 9:16 video)")
    h.add_argument("--crop", type=_crop, metavar="X,Y,W,H", help="show only this region of each frame, in the video's "
                   "pixels, scaled to the frame's width on the sheet (--cols sets the zoom; each label shows it)")
    h.add_argument("--out", help="PNG file (default: VIDEO-sheet.png next to the video); frames that do not fit on one "
                   "page go on OUT-2.png, OUT-3.png …")
    h.add_argument("--json", action="store_true")
    h.set_defaults(func=cmd_sheet)

    r = sub.add_parser("render", help="[experimental] render mv.json with the Remotion template (needs Node)")
    r.add_argument("mv", help="mv.json from `song2mv sync`")
    r.add_argument("--template", help="your own template folder (created on first use); write scenes in src/scenes")
    r.add_argument("--out", help="output folder (default: renders/ next to mv.json)")
    r.add_argument("--from", dest="start", type=float)
    r.add_argument("--to", dest="end", type=float)
    r.add_argument("--aspect", default="16x9", choices=["16x9", "9x16", "both"])
    r.add_argument("--hold", type=float, help="freeze the first HOLD seconds on the picture at from+hold (hook cuts)")
    r.add_argument("--still", type=float, help="write a PNG (one per aspect) at this song time instead of a video")
    r.add_argument("--draft", action="store_true", help="a video at 10 fps, the rate check measures at, and half size, for "
                   "the render-check loop (NAME-…-draft.mp4); render the final video without it")
    r.add_argument("--max-mb", type=float, help="a finished video over this many MB is encoded again, in two passes, "
                   "to fit (an upload limit such as 200); the audio is kept")
    r.add_argument("--cover", type=float, help="write a 1080×1080 cover PNG instead of a video: the 16:9 frame at this "
                   "song time over a blurred fill of itself (NAME-cover-Ss.png)")
    r.add_argument("--audio", help="audio file (default: the one in mv.json)")
    r.add_argument("--name", help="output file name prefix")
    r.add_argument("--json", action="store_true")
    r.set_defaults(func=cmd_render)

    for command in sub.choices.values():
        command.epilog = guide
        command.formatter_class = argparse.RawDescriptionHelpFormatter
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
