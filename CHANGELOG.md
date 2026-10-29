# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

### Added
- The README says what a computer needs, as measured: memory, time, disk and the systems tested.
- Two brief templates next to the skill for a video split among agents: `briefs/assets.md` for the painters of the
  shared pieces, `briefs/section.md` for one builder per section. The skill says how to set up, split and merge.
- A review step: `briefs/review.md` sends fresh agents over the finished render, a stretch each, to crop every figure
  at 1:1 and report what a viewer would catch. In two videos it found about 70 defects after every check passed.
- `limb()` in the kit solves an elbow or knee that bends toward a side you name, whichever side of the body the
  target is on, and reports how far it reaches and how sharply it bends.

### Changed
- The README says how its two demo videos were made, and its example asks for a music video, not a lyric video.
- The guide says `theme.bg` also shades the picture behind the captions: a light `bg` under the default white text
  washed the captions out.
- The brief templates ask painters to run ground and sky on below the stage and never to name a prop `key` or `ref`,
  and builders to look at their stretch in 9:16 as well.
- The guide opens with the steps to check before delivering, gives characters an age and the map a continuity table,
  and adds fit tiles of every touch between characters before the builders start.
- The painters' brief has proportions by age and rules for arms, legs and hands. The builders' brief has rules for
  face crops, pose changes, continuity and who is drawn in front.
- `AGENTS.md` tells an agent to read the skill before any scene work and to have the render reviewed before it
  delivers. The skill and the README say what to do without agents of one's own: a session per brief, or the roles
  in turn.

### Fixed
- A storyboard without boards draws nothing instead of failing the render: a video split among builders starts with
  every section's boards empty.
- A short drawn by a `VerticalScene` puts a strip of `theme.bg` behind its captions, as the 16:9 video has a band
  under them: over a light picture the white text did not read.

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
