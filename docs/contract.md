# Machine contract

What scripts and coding agents can rely on. song2mv is alpha (0.x): formats may change, but never silently.

## Versioning

- Every JSON file song2mv writes and every `--json` result has `schema_version` as its first key (currently `1`).
- An incompatible change — a renamed or removed field, a changed meaning or unit — bumps `schema_version`, the
  minor version, and is listed in `CHANGELOG.md`. New fields may appear without a bump; ignore unknown fields.
- Times are seconds from the start of the audio file, as floats.

## `--json` results

With `--json`, progress goes to stderr and stdout carries exactly one JSON object.

| command | fields |
| --- | --- |
| `sync` | `command`, `work`, `config`, `outputs` (file name → absolute path), `duration`, `bpm`, `lines`, `line_sources` (source → count), `check_by_ear` (line ids to verify by ear), `dropped` (lyric lines missing from the output — should be empty), `seconds` |
| `beats` | `command`, `outputs`, `bpm`, `phi`, `downbeat_mod4`, `bar0` |
| `click` | `command`, `outputs` (file name → absolute path of the wav), `from`, `to`, `bpm`, `downbeat_mod4`, `ask_the_listener` (the question to put to the person listening) |
| `check` | `command`, `video`, `song`, `goals`, `passed`, `total`, `ok`, `results` (check → `{ok, msg}`), `per_line` (`{id, motion, coverage}`), `cuts` |
| `render` | `command`, `template`, `outputs` (absolute paths), `seconds` |

Exit codes: `0` success; `1` `check` found a failing check; any other non-zero code is an error (message on stderr).

## Files written by `sync`

**`grid.json`** — `bpm`, `beat` (seconds per beat), `phi` (time of beat 0), `downbeat_mod4` (which beat index mod 4
starts a bar), `bar0` (first bar start), `bar` (seconds per bar), `duration`, `why` (how the tempo was chosen),
plus `candidates`, `phase_stats` and drift diagnostics. Beat *k* is at `phi + k * beat`.

**`lyrics.json`** — `lines`: each with `id` (`<section>-<nn>`, e.g. `ch1-03`), `section`, `kind`
(`calm` / `mid` / `hot`), `text`, `start`, `end`, `source` (`asr` / `reprompt` / `manual` / `estimated`) and
`words: [{w, t}]`.

**`mv.json`** — the render template's input: `title`, `audio`, `duration`, `grid`, `sections` (`id`, `name`, `kind`,
bar-aligned `start` / `end`), `lines`, `captions`, `theme`. Also what `check` reads.

**`music.json`** — `duration`, `loudness_db_per_half_second` (mean loudness per 0.5 s, 0 dB = the loudest moment),
`boundaries` (`[{t, novelty}]`, likely section changes; empty for very short songs), `audio_sha256`.

**`song.lrc`** — `[mm:ss.xx]line`; an empty timestamp clears the screen before gaps over 4 s.
**`song.words.lrc`** — enhanced LRC with `<mm:ss.xx>` word stamps. **`song.srt`** — one cue per line, cues never
overlap.

`song.json` (the config) and the intermediate files (`lyrics.txt`, `asr/runN.json`, `merged.json`,
`reprompt.json`) are inputs and working state, not part of the contract.
