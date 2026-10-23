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
- A beat map for songs whose tempo drifts. AI-made songs can: of 12 Suno songs measured, 4 drift by 0.9–3 % and the
  best one-tempo grid misses their beats by 135–910 ms, so no `--bpm` fits them. When the fit check finds stretches
  off the grid and its 4-bar windows chain from 8th note to 8th note without a guess, `grid.json` gets `beats`, the
  time of every beat, and the bar start is found again on them (`downbeat_mod4`, `bar0`). The grid in `lyrics.json`
  and `mv.json` carries them too; lyric words snap to 16ths of those beats, also inside the stretches; sections start
  on their bar lines; `song2mv click` clicks on them; and the template's `grid.beatPos`, `grid.bar(k)`,
  `grid.pulse`, `grid.snap` and the new `grid.beatTime` follow them. On the 6 Suno songs that get a map, the beats'
  worst error against an independent beat tracker fell from 138–4315 ms to 5–22 ms and the mean onset strength on
  them rose from 1.5–3.9 to 3.2–5.5 (1.0 = random); a song that speeds up from 118 to 121 BPM now starts its
  choruses on the music's downbeat instead of 0.35 s after it. Songs that one tempo fits get byte-identical files.
  Songs whose beat jumps or whose pulse is too weak to follow keep the one-tempo grid (`beats` is `null`), as do all
  79 JamendoLyrics songs, whose benchmark is unchanged. A `grid.json` with stretches but without `beats` is fitted
  again.
- Swing. On a swung groove the 2nd and 4th 16th notes of each beat come late, and words snapped to straight 16ths
  missed them: on a boom-bap demo song, whose hats put those 16ths at 0.325 and 0.829 of a beat, snapping moved 29 %
  of the words by more than 50 ms, and in an A/B listen its listener preferred the words on the swung 16ths. `sync`
  and `song2mv beats` now measure where the hats put them, each from the beat's own peak (within 0.005 of a beat on
  synthetic swung drums), and when the groove is clearly swung — the 8th note straight, the two 16ths standing out
  and late by 0.05 of a beat on average (60:40 or more) — `grid.json` gets `swing`, the two positions, and the grid
  in `lyrics.json` and `mv.json` carries it. Lyric words then snap to the swung 16ths (`snap_per_beat` 4), on the
  beat map when there is one; the word ticks of `song2mv click --words` sit there; the template's `grid.snap(t)`
  follows it. 3 of the 79 JamendoLyrics songs and one of 11 Suno songs (on its beat map) come out swung; on the 3,
  words within 0.1 s of the annotations rose from 52 % to 63 % (all 79: from 55.1 % to 55.5 %; within 0.3 s and 1 s
  unchanged). The other songs get byte-identical files. A `grid.json` made before this is reused as it is:
  `sync WORK/song.json --from grid` measures the swing.
- Words pinned in `manual` keep the times you gave: they are no longer snapped to the beat grid. The sync log lists
  each word of a line the runs did not time at the time it keeps, then the vocal onset near it
  (`Beep, 66.26 (onset 66.52, +7 dB)`): its arrow (`Beep,@66.26→66.52`) read like a move, and one run opened
  `lyrics.json` to see whether its pins had been kept.
- Without a beat map, `sync` leaves the words in an `off_grid` stretch at whisper's times and snaps the words around
  it to 16ths, so a word just outside the stretch could snap across its edge, past a neighbour that kept its time, and
  come out of order with it; such a word now keeps whisper's time too. A first word placed at the song's start could
  snap to the 16th before 0 s; snapped times now stop at 0. Neither happens on the songs at hand: on the 79
  JamendoLyrics songs, both demo songs and 11 trial songs, 10 of them with stretches and no beat map, no word moves.
- `warnings` says when the tempo pick is uncertain: when the lyric line gaps chose another tempo than the one the
  onsets fit best, it names both. When the grid fits almost none of the song and the music's own tempo there drifts,
  the warning no longer names a `--bpm` taken from it (on a drifting song it advised 80 BPM, two thirds of the real
  tempo).
- `song2mv click`: a stretch of the song with clicks on the beat grid and ticks on the lyric words, so a person can
  check the timing by ear.
- `song2mv check` (experimental): per-line motion, coverage, chorus variation and cut rhythm of a rendered video,
  measured over the video's own stretch. Every result has `value` and `goal`; checks that cannot run on the
  stretch are listed under `skipped`. A goals file only needs the values it changes.
- `check` fixes from the first end-to-end run of the skill:
  - **The hit that opens a section is that section's.** A line sung into the next section is measured up to that
    section's start, or up to the last cut in the beat before it: a scene hits the downbeat it hears, which on a
    drifting tempo comes before mv.json's bar line. The run's two pre-chorus counts ended on the chorus downbeat and
    were blamed for the chorus hit: 12.2 and 11.6 against `motion.max`'s 9. They now measure 1.8 and 3.9.
  - **`text.min_font` reads font sizes only:** `fontSize` (`fontSize: 30`, `fontSize={30}`, `fontSize="30"`) and `size`
    on the kit's text: `Slam`, `Quiet`, `Captions` and the comic pack's `Balloon`, `Caption` and `Sfx`. It read any `size` prop, such as `Hit size={…}`, and missed
    `fontSize={30}` on SVG text.
  - **`--json` prints only the JSON.** The table went to stderr, so `> out.json 2>&1` was not JSON. Now nothing
    else is printed, ffmpeg's messages included.
- `check` after the second end-to-end run: **`variation.repeats` judges every chorus line pair on its own.** It
  passed on the mean over all repeated line pairs, and its message showed the first 8 pairs in song order, all from
  the verses: two hook pairs at 0.61 and 0.63 hid behind a mean of 0.28 (goal ≤ 0.55). A pair with a line in a hot
  section now fails when it is over the goal; other repeats are still judged by the mean, and `value` is the mean or
  the worst chorus pair, whichever is higher. The message and `pairs` list the worst pairs first. Both runs' final
  videos still pass (worst chorus pairs 0.30 and 0.48).
- `song2mv render` (experimental): Remotion lyric-video template, 16:9 and 9:16, `--hold` for hook cuts,
  `--template DIR` for your own scenes. `outputs` names exactly the files written.
- `render --template DIR` shares the cached Remotion install: while DIR's `package-lock.json` matches the bundled
  one, `DIR/node_modules` is a link to the install in `~/.cache/song2mv/template-<version>/`. Each song's copy used to
  run its own `npm ci` and download its own headless Chrome (455 MB, plus a 130–180 MB bundle cache); a new copy now
  takes under 1 MB and renders right away. Remotion keeps one bundle cache there, so switching between copies costs
  about a second of bundling. A copy whose lock file differs (made by another version, or with packages added)
  installs its own, as before, and a copy that already has its own `node_modules` keeps it (delete it to share).
- `render --draft` renders a video at 10 fps, the rate `check` measures at, named `…-draft.mp4`, for the render →
  check loop (`--still` ignores it). Its frames are the full render's frames 0, 3, 6, …, the ones `check` measures in
  both: `--hold` and the song time are in seconds, and the end fade is timed for 30 fps. On 30 s of each of the two
  demo songs, in 16:9 and 9:16, drafts rendered in 6.0–10.3 s instead of 14.4–24.8 s (2.4× faster), and `check` gave
  each draft the same results as its full render: the same passes and fails, the same cuts, per-line motion within
  1 %. The skill iterates on drafts and renders the finished video once. A template copy made before this has no
  drafts: `render` warns and renders at the full rate.
- `check` measures the frame at each tenth of a second. ffmpeg's default rounding took the frame 1/30 s later from a
  30 fps video, so a draft and its full render were measured on different frames: per-line motion differed by up to
  77 % on the demo songs, and one stretch failed `cuts.max_gap` as a draft only. On a full render, cuts can now be
  reported 0.1 s later, and a check right at its goal can flip (that stretch's longest gap without a cut went from
  6.0 to 6.1 s, goal ≤ 6).
- `check` says where a line failed. In the first new-user benchmark a pixel video took three more draft/check loops
  between "too still" and "frantic": the check named the line and its number, and the agent guessed which moment drove
  it (a camera drift, then two cuts on the hazard lights). Each failing line in `motion.min`, `motion.max` and
  `coverage.min` now has the stretch measured (`from`, `to`), the cuts in it and a `msg`; a still or empty line adds
  its part under the goal (`stretch`), a frantic line its biggest frame change (`peak`) and its motion without the
  cuts (`without_cuts`, which also leaves out the cut frames that `cuts` lists as one cut). The report prints them
  under the FAIL and also marks frantic lines in the table. With the benchmark's hazard-light cuts put back, the line
  reads `87.5–89.8 s: 9.18 (goal ≤ 9.0); biggest change at 87.6 s (44.6, a cut); cuts at 87.6, 88.9; 6.23 without the
  cuts`. Every other field is unchanged on that video's four versions. The skill's step 5 adds that in pixel scenes a
  whole-pixel camera step can count as a cut, how a held shot stays alive (a slow drift), and a contact sheet of every
  cut to find shots that come back: the benchmark cut back to one wide street shot about 30 times.
- A finished render is capped at 8 Mbit/s (x264 `-maxrate 8M -bufsize 16M` on Remotion's CRF 18), the rate YouTube asks
  for at 1080p30. The paper pack's grain ran near 14 Mbit/s, so a 4-minute video came to 440 MB, over many upload
  limits; at the cap it is about 250 MB, and at 2× it looks the same. Flat styles stay far below the cap and do not
  change.
- `song2mv render --max-mb N`: a finished video still over N MB is encoded again, in two passes, to fit (an upload
  limit such as 200 MB), with its sound kept as it is. `--cover T` writes a 1080×1080 cover PNG instead of a video: the
  16:9 frame at song time T, whole, over a darkened blur of itself filling the square (`NAME-cover-Ts.png`). Every
  upload of today's videos needed both by hand.
- Rendered videos played the song 43 ms after the picture: Remotion's AAC kept its encoder's 2048 samples of
  priming at the start, so every hit and lit word came that much before its sound. `render.mjs` now has Remotion mix
  the audio to WAV and encodes the AAC with Remotion's ffmpeg, which trims it: on a click track and on a demo song the
  sound is within a sample of the source, and the frames are unchanged. A template copy made before this still renders
  43 ms late; copy its new `render.mjs` or a new `--template` folder.
- The template's captions now give way to a line the scene draws as soon as that line starts after the caption
  line's last word. Before, they gave way only when the caption line ended, so a scene-drawn chorus line that came in
  on a pickup, before the last verse line ended, put two lyric lines on screen at the chorus hit. A chant drawn over
  the middle of a captioned line still leaves the caption up.
- `check` also measured the next line's lead-in as motion in the line before it: a cut a 16th before the next line's
  first word, as the guide advises, fell in the last frames of the line before, or in its middle when a short line
  is measured over its 1.5 s minimum, and made it frantic. A line's measure now ends before a cut from 0.2 s before
  the next line's first word on. A line whose only motion was that cut can now measure still, as it looks.
- `cuts.max_gap` counted a stretch without a cut in full when it ran on into a calm section, where long shots are
  allowed; now only its part outside such sections counts.
- `check` measured the whole video, also past the end of the stretch it reports (`--to`, or the song's end in a
  longer video): cuts after that end were listed under `cuts` and counted in their section's cut rhythm, and
  `cuts.max_gap` ran on to the first of them (a 4 s stretch reported a 6 s gap). Frames after the end are now left
  out: a video checked with `--to` gets the same results as the same video cut there.
- `check` measured a cut on a line's first word as motion inside the line: at 10 fps a cut 0.1 s after the word
  falls in the line's first frame change, and on a 1.4 s line that one cut alone read as frantic. That frame change
  now opens the line's shot and is left out of its motion.
- `sync` warned that `lyrics.txt` in the work folder "differed … and was replaced" whenever `song.json` pointed at
  another sheet, which reads like an error after an edit made on purpose. It now warns only when the work folder's
  copy was edited by hand since the last run (`state.json` keeps its hash).
- `theme.unsungShadow`: the shadow of words not sung yet, which was always dark. `"none"` suits a light background.
- The guide adds how to cut dense songs (a line every 1.5 s or less): not on every line of a mid section, big type
  that changes per line and large transforms count as cuts, and a reframe of a flat or dark set may not. It also says
  to run one render, still or sync at a time, and how `verticalView` takes a background that reaches above the stage.
- Without a terminal, `song2mv render` showed Remotion's rendering progress but not its encoding, so a final render
  could print nothing for minutes while it encoded, long enough for an agent's stall rule to kill a healthy render.
  Encoding now prints a line per 25% too, and each prints its latest count at least every 30 s.
- Music after the last sung line gets a quiet section of its own (`outro`, "(instrumental)", calm), as music before
  the first one already did, when it lasts over 4 s from the bar line after the last line. Before, it belonged to
  the last sung section: a song's 20 s instrumental ending counted as its last chorus, so the chorus look and
  `check`'s cut gap ran on to the end.
- A section header such as `[Final Chorus]` or `[Chorus Reprise]` took the first three letters of its name as its
  id (`fin`, a mid section). A name that ends or starts with a known one now takes that one's id and kind (`ch`,
  hot), and a name that comes twice (`chb`) keeps its kind.
- `render --draft` also renders at half size (960×540, or 540×960) with a faster x264 setting (`veryfast`, CRF 23):
  `check` measures at 320×180. A full-size draft of a 4-minute paper-cut song took 6–7 minutes and came to 391 MB. On
  30–90 s stretches of four trial songs and a pixel benchmark, paper-cut drafts rendered 3.0–4.7× faster (30 s:
  14–15 s instead of 54–69 s; 90 s: 36 s instead of 137 s) into files 6–7× smaller; scenes that already rendered 30 s
  in under 10 s gained less (1.0–1.8×). `check` gave every draft the same passes, fails, skips and cuts as at full
  size; per-line motion moved by 0.08 on average and 0.29 at most over 137 lines, except on one line that opens on a
  cut whose second frame sits on the cut threshold (correlation 0.631 against 0.619, a cut below 0.62): 1.1. Smaller
  drafts were no faster, and the paper pack's grain read as motion in them: at a quarter size motion rose by 0.39 on
  average, 50 lines moved by over 0.5 and a 90 s stretch lost a cut. Pixel scenes (`pixel.cameraAt`, `Pixelate`)
  stayed within 0.17 even at a quarter size. A template copy made before this renders drafts at full size; copy its
  new `render.mjs`.
- An interrupted `render.mjs` left its temporary folder, which holds a link to the song, behind. It now removes it on
  Ctrl-C, when Remotion fails, and when Remotion stops without writing a file (on Ctrl-C it exits 0). In that last
  case it now says which file was not written, where before it printed the path as if the file had been written.
- On Windows, `song2mv render` failed at its first Remotion call: the template's `render.mjs` ran `npx`, which is
  `npx.cmd` there and cannot be started without a shell. It now runs Remotion's CLI with the node that runs it, and
  a new CI job renders a still of the sample song on Windows. Run in a folder without an install, `render.mjs` says
  to run `npm ci` instead of letting npx fetch a package.
- `node render.mjs mv.json --composition ID --props FILE` renders a PNG of any composition with the song and the props
  in FILE. The skill's `Concepts` and `Contact` commands take a props file (`{"T": 33.1}`) instead of the shell's
  `$(cat ../mv.json)`, which neither PowerShell nor cmd has, and its commands no longer chain with `&&` or continue
  lines with `\`, which Windows PowerShell 5.1 does not take. The docs' install commands and `check --src` globs are
  in double quotes, which cmd takes too. Run directly, `render.mjs` prints each file it writes. A template copy made
  before this ignores `--composition` and `--props` and renders the whole song as a 16:9 video into `out/`, without
  an error: copy a new `--template` folder, or use the `npx remotion still … --props` command in the copy's
  `src/Concepts.tsx` or `src/Contact.tsx`.
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
- Layout help for a `VerticalScene`. In a new-user run, laying out a pixel video's tall frame took about 5 minutes,
  4 vertical contact sheets and a re-rendered short: the kit's drawing helpers assume 1920×1080, the street first sat
  small in the middle and then under the dialogue box, and the box ended 12 px outside the safe box. Now:
  - `VERTICAL` in the kit holds the 9:16 frame's numbers: the safe box for text (x 120–960, y 269–1248), the
    template's captions (y 1082–1240) and the picture area above them, where the subject goes (y 269–1080).
  - `verticalView(view)` films the 16:9 world for the tall frame: the point a view looks at (a shot's, or
    `cameraAt`'s) lands in the middle of the picture area, as large as in 16:9; the frame keeps on the stage's sides
    and top and runs on below its bottom, under the captions and the apps' buttons. In a pixel scene,
    `pixel.cameraAt(T, shots, { vertical: true })` films the shots the same way, on whole pixels, its zoom changing
    when the 16:9 version's does.
  - `Svg` takes `w` and `h` (1080 × 1920 fills the frame).
  - A vertical contact sheet draws the safe box and the captions' top as dashed lines (a crop sheet leaves them
    out).

  Ported to it, that run's short drops its hand-made canvas offsets and per-zoom y corrections and frames its shots
  as the hand-tuned version did, except one close-up whose subject the hand-made tall canvas had cut off, now in the
  picture; `check` passes it 6/6 as before. The skill's step 6 says where text, the subject and the ground go. The
  default template renders as before.
- Cut planning and storyboards in the scene kit, and a starter scene built on them. Writing scenes is the slowest part
  of a video: 12.7 of 23 minutes of a new-user run, and in five trial videos every agent wrote 750–1200 lines of
  scene code that rebuilt the same machinery (a cut list from an uneven bar pattern, a timeline of boards, big karaoke
  lines, a 9:16 refilm), while one lost about 30 minutes iterating cut plans on a dense rap song against `check`.
  - `planShots(ctx, from, to, framings)` (`src/kit/plan.ts`) plans a stretch's cuts, the framing each takes, its
    drift and the hits, so they pass `check` by construction: cuts on bar lines or a 16th before a line's first word;
    mid sections uneven (interval CV ≥ 0.42 where it can), no shot over 5.2 s, no cut inside a line under 1.8 s and
    never two in a short one, dense lines cut every 2–3 lines; calm sections held with slow drifts; hot sections on
    downbeats with a punch on each bar line; a drift on every shot; later copies of a section on the framings in
    another order; no cut between framings too alike to show it. It follows a song's beat map and swing; `pattern`
    sets bar counts of your own.
  - Boards (`src/kit/storyboard.tsx`): a `Board` starts at a line id, a section id or a time and films a `world`
    through its `framings` (and `tall` ones for 9:16), with optional `pattern`, `hits`, an `overlay` over the camera
    and `big` lines drawn with `BigLine`, low in the frame, below what `check` measures. `<Storyboard>` draws the board
    on at T, in 16:9 or, with `vertical`, as the `VerticalScene`; `linesDrawnBy` gives `linesDrawnByScene`. `BigLine`
    takes `x` and `width`.
  - The starter, `src/scenes/Starter.tsx`, not used by default: a whole video of kit worlds (hills, a street at dusk
    and in the rain, a room, a stage, fireworks, a beach) with a hero, a board per section by its role and copy, cut
    by the planner. An agent edits one marked block (what each part shows, the palette, the hero). Switching to it is
    one line in `src/scenes/index.ts`, which now exports `VerticalScene` with the other two in that line. Out of the box
    its drafts pass `check` on the sample song (6/6 in 16:9 and 9:16), both demo songs (9/9 and 9/9; 10/10 and 10/10)
    and two trial songs, a dense Korean rap (12/12 and 12/12) and a slow one with 8-second lines (11/11 and 11/11).
    Ported to the boards, one trial's 693-line scene became 615 lines and kept its `check` results (11/11 for the
    song, 6/6 for the short).

  The default scene, its stills and the gallery render as before.
- Fixes from the third new-user run, the first through the starter: 42.6 minutes against 30.7 for the run before,
  about 14 of them lost to what follows.
  - **Fonts.** `loadFont(family, url)` in the kit loads a font file imported from `src/` and returns the family for
    `fontFamily`; the compositions hold their first frame until every file has loaded (`useFonts`). The skill's
    concept step and the starter show it. The run had written Remotion's own pattern, a `delayRender()` at the top of
    a module, and Remotion's entry, which runs after the scenes' modules, drops such a handle: the font held no frame,
    and the timer left behind cancelled every render longer than its timeout. Drafts, stills and the short passed; the
    full render failed at frame 1493, and with a longer timeout and retries took 171 s, two batches of frames waiting
    58 s each. With the kit's loader the same video rendered in one go, its frames matching the delivered ones (under
    1 grey level apart on average).
  - **Drift over fine detail.** `drift` on `planShots`, a `Board` and the starter's `SHOW` scales every shot's push,
    pan and pull. Over the run's brownstone street, window grids, railings and stoop treads measured as motion under
    the planner's drift alone, 8–9 on most verse lines against `motion.max`'s 9; `drift: 0.5` on that street's boards
    took its verse lines from 5.4 to 3.6 on average (the highest from 8.9 to 6.5), with the same cuts and no line
    still. `check` says "the whole frame changes, as under a camera move over fine high-contrast detail" for a frantic
    line without a cut whose change covers most of the frame (70 % of a 4×8 grid in most frames): on the run's video,
    lines with a big mover in them measure 0.53–0.59, those with the drift alone 0.72–1.0. The skill says it under
    "Held shots".
  - **Boards keyed to lines.** `Storyboard` plans each section once across its boards (`planBoards` in
    `src/kit/plan.ts`): every board start is a cut of the plan, counted in the section's rhythm, and a section with
    boards at its lines cuts inside as few of them as an interval CV of 0.37 allows (check wants 0.35), inside none
    under 2.5 s if it can, since a board start cuts next to them; each board was planned alone, and its cuts inside
    2.2 s lines made the run's busy verses frantic. With the run's three outro boards two lines apart,
    `cuts.rhythm.ou` went from 0.32 to 0.43. Over its final boards, cuts inside the keyed sections' lines went from 13
    to 4, inside lines under 2.5 s from 8 to none (`v1-06`: 8.25 → 6.22), the verses' rhythm from 0.43 and 0.50 to
    0.39 and 0.43; one line got a cut its verse's rhythm needed (`v1-03`, 2.8 s, whose own motion of 8.25 then measured
    10.1), and with `drift: 0.5` on the street's boards every check passes. On 33 synthetic keyed sections the old
    planner missed `cuts.rhythm` in 10, this one in 4, all of them short outros keyed every 2 lines. A board keyed to a
    line now opens on its first framing in every copy of the section: verse 2's boards opened on their second one, the
    line's subject missing. The starter no longer adds a board every 8 lines in a section whose lines have boards of
    their own, and the skill says to key boards every 2 lines or more, unevenly. `planShots` plans one stretch as
    before.
  - **9:16.** The starter's `tall()` writes a 9:16 framing without `at()`'s clamp to the 16:9 stage, which had moved
    17 of the starter's own 28 tall framings off the points written (a wide shot written for x 800 looked at x 960, a
    close-up written for y 860 at y 762); its worlds use it. The skill says how far a close-up reaches below y 1080: the frame ends
    1245 / zoom stage px below the view's point, about 300 px for a 2× close-up of a subject at y 760.
- `song.json` sets the two effects the template's frame lays over every scene: `"vignette": false` turns off the dark
  vignette, and `"flashes": [[song time, strength 0–1], …]` replaces the white flash at the start of each hot section
  (`[]` for none). `sync` copies both into `mv.json`; without them `mv.json` is as before. Neither could be changed
  without editing the template copy: a concept with lit corners came out darkened, and on a song whose tempo drifts
  the flash, placed on the one-tempo grid, came 0.35 s before the chorus downbeat.
- A `Concepts` composition in the template draws every component exported from `src/scenes/concepts/index.ts` side
  by side at song time `T` (a prop, default 30), each labelled with its export name: the rough still per concept that
  the skill asks for before a concept is picked, in one command (in the skill's step 3). Nothing rendered concepts
  before, so both demo runs exported each one as `Scene` in turn, rendered a still of each and stacked them by hand.
  The template ships an empty `index.ts` there.
- A `Contact` composition in the template draws the song's `Scene` at a list of song times on one sheet, each frame
  labelled with its time: props `times` and `cols` (frames per row), and `vertical` for the 9:16 frame (the
  `VerticalScene`, or `Scene` in the short's band). Many moments cost one render; each `render --still` bundles again
  (about 5 s), so both demo runs built their own contact sheet to review a video. The skill's step 4 has the command.
  `crop: [x, y, w, h]` shows only that region of each frame, in the frame's pixels, scaled to the tile width (`cols`
  sets the zoom; the labels show it). Before the first full render the skill now asks for one crop sheet per character
  and per big-type moment: a whole frame on a sheet hides rough lines, seams, gaps and clipped text, and in the two demo
  runs the owner found three of them after delivery. Without `crop` the sheet is unchanged.
- `song2mv sheet`: a contact sheet of a rendered video. It tiles the video's own frames on a PNG, captions, title and
  strips included, each labelled with its song time and, with `--song`, the line sung then (or the section between
  lines). `--every S` takes a frame from the middle of every S seconds, `--times` the song times listed, and `--cuts` a
  frame 0.3 s into each shot of a saved `check --json` result, whose `from` and `song` it reuses; `--crop` and `--cols`
  work as in `Contact`. Each tile is the frame on screen at its time, and a sheet taller than about 2400 px continues
  on more pages. `Contact` draws the bare scene, so in four trial runs on one day every agent wrote its own script for
  the video, with labels from Pillow (Homebrew's ffmpeg has no `drawtext`); `-vf fps=1/3.5` labelled every frame
  1.75 s early, and a scene-only sheet could not show one run's worst defect, two lyric lines on screen at once at
  the chorus hit. The labels are a built-in bitmap font drawn with numpy and zlib writes the PNG, so the command needs
  only ffmpeg and numpy. The skill's step 5 makes a sheet after every `check`, at its cuts, and one of every full
  render. Without `--from`, a stretch keeps the start in the name `render` gave it (`song-9x16-49.72-72.2.mp4` starts
  at 49.72): one run's short was labelled with video time until its agent found `--from`.
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
  - A `lie` pose for `Person` (the face in profile with a shut eye), and a `Bed` (also `Room`'s `bed`, `sleeper` and
    `onBed`) with the sleeper under the blanket and the head sunk into the pillow; `over` draws what lies on the
    bedding, such as tears that leave a damp spot (`Tears` `spot`).
  - `Cash`: banknotes tumbling down, with no currency, letters or numbers on them.

  `Hit`, `Flames`, `Lightning`, `Storm`, `Tears` and `Cash` take their colours and shapes as props, so they fit any
  art style; their tiles draw each again flat on paper. The parts combine: one scale (`s` = 1 is a Person 300 px
  tall; `Tears` and `Bed` follow it), the line things stand on, and anchors (`personEye()` next to `personHand()`,
  `FlamesAlong` for an object's edge, a strike's `to` for a point). A recipe combines parts into a new asset in a few
  lines: `SleeplessStorm` (`src/kit/recipes.tsx`, tile 21) has someone lying awake in bed while a storm crosses the
  window, with a tear and the camera closing in. The gallery overview now holds 21 tiles.
- A style pack for pixel art, `pixel` in the scene kit (`src/kit/styles/pixel.tsx`):
  - `Canvas`, a picture of big square pixels drawn in code: boxes, discs, polygons, lines, dithered tones, a 5×7 font
    for Latin letters and digits, and `stamp` to put a sprite on with a dark 1-px outline;
  - `Pixels`, a canvas on the stage, `px` stage px to a pixel;
  - `Pixelate`, which turns anything inside it into blocks on the same grid, outlined if asked: type in any font
    (Korean from about 18 blocks to the em; lyrics stay crisp type) or any of the kit's drawings;
  - a palette, and `step` for the held 8 steps a second of sprite animation.

  Gallery tile 22 draws a corner shop at dusk with it, its sign in pixelated type.
  `Pixelate` samples the picture with one dot per block: where the stage is drawn smaller than full size (0.76 in the
  9:16 band), pass that size as `stageScale`, or the picture can flicker or vanish as it moves.
- Clean pixels and lines in the pixel pack. The first demo run's video looked right as a whole, but up close its
  characters' lines were sloppy: sprites scaled by 1.4 or 2.4 put blocks of different sizes in one shot and softened
  their edges, outlines doubled pixels on curves, and a cat built from discs read as a lump. Now:
  - `cameraAt`, the kit's camera for a pixel scene: the zoom rounds to a whole number and the frame to whole pixels of
    the world, kept on the stage, so every block on screen is `px` × zoom stage px. A close-up at 2× or 3× keeps one
    pixel size. A shot that changes the zoom cuts on its time, glide or not, since blocks can only change size in one
    jump; a glide or drift at one zoom pans by whole pixels.
  - `Pixels` rounds its pixel size and place to whole stage px and draws each block exactly that size; the last block
    of a run was 1 px wider.
  - `sprite(rows, palette)` draws a character from a character map, a string per row and a character per pixel.
    `stamp` fills a silhouette's inside corners before it outlines it, so the 1-px outline turns them on a diagonal
    instead of an L of three pixels, and a 1-px `line` is pixel perfect: no doubled pixel where it turns (a bicycle
    wheel had 15).
  - `Pixelate` grows each block from one sampled pixel to exactly its size (blocks were 7 to 9 px and could mix the
    colours of two neighbours) and outlines across and down, one block wide, instead of in a square that doubled
    every diagonal step. Under `cameraAt`, pass the camera's zoom as `stageScale`: up close, a block sampled with a
    dot wider than one screen pixel came out a pixel short or off the grid.

  Gallery tile 22 redraws its walker as a girl in four walk frames and adds a cat asleep on the vending machine, a
  plant, a bicycle parked by the shop window and a car, all character-map sprites. Its camera cuts in to 2× on the cat
  at 10.5 s, to 3× on the girl walking into the sunset at 13 s, and back out at 14.25 s (render the tile with
  `--props '{"T": 13}'` to see the close-up).
- Type for the pixel pack. A new user's pixel video needed big outlined letters and its lyrics in pixel type, and the
  pack had neither, so the agent wrote both (3 of its 35.5 minutes). Its first big letters, `text` with a shadow put
  on with `stamp`, had ink specks inside: `stamp` rings every gap, and a shadow one bit down and right leaves small
  gaps between the letters and their shadow. Now:
  - `BigText`: the 5×7 font at a whole-number `scale`, two-tone with `lower`, a drop `shadow` one bit down and one
    block of `outline` round all of it. A gap the shadow nearly fills takes the shadow's colour and a one-block slit
    the outline's, so no speck is left. `width` wraps it, stepping the scale down while a word alone is wider, and
    `t` pops it in once.
  - `Dialog`: a game dialog box that letters the line being sung, sung words lit and the rest dim, wrapped and set
    once per line, so no word moves; a line longer than its `rows` turns the page when the singing reaches the next
    one.
  - Both letter text the 5×7 font lacks, such as Korean, from a font (`font`, else the theme's font stack) at 16
    blocks to the em per scale, weight 500, each glyph drawn at the quarter-block shift that leaves the fewest
    half-covered blocks, so its strokes land on whole blocks. Measured with Pretendard, the stack's first font: tried
    at 10 to 20 blocks and weights 500 to 800, bold strokes merge (a doubled consonant became one blob at 12 and 14),
    and at weight 500 a syllable with two final consonants still clumped at 14 and read at 16; without the shift,
    strokes fell between blocks and came out doubled or missing. At 16 blocks Apple SD Gothic Neo, a stock Mac's
    fallback, reads but rougher (thinner strokes, short bars cut to one-block stubs; weight 600 merges them instead),
    and Noto Sans KR, the same Hangul as Noto Sans CJK KR, reads cleanly at its regular weight. The guide says so,
    and to import a font file and pass it as `font` for the same letters everywhere.
  - Under `BigText`'s shadow a gap one bit tall between two strokes takes the outline's colour where it is two bits
    wide or more, so dense Hangul does not turn into stripes of face and shadow (a narrower gap keeps the shadow's,
    or it would be an ink speck); a bright shadow still leaves its colour inside syllables with two final
    consonants, so the guide asks for a dark one.
  - The 5×7 font covers all of ASCII (`` $ @ [ ] { } \ | ^ ` ~ `` are new). Before choosing a face, `BigText` and
    `Dialog` spell look-alikes plainly (`Ø` as O, `«` as `"`) and drop symbols the font lacks (music notes, emoji),
    so a `~` or a music note in one line keeps the 5×7 look; only letters it lacks, such as Korean, set every line
    in `font` (a two-row `Dialog` then grows from 25 to 44 blocks tall).

  Gallery tile 24 shows both on a 16:9 night street and on a tall panel in Korean.
- `pixel.Pixelate` takes a `shadow`: a copy of the blocks one block down in that colour, inside the outline. A second
  `Pixelate` under an outlined one, offset sideways as a shadow, showed through each open diagonal corner of the
  outline as a speck.
- A style pack for comic pages, `comic` in the scene kit (`src/kit/styles/comic.tsx`):
  - `Page`, the paper (1920×1080, or 1080×1920 with `w` and `h`), and `Panel`, a box on it that films the scene with
    its own camera (the kit's `shots`, `hits` and punch) and pops or slides in at `t`; `layout` splits a page into
    rows of panels;
  - `Ink`, which prints its drawing twice: the colours a few px off register, then ink outlines over them, heavier in
    close-ups (`contour` for characters, below). One `Ink` per layer, back to front, since an `Ink` draws its lines
    over its own colours only. `Flat` marks colour without a line, and `Dots` are Ben-Day dots that keep their size
    on the page at any zoom;
  - `Balloon` (speech, shout or thought) and `Caption`, which letter a `Line` word by word as it is sung, unsung words
    ghosted, and `Sfx`, sound-effect lettering that slams in once and holds still;
  - a palette, and font stacks for lettering and display type.

  Gallery tile 23 draws a kitchen morning as a comic page: the wide panel frozen just before the toaster pops, then
  close-ups of the pop, the face and the cat. The second demo run, drawn as a comic, had to build this engine in the
  song's copy before it could draw the song.
- Clean character lines in the comic pack. The second demo run's video looked right as a whole, but up close its
  characters' lines were sloppy: every part of a figure (head, arms, body, knees, a bun) was outlined on its own, so
  lines ran through the figure where the parts met, every line had the same weight, and the off-register colour
  pushed faces, hair and a cup out of their lines. Now:
  - `Ink contour` draws one heavy line round the outside of everything in it, a little heavier on the side away from
    the light, and prints its colour in register. Inside, only what is asked for draws a line, `inner` wide (half
    the contour by default): paths with `fill="none"`, shapes in an `Edge`, and `Brush` strokes, which swell and
    taper like a brush line. `brushPath` gives that outline as a path to fill, for limbs and tails. A plain `Ink`
    still outlines every shape over off-register colour, for backgrounds and big shapes.
  - Contour and inner lines grow with the camera's zoom like the pack's other lines (by its square root), so the
    contour stays twice the inner line in every panel.
  - `Flat` and `Dots` draw only in an Ink's colour layer, so a Ben-Day pattern's id is no longer defined three times.
  - A shout balloon's tail is a straight wedge from inside the burst, so a short tail shows between the spikes
    instead of as a thin sliver.

  Gallery tile 23 redraws its person and cat with them: one outline round each figure, an elbow whose crease starts
  on the arm's outline, fingers round the mug, tapered features, Ben-Day dots on all skin, and puffed fur and hair
  drawn as tufts, the fur's dips rounded so the outline keeps its weight in them.
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
- `check_by_ear` also lists a line with a word no run timed between words more than 1 s apart per word. Such a word
  is spread evenly between the words around it, and that gap is a held note or a wrong time on one side: on a test
  song one run timed a line's last word 1.6 s late from a single matched letter, and the word before it, which no
  run heard, was spread into the gap. The `sync` log says `◀ no run timed "…", N s between the words around it`. On
  the JamendoLyrics benchmark the list grows by 10 lines, to 331, and in 6 of them that word is more than 1 s off.
- `check_by_ear` also lists a line spread over far more time than it is sung in: two neighbouring words more than 3 s
  apart, the line lasting more than 2.5 × its word count × the song's median time from one word to the next, or words
  heard off the sheet (`off_sheet`, below) between its first and last word. Such a line was matched in two places: on
  a Suno song whose sheet had the hook's couplet once and the song twice, one line stayed on screen for 8 s with its
  last two words 6 s late, and the list was empty. The `sync` log says `◀ hk1-06 spread out: 5.9 s between "wish"
  and "me"`. On the JamendoLyrics benchmark the list grows by 23 lines, to 354, and 19 of them have a word more than
  1 s off; at 2 s and 2 × it would have grown by 83, 34 of them with a word more than 1 s off.
- Where a lyric sheet (`--lyrics`) and the audio's lyrics tag differ, `warnings` names the lines that differ and says
  which of the two the whisper runs support there (`the audio's lyrics tag repeats hk1-05–hk1-06 "…", which the lyric
  sheet has once; the whisper runs support the tag here`). Each version is aligned to the runs, and around each place
  the one whose letters they match better wins. Of two Suno songs, the sheet was right for one (its tag repeats a line
  that is sung once) and the tag for the other (its sheet has a couplet once that is sung twice); `sync` says so for
  both.
- `off_sheet` in the `sync` result, with a warning for each: stretches of at least 1.5 s where two or more whisper runs
  agree on two or more words that no lyric line matched, such as a chant or an ad-lib the sheet leaves out, a line
  sung differently, or a repeat the sheet has once. Before, such words were dropped and nothing said so. On a Suno
  rap song it lists the intro chant that two runs hear and no line holds, and the second copy of the doubled couplet
  in both hooks. On JamendoLyrics, whose lyric files hold every annotated word, it lists 24 stretches in 17 of 79
  songs: ad-libs and vocalisations the files leave out, and lines the runs heard where the merge did not place them.
- `check_by_ear` also lists what a new user's run on a Suno rap song found by reading the raw runs, with the list
  empty: a whisper line with three words inside 0.1 s (the runs heard only "Brooklyn" of "Beep, beep, Brooklyn"), one
  whose runs start it more than 0.7 s apart (one run timed "One", two heard "1"; the line started 0.35 s late), one
  with a word more than 0.5 s from every run's time for it (two runs that disagree, merged to their middle), and a
  repeat the runs hear alike and not as written while two or more of them hear another copy of it as written, with a
  warning that says what they heard (`hk1-07 "Beep, beep, I'm parallel" is heard as "Back it up, I'm parallel"
  (runs 1, 2, 3), and hk1-05, the same line, as written`: Suno sang that repeat differently from its own lyrics tag).
  The log says `◀ hk2-08 stacked: …`, `◀ runs disagree by …` and `◀ no run times "…" near …`. On the JamendoLyrics
  benchmark the list grows from 354 to 425 lines, its recall for lines that start more than 1 s off from 68.6 to
  75.4 % and more than 0.3 s off from 33.4 to 38.7 %, and its precision by line start falls from 50.0 to 48.2 %
  (> 0.3 s); 56 of the 65 lines added for timing have a word more than 0.3 s off. The changed-repeat warning names 8
  lines in 7 of the 79 songs, all whisper mishearing one copy of a line the same way in every run, and none on 12
  Korean Suno songs; with one run enough for the other copy it would name 10 and 3, and without the other copy as a
  check 44 and 20. So the guide has the agent ask the user, with both versions, before the sheet changes. No word
  time changes.
- A section named calm (intro, bridge, outro …) that `music.json` measures about as loud as the mid sections — a
  median loudness less than 2 dB under theirs — is `mid`, with a warning (`br [Bridge] is about as loud as the mid
  sections (median -10.3 dB, theirs -9.4 dB): kind mid, not calm`). On AI-made songs a bridge or outro is often as
  loud as the verses: of three Suno songs with section names, all three bridges and outros were, and a calm section
  is spared the cut-gap and cut-rhythm checks and held to a lower motion floor, so a still, boring stretch passed
  `check`. The intro of the new user's song, 3.9 dB quieter, stays calm. Kinds set in `section_kinds` and the
  instrumental section before the first sung line are kept; JamendoLyrics has no section names, so its kinds do not
  change. `music.json` is now measured before `lyrics.json` and `mv.json` are written.
- Sections for a lyric sheet without `[Section]` lines. Such a sheet (a music platform's export, many lyric sites)
  made the whole song one `mid` section: no hot chorus or chorus flashes in the default look, nothing for
  `variation.repeats` to compare, `cuts.rhythm` judging the song as one verse, and in two trials agents spent 4–6
  minutes writing the headers by hand. `sync` now proposes sections from the lines that repeat and uses them: the block
  of lines sung most often again (word for word or nearly, one line in a copy may differ) is the chorus; lines only
  some copies have before (after) the ones all have are a pre-chorus (post-chorus); the lines between copies are
  verses; a short stretch after two choruses, right before another, is the bridge; a short stretch after the last
  chorus is the outro. `warnings` lists the sections and how to change them, and the sheet with them goes to
  `lyrics.sections.txt` in the work folder, to edit and pass with `--lyrics` (an edited one is kept). On six sheets with
  section names, stripped of them, the proposal marks 88 of the 102 chorus lines and 2 other lines as chorus, starts 32
  of the 34 sections it proposes within a line of a named section's start (of 54 such starts), and gives 360 of the 416
  lines the kind their names give (235 as one section). A sheet without repeats is still one section, now with a
  warning; a sheet with `[Section]` lines gives byte-identical files. JamendoLyrics has no section lines: 69 of its 79
  songs now get sections, and every word time, line source and `check_by_ear` list stays the same.
- Words before a line's first timed word start no earlier than a 16th note after the last word of the line before.
  Spread 0.3 s apart, they could start under that line's last words, which then never lit up: the captions switch to
  the newer line. On JamendoLyrics 69 words move, 45 of them closer to where they are sung; words within 0.3 s go from
  88.92 to 88.93 %.
- Numbers whisper writes in digits match the lyric sheet's letters. Whisper writes the numbers it hears as digits
  ("29" for "twenty nine", digits and a counter for a Korean time the sheet spells out), and `sync` matches letters,
  so those words got no time of their own and their lines looked weak: on a Korean song whose title, a time, is sung
  13 times, every line with it had a coverage around 0.5, and a line all three runs heard alike was listed under
  `check_by_ear` as placed by one run. Before matching, the digits of the sheet and of the runs are spelled out in the
  sheet's language: Korean when most of its words are in Hangul, with native numerals before the counters that take
  them (hours, ages, things, people, times, ordinals) and Sino-Korean otherwise (minutes, days, months, years, money);
  English when common English words make up a tenth of it, with cardinals and ordinals (21st). Other languages keep
  their digits, and so do codes such as B2B or MP3. A line whose first word is a number now also gets the first-word
  rule.
- A token without a letter or a digit is not a word. A "/" between two phrases of a line got a time of its own and
  showed up in the captions, `song.words.lrc`, `song.lrc` and `song.srt`. It stays in the line's `text` in
  `lyrics.json` and `mv.json`, where a scene can split on it, but not in `words`; `song.lrc` and `song.srt` show a
  line's words, as the captions do. A `manual` pin for such a line counts the words without it.
- `--json` on every command; `schema_version` 1 on every JSON output. Errors exit 2 and, with `--json`, print
  `{"ok": false, "error": {"message", "kind", "hint"}}`; exit 1 only means `check` found a failing check.
- `AGENTS.md`, `CLAUDE.md`, `llms.txt` and the `song2mv` Claude Code skill.
- The agent guide ships in the package. The wheel carries the skill and `AGENTS.md` in `song2mv/guide/`, and
  `song2mv --help` and the help of every command print the installed skill's path, under a line telling a coding
  agent to read it first. Before, the skill lived only in this repository and the help linked to AGENTS.md on GitHub,
  so an agent working from a pip or uv install never saw concepts first, `check` or the 9:16 safe box. A test reads
  the skill, `AGENTS.md` and `llms.txt`: every `song2mv` command in their code (chained with `&&`, `;` or `|` too)
  must exist, every flag in their code or prose must exist (on that command when one is named), and a value given to
  `--aspect`, `--downbeat` or `sync --from` must be one of its choices.
- The skill, after making two videos with it:
  - **Checkpoints don't block.** The agent shows the concept stills with its pick and the reason in one line, and
    the song map, and keeps going; the user can redirect it. It decides timing by measurement, makes the ear-check
    clips anyway and lists the spots nobody has heard when it delivers. It waits only for the song's rights or a
    lyric only the user knows. In the second run, 55 of 140 minutes went to waiting for answers nothing needed yet.
  - **The first `sync` passes `--title`** (in AGENTS.md and the README too). Step 0 asks for the title, but the
    command left it out, so the LRC and the video carried the file name until `song.json` was edited.
  - **Where a lyric sheet and the audio's lyrics tag differ,** the tag is usually what Suno sang, and the whisper runs
    show which is right. For one song the sheet was right (the tag repeats a line that was sung once); for the other
    the tag was (the sheet has a couplet once that was sung twice, and the missing copy's words were pulled into the
    lines around it, one of them on screen for 8 s, with `check_by_ear` empty). The runs also show chants and changed
    lines that neither has.
  - **A concept names its typeface** along with its palette and texture: an OFL font file imported from the template
    copy's `src/`, not a system font, which differs between machines. `song2mv render` ignores the copy's `public/`:
    a font there shows in `npx remotion still` but falls back to sans-serif in every `song2mv render`.
  - **Making the song too?** Name a BPM in the style prompt: the song whose prompt named 92 BPM kept it, the one
    whose prompt named no tempo drifted.
  - **`--hold` is checked with `--still` at from + hold** before the short is rendered. The example's 0.17 s, from
    another song, would have frozen the second song's lettering mid-pop; the command now leaves the value open.
  - **Text is at least 36 px on screen,** and `check` reads only the size literals in the source, not what a camera
    or a `scale()` makes of them.
