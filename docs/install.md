# Install

song2mv is a command-line tool; a global tool install is the natural fit. Install only the parts you use.

Install it from PyPI with [uv](https://docs.astral.sh/uv/):

```sh
uv tool install --python 3.13 "song2mv[sync]"     # sync + beats + check
uv tool install --python 3.13 "song2mv[beats]"    # beats + click + check
uv tool install song2mv                           # check, sheet (and render)
```

Try it without installing:

```sh
uvx --python 3.13 --from "song2mv[sync]" song2mv sync song.mp3 --language en
```

Inside an existing virtual environment, `python -m pip install "song2mv[sync]"` works too. The latest `main`, before
its next release, installs from GitHub: `uv tool install --python 3.13 "song2mv[sync] @ git+https://github.com/yongjip/song2mv"`.
On Homebrew or Debian-managed Pythons a bare `pip install` outside a virtualenv is rejected (PEP 668); use
`uv tool` there. To add an extra later, run `uv tool install --force` with the extra.

After the first PyPI release these become `uv tool install "song2mv[sync]"`, `pipx install "song2mv[sync]"` and
`uvx --from "song2mv[sync]" song2mv …`.

## System requirements

| needed by | requirement |
| --- | --- |
| `sync`, `beats`, `click`, `check`, `sheet` | **ffmpeg** and **ffprobe** on PATH (`brew install ffmpeg`, `apt install ffmpeg`) |
| `render` | **Node 18+** with npm. The first render installs Remotion (~300 npm packages) and downloads a headless Chrome (~700 MB in all) |
| Python | 3.10–3.14 (tested in CI). `sync` needs faster-whisper, whose ctranslate2 has no Python 3.15 wheels yet — use `--python 3.13`. `check`, `beats` and `render` also run on 3.15 |

## Disk use

| part | size | when |
| --- | --- | --- |
| numpy | ~35 MB | always |
| librosa, scipy, numba, llvmlite (`beats`) | ~300 MB | install |
| faster-whisper, ctranslate2, onnxruntime, PyAV (`sync`) | ~130 MB | install |
| whisper model `small` | ~460 MB | first `sync` (Hugging Face cache); `--model base` is ~3× smaller, less accurate |
| Remotion + Chrome (`render`) | ~700 MB | first `render`, in `~/.cache/song2mv/`; a `--template` folder links to it (it installs its own only when its `package-lock.json` differs) |

Set `SONG2MV_CACHE` to move the render cache. On a Mac, `render` has Chrome draw on the GPU (Remotion's
`--gl=angle`); `SONG2MV_GL=off` draws in software, as on Linux and Windows, and another value is passed to `--gl`.
`render` renders a video in chunks of `SONG2MV_CHUNK` frames (900; 0 renders it in one piece), each with a Chrome
of its own, and joins them without encoding them again. A chunk is rendered again after the computer slept (sleep
kills Chrome's tabs mid-render, and Remotion can then wait for them forever), after Chrome crashed, or when no frame
has come for `SONG2MV_STALL` seconds (180; 0 never). On a Mac, `render` keeps the computer awake while it runs, and
awake with the lid closed while it is on power; on battery, closing the lid still puts it to sleep.
On a Mac, `render` uses Google's build of the Chrome version Remotion pins (`node_modules/.song2mv-chrome`) instead of
Remotion's own, which keeps V8's debug checks (its Linux builds turn them off): one of them stopped long renders of
some scenes with "Page crashed!". Final videos take its JPEG frames at quality 100 (at 80 they came out 36 % larger).

## Network access

`sync` downloads the whisper model from Hugging Face on first use. The first `render` runs `npm ci` (npm registry) and
downloads a headless Chrome from Google's Chrome for Testing storage (on Linux, usually Remotion's own build from
remotion.media). Nothing else contacts the network.
