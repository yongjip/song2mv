# Product scope and complexity budget

song2mv's job is narrow: take a song and its lyrics, place every sung word on the song's beat grid, and turn that
into subtitles or a video drawn in code. The internals may be detailed (several whisper runs, alignment, grid
fitting); the surface people and agents learn must stay small.

## Surface baseline (0.1)

| Surface | Count |
| --- | ---: |
| Top-level commands | **5** — `sync`, `beats`, `click`, `check`, `render` |
| Output files of `sync` | 7 — `grid.json`, `lyrics.json`, `mv.json`, `song.lrc`, `song.words.lrc`, `song.srt`, `music.json` |
| Extras | 2 — `beats`, `sync` |
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

## Admission test

Before adding a command, flag, config key, output file, extra or MCP tool, write down in the pull request:

1. **The repeated workflow** it serves — who does it, how often, what they do today instead.
2. **Why an existing surface can't carry it** — a flag on an existing command, a key in `song.json`, a field in an
   existing JSON file.
3. **The cost** — what it adds to `--help`, the docs, the tests and the install size.

Prefer, in this order: a better default, a key in `song.json`, a flag on an existing command, a new output field,
and only then a new command. A new top-level command also updates the grammar test in `tests/test_cli.py`.
