# Changelog

All notable changes are listed here. song2mv is alpha (0.x): see docs/contract.md for what changes may break.

## Unreleased

### Added
- A 3D skeleton for characters, drawn per part and per view: the kit's `skeleton` (`pose3`, `freeArm`, `gait`,
  `strides`, `steady`, `OneOutline`, `hullOf`), documented in the template's `VIEWS.md`, with `test-skeleton.mjs` in
  `npm run test:assets`. Joints are posed by hand and foot targets with fixed bones, seen through a camera; heads,
  hands and feet take the drawing for their view at the size their depth gives; `fingers` bends a wrist, and a hand
  goes end-on only within about 25 degrees of the line of sight. In a test of three shots built both ways, reviewed
  blind and fixed once each (`experiments/hybrid-figure/PARTS-AND-VIEWS.md`), the pops at hand-overs came from
  swapping whole-body drawings and went with one continuous rig, in 2D as in 3D; the stuck-on arm went with a torso
  drawn per view with the shoulders in its outline; the skeleton alone showed depth, at about 1.4 times the tokens.
  The skill says how to build each shot and what to draw per view.
- Contact between figures, measured as drawn. `arm()` and `limb()` return `short`, how far the hand stops short of a
  target out of reach (the bones never stretch), and the `out of reach` line says it (`arm: WHO: out of reach by N px
  at T s`). The kit's `bodycheck` reads new marks, `data-figure`, `data-part`, `data-touch="WHO: PART"`,
  `data-view` and `limbMarks()`, and a video render prints three faults beside the `arm:` and `face:` ones: `limb:` (a
  bone drawn over 10 % longer than its rig), `contact:` (two parts that must touch drawn apart, with the gap) and
  `proportions:` (a close-up's part off the standing rig's, for its head, by over 10 %). `<ShowFaults>` writes them on
  a still, and two kit gallery tiles show a hug posed by target and one out of reach. A family video's hugs were
  rejected three times for exactly these (a gap between the bodies, a child's arms scaled up so her hands met, a
  close-up at other proportions) after painters spent 100 to 180 render-and-look calls each setting joints by hand.
- The skill, from a remake its user called creative: where a story's rule comes from (a metaphor in the lyrics about
  what the hero does, taken literally, which the first video had drawn once as a gag), asking of each scene what the
  rule makes happen there, a payoff that echoes its setup, and the break and the outro carrying the low point and the
  epilogue the lyrics skip.
- The skill: what to keep on the strongest model when a weaker one takes part. A video made end to end with a cheaper
  model was judged dull, with poor characters; keep the concept, the song's rule, the storyboard and the character
  pieces on the strongest model (or reuse finished characters) and give the weaker one only the assembly.
- The skill, from a video's first week online: confirm every name drawn into the picture with the user before the
  final render (a romanized name can read as another name, and YouTube cannot swap a published file), start the end
  screen after a closing punchline, and link each short to the full video through "Related video".
- `"captionBand": false` in the song config's `theme` drops the shading behind the bottom captions (and the strip
  behind a short's) and outlines each caption letter in `theme.bg` instead, for a bright picture the dark band dulls.
- The skill and its review brief, from a cartoon video rejected after passing every check and its remake: plan a
  story before drawing (a beat sheet on one rule, scenes that play out with reactions, the title line's own moment)
  and the hero's design sheet with head turns as drawn views, and show both before the build; an appeal lens for
  reviewers; key moments framed big, a peak inside one shot, props moved by a hand, no framing repeated in 9:16, the
  light following the story's rule, washes that keep the hero's colour; and how that run split its agents.
- `arm()` takes `body`, the torso as an ellipse (`c`, `rx`, `ry`, and `front` for a figure seen from the side), and
  reports two more faults with it: folded across the chest (a joint under 100° with the hand on the body and the elbow
  inside it or near shoulder height) and laid across the body (more than 36 % of the arm's length over the torso's front
  half, the hand on it). Reviewers of one video found these in about ten poses over three rounds that printed no
  `arm:` line.
- A board's `span` says which framing the shot on screen took (`framing`, an index into `framings`, or `tall` in 9:16)
  and when that shot cuts in and away (`shotFrom`, `shotTo`), so a world can draw for the shot.
- `comic.follow`, a page camera for a comic page that a Storyboard films: under a close framing, the page moves until
  the panel being drawn fills the frame, by a cut or a glide, and a panel switch within 0.5 s of one of the planner's
  cuts moves onto that cut. Its doc comment carries what passed `check` in one video's pages.
- `comic.Sfx` takes `spacing`, the gap between its letters in em.
- The skill and its briefs: a piece whose parts draw their own ink takes only a thin joining outline; each short is
  framed by the builder of its stretch and reviewed from the first round, against the safe box.
- The skill and its briefs, from a max-quality run's four review rounds: an elbow folded across the chest that
  `arm()` misses, hand shapes that switch mid-ease, lettering on a mirrored figure, a backdrop narrower than a
  pull-back, the template's flash under a film finish, a short's plain bottom band, and the scene patch a piece fix
  may need.
- `AnchoredCheeks` attaches separate cheek marks to stable eye landmarks through a head turn. `Comparison` gives
  control and candidate drawings the same time and crop. The synthetic `Face-Anchors` composition demonstrates both.
- Developer scripts extract selected encoded frames at native size with source hashes and record command timings
  without overwriting earlier runs. See `docs/animation-review.md` for review steps and limits.
- The failed reference-raster arm fitting pilot is archived under `experiments/raster-arm-fit`, outside the scene kit
  and standard dependencies. It includes a synthetic smoke input generator and records its detached-hand failure.
- Experimental 2D character starters with replaceable artwork, three proportions, walk/phone/bass actions,
  joint exercises, simple dances, preview compositions and geometry/contact checks.
- A standalone experimental 3D-driven 2D figure study with authored directional heads and silent examples.
  It uses a separate npm install; CI checks it and attaches preview PNGs. These studies may change or be removed.
- A production quality contract and asset/review briefs for identity, contact, moving proofs and honest
  review coverage. Attractive stills and passing geometry checks do not establish finished motion quality.
- A video render's log names a board that opens on a framing too alike to the one before it in the same world
  (`storyboard: the cut to the board at … goes from framing …`): such a cut reads as a skipped frame.
- The skill and its briefs, from a children's copy-along video and three review rounds: empty-handed mimes and the
  main character doing every action, short arms on chubby characters, eating that touches the mouth, pose changes of
  0.6 s or more, text beside the action and ended at a cut, a short's overlay beside the action and its wides zoomed
  in, and comparing the copies of a repeated line's timing.

### Fixed
- Render staging preserves a copied template's public artwork and uses a separate name for the input audio.
- `sync` no longer puts a word late when whisper ran it on over the pause after it. Whisper leaves no gap between
  words, so a line's last word before an instrumental break can last until the next word is sung, and `sync` spread
  the word's letters over that span: in one song a chorus line's last word, a 10.3 s whisper word of three letters,
  came 1.7 s late, and `check_by_ear` did not list it. A whisper word longer than 4 s now gives no time, and the word
  is placed from the other runs or next to its timed neighbours; in that song, where the user pinned it by ear. On the
  JamendoLyrics benchmark (rerun from the align step), 10 words in 7 songs move (summed error 31.4 → 30.5 s), words
  within 0.1 / 0.3 / 1 s stay 55.5 / 88.9 / 96.6 %, lines starting more than 0.3 s off stay 529 of 3,383, those more
  than 1 s off go from 175 to 174, and `check_by_ear` lists 450 lines instead of 449.

### Changed
- A short, and a 16:9 stretch that stops before the song's end, fade out over their last 0.5 s (`FADE_OUT`), not 0.8 s:
  in one short the longer fade swallowed the last gag. Choose `--to` at least 0.5 s after the last action.
- `comic.Sfx` sets its letters 0.06 em apart by default (they touched before): in a tight display face a turned
  letter's fill ran into the next one's, and THWACK read 1HWACK. `spacing={0}` sets them as before.
- The template runs Remotion 4.0.540 (was 4.0.537), with Chrome 158.0.8127.2; its bundler is now rspack 2.3.0. A
  `--template` copy keeps its own `render.mjs` and Remotion: copy the new `render.mjs` over it only together with the
  new `package.json` and `package-lock.json`.
- A Mac renders with Remotion's own Chrome again, and the download of Google's Chrome 157 into
  `node_modules/.song2mv-chrome` (104 MB) is gone. The 157 builds had a V8 bug: Remotion's Mac build kept V8's debug
  checks and crashed long renders ("Page crashed!"), and Google's build computed wrong values without a word (a shared
  number box gave 99.5 for 2.25). Chrome 158 has V8's fix and Remotion builds it without the checks, 116 MB smaller than
  before. A whole song that crashed before (8,856 frames at 1080p) renders in 3:14 and 3:00 with no crash, against 5:08
  and 4:39 with Google's 157 on the same busy Mac, in a file 7 % smaller. Google's 157 had also drawn a light beam
  that had already left the frame back into one frame of one of its two renders.
- Finals no longer pass `--jpeg-quality=100`, which Google's Chrome needed. With Remotion's Chrome it changed neither
  the size (145.3 and 145.5 MB at the default, 145.6 MB at 100), the time, nor how near the frames come to lossless
  ones (42.0 dB both ways; a paper-style video, 40.3 dB both ways).
- `render` no longer picks a free port for Remotion. With 4.0.537, an IPv6-only Studio on the default port still
  supplied the pages (three requests); 4.0.540 asks it for none, and six renders at once start without clashing.
- Text set in weight 900 comes out a step heavier in the default font stack on a Mac that has Pretendard or Apple SD
  Gothic Neo: Chrome 157 drew their ExtraBold for 900, Chrome 158 draws Black and Heavy as the CSS asks. The default
  sample's lyrics and the kit's heavy text change; fonts loaded with `loadFont` are not affected. Glyph edges are
  anti-aliased a little differently: across three real videos at 10 frames a second, `diff` finds nothing in one and
  no more than 0.4 % of a frame in a stretch in the others, and of the 34 gallery tiles two (the weight) and
  11 more by 1 to 79 pixels.

## 0.3.0 — 2026-11-02

### Changed
- `arm()` calls an arm folded into a V with the elbow up at a joint under 75°, not 70°. A standing figure's arm held out to a
  screen, the elbow half an upper arm above the shoulder and the forearm hanging (72.5°), passed the check and was a high
  finding for two blind reviewers. Replaying every arm of five videos at 10 frames a second (50 000 solves), 75° adds that
  one warning and no other; a sleeper's bent arm (79.5°) and a hand down on a lamp's table (78°) still pass.
- The README identifies the model and effort setting next to the video examples and notes that results can vary.
- The paper style renders about four times faster. A paper piece drew five filters in every frame (two noise passes, two
  blurs and its lit edge), and each is a pass of its own for the GPU, which Chrome runs on one thread: a 2:34 video took
  25 min to render at 1080p and 6 min as a draft. Shadows and lit edges are now paths, and the grain is two tiles of
  noise that Chrome draws once and the pack lays over each piece, so the same video takes 6 min and 1 min. Stills differ
  from the old ones no more than the old ones differ from themselves drawn with other noise seeds, `check` gives the
  same numbers and the files are about the same size. A piece lifted past 12 px, and an empty outline that shades drawings
  glued on it, still use filters.

### Added
- An `anime` style pack: `anime.AnimeHead` and `anime.AnimeBust` draw a cel-shaded cyberpunk-anime head (and
  shoulders in a high-collar jacket) in a front or a three-quarter view, facing either way. Eyes, brows and mouth
  are set by `expression` (`anime.faces` has six), the mouth moves with `talk` (`anime.mouthAt` for sung lines), the
  eyes look where `look` says and blink by themselves, and the rim lights flicker. The fringe is one swept shape that
  casts its shadow on the forehead, each clump has a shaded underside, the near side has a tucked ear and a cyan rim
  light, the far side a magenta one. `anime.Neon` lights a frame from two corners, and `eyeShot`, `SpeedLines` and
  `Split` make an eye close-up with a flash cut; the recipe `NeonCloseup` combines them. Gallery tiles 33 and 34.
  Heads only: no hands and no bodies below the jacket.
- A layered SVG brand kit with color, single-ink and reversed logos, icons, transparent raster exports, and a rebuild script. The README shows the logo in light and dark themes.
- Quality levels in the skill: medium, high (the default) and max set, phase by phase, how many agents draw, how
  many review and for how many rounds (one at medium, two at high, and at max a third when the second still found a
  high-severity finding), and at max a first round with one reviewer per lens (bodies, framing, continuity, motion,
  story, text and 9:16). In two videos, reviews found about 120 defects after every check had passed and a second
  round about 60 more; of 117 recorded, 54 % were framing, 46 % continuity, 44 % bodies. At high and max a fresh
  reviewer looks at the painters' pieces before the build. `briefs/review.md` groups what a viewer finds wrong by
  lens. On one song judged blind, the model mattered more than the level: Sonnet 5.5 left 7.6 high- and
  medium-severity findings per minute at medium and 5.3 at max, Opus 5.5 1.3 at high, and Sonnet builders with
  Opus painters and reviewers 2.8 at max, at a higher cost than either alone. The skill says to run every agent on
  the strongest model you have.
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
