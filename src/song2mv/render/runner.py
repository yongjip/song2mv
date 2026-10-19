"""Render an mv.json with the bundled Remotion template (experimental).

The template ships inside the package (render/template). It needs Node 18+ and npm; the first render installs
Remotion and a headless Chrome (about 570 MB) into the template folder.

- Without --template: a shared copy in the cache (~/.cache/song2mv/template-<version>, or $SONG2MV_CACHE) renders
  the plain lyric video. It is refreshed from the package on every render; do not edit it.
- With --template DIR: DIR becomes your own copy of the template (copied there the first time). Write your scenes
  in DIR/src/scenes and render from it; the copy is yours, upgrades never touch it.

Remotion is not MIT: free for individuals and companies with up to 3 employees, a company license otherwise
(https://www.remotion.dev/license).
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

from .. import __version__
from ..contract import load_mv, stamp
from ..errors import Song2mvError

BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")
INSTALLED = ".song2mv-installed"  # written into node_modules once npm finished
RENDERED = re.compile(r"Rendered (\d+)/(\d+)")
PROGRESS = re.compile(r"(Bundling \d+%|Getting composition|Encoded \d+/\d+|Stitching|Downloading .*\d+%)")


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


def prepare_template(template: str | None) -> str:
    """Return a template folder that has node_modules installed, copying the bundled template if needed."""
    ignore = shutil.ignore_patterns("node_modules", "out", "__pycache__")
    if template:
        target = os.path.abspath(template)
        if not os.path.exists(os.path.join(target, "render.mjs")):
            if os.path.exists(target) and os.listdir(target):
                raise Song2mvError(f"{target} exists and is not a song2mv template (no render.mjs)",
                                   hint="pick an empty or new folder for --template")
            shutil.copytree(BUNDLED, target, dirs_exist_ok=True, ignore=ignore)
            print(f"[render] template copied to {target} — write your scenes in src/scenes/")
    else:  # the shared copy always matches the installed song2mv (it is not for editing)
        target = os.path.join(cache_root(), f"template-{__version__}")
        shutil.copytree(BUNDLED, target, dirs_exist_ok=True, ignore=ignore)
    # node_modules counts as installed only after npm finished: an interrupted install has no marker and is redone
    marker = os.path.join(target, "node_modules", INSTALLED)
    want = _lock_hash(target)
    if not os.path.exists(marker) or open(marker, encoding="utf-8").read().strip() != want:
        npm = _require("npm")
        print(f"[render] installing Remotion into {target} (first run only, ~570 MB) …")
        cmd = [npm, "ci"] if os.path.exists(os.path.join(target, "package-lock.json")) else [npm, "install"]
        r = subprocess.run(cmd + ["--no-audit", "--no-fund"], cwd=target, stdout=sys.stderr)
        if r.returncode != 0:
            raise Song2mvError("npm install failed — see the output above", hint="check your network and Node version, then run again")
        open(marker, "w", encoding="utf-8").write(want + "\n")
    return target


def _audio_found(mv: dict, mv_json: str, tpl: str, audio: str | None) -> bool:
    """The same places render.mjs looks in."""
    name = mv.get("audio")
    candidates = [audio, name and os.path.join(tpl, "public", name), mv.get("audio_path"),
                  name and os.path.join(os.path.dirname(mv_json), name)]
    return any(c and os.path.isfile(c) for c in candidates)


def _run_filtered(args: list[str], cwd: str) -> int:
    """Run the Remotion render with its output on stderr (with --json, stdout carries only the JSON result).
    Without a terminal, Remotion prints a line per frame — thousands per song — so those become a line per 25%."""
    if sys.stderr.isatty():
        return subprocess.run(args, cwd=cwd, stdout=sys.stderr).returncode
    p = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    assert p.stdout
    shown = -1
    for raw in p.stdout:
        line = raw.rstrip()
        m = RENDERED.match(line)
        if m:
            done, total = int(m.group(1)), max(1, int(m.group(2)))
            quarter = 4 * done // total
            if quarter > shown:
                shown = quarter
                print(f"  rendered {done}/{total} frames", file=sys.stderr)
            if done >= total:
                shown = -1  # the next aspect starts over
            continue
        if line and not PROGRESS.match(line):
            print(line, file=sys.stderr)
    return p.wait()


def render(mv_json: str, out: str | None = None, template: str | None = None, start: float | None = None,
           end: float | None = None, aspect: str = "16x9", hold: float | None = None, still: float | None = None,
           audio: str | None = None, name: str | None = None) -> dict:
    mv_json = os.path.abspath(mv_json)
    mv = load_mv(mv_json)  # before installing anything
    dur = float(mv["duration"])
    t0 = start or 0.0
    if not 0 <= t0 < dur:
        raise Song2mvError(f"--from {t0:g} is outside the song (0–{dur:.1f} s)")
    if end is not None and end <= t0:
        raise Song2mvError(f"--to ({end:g}) must be after --from ({t0:g})")
    if still is not None and not t0 <= still <= (end if end is not None else dur):
        raise Song2mvError(f"--still {still:g} is outside the rendered stretch ({t0:g}–{end if end is not None else dur:g} s)")
    if hold is not None and hold < 0:
        raise Song2mvError("--hold must be zero or more seconds")
    node = _require("node")
    tpl = prepare_template(template)
    warnings = []
    if not _audio_found(mv, mv_json, tpl, audio):
        warnings.append(f"no audio file found for {os.path.basename(mv_json)} ({mv.get('audio')!r}): the video is "
                        "silent — pass --audio FILE")
        print(f"  ! {warnings[-1]}", file=sys.stderr)
    out = os.path.abspath(out or os.path.join(os.path.dirname(mv_json), "renders"))
    os.makedirs(out, exist_ok=True)
    fd, manifest = tempfile.mkstemp(prefix="song2mv-", suffix=".txt")
    os.close(fd)
    args = [node, "render.mjs", mv_json, "--aspect", aspect, "--out", out, "--manifest", manifest]
    for flag, val in (("--from", start), ("--to", end), ("--hold", hold), ("--still", still),
                      ("--audio", os.path.abspath(audio) if audio else None), ("--name", name)):
        if val is not None:
            args += [flag, str(val)]
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
    for f in written:
        print(f"  {f}")
    return stamp({"command": "render", "template": tpl, "outputs": {os.path.basename(f): f for f in written},
                  "seconds": round(time.time() - t, 1), "warnings": warnings})


def _stat(path: str) -> tuple[int, int]:
    st = os.stat(path)
    return st.st_size, st.st_mtime_ns
