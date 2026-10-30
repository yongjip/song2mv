# Product scope and complexity budget

song2mv's job is narrow: take a song and its lyrics, place every sung word on the song's beat grid, and turn that
into subtitles or a video drawn in code. The internals may be detailed (several whisper runs, alignment, grid
fitting); the surface people and agents learn must stay small.

## Surface baseline

| Surface | Count |
| --- | ---: |
| Top-level commands | **7** — `sync`, `beats`, `click`, `check`, `sheet`, `diff`, `render` |
| Output files of `sync` | 7 — `grid.json`, `lyrics.json`, `mv.json`, `song.lrc`, `song.words.lrc`, `song.srt`, `music.json` |
| Extras | 2 — `beats`, `sync` (plus `dev` for contributors) |
| MCP tools | 0 (planned: one per command) |

### Why `click` became a command and `music.json` an output (0.1)

Both started as `python -m song2mv.timing.<module>` helpers.

1. **Workflow.** Every song's beat grid and word timing has to be checked by ear, and an agent cannot hear: after
   each `sync` it hands the person a clip with clicks on it, often several times per song. Scene design reads the
   loudness curve and section boundaries for every video.
2. **Why not the helpers.** With the documented install (`uv tool install`) only the `song2mv` executable is on
   PATH, so `python -m song2mv...` fails with "No module named song2mv". The helpers had no `--json`, no error
   format and were missing from `--help`. The click track is not a `sync` flag because it is made many times per
   `sync`, for different stretches; the music analysis is cheap (seconds, cached by the audio's content), so
   `sync` writes it instead of a sixth command.
3. **Cost.** One subcommand with four flags and one output file; no new dependency (the `beats` extra).

### Why `sheet` became a command (0.1)

1. **Workflow.** The skill reviews every render on contact sheets: one frame per shot after `check`, and the finished
   video with its captions. The template's `Contact` draws the bare scenes, so in four trial runs on one day every
   agent wrote its own script for the video (ffmpeg frame grabs, tiled, labelled), and they hit the same snags:
   Homebrew's ffmpeg has no `drawtext`, so the labels needed Pillow, and `-vf fps=1/S` labelled every frame half a
   step early. A scene-only sheet could not show one run's worst defect, two lyric lines on screen at once.
2. **Why not an existing surface.** `Contact` renders the scenes in the browser, not the video, so it has no captions,
   title or strips; a prop that drew the template's whole frame would still need Node and a bundle, and would show a
   new render rather than the file that was encoded. `check` measures the video against goals: it needs sung
   lines in the stretch, exits 1 when a goal fails and reads grey frames at 320×180, while a sheet needs a few colour
   frames at chosen times; `--every`, `--cols` and `--crop` would mean nothing to its measurements.
3. **Cost.** One subcommand with eight flags besides `--json` and one output file (a PNG, more pages when it is
   long). No new dependency: ffmpeg grabs the frames, numpy tiles them, a bitmap font of about a hundred glyphs draws
   the labels and zlib writes the PNG.

### Why `diff` became a command (after 0.2.1)

1. **Workflow.** At the high and max quality levels a video goes through several rounds of review and fixes, and a
   fix to a character piece moves what its anchors place in every shot that uses it. In one demo, a fix to a
   toddler's hand-hold also moved her teacher out of a doorway in three other shots. A one-off script caught it,
   comparing drafts of the whole video from before and after frame by frame; the guide's advice until then, a
   contact sheet of each compared by eye, shows one frame per shot and nothing of what moved within it.
2. **Why not an existing surface.** `sheet` shows frames of one video at times chosen beforehand; here the times are
   the answer. A `sheet --against BEFORE` would read every frame of two videos, refuse a pair rendered with other
   options and return a list of stretches, and `--every`, `--times`, `--lines` and `--cuts` would mean nothing beside
   it. `check` measures one video against goals and needs sung lines.
3. **Cost.** One subcommand with three flags besides `--json` and one output file (a PNG, more pages when many
   stretches changed). No new dependency: ffmpeg streams both videos at 480 px, and `diff` reuses `sheet`'s frame
   grabs, tiles, font and PNG writer and `check`'s test for a cut. Two drafts of a 3.6-minute song take about 3 s.

## Admission test

Before adding a command, flag, config key, output file, extra or MCP tool, write down in the pull request:

1. **The repeated workflow** it serves — who does it, how often, what they do today instead.
2. **Why an existing surface can't carry it** — a flag on an existing command, a key in `song.json`, a field in an
   existing JSON file.
3. **The cost** — what it adds to `--help`, the docs, the tests and the install size.

Prefer, in this order: a better default, a key in `song.json`, a flag on an existing command, a new output field,
and only then a new command. A new top-level command also updates the grammar test in `tests/test_cli.py`.
