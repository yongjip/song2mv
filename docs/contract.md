# Machine contract

What scripts and coding agents can rely on. song2mv is alpha (0.x): formats may change, but never silently.

## Versioning

- Every `--json` result and every output file below (`grid.json`, `lyrics.json`, `mv.json`, `music.json`, the
  `beats` grid file) has `schema_version` as its first key (currently `1`).
- An incompatible change — a renamed or removed field, a changed meaning or unit — bumps `schema_version`, the
  minor version, and is listed in `CHANGELOG.md`. New fields may appear without a bump; ignore unknown fields.
- Times are seconds from the start of the audio file, as floats.

## `--json` results

With `--json`, progress goes to stderr and stdout carries exactly one JSON object — also when the command fails.
Every result has `command` and `ok`; `outputs` is always an object, file name → absolute path.

| command | fields |
| --- | --- |
| `sync` | `work`, `config`, `outputs`, `duration`, `bpm`, `lines`, `line_sources` (source → number of lines), `check_by_ear` (line ids to verify by ear: re-heard, estimated, or placed by only one whisper run), `dropped` (lyric lines missing from the output — should be empty), `language`, `warnings`, `seconds` |
| `beats` | `outputs`, `bpm`, `beat`, `phi`, `downbeat_mod4`, `bar0`, `bar`, `duration`, `warnings` |
| `click` | `outputs` (the wav), `from`, `to`, `bpm`, `downbeat_mod4`, `ask_the_listener` (the question to put to the person listening) |
| `check` | `video`, `song`, `goals`, `from`, `to` (the stretch measured, in song time), `passed`, `total`, `results` (check → `{ok, value, goal, msg}`, see below), `skipped` (check → why it could not run on this stretch), `per_line` (`{id, motion, coverage}`), `cuts` (song times), `warnings` |
| `render` | `template`, `outputs`, `seconds`, `warnings` |

`check` results: `value` is the measured number and `goal` is `{"min": x}` or `{"max": x}`. Per-line checks
(`motion.min`, `motion.max`, `coverage.min`) count the failing lines in `value` (goal `{"max": 0}`) and list them in
`lines` as `{id, value, goal}`. A check in `skipped` neither passed nor failed and is not counted in `total`.

## Exit codes and errors

| code | meaning |
| --- | --- |
| `0` | success |
| `1` | `check` ran and a check failed; its result (`"ok": false`) is on stdout as usual |
| `2` | an error: bad input, a missing tool or extra, a failed render, a usage error |

On an error, stderr has `song2mv <command>: error: <message>` and usually a `hint:` line, and with `--json` stdout
carries `{"schema_version": 1, "command": …, "ok": false, "error": {"message", "kind", "hint"}}`. `kind` is `input`
(something you can fix — the hint says how), `interrupted` or `bug` (please report it). Usage errors (an unknown
flag, `--bpm abc`) stop before the command starts: exit `2`, the message on stderr, nothing on stdout.

## Files written by `sync`

**`grid.json`** — `bpm`, `beat` (seconds per beat), `phi` (time of beat 0), `downbeat_mod4` (which beat index mod 4
starts a bar), `bar0` (first bar start), `bar` (seconds per bar), `duration`, `why` (how the tempo was chosen),
plus `candidates`, `phase_stats`, `line_start_hist`, drift diagnostics and `request` (the settings and audio hash it
was made for). Beat *k* is at `phi + k * beat`. `song2mv beats` writes the same format.

**`lyrics.json`** — `title`, `duration`, `grid`, `sections` (as in `mv.json`) and `lines`: each with `id`
(`<section>-<nn>`, e.g. `v1-03`; a section that appears once keeps a bare id, `ch-01`), `section`, `section_name`,
`kind` (`calm` / `mid` / `hot`), `text`, `start`, `end`, `source` (`asr` / `reprompt` / `manual` / `estimated`),
`runs_used`, `coverage` and `words: [{w, t}]`. Word times never go backwards and `end` is after the line's last
word. Lines may overlap: a backing vocal can start while another line is still sung.

**`mv.json`** — the render template's input: `title`, `subtitle`, `audio` (file name), `audio_path` (absolute),
`duration`, `grid`, `sections` (`id`, `name`, `kind`, bar-aligned `start` / `end`), `lines` (`id`, `section`, `text`,
`start`, `end`, `words`), `captions`, `theme`. Also what `check` reads.

**`music.json`** — `duration`, `loudness_db_per_half_second` (mean loudness per 0.5 s, 0 dB = the loudest moment),
`boundaries` (`[{t, novelty}]`, likely section changes; empty for very short songs), `audio_sha256`.

**`song.lrc`** — `[mm:ss.xx]line`; an empty timestamp clears the screen before gaps over 4 s.
**`song.words.lrc`** — enhanced LRC with `<mm:ss.xx>` word stamps. **`song.srt`** — one cue per line (lines that
start within 0.3 s of each other share a cue, one text line each); cues never overlap.

`song.json` (the config) and the working files (`lyrics.txt`, `asr/runN.json`, `merged.json`, `reprompt.json`,
`state.json`) are inputs and working state, not part of the contract.

## Privacy

`mv.json`, `song.json`, `state.json` and the `--json` results contain absolute paths, which include your user name
on most systems (`/Users/<name>/…`). Keep work folders out of repositories and do not post these files as they are.
