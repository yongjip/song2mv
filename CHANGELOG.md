# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

First release (0.1.0).

### Added
- `song2mv sync`: audio + lyrics → beat grid, word-timed lyrics, `song.lrc`, `song.words.lrc`, `song.srt`, `mv.json`
  and `music.json` (loudness and likely section boundaries, for scene design). Several whisper runs merged per
  lyric word; tempo fitted to percussive onsets; gaps re-heard with the expected words as prompt; per-song manual
  values in `song.json`. Options given on a rerun with a `song.json` are saved to it.
- `song2mv beats`: tempo and beat grid only.
- `song2mv click`: a stretch of the song with clicks on the beat grid and ticks on the lyric words, so a person can
  check the timing by ear.
- `song2mv check` (experimental): per-line motion, coverage, chorus variation and cut rhythm of a rendered video,
  measured over the video's own stretch. Every result has `value` and `goal`; checks that cannot run on the
  stretch are listed under `skipped`. A goals file only needs the values it changes.
- `song2mv render` (experimental): Remotion lyric-video template, 16:9 and 9:16, `--hold` for hook cuts,
  `--template DIR` for your own scenes. `outputs` names exactly the files written.
- Work folders and caches belong to one audio file, by content: another song in the same folder is refused, a
  changed file is transcribed again, and whisper runs are reused only for the same model, language and settings.
- A sung line is never dropped: a line with no room between its neighbours is squeezed in (inside the song),
  marked `estimated` and listed under `check_by_ear`; the `sync` result also reports `dropped` (should be empty).
- `check_by_ear` also lists lines only one whisper run placed. A re-heard line heard more often than the lyric sheet
  has it takes the earliest hearing with believable word timing, and `warnings` names the others.
  Word times stay in order, and a line ends after its last word.
- A line starts where it is sung, not in the pause before it. Whisper leaves no gap between words, so it hears that
  pause as part of the line's first word; `sync` cuts that whisper word to the run's median word duration, keeping
  its end. On the JamendoLyrics benchmark (79 songs, docs/benchmark.md), lines starting more than 0.3 s off fell
  from 51 % to 22 %; a first word that really is sung long now starts late.
- A chorus that repeats word for word stays on its own audio. Each whisper run used to be matched to the lyric sheet
  by difflib alone, which anchors on the longest shared block: when the run heard the second copy better, the
  sheet's first copy took its audio, and the lines in between were left with none (placed tens of seconds off, or
  squeezed in as estimates). Each run is now also aligned over the whole song by dynamic programming, and where the
  two disagree, the one that matched more of that stretch wins (difflib's on a tie). A line whose matched letters lie
  more than 10 s apart keeps only the larger part. Lines the runs still leave out of the sheet's order are merged
  again from the runs that placed them in order, and `check_by_ear` lists lines that start before the lines above
  them (more than 2 s: a backing vocal may come early) or after the lines below them. On the JamendoLyrics benchmark,
  lines starting more than 10 s off fell from 214 to 12 and more than 1 s off from 402 to 177, and words within
  0.3 s rose from 83 % to 89 %.
- `--json` on every command; `schema_version` 1 on every JSON output. Errors exit 2 and, with `--json`, print
  `{"ok": false, "error": {"message", "kind", "hint"}}`; exit 1 only means `check` found a failing check.
- `AGENTS.md`, `CLAUDE.md`, `llms.txt` and the `song2mv` Claude Code skill.
