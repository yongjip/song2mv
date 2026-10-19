# Product scope and complexity budget

song2mv's job is narrow: take a song and its lyrics, place every sung word on the song's beat grid, and turn that
into subtitles or a video drawn in code. The internals may be detailed (several whisper runs, alignment, grid
fitting); the surface people and agents learn must stay small.

## Surface baseline (0.1)

| Surface | Count |
| --- | ---: |
| Top-level commands | **4** — `sync`, `beats`, `check`, `render` |
| Output files of `sync` | 6 — `grid.json`, `lyrics.json`, `mv.json`, `song.lrc`, `song.words.lrc`, `song.srt` |
| Extras | 2 — `beats`, `sync` |
| MCP tools | 0 (planned: one per command) |

Helpers that only a person debugging timing needs (`click_check`, `analyze_music`) stay as
`python -m song2mv.timing.<module>` and are not top-level commands.

## Admission test

Before adding a command, flag, config key, output file, extra or MCP tool, write down in the pull request:

1. **The repeated workflow** it serves — who does it, how often, what they do today instead.
2. **Why an existing surface can't carry it** — a flag on an existing command, a key in `song.json`, a field in an
   existing JSON file.
3. **The cost** — what it adds to `--help`, the docs, the tests and the install size.

Prefer, in this order: a better default, a key in `song.json`, a flag on an existing command, a new output field,
and only then a new command. A new top-level command also updates the grammar test in `tests/test_cli.py`.
