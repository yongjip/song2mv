# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

First release (0.1.0).

### Added
- `song2mv sync`: audio + lyrics → beat grid, word-timed lyrics, `song.lrc`, `song.words.lrc`, `song.srt` and
  `mv.json`. Several whisper runs merged per lyric word; tempo fitted to percussive onsets; gaps re-heard with the
  expected words as prompt; per-song manual values in `song.json`.
- `song2mv beats`: tempo and beat grid only.
- `song2mv check` (experimental): per-line motion, coverage, chorus variation and cut rhythm of a rendered video.
- `song2mv render` (experimental): Remotion lyric-video template, 16:9 and 9:16, `--hold` for hook cuts,
  `--template DIR` for your own scenes.
- A sung line is never dropped: a line with no room between its neighbours is squeezed in, marked
  `estimated` and listed under `check_by_ear`; the `sync` result also reports `dropped` (should be empty).
- `--json` on every command; `schema_version` 1 on every JSON output.
- `AGENTS.md`, `CLAUDE.md`, `llms.txt` and the `song2mv` Claude Code skill.
