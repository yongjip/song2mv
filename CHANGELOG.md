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
- `--json` on every command; `schema_version` 1 on every JSON output. Errors exit 2 and, with `--json`, print
  `{"ok": false, "error": {"message", "kind", "hint"}}`; exit 1 only means `check` found a failing check.
- `AGENTS.md`, `CLAUDE.md`, `llms.txt` and the `song2mv` Claude Code skill.
