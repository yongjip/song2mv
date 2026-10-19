# Contributing

Thanks for helping. song2mv is alpha and maintained on a best-effort basis; issues and pull requests are welcome,
answers may take a few days.

## Good first contributions

- Timing accuracy: songs where lines are misplaced, tempo or bar start is wrong (describe the song's style, tempo,
  language; never attach the audio unless you own it).
- Output formats editors need (for example ASS karaoke tags) — see the admission test in `docs/product-scope.md`.
- Lyric parsing for languages and lyric-sheet styles we have not seen.

## Development

```sh
uv venv --python 3.12 && uv pip install -e '.[sync,dev]'
source .venv/bin/activate
ruff check src tests
pytest -q
```

(Plain `uv run` would sync the environment to the base dependencies and drop the extras; use `uv run --no-sync` if
you prefer not to activate.)

Tests build synthetic audio and video. Do not add songs, lyrics, renders or other media to the repository.

## Pull requests

- Keep changes small and focused; one behaviour per pull request.
- Add a `CHANGELOG.md` entry under `## Unreleased`. Do not bump the version.
- A change to a JSON output follows `docs/contract.md` (new fields are fine; renames bump `schema_version`).
- New commands, flags, config keys or output files explain the workflow they serve (`docs/product-scope.md`).
- Coding agents are welcome to help; `AGENTS.md` has the rules they should follow here.
