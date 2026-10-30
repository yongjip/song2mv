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
Every result has `command` and `ok`; `outputs` is always an object, file name → absolute path. `check` has no
progress: with `--json` it prints nothing but the object, so `> out.json 2>&1` holds valid JSON unless it fails with
an error.

| command | fields |
| --- | --- |
| `sync` | `work`, `config`, `outputs`, `duration`, `bpm`, `lines`, `line_sources` (source → number of lines), `check_by_ear` (line ids to verify by ear: re-heard, estimated, placed by only one whisper run, out of the lyric sheet's order, with a word no run timed between words far apart, spread over far more time than it is sung in, with three words at almost one time or two at one time that another copy of the line has apart, with runs that disagree on its start or on a word's time, or heard alike by the runs but not as written where two or more of them hear another copy of it as written), `off_sheet` (words the whisper runs hear that no lyric line has, see below), `dropped` (lyric lines missing from the output — should be empty), `language`, `warnings`, `seconds` |
| `beats` | `outputs`, `bpm`, `beat`, `phi`, `downbeat_mod4`, `bar0`, `bar`, `duration`, `off_grid` (as in `grid.json`), `warnings` |
| `click` | `outputs` (the wav), `from`, `to`, `bpm`, `downbeat_mod4`, `ask_the_listener` (the question to put to the person listening) |
| `check` | `video`, `song`, `goals`, `from`, `to` (the stretch measured, in song time), `passed`, `total`, `results` (check → `{ok, value, goal, msg}`, see below), `skipped` (check → why it could not run on this stretch), `per_line` (`{id, motion, coverage}`), `cuts` (song times), `warnings` |
| `sheet` | `video`, `song` (`null` without one), `from`, `to` (the song times of the video's first frame and its end), `times` (the song time of each frame on the sheet, in order), `outputs` (the sheet's pages, the first at `--out`), `warnings` |
| `diff` | `before`, `after`, `song` (`null` without one), `from`, `to` (the song times of the videos' first frame and their end), `frames` (the number compared), `faint` (frames with a changed pixel that were left out, see below), `stretches` (see below), `outputs` (the sheet's pages; none when nothing changed), `warnings` |
| `render` | `template`, `outputs`, `seconds`, `warnings` (for a video, also each warning the kit printed, `arm: WHO: FAULT at T s` and `storyboard: …` lines, once each as first seen) |

`check` results: `value` is the measured number and `goal` is `{"min": x}` or `{"max": x}`. Per-line checks
(`motion.min`, `motion.max`, `coverage.min`) count the failing lines in `value` (goal `{"max": 0}`) and list them in
`lines` as `{id, value, goal, from, to, cuts, msg}`, each with where it failed: `from` and `to` are the stretch
measured for the line and `cuts` the cuts in it (song times), and `msg` says it in words. A still (`motion.min`) or
empty (`coverage.min`) line adds `stretch` `{from, to, value}`: its longest part whose every second is under the goal
(or else its lowest second), without the frames at its ends that reach the goal, and the mean over it. A frantic line
(`motion.max`) adds `peak` `{t, value}`, its biggest frame change and the song time of the frame it shows on, and
`without_cuts`, its motion with every cut-like frame change left out, also those that `cuts` lists as one cut because
they fall within 0.3 s of each other (`msg` calls the peak a cut when it is one of them). In a pixel scene a
whole-pixel camera step can be one of them too. Without a cut, `msg` says when the change covers the whole frame,
as a camera move over fine detail does. `cuts.max_gap`'s `msg` names the sudden changes in its `gaps` that did not count
as a cut (a frame pair that changes at least 1 more than both pairs beside it), with their correlation and difference. `variation.repeats` lists every repeated line pair in `pairs` as
`[pair, correlation]`, worst first; its `value` is their mean, or the worst pair with a line in a hot section when
that is higher. A check in `skipped` neither passed nor failed and is not counted in `total`. On a draft (a video at
half size), `warnings` names the lines that pass `motion.max` by less than 0.3: a full render measures up to that much
higher than its draft.

`diff` stretches: each is `{from, to, peak, at, box, lines}`. `from` and `to` are song times, from the start of its
first changed frame to the end of its last; `peak` is the largest share of the frame (0–1) changed in one of its
frames, and `at` the song time of that frame's middle, the frame both sides of the sheet show; `box` is `[x, y, w, h]`
round every changed pixel of the stretch, in the video's pixels, as `sheet --crop` takes it; `lines` are the ids of
the lines sung in it, or of the sections there when no line is (empty without `--song`). Both videos are read in grey
at 480 px on their long side, and a pixel changed when it differs by more than 24 levels. Frames with a changed pixel
and less than 0.15 s of unchanged frames between them make one stretch, which ends at a cut in either video (`check`'s
test for one); a stretch whose frames change fewer pixels in all than 0.02 % of one frame is left out, and its frames
are counted in `faint`. Two videos of different size, frame rate or length are an error; otherwise `diff` exits 0,
whether or not anything changed.

`off_sheet` lists the stretches of at least 1.5 s where two or more whisper runs agree on two or more words that no
line of the lyric sheet matched: a chant or an ad-lib the sheet leaves out, a line sung differently, a repeat the
sheet has once, or a line of the sheet that the runs heard there but that was placed elsewhere (compare the words with
the sheet). Each is `{from, to, runs, words, after}`: `from` and `to` in song time, `runs` the numbers of the runs
that agree (as in `runs_used`), `words` what one of them heard, and `after` the id of the last line that starts before
it (`null` before the first). A stretch is left out when it holds at least half as many timed words of the sheet's
own lines as words heard: there the runs misheard those lines. Each stretch also gets an entry in `warnings`, and a
line whose first and last words lie on either side of one goes on `check_by_ear`.

When `sync` has a lyric sheet (`--lyrics`) and the audio also has a lyrics tag that differs from it (in more than case
and punctuation), `warnings` names each place where they differ and says which of the two the whisper runs support
there, for example `the audio's lyrics tag repeats hk1-05–hk1-06 "…", which the lyric sheet has once; the whisper runs
support the tag here` (`the sheet`, `the tag` or `neither clearly`). Up to four places are named one by one; with more,
three are, and a fourth entry counts the rest.

`sync` and `beats` add one entry to `warnings` per `off_grid` stretch (see `grid.json`), saying what was found and
where, for example `the tempo changes near 0:30 (100 → 120 BPM): the beat grid fits only before that; …`, or a
single entry when the grid fits almost none of the song (`the beat grid (80 BPM) does not fit this song: …`, with a
`--bpm` to try, except when that other tempo drifts too). Read the stretches from `off_grid`, not from the text.
`sync` also warns when the tempo pick is uncertain: when the lyric line gaps chose another tempo than the one the
onsets fit best (`the tempo pick is uncertain: the onsets fit 118.02 BPM best, but …`). They choose it only when its
grid is off the music for no more of the song than the onsets' favourite's; otherwise that one is the grid.

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
plus `candidates`, `phase_stats`, `line_start_hist`, `local_offsets`, `off_grid`, `beats`, `swing` and `request`
(the settings and audio hash it was made for). Beat *k* is at `phi + k * beat`: one tempo for the whole song, unless
`beats` holds a beat map. `song2mv beats` writes the same format.

- `off_grid` — where that one tempo does not fit the music: `[{from, to, bpm, kind, offset_ms}]`, empty when it fits
  everywhere. `bpm` is the music's own tempo in the stretch; `kind` is `tempo` (another tempo), `drift` (the tempo
  moves away gradually; also `bpm_from` and `bpm_to`) or `shift` (the same tempo, but the beat moved; `offset_ms` is
  how far the music's beats sit after the grid's, negative = before, or `null` when it varies). A stretch is where,
  for at least 2 bars, a grid fitted to that part of the song (tempo within ×/÷ 1.25 and phase, in windows of 16
  beats) lands on the onsets clearly better than the global grid and its beats are more than half a 16th note from
  the global grid's 8th notes — so a section that accents the off-beat is not flagged. With a beat map (`beats`),
  `sync` snaps lyric words to it everywhere and starts sections on its bar lines. Without one, it does not snap lyric
  words inside a stretch (section starts still sit on the grid's bar lines), and anything that draws beats from the
  grid is off there. One stretch covering the whole song means the grid's tempo is probably wrong; it is a `drift`
  (with `bpm_from` and `bpm_to`) when that other tempo also moves by more than 1 % from the song's first quarter to
  its last.
- `local_offsets` — the check behind `off_grid`, one window per 2 bars: `{from, to, bpm, offset_ms, strength, fits}`,
  where `offset_ms` is how far the window's own beats sit from the grid's at its middle, `strength` its onset score
  and `fits` `true`, `false`, or `null` when the window has no clear pulse to judge.
- `beats` — only when `off_grid` has stretches: the time of every beat from the start of the song (beat *k* is
  `beats[k]`), following the music where the one tempo does not, or `null` when it could not be followed without a
  guess (a beat that moves by part of an 8th note, a weak pulse, a gap whose beat count is unsure) or one stretch
  covers the whole song. The fit check's windows are chained 8th note by 8th note; of the two 8th-note phases, the
  one on stronger onsets holds the beats. With a map, `downbeat_mod4` counts in `beats` (a bar starts at `beats[k]`
  where `k % 4 == downbeat_mod4`, found again on the map from the kick unless given), `bar0` is that first bar
  start and `phase_stats` are measured on the map; `bpm`, `beat`, `phi`, `line_start_hist` and `local_offsets` stay
  those of the one-tempo grid. Between beats, times are linear; before the first and after the last beat, the
  first and last beat lengths continue.
- `swing` — only when the groove is clearly swung: `[a, b]`, where the 2nd and 4th 16th notes of each beat fall, in
  beats from the beat (straight would be `[0.25, 0.75]`; a swung boom-bap song has `[0.325, 0.829]`). Measured on the
  hats (the percussive part above 6 kHz), folded by position inside the beat — on the beat map when there is one,
  and without one outside the `off_grid` stretches — each 16th from the beat's own peak. Clearly swung: the 8th note
  within 0.02 of halfway, both 16ths standing out with nothing else between the beats, and both late, by at least
  0.03 each and 0.05 on average (60:40 or more). With `snap_per_beat` 4, `sync` snaps lyric words to the beat, the
  8th note and these two 16ths (of the beat map's beats when there is one); 8th notes stay straight.

A `grid.json` without `off_grid`, or with stretches but without `beats`, was made by an older song2mv; `sync` fits
it again. One made before song2mv measured swing has no `swing`, swung or not, and is reused as it is:
`sync … --from grid` fits it again.

**`lyrics.json`** — `title`, `duration`, `grid`, `sections` (as in `mv.json`) and `lines`: each with `id`
(`<section>-<nn>`, e.g. `v1-03`; a section that appears once keeps a bare id, `ch-01`), `section`, `section_name`,
`kind` (`calm` / `mid` / `hot`: from the section's name, or `mid` for a section named calm that `music.json` measures
about as loud as the mid sections; `section_kinds` in the config overrides both), `text`, `start`, `end`, `source`
(`asr` / `reprompt` / `manual` / `estimated`), `runs_used`, `coverage` and `words: [{w, t}]`, the line's tokens with a
letter or a digit (a `/` or `–` between them stays in `text` only). Word times never go
backwards and `end` is after the line's last word; a line pinned in `manual` keeps its word times unsnapped. Lines
may overlap: a backing vocal can start while another line is still sung.

**`mv.json`** — the render template's input: `title`, `subtitle`, `audio` (file name), `audio_path` (absolute),
`duration`, `grid` (`bpm`, `beat`, `phi`, `downbeat_mod4`, `bar0`, `off_grid` and, when it is a list, `beats` from
`grid.json`, and `swing` when it has one), `sections` (`id`, `name`, `kind`, bar-aligned `start` / `end`), `lines`
(`id`, `section`, `text`, `start`, `end`, `words`), `captions`, `theme`, and `vignette` and `flashes` when the song
config sets them. Also what `check` reads.

**`music.json`** — `duration`, `loudness_db_per_half_second` (mean loudness per 0.5 s, 0 dB = the loudest moment),
`boundaries` (`[{t, novelty}]`, likely section changes; empty for very short songs), `audio_sha256`.

**`song.lrc`** — `[mm:ss.xx]line`, the line's `words`; an empty timestamp clears the screen before gaps over 4 s.
**`song.words.lrc`** — enhanced LRC with `<mm:ss.xx>` word stamps. **`song.srt`** — one cue per line, its `words`
(lines that start within 0.3 s of each other share a cue, one text line each); cues never overlap.

`song.json` (the config) and the working files (`lyrics.txt`, `lyrics.sections.txt`, `asr/runN.json`, `merged.json`,
`reprompt.json`, `state.json`) are inputs and working state, not part of the contract. `lyrics.sections.txt` is written
for a lyric sheet without `[Section]` lines: the sheet with the sections `sync` proposed from its repeated lines and
used, which `warnings` lists.

## Privacy

`mv.json`, `song.json`, `state.json` and the `--json` results contain absolute paths, which include your user name
on most systems (`/Users/<name>/…`). Keep work folders out of repositories and do not post these files as they are.
