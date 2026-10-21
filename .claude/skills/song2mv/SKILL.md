---
name: song2mv
description: Make a beat-synced music video or lyric video for a song, drawn in code — lyric and beat timing, scene design, 16:9 and 9:16 renders, objective checks, fixes. Also for synced lyrics only (LRC, SRT, word-timed JSON) or a song's beat grid. Use when the user asks for a music video, lyric video, visualizer, karaoke video, Shorts/Reels clip, LRC/SRT or beat timing for a song file.
---

# Music video from a song (song2mv)

You turn one audio file into a music video whose every frame is code (React/SVG in Remotion), synced to the song's
beat and lyrics. `song2mv` has the tools; this file is the order to use them in and what to watch for.

The loop is: **timing → scene design → render → check → fix**, with the user looking and listening at the
checkpoints. You cannot hear the song, so every judgement that needs ears goes to the user, with a short clip or
click track that makes it a ten-second check.

## 0. Before anything

- **Rights.** Ask whose song it is and whether the user may publish a video of it (AI music services' plan terms
  count). Never copy the song, its lyrics or renders into a repository; everything song-specific lives in the work
  folder (`song2mv-work/<song>/`).
- **Setup**, once: `uv tool install --python 3.13 'song2mv[sync] @ git+https://github.com/yongjip/song2mv'` (not on
  PyPI yet; faster-whisper has no Python 3.15 wheels). Needs ffmpeg; `render` needs Node 18+ and installs Remotion
  (~570 MB) on its first run.
- **What they want**: full 16:9 video, 9:16 short(s), LRC/SRT only, or all. Title text. Mood or references.

## 1. Timing

```bash
song2mv sync <audio> --lyrics <lyrics.txt> --language <code> --json     # run in the background; minutes
```

`--lyrics` is optional when the audio has a lyrics tag (Suno writes one). Read the progress log and the JSON:

- **Section parsing** (`── [Chorus] → ch1 (hot)`): are the kinds right? Fix with `section_kinds` in `song.json`.
  Lines in `( )` were skipped as stage directions unless their section is in `keep_parenthesized_in`.
- **`◀ no run found this line` / `◀ only run [k]` / `◀ runs disagree`**: weak spots. More runs help
  (`--runs 5`, finished runs are reused). A bigger model (`--model medium`) helps more but is slower.
  `◀ back in lyric order (was at T)`: the merged runs had put the line on another copy of its words, so it was
  merged again from the runs that kept the sheet's order; check it by ear.
- **Tempo line** (`→ 90.00 BPM ... 53% of lyric line gaps are whole bars`): if the fit is low or a close runner-up
  exists, say so. **Bar start** (`beat % 4 == 3`): a guess from the kick drum.
- **Grid fit** (`grid fit, 4-bar windows …: off 3:02–4:10 (shift, 90 BPM)`, and a warning per stretch): the song
  leaves the grid's one tempo there, and `grid.json` lists it under `off_grid`. Words there are not snapped, and
  motion driven by `grid.pulse` or `grid.bar` will miss the music there: drive those stretches by line and word
  times instead. Put a click track over the start of the stretch. A warning that the grid does not fit the whole
  song names a `--bpm` to try.
- **`check_by_ear`** in the JSON: lines filled by re-listening (`reprompt`), estimated, placed by only one whisper
  run, out of the lyric sheet's order (a repeated line on another copy of its words), or with a word no run timed
  between words far apart (the log names the word: `◀ no run timed "…"`; the words around it may be off too). Most
  likely wrong. A warning "heard N times" names the other times a re-heard line was heard: make the click track
  cover them all.

Then make the ear check cheap for the user:

```bash
song2mv click <work> --from <chorus start - 4> --to <+12> --words      # → <work>/click-<from>-<to>.wav
```

Ask them to listen: do the clicks sit on the drums, is the high click on the "one", do the word ticks land on the
syllables? Fix with `"bpm"`, `"downbeat_mod4"` and `"manual": {"<line id>": [word start times]}` in
`<work>/song.json`, then `song2mv sync <work>/song.json` (only cheap steps rerun). Shouts and chants nearly always
need a few `manual` values; that is normal. A pin only constrains: re-heard lines around it keep their times while
they still fit between the pins, so pin only the lines that are wrong. A re-heard line a pin contradicts is heard
again between the pins and stays on `check_by_ear`: check it once more.

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

**Propose two or three concepts and let the user pick one.** They must differ in more than colour: a different art
style and a different central image. For each, write:

- **Idea:** one line, the image that carries the song, taken from its lyrics and mood.
- **Art style:** what fits this song, not what is quickest to build. Some options:
  - flat illustration (the kit's own style);
  - paper cut-out with drop shadows (the kit has a style pack for it), or ink lines on paper, or chalk on a
    blackboard;
  - pixel art, or a retro VHS / photocopy look;
  - collage, or watercolour washes;
  - an isometric miniature;
  - kinetic typography only, or neon signs on brick.
- **Palette and texture.**
- **Main character or motif,** and how it changes over the song.
- **First chorus:** how it hits, the song's biggest moment.

Make each concept concrete enough to picture: render one rough still per concept and show them side by side.

**Then the song map** for the chosen concept, `<work>/map.md`. Agree on it with the user before coding:

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
   (`paper`: cut-out pieces with shadows and grain). The kit's own pieces are flat illustration: they fit a flat
   concept and look out of place in any other.
3. **Change your copy.** The song's template copy (`--template`, step 4) is yours: change a kit piece or a pack there
   (a colour, a shape, another pose) instead of working around it. Upgrades never touch it.
4. **Draw what is new** in the concept's style. With a pack, draw it from the pack's pieces. Without one, build the
   style first (a pixel canvas, an ink line, a watercolour wash) and draw the song's objects on top. The kit's timing and
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
captions in `theme`'s colours and font; in 9:16 its starry sky fills the screen above and below the stage. Left at
the defaults, they put the kit's neon night around every concept, and the title is the file name. Set `title` and
`theme` (`bg`, `stars`, the text colours, `font`) in `song.json` to fit the concept, then run
`song2mv sync <work>/song.json --from build`.

### The scene kit

Look at it before you design anything:

```bash
cd <work>/video && npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0   # all 21 scenes
npx remotion still src/index.ts Kit-Gallery scene.png --frame=4                        # one at full size (1–21)
```

`src/Gallery.tsx` shows how each of those scenes is put together. Every piece is a pure function of `T`; its doc
comment in `src/kit/` lists what each prop does. Scenes 1–12 are the kit's pieces, in one flat illustrated style.
Scene 13 is the paper style pack. Scenes 14–20 are helpers that fit any style, their colours and shapes being props
(most of those tiles draw the helper again, flat on paper), and a person in bed: one world filmed as shots (14), hits
(15), flames (16), a storm (17), tears (18), lying awake in bed (19), falling cash (20). Scene 21 is a recipe that
combines them.

| family | pieces | for |
|---|---|---|
| sky and light | `SkyGradient` (dawn, day, dusk, night; `to` + `k` blend; `stars`), `Sun`, `Moon`, `Clouds` (`time`, `light`, `size`), `Rays`, `BeatGlow`, `Flash`, `Bokeh`, `Dust`, `Snow` | time of day, mood, the beat in light |
| camera | `Camera` (one world filmed as `shots`: each cuts in at a bar or word time and looks at `x`, `y` with `zoom` and `rotate`, may drift `to` the next cut or `glide` in; `hits` punch the zoom in), `cameraAt()` (the same camera as numbers and as SVG or CSS transforms), `Drift` (a slow zoom) | cutting on the music |
| places | `City` (night, `dusk`, `day`; `shift` pans by depth), `Street` (pavement, road, lamps), `Room` (`view` through the window; `bed` + `sleeper`), `Bed` (a sleeper between mattress and blanket, `cover`, `head`; `over` for what lies on the bedding), `Ground` (ridges, town, trees), `Sea` (`light` path, `beach`), `GridFloor` | where it happens |
| people | `Person` (15 poses, `lie` on the back among them; `walk`/`run` by `phase`; `look`: outfit, hair, skin, colours; `prop` + `personHand()`; `personEye()` for tears or a glint), `Crowd` (`handsUp`, `jump`, `idle`, `lights`), `MiniPerson` | the protagonist, the audience |
| objects | `Phone` (`messages`, `typing`, `call`), `Clock` (`spin`, `ticks` on the beat, alarm `ring`), `Heart` (`beat`, `crack`), `Car` (`distance` turns the wheels), `Plane` (`trail`), `Lantern`/`Lanterns` | what the lyrics are about |
| effects | `Rain` (`strength`, splashes on `ground`), `Fireworks` (`bursts` at times), `Confetti`, `Hit` (`burst`, `sparkle` or `ring` at a point and time), `Flames` (a fire to a candle; `flat`, `wind`, `strength`) and `FlamesAlong` (an object's edge on fire), `Storm` (a storm deck of `Clouds` lit from inside by its `strikes`) and `Lightning` (`fork` or `zigzag` bolts; a strike's `to` aims it at a point), `strikeFlashes()` (for `Flash`), `Tears` (well up, run down a cheek, drip; `spot` dampens where they land), `Cash` (banknotes tumbling down) | weather, hits and the big moments |
| text | `Slam`, `Quiet`, `BigLine`, `Captions` | lines in the scene |

**Style packs** (`src/kit/styles/`, one namespace each: `import { paper } from "../kit"`). `paper`, for paper
cut-out:
- outlines cut by hand, each with its own seed: `paper.rect`, `paper.ellipse`, `paper.poly`, `paper.strip` (stems,
  cords, steam); join outlines to cut holes;
- `paper.Cut`: one piece, placed with `x`, `y`, `rotate`, `s`; `lift` raises it off the paper under it and its
  shadow grows; a Cut inside a Cut is glued onto it;
- `paper.Stack id`: the grain and the light for every piece inside it, one per scene;
- `paper.colors` and `paper.matte(c)` for paper colours, `paper.step(T)` for the held steps of cut-out motion.

Putting a scene together:

- **Order:** draw back to front inside `<Svg>`: sky, far places, near places, people, then effects in front. Give
  every instance an `id` of its own when two of a kind share the stage (gradients are looked up by id).
- **Camera:** draw the world once, wrap it in `<Camera>` (inside an `<Svg>`: `<g transform={cameraAt(…).svg}>`) and
  cut its `shots` on bars and words; put `Hit`s and the camera's `hits` on the same times. Keep text outside the
  camera, so that a punch or a roll never moves it.
- **Any style:** `Hit`, `Flames`, `Lightning`/`Storm`, `Tears` and `Cash` take their colours and shapes as props. For
  a flat or paper look pass the style's colours with `glow={0}` or `flat`; inside a `paper.Stack`, wrapping one in
  `<paper.Cut d="" fill="none" lift={6}>` gives it the paper's shadow (gallery tiles 15–18 and 20).
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
   layouts, or export a `VerticalScene` that draws the whole 9:16 frame (step 6). Keep text ≥ 36 px.
5. Pull timing from data: `useSong().lineById["ch1-01"].words[0].t`, `grid.bar(k)`, `grid.pulse(T)`.

Typecheck (`cd <work>/video && npx tsc --noEmit`), then look at stills of the new section before rendering video.

## 5. Render and check

```bash
song2mv render <work>/mv.json --template <work>/video --from A --to B
song2mv check <work>/renders/<name>-16x9-A-B.mp4 --song <work>/mv.json --from A --to B \
  --src '<work>/video/src/scenes/**/*.tsx' --json
```

Take the video's path from `outputs` in `render --json` instead of building it (the file name starts with the
work folder's name, or `--name`). Fix every FAIL, re-measure, and say which numbers moved. Checks under `skipped`
did not run on this stretch; they did not pass. If a FAIL is the ruler's fault (a deliberately still, quiet
intro line), copy the goals file, add the line id to `motion.quiet_allow`, pass `--goals` and tell the user why —
don't quietly bend the goals.

**Passing is necessary, not proof of fun.** After the numbers pass, send the user a clip and ask what is boring.
Their answer outranks the check.

## 6. Shorts (9:16)

Pick 10–35 s around the hook (usually the first chorus). The first two seconds decide whether people stay: start
on the hit and use `--hold` so the first frame already shows the payoff.

```bash
song2mv render <work>/mv.json --template <work>/video --from <hit> --to <+33> --aspect 9x16 --hold 0.17
```

By default the short shows `Scene` shrunk into a band, with the template's sky above and below it and the title on
top. That frame puts the template's look around every concept, and a scene that draws its own lyrics leaves the
bottom of the screen empty. To fill the phone screen instead, export a `VerticalScene` from `src/scenes/index.ts`:
a component of `T` that draws the whole 1080×1920 frame. The template then adds only the captions of lines the
scenes don't draw, the flashes and the fade-out; the background and any title are the scene's. It is usually the
same world and timing filmed for a tall frame: the camera centred in the safe box, the picture out to every edge.

Keep text inside x 120–960, y 269–1248: that box is clear of the app buttons and caption overlay on Reels, Shorts
and TikTok. The template's title, stage and lyrics already sit in it; a `VerticalScene` keeps its own text there
and puts only picture below it. Check stills.

## 7. Deliver

Full render(s), short(s), `song.srt` / `song.lrc`, and a short list of what was hand-fixed (manual timing values,
goals changed and why). Nothing from the work folder gets committed.

**Give back what other songs can use.** Look over what you drew for the video. Some pieces are generic, not tied to
this song: an object, a pose, a place, a style pack. Offer those to the user as a pull request to song2mv, following
`CONTRIBUTING.md` ("Adding an asset or a style pack"): original drawings, no media files, the kit's rules, a gallery
tile and a still. Open it only if the user agrees, and leave the song, its lyrics and its own scenes out.
