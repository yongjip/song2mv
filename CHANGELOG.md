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
- The beat grid says where it does not fit. The grid keeps one tempo, but tempo and phase are fitted again in
  windows of 4 bars: where a tempo change, a drift or a beat that moved puts the music's beats more than half a 16th
  note off the grid for at least 2 bars, `grid.json` lists the stretch under `off_grid` (also in the `beats` result
  and in the `grid` of `lyrics.json` and `mv.json`), `warnings` says what was found and where, and `sync` leaves lyric
  words there at whisper's times instead of snapping them to 16th notes. A grid made before this is fitted again.
  `local_offsets` now has one 4-bar window per 2 bars instead of 20-second windows.
- `song2mv click`: a stretch of the song with clicks on the beat grid and ticks on the lyric words, so a person can
  check the timing by ear.
- `song2mv check` (experimental): per-line motion, coverage, chorus variation and cut rhythm of a rendered video,
  measured over the video's own stretch. Every result has `value` and `goal`; checks that cannot run on the
  stretch are listed under `skipped`. A goals file only needs the values it changes.
- `song2mv render` (experimental): Remotion lyric-video template, 16:9 and 9:16, `--hold` for hook cuts,
  `--template DIR` for your own scenes. `outputs` names exactly the files written.
- The template's lyrics are easier to read.
  - **Unsung words:** they are drawn at 50 % white with a tight dark shadow. At 32 % they had 2.7:1 contrast against
    the background, below WCAG's 3:1 for large text; now they have 5.3:1.
  - **Short gaps:** when the next line comes within 0.5 s, a line stays up until that line appears. Before, the
    screen went empty for up to 0.45 s (13 frames) between lines, 10–13 times per song.
  - **Long lines:** they wrap. Each word was its own span with no space between them, so a line too wide for its
    box ran off the screen, the big chorus line by up to twice its width. Words are now separated by real spaces.
  - **9:16 layout:** the title, the stage and the lyrics sit inside x 120–960, y 269–1248, clear of the app buttons
    and caption overlay on Reels, Shorts and TikTok. Before, the lyrics sat at y 1300–1460, under them.
  - **`check` in 9:16:** it measures the top 56 % of the frame, above the lyrics.
- A scene kit in the render template, for drawing a song's own scenes. Every piece is a pure function of song time,
  in one flat illustrated style:
  - **people:** a posable side-view `Person` with walk and run cycles, three outfits, three hair styles and four skin
    tones; a backlit `Crowd` that moves with the beat;
  - **places:** `City` by night, dusk and day, `Street`, `Room`, `Ground`, `Sea`;
  - **sky and light:** `SkyGradient` for dawn, day, dusk and night, `Sun`, `Moon`, `Clouds`;
  - **objects:** `Phone` with chat and call screens, `Clock`, `Heart`, `Car`, `Plane`, `Lantern`;
  - **effects:** `Rain`, `Fireworks`, `Confetti`.

  The `Kit-Gallery` composition shows them in 12 scenes: `npx remotion still src/index.ts Kit-Gallery gallery.png
  --frame=0`. The skill explains how to combine them.
- A song's scenes can draw the whole 9:16 frame. `src/scenes/index.ts` may export a `VerticalScene`, a component of
  song time drawn on 1080×1920; the short then shows it instead of the 16:9 scene shrunk into a band, and adds only
  the captions of lines the scenes don't draw, the flashes and the fade-out (no template sky, beat glow, title or
  vignette). The band put the template's starry sky and title around every concept, and a scene that drew its own
  lyrics left the bottom 45 % of the screen empty. Without a `VerticalScene` the short renders as before.
- A style pack for paper cut-out, `paper` in the scene kit (`src/kit/styles/paper.tsx`). The kit's people, places
  and objects are flat illustration; a style pack is a few drawing pieces that put any object in another art style:
  - outlines cut by hand: `rect`, `ellipse`, `poly` and `strip`, seeded so that a cut stays the same from frame to
    frame;
  - `Cut`, one piece of paper, whose shadow falls further and softer as its `lift` grows;
  - `Stack`, the paper's grain and a lit edge for every piece inside it;
  - a paper palette, and `step` for the held 12 steps a second of cut-out motion.

  Gallery tile 13 draws a room of everyday things with it. Packs live in `src/kit/styles/`, one namespace each, so
  that pixel, ink or watercolour packs can follow.
- Seven more scene-kit pieces, the first batch picked by a study of what 90 songs' videos call for (11 trial songs, 79
  JamendoLyrics songs): the kit covered 40 % of it, and the most-missed things that judges wanted as helpers came
  first. Each has a gallery tile (14–20):
  - `Camera`: one world drawn once and filmed as shots. A shot cuts in at a song time (a bar, a word), looks at a
    point with a zoom and a roll, may drift until the next cut or glide in; hits punch the zoom in. `cameraAt()`
    gives the same camera as numbers and as SVG or CSS transforms. Both concept demos had built their own.
  - `Hit`: a burst, a sparkle or a ring at a point and time.
  - `Flames`: a fire with wavering tongues in three layers, licks and embers, from a campfire to a candle.
  - `Storm` and `Lightning`: a storm deck made of the kit's `Clouds` hung upside down, lit from inside around each
    strike; forked or flat zigzag bolts that flicker like the real thing; `strikeFlashes()` for the kit's `Flash`.
    `Clouds` gets an optional `size`.
  - `Tears`: well up at an eye, run down the cheek leaving a wet trail, hang and fall.
  - A `lie` pose for `Person`, and a `Bed` (also `Room`'s `bed` and `sleeper`) with the sleeper under the blanket.
  - `Cash`: banknotes tumbling down, with no currency, letters or numbers on them.

  `Hit`, `Flames`, `Lightning`, `Storm`, `Tears` and `Cash` take their colours and shapes as props, so they fit any
  art style; their tiles draw each again flat on paper. The parts combine: one scale (`s` = 1 is a Person 300 px
  tall; `Tears` and `Bed` follow it), the line things stand on, and anchors (`personEye()` next to `personHand()`,
  `FlamesAlong` for an object's edge, a strike's `to` for a point). A recipe combines parts into a new asset in a few
  lines: `SleeplessStorm` (`src/kit/recipes.tsx`, tile 21) has someone lying awake in bed while a storm crosses the
  window, with a tear and the camera closing in. The gallery overview now holds 21 tiles.
- Adding to the kit by pull request. `CONTRIBUTING.md` says how to add an asset or a style pack: original drawings,
  MIT, no media files, the kit's rules, a gallery tile and a still. The pull request template asks for them, and CI
  renders every gallery tile and keeps the PNGs for 14 days as the run's `kit-gallery` artifact. Once a video is
  done, the skill offers the user its generic drawings back as a pull request.
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
- A pin in `manual` only constrains. Pinning a line inside a re-heard gap used to split the gap's window, and each
  piece was heard again with a shorter prompt over the whole old window, so re-heard lines that had been right moved:
  on a test song two pins sent the line after them 1.2 s early, into a pinned line, and two more pins moved eight
  re-heard lines, two of them by more than 5 s. Now a re-heard line keeps the time its earlier hearing gave it while
  that still fits between the placed and pinned lines around it; only the lines a pin contradicts, and lines no
  hearing timed, are heard again, and pins bound those windows. Nothing changes without pins. `reprompt.json` records
  the lines each hearing was for and the lines it timed; a file written before this is read as before.
- `--json` on every command; `schema_version` 1 on every JSON output. Errors exit 2 and, with `--json`, print
  `{"ok": false, "error": {"message", "kind", "hint"}}`; exit 1 only means `check` found a failing check.
- `AGENTS.md`, `CLAUDE.md`, `llms.txt` and the `song2mv` Claude Code skill.
