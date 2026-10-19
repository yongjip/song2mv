"""Render an mv.json with the bundled Remotion template (experimental).

The template ships inside the package (render/template). It needs Node 18+ and npm; the first render installs
Remotion and a headless Chrome (about 570 MB) into the template folder.

- Without --template: a shared copy in the cache (~/.cache/song2mv/template-<version>) renders the plain lyric
  video. Do not edit it.
- With --template DIR: DIR becomes your own copy of the template (copied there the first time). Write your scenes
  in DIR/src/scenes and render from it; the copy is yours, upgrades never touch it.

Remotion is not MIT: free for individuals and companies with up to 3 employees, a company license otherwise
(https://www.remotion.dev/license).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time

from .. import __version__
from ..contract import stamp

BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")


def cache_root() -> str:
    base = os.environ.get("SONG2MV_CACHE") or os.path.join(
        os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache"), "song2mv")
    return base


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise SystemExit(f"song2mv render needs {tool} (Node 18+). Install Node.js and try again.")
    return path


def prepare_template(template: str | None) -> str:
    """Return a template folder that has node_modules installed, copying the bundled template if needed."""
    if template:
        target = os.path.abspath(template)
        if not os.path.exists(os.path.join(target, "render.mjs")):
            if os.path.exists(target) and os.listdir(target):
                raise SystemExit(f"{target} exists and is not a song2mv template (no render.mjs). Pick an empty or new folder.")
            shutil.copytree(BUNDLED, target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("node_modules", "out", "__pycache__"))
            print(f"[render] template copied to {target} — write your scenes in src/scenes/")
    else:
        target = os.path.join(cache_root(), f"template-{__version__}")
        if not os.path.exists(os.path.join(target, "render.mjs")):
            shutil.copytree(BUNDLED, target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("node_modules", "out", "__pycache__"))
    if not os.path.isdir(os.path.join(target, "node_modules")):
        npm = _require("npm")
        print(f"[render] installing Remotion into {target} (first run only, ~570 MB) …")
        cmd = [npm, "ci"] if os.path.exists(os.path.join(target, "package-lock.json")) else [npm, "install"]
        r = subprocess.run(cmd + ["--no-audit", "--no-fund"], cwd=target, stdout=sys.stderr)
        if r.returncode != 0:
            raise SystemExit("npm install failed — see the output above.")
    return target


def render(mv_json: str, out: str | None = None, template: str | None = None, start: float | None = None,
           end: float | None = None, aspect: str = "16x9", hold: float | None = None, still: float | None = None,
           audio: str | None = None, name: str | None = None) -> dict:
    node = _require("node")
    mv_json = os.path.abspath(mv_json)
    tpl = prepare_template(template)
    out = os.path.abspath(out or os.path.join(os.path.dirname(mv_json), "renders"))
    os.makedirs(out, exist_ok=True)
    args = [node, "render.mjs", mv_json, "--aspect", aspect, "--out", out]
    for flag, val in (("--from", start), ("--to", end), ("--hold", hold), ("--still", still),
                      ("--audio", os.path.abspath(audio) if audio else None), ("--name", name)):
        if val is not None:
            args += [flag, str(val)]
    before = set(os.listdir(out))
    t = time.time()
    # child output goes to stderr: with --json, stdout must carry only the one JSON result
    r = subprocess.run(args, cwd=tpl, stdout=sys.stderr)
    if r.returncode != 0:
        raise SystemExit(r.returncode)
    made = sorted(f for f in os.listdir(out) if f not in before or os.path.getmtime(os.path.join(out, f)) >= t - 1)
    for f in made:
        print(f"  {os.path.join(out, f)}")
    return stamp({"command": "render", "template": tpl, "outputs": [os.path.join(out, f) for f in made],
                  "seconds": round(time.time() - t, 1)})
