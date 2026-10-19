# Install

song2mv is a command-line tool; a global tool install is the natural fit. Install only the parts you use.

```sh
uv tool install 'song2mv[sync]'     # recommended: sync + beats + check
pipx install 'song2mv[sync]'        # equivalent
uv tool install song2mv             # check only (numpy)
uv tool install 'song2mv[beats]'    # beats + check
```

Try it without installing:

```sh
uvx --from 'song2mv[sync]' song2mv sync song.mp3 --language en
```

Inside an existing virtual environment, `python -m pip install 'song2mv[sync]'` works too. On Homebrew or
Debian-managed Pythons a bare `pip install` outside a virtualenv is rejected (PEP 668); use `uv tool` or `pipx`.

## System requirements

| needed by | requirement |
| --- | --- |
| every command | Python 3.10–3.13, **ffmpeg** and **ffprobe** on PATH (`brew install ffmpeg`, `apt install ffmpeg`) |
| `render` | **Node 18+** with npm. The first render installs Remotion and a headless Chrome (~570 MB) |

## Disk use

| part | size | when |
| --- | --- | --- |
| numpy | ~35 MB | always |
| librosa, scipy, numba, llvmlite (`beats`) | ~300 MB | install |
| faster-whisper, ctranslate2, onnxruntime, PyAV (`sync`) | ~130 MB | install |
| whisper model `small` | ~460 MB | first `sync` (Hugging Face cache); `--model base` is ~3× smaller, less accurate |
| Remotion + Chrome (`render`) | ~570 MB | first `render` (`~/.cache/song2mv/` or your `--template` folder) |

Set `SONG2MV_CACHE` to move the render cache.
