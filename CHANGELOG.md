# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

## 0.1.0 — 2026-10-29

First release. The changes made while building it, with the measurements behind them, are in
[docs/pre-release-log.md](https://github.com/yongjip/song2mv/blob/main/docs/pre-release-log.md).

- `song2mv sync`: a song and its lyrics in; a beat grid, word-timed lyrics, LRC, SRT and `mv.json` for the video
  out. Several whisper runs are aligned to the lyric sheet and merged per word, and the lines most likely to be wrong
  are listed under `check_by_ear`. On the JamendoLyrics benchmark (79 songs in four languages), 87 % of a song's
  words land within 0.3 s of where people put them, on average.
- `song2mv beats`: tempo and beat grid without lyrics. Stretches that leave the song's one tempo are listed under
  `off_grid`, and a song that drifts gets a beat map.
- `song2mv click`: clicks on the beat grid and ticks on the lyric words, to check the timing by ear.
- `song2mv render` (experimental): a lyric video in 16:9 and 9:16 from a Remotion template, with `--draft` for quick
  rounds, `--max-mb` for upload limits and `--cover` for a square cover. With `--template`, your own scenes go in a
  copy of the template, with a scene kit (people, places, sky, objects, camera, effects) and style packs (paper,
  pixel, comic, toon, line, paint, finish).
- `song2mv check` (experimental) and `song2mv sheet`: a rendered video measured per sung line and laid out as a
  contact sheet, for agents that cannot watch it.
- A Claude Code skill for the whole music-video loop, and an `AGENTS.md` for other agents, both in the package.
- `docs/timing-layer.md`: song2mv's timing in HyperFrames and in a Remotion project of your own.
- Every command takes `--json`, and every JSON file carries a `schema_version`.
