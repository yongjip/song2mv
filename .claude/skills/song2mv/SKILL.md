---
name: song2mv
description: Make a beat-synced music video or lyric video for a song, drawn in code — lyric and beat timing, scene design, 16:9 and 9:16 renders, objective checks, fixes. Also for synced lyrics only (LRC, SRT, word-timed JSON) or a song's beat grid. Use when the user asks for a music video, lyric video, visualizer, karaoke video, Shorts/Reels clip, LRC/SRT or beat timing for a song file.
---

# Music video from a song (song2mv)

You turn one audio file into a music video whose every frame is code (React/SVG in Remotion), synced to the song's
beat and lyrics. `song2mv` has the tools; this file is the order to use them in and what to watch for.

The loop is: **timing → scene design → render → check → fix**. You cannot hear the song, so every judgement that
needs ears goes to the user as a short clip or click track that makes it a ten-second check.

**Checkpoints don't block.** At each one, show the user what you have, with your pick and the reason in one line,
and keep going; they can redirect you at any time. Decide timing by measurement, send the ear-check clips anyway and
list the spots nobody has heard when you deliver. Wait only for what you can neither measure nor recommend: the
song's rights, or a lyric only the user knows.

## 0. Before anything

- **Rights.** Ask whose song it is and whether the user may publish a video of it (AI music services' plan terms
  count). Never copy the song, its lyrics or renders into a repository; everything song-specific lives in the work
  folder (`song2mv-work/<song>/`).
- **Setup**, once: `uv tool install --python 3.13 "song2mv[sync] @ git+https://github.com/yongjip/song2mv"` (not on
  PyPI yet; faster-whisper has no Python 3.15 wheels). Needs ffmpeg; `render` needs Node 18+ and installs Remotion
  (~570 MB) on its first run.
- **What they want**: full 16:9 video, 9:16 short(s), LRC/SRT only, or all. Title text. Mood or references. If you
  make the song too (Suno and the like), name a BPM in the style prompt: it tends to give a steady tempo.

## 1. Timing

```bash
song2mv sync <audio> --lyrics <lyrics.txt> --language <code> --title "<title>" --json   # run in the background; minutes
```

`--lyrics` is optional when the audio has a lyrics tag (Suno writes one). If you also have a lyric sheet, pass it:
where it and the tag differ, `warnings` names the lines and says which of the two the whisper runs support there (for
one song the sheet was right, for another the tag). `off_sheet` lists stretches where the runs agree on words that no
line matched: chants, ad-libs, changed lines, a repeat the sheet has once, or a line of the sheet placed elsewhere
(its words are on the sheet; that line is then usually on `check_by_ear`). Sync again with a sheet that matches what
the runs heard (`<work>/asr/run*.json` has every word), and put the stretches you add into the user's ear check. Read
the progress log and the JSON:

- **Section parsing** (`── [Chorus] → ch1 (hot)`): are the kinds right? A section named calm (a bridge, an outro)
  that is about as loud as the verses becomes `mid`, and `warnings` says so. Fix with `section_kinds` in `song.json`.
  Lines in `( )` were skipped as stage directions unless their section is in `keep_parenthesized_in`.
- **`◀ no run found this line` / `◀ only run [k]` / `◀ runs disagree`**: weak spots. More runs help
  (`--runs 5`, finished runs are reused). A bigger model (`--model medium`) helps more but is slower.
  `◀ back in lyric order (was at T)`: the merged runs had put the line on another copy of its words, so it was
  merged again from the runs that kept the sheet's order; check it by ear.
- **Tempo line** (`→ 90.00 BPM ... 53% of lyric line gaps are whole bars`): if the fit is low or a close runner-up
  exists, say so. **Bar start** (`beat % 4 == 3`): a guess from the kick drum.
- **Grid fit** (`grid fit, 4-bar windows …: off 3:02–4:10 (shift, 90 BPM)`, and a warning per stretch): the song
  leaves the grid's one tempo there, and `grid.json` lists it under `off_grid`. AI-made songs can drift in tempo;
  `sync` follows the drift with a beat map (`beat map: … beats` in the log, `beats` in `grid.json`), and words,
  `grid.pulse`, `grid.bar` and the clicks follow it. Without a map (`no beat map`), words there are not snapped, and
  motion driven by `grid.pulse` or `grid.bar` will miss the music there: drive those stretches by line and word
  times instead. Put a click track over the start of the stretch. A warning that the grid does not fit the whole
  song names a `--bpm` to try; `the tempo pick is uncertain` names the tempo the onsets prefer.
- **Swing** (`swing: the hats put the 2nd and 4th 16th notes … at 0.325 and 0.829`, `swing` in `grid.json`): words
  and `grid.snap(t)` sit on those swung 16ths; let the user hear the word ticks of `click --words` over a dense verse.
- **`check_by_ear`** in the JSON: lines filled by re-listening (`reprompt`), estimated, placed by only one whisper
  run, out of the lyric sheet's order (a repeated line on another copy of its words), with a word no run timed
  between words far apart (the log names the word: `◀ no run timed "…"`; the words around it may be off too), or
  spread over far more time than they are sung in (`◀ … spread out: …` in the log: usually split between two copies
  of a repeat the sheet has once; look for an `off_sheet` stretch or a tag warning next to it), with three words at
  almost one time (`◀ … stacked: …`), with runs that disagree by more than 0.7 s (`◀ runs disagree by …`) or on a
  word (`◀ no run times "…" near …`), or heard alike by the runs but not as written while another copy of it is
  (a warning `… is heard as "…"`: Suno changed that repeat, or whisper misheard it the same way in every run, which
  is what every such warning on the JamendoLyrics benchmark was; put the line into the user's ear check with both
  versions, as written and as heard, and change the sheet only after the user confirms). Most likely wrong. A warning
  "heard N times" names the other times a re-heard line was heard: make the click track cover them all.

Then make the ear check cheap for the user:

```bash
song2mv click <work> --from <chorus start - 4> --to <+12> --words      # → <work>/click-<from>-<to>.wav
```

Send it with the question: do the clicks sit on the drums, is the high click on the "one", do the word ticks land on
the syllables? Meanwhile decide by measurement: where the whisper runs agree, the grid fit, a repeated section's
timing. Fix with `"bpm"`, `"downbeat_mod4"` and `"manual": {"<line id>": [word start times]}` in `<work>/song.json`,
then `song2mv sync <work>/song.json` (only cheap steps rerun). Shouts and chants nearly always need a few `manual`
values. A pin only constrains: re-heard lines around it keep their times while they still fit between the pins, so
pin only the lines that are wrong; a re-heard line a pin contradicts is heard again and stays on `check_by_ear`.

Outputs in `<work>/`: `grid.json`, `lyrics.json`, `mv.json` (the template's input), `song.lrc`, `song.words.lrc`,
`song.srt`, `music.json` (loudness and section boundaries). If the user only wanted subtitles, you are done here.

## 2. Baseline render

```bash
song2mv render <work>/mv.json --from <a hot section start - 6> --to <+10> --aspect both
song2mv render <work>/mv.json --still <time> --aspect both          # PNGs you can look at
```

Look at the stills yourself. This plain lyric video is the floor: captions in time, sections coloured by energy,
choruses big. Show it to the user early — sometimes it is all they need.

## 3. Concept, then the song map

Every song gets its own look. One kit or template applied to every song makes every video look alike, so the look is
decided before you touch the kit.

**Propose two or three concepts and pick one.** They must differ in more than colour: a different art style and a
different central image. For each, write:

- **Idea:** one line, the image that carries the song, taken from its lyrics and mood.
- **Art style:** what fits this song, not what is quickest to build. Some options:
  - flat illustration (the kit's own style);
  - paper cut-out with drop shadows (the kit has a style pack for it), or ink lines on paper, or chalk on a
    blackboard;
  - pixel art (the kit has a style pack for it too), or a retro VHS / photocopy look;
  - collage, or watercolour washes;
  - an isometric miniature;
  - kinetic typography only, or neon signs on brick.
- **Palette, texture and typeface.** The typeface is part of the look: rather than a system font, use an OFL font
  file imported from `src/` (`song2mv render` ignores `public/`), and check stills on the machine that renders.
- **Main character or motif,** and how it changes over the song.
- **First chorus:** how it hits, the song's biggest moment.

Make each concept concrete enough to picture: one rough still each, shown side by side with your pick and the reason
in one line. Copy the template now (step 4's first command), draw each concept as a component of `T` in
`<work>/video/src/scenes/concepts/`, export it by name from `src/scenes/concepts/index.ts`, and render them all at one
moment, such as the first chorus' downbeat: write that time into `<work>/video/concepts.json` (`{"T": 33.1}`) and run
this in `<work>/video`. It prints the PNG's path. Each concept is drawn alone, without the template's sky, captions
or vignette:

```bash
node render.mjs ../mv.json --composition Concepts --props concepts.json
```

A copy made by an older song2mv has a `render.mjs` that does not know `node render.mjs --composition`: it renders the whole song as a 16:9 video into
`out/` instead, and prints no PNG path. Stop it and use the `npx remotion still … --props` command in that copy's
`src/Concepts.tsx` (`src/Contact.tsx` for contact sheets), or make a new `--template` folder and move `src/scenes/`
and any kit changes into it.

**Then the song map** for the chosen concept, `<work>/map.md`. Show it to the user and carry on:

- Per section (from `mv.json` sections; `<work>/music.json` has the loudness curve and likely boundaries): bars,
  energy (rising / peak / falling), what the lyrics say, **one visual idea**, colour.
- **One main character or motif** that carries through the whole song and changes with it. A video with a
  protagonist is more watchable than a slideshow of effects.
- **Hit points**: the first beat of each chorus, drops, the last word. These get the biggest moment (cut, flash,
  slam). Use `grid.bar(k)` and line/word times — never hand-typed seconds.
- **Contrast**: chorus 2 must not look like chorus 1 (the check measures it). Verses cut on an uneven rhythm
  (2 bars, 1 bar, 3 bars …), not every bar.
- **Text**: which lines become big type in the scene (`Slam`, `BigLine`), which stay as bottom captions.

**Then get the pieces, in this order:**

1. **The concept decides.** Pick it first (above), then look in the kit for what fits it, not for a concept that fits
   the kit.
2. **Reuse what fits the concept's style.** A style pack in `src/kit/styles/` puts any object in one art style
   (`paper`: cut-out pieces with shadows and grain; `pixel`: sprites on a canvas of big pixels). The kit's own pieces
   are flat illustration: they fit a flat concept and look out of place in any other, unless a pack restyles them
   (`pixel.Pixelate` turns any of them into pixels).
3. **Change your copy.** The song's template copy (`--template`, step 4) is yours: change a kit piece or a pack there
   (a colour, a shape, another pose) instead of working around it. Upgrades never touch it.
4. **Draw what is new** in the concept's style. With a pack, draw it from the pack's pieces. Without one, build the
   style first (an ink line, a watercolour wash) and draw the song's objects on top. The kit's timing and
   motion code works in any style:
   - `useSong()` and `grid`;
   - `Camera` and `cameraAt()`, `Drift`, `liveLine`, and the easing and `rng` helpers in `math`;
   - the helpers that take their colours and shapes as props: `Hit`, `Flames`, `Lightning` and `Storm`, `Tears`,
     `Cash`;
   - how `effects.tsx` times its particles.

Before rendering the whole song, test a frame: if it could sit in the kit's gallery unchanged, it is not this song's
video yet.

Ask yourself honestly: would a stranger watch this past the first chorus? If the answer is "it is correct", it is
not done — make it funnier, stranger, more specific to this song.

## 4. Build scenes

```bash
song2mv render <work>/mv.json --template <work>/video --still 1      # first use copies the template there
```

Write the song's scenes in `<work>/video/src/scenes/` and export them from `src/scenes/index.ts` (`Scene` and
`linesDrawnByScene`). Draw them in the chosen concept's style, and take what fits from the kit in `src/kit/`.

**The frame comes from the song config.** Around your scenes the template draws a background, the title and the
captions in `theme`'s colours and font; in 9:16 its starry sky fills the screen above and below the stage. Over the
scenes it lays a dark vignette, and a white flash at the start of each hot section, placed on the one-tempo grid.
Left at the defaults, they put the kit's neon night around every concept, and the title is the file name. Set `title`
and `theme` (`bg`, `stars`, the text colours, `font`) in `song.json` to fit the concept; `"vignette": false` keeps the
scene's corners as drawn, and `"flashes": [[song time, strength 0–1], …]` puts the flashes on the song's real hits
(`[]` when the scenes flash themselves). Then run `song2mv sync <work>/song.json --from build`.

### The scene kit

Look at it before you design anything (in `<work>/video`):

```bash
npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0   # all 24 scenes
npx remotion still src/index.ts Kit-Gallery scene.png --frame=4     # one at full size (1–24)
```

`src/Gallery.tsx` shows how each of those scenes is put together. Every piece is a pure function of `T`; its doc
comment in `src/kit/` lists what each prop does. Scenes 1–12 are the kit's pieces, in one flat illustrated style.
Scene 13 is the paper style pack. Scenes 14–20 are helpers that fit any style, their colours and shapes being props
(most of those tiles draw the helper again, flat on paper), and a person in bed: one world filmed as shots (14), hits
(15), flames (16), a storm (17), tears (18), lying awake in bed (19), falling cash (20). Scene 21 is a recipe that
combines them. Scene 22 is the pixel style pack, scene 23 the comic style pack, scene 24 the pixel pack's type.

| family | pieces | for |
|---|---|---|
| sky and light | `SkyGradient` (dawn, day, dusk, night; `to` + `k` blend; `stars`), `Sun`, `Moon`, `Clouds` (`time`, `light`, `size`), `Rays`, `BeatGlow`, `Flash`, `Bokeh`, `Dust`, `Snow` | time of day, mood, the beat in light |
| camera | `Camera` (one world filmed as `shots`: each cuts in at a bar or word time and looks at `x`, `y` with `zoom` and `rotate`, may drift `to` the next cut or `glide` in; `hits` punch the zoom in), `cameraAt()` (the same camera as numbers and as SVG or CSS transforms), `Drift` (a slow zoom) | cutting on the music |
| places | `City` (night, `dusk`, `day`; `shift` pans by depth), `Street` (pavement, road, lamps), `Room` (`view` through the window; `bed` + `sleeper`), `Bed` (a sleeper between mattress and blanket, `cover`, `head`; `over` for what lies on the bedding), `Ground` (ridges, town, trees), `Sea` (`light` path, `beach`), `GridFloor` | where it happens |
| people | `Person` (15 poses, `lie` on the back among them; `walk`/`run` by `phase`; `look`: outfit, hair, skin, colours; `prop` + `personHand()`; `personEye()` for tears or a glint), `Crowd` (`handsUp`, `jump`, `idle`, `lights`), `MiniPerson` | the protagonist, the audience |
| objects | `Phone` (`messages`, `typing`, `call`), `Clock` (`spin`, `ticks` on the beat, alarm `ring`), `Heart` (`beat`, `crack`), `Car` (`distance` turns the wheels), `Plane` (`trail`), `Lantern`/`Lanterns` | what the lyrics are about |
| effects | `Rain` (`strength`, splashes on `ground`), `Fireworks` (`bursts` at times), `Confetti`, `Hit` (`burst`, `sparkle` or `ring` at a point and time), `Flames` (a fire to a candle; `flat`, `wind`, `strength`) and `FlamesAlong` (an object's edge on fire), `Storm` (a storm deck of `Clouds` lit from inside by its `strikes`) and `Lightning` (`fork` or `zigzag` bolts; a strike's `to` aims it at a point), `strikeFlashes()` (for `Flash`), `Tears` (well up, run down a cheek, drip; `spot` dampens where they land), `Cash` (banknotes tumbling down) | weather, hits and the big moments |
| text | `Slam`, `Quiet`, `BigLine`, `Captions` | lines in the scene |

**Style packs** (`src/kit/styles/`, one namespace each: `import { paper, pixel, comic } from "../kit"`). `paper`, for
paper cut-out:
- outlines cut by hand, each with its own seed: `paper.rect`, `paper.ellipse`, `paper.poly`, `paper.strip` (stems,
  cords, steam); join outlines to cut holes;
- `paper.Cut`: one piece, placed with `x`, `y`, `rotate`, `s`; `lift` raises it off the paper under it and its
  shadow grows; a Cut inside a Cut is glued onto it;
- `paper.Stack id`: the grain and the light for every piece inside it, one per scene;
- `paper.colors` and `paper.matte(c)` for paper colours, `paper.step(T)` for the held steps of cut-out motion.

`pixel`, for pixel art. One pixel size per shot: draw the whole scene on one grid and let only the camera scale it,
by whole numbers; never `scale()` a sprite or a layer, or blocks of two sizes meet and edges go soft.
- `new pixel.Canvas()`: a picture in big pixels, drawn with `box`, `disc`, `poly`, `line` (1 px wide it is pixel
  perfect: no doubled pixel where it turns), `dither` (a tone of a colour) and `text` (a 5×7 font: Latin letters,
  digits and the rest of ASCII); positions round to whole pixels;
- `pixel.sprite(rows, palette)`: a character from a character map, a string per row and a character per pixel
  (`"..HHhh.."` with `{ H: hair, h: shine }`; others stay clear). `canvas.stamp(sprite, outline, x, y)` puts it on
  with a clean 1-pixel outline (inside corners filled, so the ring turns them on a diagonal). Draw people, animals
  and anything round this way, a frame per pose, not from discs or sampled curves: eyes, ears, a tail and a wheel
  need their pixels placed (scene 22: a walk in four frames, a cat asleep, a bicycle, a car). Part shapes that touch
  inside a sprite (leaves, an arm over the body) with a darker shade, not a gap, since every gap gets an ink line,
  and stamp what a character walks past before the character, so its outline stays whole. Check them at 1:1 and 2×;
- `pixel.Pixels`: a canvas on the stage, `px` stage px to a pixel (at 8, 240 × 135 pixels fill it), rounded to
  whole stage px;
- `pixel.cameraAt(T, shots)`: the kit's camera for a pixel scene, `<g transform={pixel.cameraAt(…).svg}>` round it:
  the zoom rounds to a whole number and the frame to whole pixels, kept on the stage, so a close-up is 2× or 3× with
  one pixel size. A shot that changes the zoom cuts (blocks change size in one jump), so give each zoom a beat or
  more; a glide or drift at one zoom pans by whole pixels;
- `pixel.BigText`: big type on the grid, `x` its centre and `y` its top in blocks of a `px` grid as in `Pixels`: the
  5×7 font at `scale` blocks a bit, two-tone with `lower`, a `shadow` one bit down, one block of `outline` round all
  of it with no specks in the letters; `width` wraps it (and steps the scale down while a word alone is wider), `T`
  with `t` pops it in once. Not `text` + `stamp`: `stamp` rings every gap, so a text with a shadow gets ink specks
  between the letters and their shadow. Text the 5×7 font lacks, such as Korean, comes from `font` (default: the
  theme's) at 16 blocks to the em per scale (Hangul 14 blocks tall): it reads from scale 1, and with a shadow from
  scale 2 if the shadow is dark under a light face; a bright shadow leaves its colour inside syllables with two final
  consonants at any scale. The 16 blocks were measured with Pretendard, the theme's first font; Apple SD Gothic Neo,
  where a Mac without it falls back, reads rougher (thin strokes, short bars as one-block stubs), and Noto Sans CJK
  KR (Linux) reads cleanly. For the same letters on every machine, import an OFL Korean font file from `src/`, load
  it before the first frame and pass its family as `font`;
- `pixel.Dialog`: a game dialog box that letters the line being sung word by word (sung words lit, the rest dim),
  wrapped to its `width` and set once per line, so no word moves; a line longer than `rows` turns the page. Put the
  lines it shows in `linesDrawnByScene`. Its 5×7 letters are 7 blocks tall: `px` 6 keeps them over 36 px in 16:9
  and in a `VerticalScene`, but the short shows a `Scene` in its band at 0.76, so there use `px` 7 or more (8, the
  default, to be safe). The 5×7 font has all of ASCII and drops symbols it lacks (music notes, emoji); when a line
  has letters it lacks, such as Korean, every line comes from the font in rows of 19 blocks, Hangul 14 tall: draw
  the box at `px` 4 in 16:9 (Hangul stays over 36 px in the band too), at `px` 6 in a 9:16 frame;
- `pixel.Pixelate id`: anything inside turns into blocks on the same grid, `outline` rings them one block wide: any
  kit drawing, or type in a font of your own. Pop or slide what is inside, not a group around it, so the blocks stay
  put. One colour per Pixelate gives clean blocks. `shadow` adds a drop shadow one block down in that colour, inside
  the outline (a dark one keeps diagonal edges clean). Not a second Pixelate under an outlined one: the ring leaves
  each block's diagonal corner open, so a shadow offset sideways shows through there in specks. Korean type smears
  under about 18 blocks to the em here. Pass the size it is drawn at on screen as `stageScale`: the
  camera's zoom under `pixel.cameraAt` (`stageScale={camera.zoom}`), times 0.76 in the 9:16 band; otherwise blocks
  flicker, vanish or come out a pixel short;
- `pixel.colors`, and `pixel.step(T)` for the held 8 steps a second of sprite animation.

`comic`, for a comic page: `comic.Page` holds `comic.Panel`s, each filming the world with its own `shots`; `comic.Ink`
prints colour off register under ink lines (one Ink per layer, back to front), with `comic.Dots` for Ben-Day dots;
`comic.Balloon` and `comic.Caption` letter a `Line` as it is sung, unsung words ghosted; `comic.Sfx` slams once.
Draw characters and small props in `comic.Ink contour`: one heavy outline round all of it, colour in register, and
inside only the lines you place: `comic.Brush` (tapered: features, folds, an arm's edge over the body), `comic.Edge`
(eyes, a mouth) and `fill="none"` paths. `comic.brushPath` makes limbs and tails to fill. A form in front of another
(a forearm over the body) goes in a later contour Ink; check the joints at 2×. The contour fills narrow gaps and sharp
notches: give a small form (an ear) a lighter `line`, draw a hole (a mug handle's) as a filled shape in an `Edge`,
round the dips between tufts of fur, and keep balloons, tails and trailing bubbles clear of the figure.

Putting a scene together:

- **Order:** draw back to front inside `<Svg>`: sky, far places, near places, people, then effects in front. Give
  every instance an `id` of its own when two of a kind share the stage (gradients are looked up by id).
- **Camera:** draw the world once, wrap it in `<Camera>` (inside an `<Svg>`: `<g transform={cameraAt(…).svg}>`) and
  cut its `shots` on bars and words; put `Hit`s and the camera's `hits` on the same times. Keep text outside the
  camera, so that a punch or a roll never moves it.
- **Any style:** `Hit`, `Flames`, `Lightning`/`Storm`, `Tears` and `Cash` take their colours and shapes as props. For
  a flat or paper look pass the style's colours with `glow={0}` or `flat`; inside a `paper.Stack`, wrapping one in
  `<paper.Cut d="" fill="none" lift={6}>` gives it the paper's shadow (gallery tiles 15–18 and 20). Inside
  `<pixel.Pixelate outline={…}>`, any kit drawing turns into outlined pixels, with in-between colours where it is
  shaded or soft; draw a sprite for anything seen up close.
- **Recipes:** parts fit together by the same scale `s` (1 = a Person 300 px tall), the line things stand on and
  anchors (`personHand()`, `personEye()`, a strike's `to`, `FlamesAlong`), so a new asset can be a recipe of a few
  lines that combines them, like `SleeplessStorm` in `src/kit/recipes.tsx` (scene 21); recipes are welcome as pull
  requests too.
- **One light:** choose the scene's key light and pass it everywhere it is asked for: the same `time` for sky,
  clouds, city and vehicles; `light` on `Clouds` and `Sea`.
- **Motion from data:**
  - a walk covers `STRIDE × s` per `phase` cycle, so move x by that and the feet don't slide;
  - a car's `distance` is the distance moved divided by s;
  - put bursts, cuts and pans on `grid.bar(k)` and word times.
- **Rain:** fade it with `strength`, not with an opacity group around it.
- **Drawing next to the kit:** when the concept uses the kit's flat style, the song's own character and objects
  must match it:
  - flat shapes, no black outlines (an edge is a darker tone of the fill);
  - one tone step of shade, a lighter rim on the lit side, glow around lights;
  - far things lighter and hazier.

Rules that held up:

1. **Pure function of song time `T`.** Never the frame number or state; any `--from` must render identically.
2. **Text pops once, then holds still** while it is read. No wobble, bob or beat-shake on letters. The beat moves
   lights, particles, shapes, the camera (`Camera`, `Drift`) — not text.
3. **Every line a scene draws itself** goes into `linesDrawnByScene`, so the bottom captions don't double it.
4. **Lay out on the 1920×1080 stage.** In 9:16 the stage is a band; read `VerticalCtx` to stack side-by-side
   layouts, or export a `VerticalScene` that draws the whole 9:16 frame (step 6). Keep text ≥ 36 px on screen:
   `check` reads only the size literals in the source, not what a camera or a `scale()` makes of them.
5. Pull timing from data: `useSong().lineById["ch1-01"].words[0].t`, `grid.bar(k)`, `grid.pulse(T)`.

Typecheck (`npx tsc --noEmit` in `<work>/video`), then look at stills of the new section before rendering video. A
contact sheet draws the scene at many song times in one render, each frame labelled with its time: write its props
into `<work>/video/sheet.json`, such as `{"times": [33.1, 34.6, 36.2, 37.7]}` (`"cols"`: frames per row;
`"vertical": true`: the 9:16 frame), and run this in `<work>/video`:

```bash
node render.mjs ../mv.json --composition Contact --props sheet.json
```

**Before the first full render, look closer.** A whole frame on a sheet hides rough lines. `"crop": [x, y, w, h]`
shows only that region of the frame (its pixels: 1920×1080, or 1080×1920 with `"vertical"`), scaled to the tile
width: `"cols"` sets the zoom and each label shows it. Make one crop sheet per character and per big-type moment, at
1× or more, and fix rough lines, seams, gaps between parts and clipped text. Judge soft glows at 1×: above it the
browser cuts a wide glow (the kit's 90 px text glow) with hard edges the video does not have.

```bash
node render.mjs ../mv.json --composition Contact --props hero.json --name hero   # hero.json: {"times": [33.1, 41.2, 52], "cols": 3, "crop": [700, 380, 312, 400]}, 2×
```

## 5. Render and check

Iterate on drafts:

```bash
song2mv render <work>/mv.json --template <work>/video --from A --to B --draft
song2mv check <work>/renders/<name>-16x9-A-B-draft.mp4 --song <work>/mv.json --from A --to B --src "<work>/video/src/scenes/**/*.tsx" --json
```

A draft is the video at 10 fps, the rate `check` measures at: it renders in well under half the time (30 s of a demo
song: 8 s instead of 19 s), and `check` gives it the same results as the full render. When the stretch passes, render
it once without `--draft` and check that too; the user only ever sees full renders, since a draft looks choppy.
Take the video's path from `outputs` in `render --json` instead of building it (the file name starts with the
work folder's name, or `--name`). `--src` should cover the video's scene files only: keep review helpers such as
contact sheets outside `src/scenes/`. Fix every FAIL, re-measure, and say which numbers moved. Checks under `skipped`
did not run on this stretch; they did not pass. If a FAIL is the ruler's fault (a deliberately still, quiet
intro line), copy the goals file, add the line id to `motion.quiet_allow`, pass `--goals` and tell the user why —
don't quietly bend the goals.

Each failing line says where: the stretch measured, the cuts in it, and the part under the goal (a still or empty
line) or the biggest change and the motion without the cuts (a frantic line). Change that moment, not the whole scene.
In a pixel scene a whole-pixel camera step (`pixel.cameraAt`) can count as a cut, in the list and in that motion.

- **Held shots** measure still; a slow drift (the shot's `to`) keeps one alive. On one pixel street a 4–6 pixel drift
  over a 2–3 s close-up measured 2–5; a 14-pixel drift measured up to 16 (frantic).
- **Shot variety.** `check` does not see a shot coming back: one video cut back to the same wide street shot about
  30 times. Make a contact sheet with `times` at each of `check`'s `cuts` plus 0.3 s. A shot that continues across
  neighbouring tiles is one shot; reframe a framing that returns after other shots.

**Passing is necessary, not proof of fun.** After the numbers pass, send the user a clip of the full render and ask
what is boring. Their answer outranks the check.

## 6. Shorts (9:16)

Pick 10–35 s around the hook (usually the first chorus). The first two seconds decide whether people stay: start
on the hit and use `--hold` so the first frame shows the payoff fully drawn; check it with `--still` at from + hold.

```bash
song2mv render <work>/mv.json --template <work>/video --from <hit> --to <+33> --aspect 9x16 --hold <s>
```

While you fix the short, render and check it as a draft (`--draft`), as in step 5.

By default the short shows `Scene` shrunk into a band, with the template's sky above and below it and the title on
top. That frame puts the template's look around every concept, and a scene that draws its own lyrics leaves the
bottom of the screen empty. To fill the phone screen instead, export a `VerticalScene` from `src/scenes/index.ts`:
a component of `T` that draws the whole 1080×1920 frame. The template then adds only the captions of lines the
scenes don't draw, the flashes and the fade-out; the background and any title are the scene's. It is usually the
same world and timing filmed for a tall frame, which `verticalView` in the kit does:

```tsx
const cam = verticalView(cameraAt(T, shots, { hits }));   // a pixel scene: pixel.cameraAt(T, shots, { px, vertical: true })
<Svg w={1080} h={1920}><g transform={cam.svg}>…the world, as drawn for 16:9…</g></Svg>
```

Where things go (`VERTICAL` in the kit has the numbers):

- **Text** inside the safe box, x 120–960, y 269–1248, clear of the app buttons and caption overlay on Reels, Shorts
  and TikTok. The template's captions take its bottom, y 1082–1240; a scene that draws its own lyrics puts them there
  too, and a title or big type at the top of the box.
- **The subject** in the picture area above the captions, y 269–1080. `verticalView` puts the view's point in its
  middle (540, 675), as large as in the 16:9 frame; pass a larger zoom to come closer. A wide shot's point is
  usually the middle of the stage, not its subject: give the tall frame's wide shots the subject's point
  (`shots.map(s => (s.zoom ?? 1) > 1.5 ? s : { ...s, x: 900, y: 820 })`), or the subject drops under the captions.
  A close-up shows more below its point than in 16:9, and that part sits under the captions: if it is the subject's
  body, zoom out until the subject fits above y 1080.
- **Below y 1248** the apps cover the frame: picture only. The view keeps the frame on the stage's sides and top but
  runs on past its bottom (the kit's places end at y 1080), so draw the ground on down there, or a foreground such
  as a crowd.

A contact sheet with `"vertical": true` draws the safe box and the captions' top as dashed lines (a crop sheet
leaves them out): check them there before rendering the short. `check` measures the top 56 % of a short, above the
captions, also with a `VerticalScene`; a large still overlay there (a HUD, a dialogue box) hides cuts from it, so cut
between shots that look different.

## 7. Deliver

Full render(s), short(s), `song.srt` / `song.lrc`, a short list of what was hand-fixed (manual timing values, goals
changed and why) and the spots nobody has heard yet, each with its clip. Nothing from the work folder gets committed.

**Give back what other songs can use.** Look over what you drew for the video. Some pieces are generic, not tied to
this song: an object, a pose, a place, a style pack. Offer those to the user as a pull request to song2mv, following
`CONTRIBUTING.md` ("Adding an asset or a style pack"): original drawings, no media files, the kit's rules, a gallery
tile and a still. Open it only if the user agrees, and leave the song, its lyrics and its own scenes out.
