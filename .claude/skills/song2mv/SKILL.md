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
  run, or out of the lyric sheet's order (a repeated line on another copy of its words). Most likely wrong. A
  warning "heard N times" names the other times a re-heard line was heard: make the click track cover them all.

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
  - paper cut-out with drop shadows, or ink lines on paper, or chalk on a blackboard;
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

**The kit is optional.** Use its pieces where they fit the concept. If the concept is drawn in another style, draw
its pieces in that style yourself; you can still reuse the kit's timing and motion code:
- `useSong()` and `grid`;
- `Drift`, `liveLine`, and the easing and `rng` helpers in `math`;
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
cd <work>/video && npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0   # all 12 scenes
npx remotion still src/index.ts Kit-Gallery scene.png --frame=4                        # one at full size (1–12)
```

`src/Gallery.tsx` shows how each of those scenes is put together. Every piece is a pure function of `T` and comes in one flat
illustrated style; its doc comment in `src/kit/` lists what each prop does.

| family | pieces | for |
|---|---|---|
| sky and light | `SkyGradient` (dawn, day, dusk, night; `to` + `k` blend; `stars`), `Sun`, `Moon`, `Clouds` (`time`, `light`), `Rays`, `BeatGlow`, `Flash`, `Bokeh`, `Dust`, `Snow`, `Drift` (camera) | time of day, mood, the beat in light |
| places | `City` (night, `dusk`, `day`; `shift` pans by depth), `Street` (pavement, road, lamps), `Room` (`view` through the window), `Ground` (ridges, town, trees), `Sea` (`light` path, `beach`), `GridFloor` | where it happens |
| people | `Person` (14 poses, `walk`/`run` by `phase`; `look`: outfit, hair, skin, colours; `prop` + `personHand()`), `Crowd` (`handsUp`, `jump`, `idle`, `lights`), `MiniPerson` | the protagonist, the audience |
| objects | `Phone` (`messages`, `typing`, `call`), `Clock` (`spin`, `ticks` on the beat, alarm `ring`), `Heart` (`beat`, `crack`), `Car` (`distance` turns the wheels), `Plane` (`trail`), `Lantern`/`Lanterns` | what the lyrics are about |
| effects | `Rain` (`strength`, splashes on `ground`), `Fireworks` (`bursts` at times), `Confetti` | weather and the big moments |
| text | `Slam`, `Quiet`, `BigLine`, `Captions` | lines in the scene |

Putting a scene together:

- **Order:** draw back to front inside `<Svg>`: sky, far places, near places, people, then effects in front. Give
  every instance an `id` of its own when two of a kind share the stage (gradients are looked up by id).
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
   lights, particles, shapes, the camera (`Drift`) — not text.
3. **Every line a scene draws itself** goes into `linesDrawnByScene`, so the bottom captions don't double it.
4. **Lay out on the 1920×1080 stage.** In 9:16 the stage is a band; read `VerticalCtx` to stack side-by-side
   layouts. Keep text ≥ 36 px.
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

Keep text inside x 120–960, y 269–1248: that box is clear of the app buttons and caption overlay on Reels, Shorts
and TikTok, and the template's title, stage and lyrics already sit in it. Check stills.

## 7. Deliver

Full render(s), short(s), `song.srt` / `song.lrc`, and a short list of what was hand-fixed (manual timing values,
goals changed and why). Nothing from the work folder gets committed.
