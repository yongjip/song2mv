# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

### Changed
- The README identifies the model and effort setting next to the video examples and notes that results can vary.

### Added
- A layered SVG brand kit with color, single-ink and reversed logos, icons, transparent raster exports, and a rebuild script. The README shows the logo in light and dark themes.
- Quality levels in the skill: medium, high (the default) and max set, phase by phase, how many agents draw, how
  many review and for how many rounds (one at medium, two at high, and at max a third when the second still found a
  high-severity finding), and at max a first round with one reviewer per lens (bodies, framing, continuity, motion,
  story, text and 9:16). In two videos, reviews found about 120 defects after every check had passed and a second
  round about 60 more; of 117 recorded, 54 % were framing, 46 % continuity, 44 % bodies. At high and max a fresh
  reviewer looks at the painters' pieces before the build. `briefs/review.md` groups what a viewer finds wrong by
  lens. On one song judged blind, the model mattered more than the level: Sonnet 5.5 left 7.6 high- and
  medium-severity findings per minute at medium and 5.3 at max, Opus 5.5 1.3 at high. The skill says to run every
  agent on the strongest model you have.
- The kit's `arm()` draws an arm exactly as `limb()` does and says what a viewer would see wrong: a hand that holds
  something out of reach, an arm folded into a V with the elbow up, squashed short, a hand on its own head. Each
  prints the first time an arm shows it, as `arm: WHO: FAULT at T s`, and a video's `render --json` lists them under
  `warnings`. `toStage` and `toLocal` place hand targets as stage points. In the two videos that taught this, about 20
  of the 117 defects reviewers recorded were arms or hands, four of them a hand on its own head or cheek.
- `song2mv diff BEFORE AFTER` says what changed between two renders of the same video, frame by frame: every stretch
  that differs, in song time, with the share of the frame changed at its peak, the box round the change (as
  `sheet --crop` takes it) and, with `--song`, the lines sung; and a sheet of each stretch's peak frame before and
  after, the change outlined. A stretch ends at a cut, so each shot that changed shows on its own, and a hand moved by
  a few pixels through a whole shot counts. Renders made with other options are refused. The skill runs it on drafts
  of the whole video from before and after a fix in a piece, in place of two contact sheets compared by eye: on the
  drafts that taught this it showed, in about 3 s, the hand-hold fix and the three shots where it had moved the teacher
  out of her doorway.
- A video render looks at every frame for a face (an element with `data-face="WHO"`: the kit's `Person` has it, a
  piece of your own wraps its head in one) and prints, once for each line sung, the first time an element with
  `data-over="WHAT"` drawn after it (the kit's text, or a bubble, sticky note or prop you mark; its solid shapes count)
  covers over 30 % of what shows of it (`face: WHO: covered by WHAT (LINE) at T s`), the first time the frame's edge
  cuts it (30 to 98 % of it out: `face: WHO: cut by the frame (LINE) at T s`) and the first time it cuts text (over
  15 % out: `text: WHAT: cut by the frame (LINE) at T s`). `render --json` lists them under `warnings`. The painters',
  builders' and reviewers' briefs ask for the marks and to clear the lines. Of the high-severity findings blind
  reviewers made in three Sonnet videos, about 21 of 33 were a face covered or cut and 4 more text cut. On the
  medium-level video's 16:9 render the check prints 11 lines, which include 5 of the 6 faces the reviewers called
  high (the sixth, a bowl over a mouth, is a prop nobody had marked); on a published paper-cut video, rendered at 1
  frame a second, it prints 1 line for the 16:9 frame and 1 for the 9:16. A figure that walks in is cut for a moment
  and prints too.

### Changed
- The painters' brief asks for `arm()` on every arm that reaches for something, `toward` down for a hand at the face,
  a hand's forearm on its layer, and joined hands out to a child's side; the builders' brief takes hand targets from
  anchors with `toStage` and clears every `arm:` line. After a fix in a piece, the skill compares a draft of the whole
  video before and after: a piece's anchors place other figures too, and one hand-hold fix moved a teacher out of her
  doorway.

### Fixed
- `render --json` lists the storyboard's warnings (`storyboard: …`) under `warnings` too, once each, as it does the
  kit's `arm:` faults. The guide no longer says a still prints arm faults: Remotion's stills print nothing the page
  logs, so painters write each arm's `faults` on their test tiles.
- A chunk whose Chrome browser process died mid-render is rendered again after `SONG2MV_STALL` seconds. Remotion
  then waits forever for the frames the dead browser had and repeats its last frame count every half second, and each
  repeat restarted the wait, so the render failed with an error 300 s later instead. With the browser killed in the
  second of three chunks (`SONG2MV_STALL=30`), a 10 s render now finishes with all 300 frames 41 s after the kill;
  before, it failed 150 s after it.

## 0.2.1 — 2026-10-30

### Fixed
- A long render no longer hangs when the computer sleeps or Chrome crashes. Two final renders here stopped the
  minute a laptop's lid was closed on battery: sleep killed Chrome's tabs, and Remotion's recovery then waited
  forever. `render` now keeps a Mac awake while it runs (with the lid closed too, on power), renders a video in
  chunks of 900 frames (`SONG2MV_CHUNK`), each with a Chrome of its own, joined without encoding them again, and
  renders a chunk again after the computer slept, after Chrome crashed, or when no frame has come for 180 s
  (`SONG2MV_STALL`). Whatever stops anyway fails with the frame it stopped at instead of waiting. A line Remotion
  repeats word for word shows once.

## 0.2.0 — 2026-10-30

### Added
- The README says what a computer needs, as measured: memory, time, disk and the systems tested.
- Two brief templates next to the skill for a video split among agents: `briefs/assets.md` for the painters of the
  shared pieces, `briefs/section.md` for one builder per section. The skill says how to set up, split and merge.
- A review step: `briefs/review.md` sends fresh agents over the finished render, a stretch each, to crop every figure
  at 1:1 and report what a viewer would catch. In two videos it found about 120 defects after every check passed.
- `limb()` in the kit solves an elbow or knee that bends toward a side you name, whichever side of the body the
  target is on, and reports how far it reaches and how sharply it bends.

### Changed
- The guide and briefs add what a character redesign taught: the variants the continuity table needs go into the
  pieces before the builders start, pictures of a character draw from its face, a turn needs an in-between
  pose, how many agents render at once, and asking for a photo or clip of the real people a song is about,
  kept out of repositories.
- The guide runs full-size renders one at a time, two template copies included: two final videos rendered at once
  both stopped about ten minutes in. Drafts may still render side by side.
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
- The band behind the captions stays on between lines and fades out and in round longer gaps, where it blinked at
  every new line and flashed onto the shot before a cut; it stays off while the scene draws a line itself.

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
