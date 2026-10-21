# Install

song2mv is a command-line tool; a global tool install is the natural fit. Install only the parts you use.

song2mv is **not on PyPI yet**. Until it is, install from GitHub with [uv](https://docs.astral.sh/uv/):

```sh
uv tool install --python 3.13 'song2mv[sync] @ git+https://github.com/yongjip/song2mv'    # sync + beats + check
uv tool install --python 3.13 'song2mv[beats] @ git+https://github.com/yongjip/song2mv'   # beats + click + check
uv tool install 'song2mv @ git+https://github.com/yongjip/song2mv'                        # check (and render)
```

Try it without installing:

```sh
uvx --python 3.13 --from 'song2mv[sync] @ git+https://github.com/yongjip/song2mv' song2mv sync song.mp3 --language en
```

Inside an existing virtual environment, `python -m pip install 'song2mv[sync] @ git+https://github.com/yongjip/song2mv'`
works too. On Homebrew or Debian-managed Pythons a bare `pip install` outside a virtualenv is rejected (PEP 668); use
`uv tool` there. To add an extra later, run `uv tool install --force` with the extra.

After the first PyPI release these become `uv tool install 'song2mv[sync]'`, `pipx install 'song2mv[sync]'` and
`uvx --from 'song2mv[sync]' song2mv …`.

## System requirements

| needed by | requirement |
| --- | --- |
| `sync`, `beats`, `click`, `check` | **ffmpeg** and **ffprobe** on PATH (`brew install ffmpeg`, `apt install ffmpeg`) |
| `render` | **Node 18+** with npm. The first render installs Remotion (~300 npm packages) and downloads a headless Chrome (~570 MB in all) |
| Python | 3.10–3.14 (tested in CI). `sync` needs faster-whisper, whose ctranslate2 has no Python 3.15 wheels yet — use `--python 3.13`. `check`, `beats` and `render` also run on 3.15 |

## Disk use

| part | size | when |
| --- | --- | --- |
| numpy | ~35 MB | always |
| librosa, scipy, numba, llvmlite (`beats`) | ~300 MB | install |
| faster-whisper, ctranslate2, onnxruntime, PyAV (`sync`) | ~130 MB | install |
| whisper model `small` | ~460 MB | first `sync` (Hugging Face cache); `--model base` is ~3× smaller, less accurate |
| Remotion + Chrome (`render`) | ~570 MB | first `render`, in `~/.cache/song2mv/`; a `--template` folder links to it (it installs its own only when its `package-lock.json` differs) |

Set `SONG2MV_CACHE` to move the render cache.

## Network access

`sync` downloads the whisper model from Hugging Face on first use. The first `render` runs `npm ci` (npm registry) and
Remotion downloads a headless Chrome from Google's Chrome for Testing storage. Nothing else contacts the network.
