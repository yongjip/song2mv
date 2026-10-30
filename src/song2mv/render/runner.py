"""Render an mv.json with the bundled Remotion template (experimental).

The template ships inside the package (render/template). It needs Node 18+ and npm; the first render installs
Remotion and a headless Chrome (about 500 MB) into the shared copy of the template.

- Without --template: the shared copy in the cache (~/.cache/song2mv/template-<version>, or $SONG2MV_CACHE) renders
  the plain lyric video. It is refreshed from the package on every render; do not edit it.
- With --template DIR: DIR becomes your own copy of the template (copied there the first time). Write your scenes
  in DIR/src/scenes and render from it; the copy is yours, upgrades never touch it. Its node_modules is a link to
  the shared copy's install while their package-lock.json files match; a copy whose lock file differs (made by
  another version, packages added) installs its own, and one that already has its own node_modules keeps it.

Remotion is not MIT: free for individuals and companies with up to 3 employees, a company license otherwise
(https://www.remotion.dev/license).
"""
from __future__ import annotations

import contextlib
import hashlib
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

from .. import __version__
from ..contract import load_mv, stamp
from ..errors import Song2mvError

BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")
INSTALLED = ".song2mv-installed"  # written into node_modules once npm finished
NOT_COPIED = shutil.ignore_patterns("node_modules", "out", "__pycache__")
RENDERED = re.compile(r"(Rendered|Encoded) (\d+)/(\d+)")
PROGRESS = re.compile(r"(Bundling \d+%|Getting composition|Stitching|Downloading .*\d+%)")
HEARTBEAT = 30.0  # seconds: a slow render or encode still says where it is
STALL = 180.0  # seconds without a new frame before render.mjs renders a chunk again (SONG2MV_STALL; 0: never)
RESTART = 120.0  # more seconds for that chunk's new Chrome to finish a frame, before the whole render is stopped
STOP_WAIT = 10.0  # seconds for a stopped render to quit before what is left of it is killed
TAB_CLOSED = re.compile(r"Session closed|Target closed")


def cache_root() -> str:
    base = os.environ.get("SONG2MV_CACHE") or os.path.join(
        os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache"), "song2mv")
    return base


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise Song2mvError(f"render needs {tool} (Node 18+)", hint="install Node.js 18 or newer and try again")
    return path


def _lock_hash(target: str) -> str:
    lock = os.path.join(target, "package-lock.json")
    if not os.path.exists(lock):
        lock = os.path.join(target, "package.json")
    return hashlib.sha256(open(lock, "rb").read()).hexdigest()


def _installed(target: str) -> bool:
    """node_modules counts as installed only after npm finished: an interrupted install has no marker and is redone."""
    marker = os.path.join(target, "node_modules", INSTALLED)
    return os.path.exists(marker) and open(marker, encoding="utf-8").read().strip() == _lock_hash(target)


def _install(target: str) -> None:
    if _installed(target):
        return
    npm = _require("npm")
    print(f"[render] installing Remotion into {target} (first run only, ~500 MB) …")
    cmd = [npm, "ci"] if os.path.exists(os.path.join(target, "package-lock.json")) else [npm, "install"]
    r = subprocess.run(cmd + ["--no-audit", "--no-fund"], cwd=target, stdout=sys.stderr)
    if r.returncode != 0:
        raise Song2mvError("npm install failed — see the output above", hint="check your network and Node version, then run again")
    open(os.path.join(target, "node_modules", INSTALLED), "w", encoding="utf-8").write(_lock_hash(target) + "\n")


def _shared_template() -> str:
    """The cache's copy, refreshed from the package and installed: it always matches this song2mv (not for editing)."""
    target = os.path.join(cache_root(), f"template-{__version__}")
    shutil.copytree(BUNDLED, target, dirs_exist_ok=True, ignore=NOT_COPIED)
    _install(target)
    return target


def prepare_template(template: str | None) -> str:
    """Return a template folder that has node_modules installed, copying the bundled template if needed."""
    if not template:
        return _shared_template()
    target = os.path.abspath(template)
    if not os.path.exists(os.path.join(target, "render.mjs")):
        if os.path.exists(target) and os.listdir(target):
            raise Song2mvError(f"{target} exists and is not a song2mv template (no render.mjs)",
                               hint="pick an empty or new folder for --template")
        shutil.copytree(BUNDLED, target, dirs_exist_ok=True, ignore=NOT_COPIED)
        print(f"[render] template copied to {target} — write your scenes in src/scenes/")
    modules = os.path.join(target, "node_modules")
    if os.path.islink(modules) and not _installed(target):  # the shared install is gone or no longer matches
        os.unlink(modules)
    if not os.path.lexists(modules) and _lock_hash(target) == _lock_hash(BUNDLED):
        shared = _shared_template()
        try:
            os.symlink(os.path.join(shared, "node_modules"), modules, target_is_directory=True)
            print(f"[render] {modules} links to the Remotion install in {shared}")
        except OSError:  # a file system without symlinks: the copy installs its own
            pass
    _install(target)
    return target


def _audio_found(mv: dict, mv_json: str, tpl: str, audio: str | None) -> bool:
    """The same places render.mjs looks in."""
    name = mv.get("audio")
    candidates = [audio, name and os.path.join(tpl, "public", name), mv.get("audio_path"),
                  name and os.path.join(os.path.dirname(mv_json), name)]
    return any(c and os.path.isfile(c) for c in candidates)


def _stall_seconds() -> float:
    raw = os.environ.get("SONG2MV_STALL", "")
    try:
        return float(raw) if raw else STALL
    except ValueError:
        raise Song2mvError(f"SONG2MV_STALL is {raw!r}: give it a number of seconds (0 never stops a render)") from None


def _family(pid: int) -> list[int]:
    """pid and everything it started, Chrome too (Remotion gives Chrome a process group of its own)"""
    try:
        rows = subprocess.run(["ps", "-A", "-o", "pid=,ppid="], capture_output=True, text=True).stdout.splitlines()
    except OSError:
        return [pid]
    kids: dict[int, list[int]] = {}
    for row in rows:
        if row.strip():
            child, parent = map(int, row.split())
            kids.setdefault(parent, []).append(child)
    family, todo = [], [pid]
    while todo:
        family.append(todo.pop())
        todo += kids.get(family[-1], [])
    return family


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, PermissionError):  # gone, or the number now belongs to someone else's process
        return False
    return True


def _stop(p: subprocess.Popen) -> None:
    """Ctrl-C to the render and all it started (on which Remotion kills its Chrome and quits), then SIGKILL to
    whatever is still there after STOP_WAIT seconds."""
    if os.name == "nt":
        p.kill()
        p.wait()
        return
    family = _family(p.pid)
    for sig in (signal.SIGINT, signal.SIGKILL):
        for pid in family:
            with contextlib.suppress(ProcessLookupError, PermissionError):
                os.kill(pid, sig)
        deadline = time.monotonic() + STOP_WAIT
        while time.monotonic() < deadline:
            p.poll()  # reaps the render's own process
            if not any(_alive(pid) for pid in family):
                return
            time.sleep(0.1)
    p.wait()


def _asleep(since: float) -> float:
    """Seconds the computer slept since `since`, a time.time() - time.monotonic() read earlier: the monotonic clock
    stops during sleep."""
    return time.time() - time.monotonic() - since


def _pump(stream, lines: queue.Queue) -> None:
    for raw in stream:
        lines.put(raw)
    lines.put(None)


def _run_filtered(args: list[str], cwd: str) -> int:
    """Run the Remotion render with its output on stderr (with --json, stdout carries only the JSON result).
    Without a terminal, Remotion prints a line per frame — thousands per song — so rendering and encoding each become
    a line per 25%, and one at least every HEARTBEAT seconds; a line repeated word for word shows once.
    When Chrome dies mid-render, Remotion can wait for its frames forever: render.mjs renders such a chunk again after
    SONG2MV_STALL seconds, and a render whose frames stop for RESTART seconds more is stopped here with an error (a
    template copied before render.mjs did that, or a chunk that never comes back)."""
    if sys.stderr.isatty():
        return subprocess.run(args, cwd=cwd, stdout=sys.stderr).returncode
    stall = _stall_seconds()
    stall = stall + RESTART if stall > 0 else 0
    p = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    lines: queue.Queue[str | None] = queue.Queue()
    threading.Thread(target=_pump, args=(p.stdout, lines), daemon=True).start()
    shown: dict[str, int] = {}
    counts: dict[str, tuple[int, int]] = {}
    said: set[str] = set()
    repeats = 0
    closed = False
    last = moved = time.monotonic()
    wall = time.time() - last
    while True:
        try:
            raw = lines.get(timeout=min(5.0, stall / 4) if stall > 0 else None)
        except queue.Empty:
            raw = ""
        if raw is None:
            break
        line = raw.rstrip()
        m = RENDERED.match(line)
        if m:
            what, done, total = m.group(1).lower(), int(m.group(2)), max(1, int(m.group(3)))
            if counts.get(what, (-1, 0))[0] != done:
                moved = time.monotonic()
            counts[what] = (done, total)
            quarter = 4 * done // total
            if quarter > shown.get(what, -1) or time.monotonic() - last >= HEARTBEAT:
                shown[what] = max(quarter, shown.get(what, -1))
                last = time.monotonic()
                print(f"  {what} {done}/{total} frames", file=sys.stderr)
            if done >= total:
                shown[what] = -1  # the next aspect starts over
        elif line in said:
            repeats += 1
        elif line and not PROGRESS.match(line):
            said.add(line)
            closed = closed or bool(TAB_CLOSED.search(line))
            print(line, file=sys.stderr)
        due = [f"{what} {done}/{total}" for what, (done, total) in counts.items() if done < total]
        if stall > 0 and due and time.monotonic() - moved > stall:
            _stop(p)
            slept = _asleep(wall)
            raise Song2mvError(
                f"the render stalled at {', '.join(due)} frames: none finished for {stall:g} s"
                + (f"; the computer slept for {slept:.0f} s during it" if slept > 10 else "")
                + ("; Chrome had closed one of its tabs" if closed else ""),
                hint="a computer that sleeps mid-render (a laptop's lid closed on battery) stops Chrome: keep it awake "
                     "and plugged in, then render again (SONG2MV_STALL sets the wait in seconds)")
    if repeats:
        print(f"  ({repeats} repeated line{'s' if repeats > 1 else ''} not shown)", file=sys.stderr)
    return p.wait()


def _cover(still: str, png: str) -> None:
    """A 1080×1080 cover: the frame, whole, over a darkened blur of itself filling the square."""
    graph = ("[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,boxblur=24:3,"
             "eq=brightness=-0.06[bg];[0:v]scale=1080:1080:force_original_aspect_ratio=decrease[fg];"
             "[bg][fg]overlay=(W-w)/2:(H-h)/2")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise Song2mvError("--cover needs ffmpeg", hint="install ffmpeg (it is on PATH for sync and check too)")
    r = subprocess.run([ffmpeg, "-y", "-v", "error", "-i", still, "-filter_complex", graph, "-frames:v", "1", png],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise Song2mvError(f"ffmpeg could not make the cover: {(r.stderr.strip().splitlines() or ['?'])[-1]}")


def render(mv_json: str, out: str | None = None, template: str | None = None, start: float | None = None,
           end: float | None = None, aspect: str = "16x9", hold: float | None = None, still: float | None = None,
           audio: str | None = None, name: str | None = None, draft: bool = False, max_mb: float | None = None,
           cover: float | None = None) -> dict:
    mv_json = os.path.abspath(mv_json)
    mv = load_mv(mv_json)  # before installing anything
    dur = float(mv["duration"])
    t0 = start or 0.0
    if not 0 <= t0 < dur:
        raise Song2mvError(f"--from {t0:g} is outside the song (0–{dur:.1f} s)")
    if end is not None and end <= t0:
        raise Song2mvError(f"--to ({end:g}) must be after --from ({t0:g})")
    if still is not None and cover is not None:
        raise Song2mvError("--still and --cover each write a picture: pass one of them")
    for flag, t in (("--still", still), ("--cover", cover)):
        if t is not None and not t0 <= t <= (end if end is not None else dur):
            raise Song2mvError(f"{flag} {t:g} is outside the rendered stretch ({t0:g}–{end if end is not None else dur:g} s)")
    if max_mb is not None and max_mb <= 0:
        raise Song2mvError("--max-mb must be more than 0")
    if cover is not None:
        still, aspect = cover, "16x9"
    if hold is not None and hold < 0:
        raise Song2mvError("--hold must be zero or more seconds")
    node = _require("node")
    tpl = prepare_template(template)
    warnings = []
    if not _audio_found(mv, mv_json, tpl, audio):
        warnings.append(f"no audio file found for {os.path.basename(mv_json)} ({mv.get('audio')!r}): the video is "
                        "silent — pass --audio FILE")
        print(f"  ! {warnings[-1]}", file=sys.stderr)
    draft = draft and still is None
    if draft and "draft" not in open(os.path.join(tpl, "render.mjs"), encoding="utf-8").read():
        warnings.append(f"{tpl} was copied before --draft existed: this render is at the full frame rate "
                        "(a new --template folder renders drafts)")
        print(f"  ! {warnings[-1]}", file=sys.stderr)
    out = os.path.abspath(out or os.path.join(os.path.dirname(mv_json), "renders"))
    os.makedirs(out, exist_ok=True)
    fd, manifest = tempfile.mkstemp(prefix="song2mv-", suffix=".txt")
    os.close(fd)
    args = [node, "render.mjs", mv_json, "--aspect", aspect, "--out", out, "--manifest", manifest]
    for flag, val in (("--from", start), ("--to", end), ("--hold", hold), ("--still", still),
                      ("--audio", os.path.abspath(audio) if audio else None), ("--name", name),
                      ("--max-mb", max_mb if still is None and not draft else None)):
        if val is not None:
            args += [flag, str(val)]
    if draft:
        args.append("--draft")
    before = {f: _stat(os.path.join(out, f)) for f in os.listdir(out)}
    t = time.time()
    try:
        code = _run_filtered(args, tpl)
        written = [line.strip() for line in open(manifest, encoding="utf-8") if line.strip()]
    finally:
        os.unlink(manifest)
    if code != 0:
        raise Song2mvError(f"the Remotion render failed (exit {code}) — see the output above")
    if not written:  # a template copied before --manifest existed: whatever is new or rewritten in the out folder
        written = [os.path.join(out, f) for f in sorted(os.listdir(out)) if before.get(f) != _stat(os.path.join(out, f))]
    if cover is not None:
        made = []
        for f in written:
            png = os.path.join(os.path.dirname(f), re.sub(r"-(16x9|9x16)-", "-cover-", os.path.basename(f), count=1))
            _cover(f, png)
            os.unlink(f)
            made.append(png)
        written = made
    for f in written:
        print(f"  {f}")
    return stamp({"command": "render", "template": tpl, "outputs": {os.path.basename(f): f for f in written},
                  "seconds": round(time.time() - t, 1), "warnings": warnings})


def _stat(path: str) -> tuple[int, int]:
    st = os.stat(path)
    return st.st_size, st.st_mtime_ns
