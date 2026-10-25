# Contributing

Thanks for helping. song2mv is alpha and maintained on a best-effort basis; issues and pull requests are welcome,
answers may take a few days.

## Good first contributions

- Timing accuracy: songs where lines are misplaced, tempo or bar start is wrong (describe the song's style, tempo,
  language; never attach the audio unless you own it).
- Output formats editors need (for example ASS karaoke tags) — see the admission test in `docs/product-scope.md`.
- Lyric parsing for languages and lyric-sheet styles we have not seen.
- Drawings for the scene kit: an asset many songs can use, or a style pack (see below).
- What a video taught you: what its viewers found fun or dull and what fixed it, with the numbers that moved, as a
  change to `.claude/skills/song2mv/SKILL.md`. The skill is how any agent makes a good video from this repository
  alone. Describe the song in general terms, never its lyrics.

## Development

```sh
uv venv --python 3.12
uv pip install -e ".[sync,dev]"
uv run --no-sync ruff check src tests
uv run --no-sync pytest -q
```

(Plain `uv run` would sync the environment to the base dependencies and drop the extras. To activate the environment
instead: `source .venv/bin/activate`, or `.venv\Scripts\activate` on Windows.)

Tests build synthetic audio and video. `tests/test_template.py` renders through the template and runs only after
`npm ci` in `src/song2mv/render/template`. Do not add songs, lyrics, renders or other media to the repository.

Update React and React DOM together. Keep Remotion and every `@remotion/*` package on the same version.
After template dependency changes, run `npm ci`, `npm run typecheck`, `npm run test:assets` and the template
render tests; type checking alone does not detect a React runtime mismatch.

Asset checks transpile render probes with esbuild and validate interaction types through the installed `tsc`
CLI, extending the template's tsconfig in a temporary project that is removed afterward. Do not import the
legacy TypeScript compiler API: TypeScript 7 does not expose it. Keep the negative type checks as well as the
rendered SVG and mutation checks when changing this harness.

## Pull requests

- Keep changes small and focused; one behaviour per pull request.
- Add a `CHANGELOG.md` entry under `## Unreleased`. Do not bump the version.
- A change to a JSON output follows `docs/contract.md` (new fields are fine; renames bump `schema_version`).
- New commands, flags, config keys or output files explain the workflow they serve (`docs/product-scope.md`).
- English only: code, docs, test data and commit messages.
- Few comments: let names and types explain the code, and comment only what they cannot say.
- Coding agents are welcome to help; `AGENTS.md` has the rules they should follow here.

## Changes made on the maintainer's machine

Agent sessions working in the maintainer's checkout do not push `main`: they enqueue their branch in a local merge
queue that runs the checks, pushes and waits for CI. Follow [docs/merge-queue.md](docs/merge-queue.md). Pull requests
are opened and reviewed as usual; the maintainer lands them through the same queue.

## Adding an asset or a style pack

The render template's scene kit (`src/song2mv/render/template/src/kit/`) grows by pull request. Three kinds of drawing
fit:

- **An asset:** a person, place, object or effect that many songs could use, in the kit's flat style. Put it in the
  file of its family (`people.tsx`, `objects.tsx`, …) or in a new file exported from `kit/index.ts`.
- **A style pack:** a few drawing pieces that put any object in one art style, like `kit/styles/paper.tsx` (paper
  cut-out). One file in `kit/styles/`, exported from `kit/index.ts` as a namespace
  (`export * as ink from "./styles/ink";`).
- **A recipe:** a new asset made by combining existing parts in a few lines, like `SleeplessStorm` in
  `kit/recipes.tsx` (a room, a bed, a lying person, tears, a storm in the window, a camera). Recipes are welcome too.

A song's own characters and scenes stay in that song's copy of the template; contribute what other songs can use.

- **Original drawings only.** Draw it yourself, in code. No traced or copied characters, logos, brands or other
  people's artwork.
- **MIT.** Your drawing is released under the repository's license.
- **No media files:** no images, fonts, audio or video. Everything is code.
- **The kit's rules:**
  - a pure function of song time `T`, never of the frame number or state;
  - an `id` prop for anything it puts in SVG `<defs>`, so two copies on one stage don't clash;
  - text pops once and then holds still: no wobble, bob or beat-shake on letters;
  - an SVG filter's `feOffset` a hair over a whole or half number (1.01, not 1; 1.51, not 1.5): an offset lands on
    whole pixels, and Chrome rounds an exact half up in software and down on a Mac's GPU, where `song2mv render`
    draws, so the tile must look the same rendered with `--gl=angle` and without;
  - laid out on the 1920×1080 stage, with props named so that they need no comment.
- **A gallery tile and a still.** Add a tile that uses it to `src/Gallery.tsx` (a style pack's tile draws a few
  everyday objects in the style). In the template folder, run `npx tsc --noEmit`, render the tile with
  `npx remotion still src/index.ts Kit-Gallery out/tile.png --frame=N` and attach the PNG to the pull request (`out/`
  is never committed). CI renders every tile too: they are in the run's `kit-gallery` artifact.
