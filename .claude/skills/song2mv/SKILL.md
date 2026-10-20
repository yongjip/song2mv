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

## 3. Scene design

A music video is not the lyrics on a background. Write a **song map** first, `<work>/map.md`, and agree on it with
the user before coding:

- Per section (from `mv.json` sections; `<work>/music.json` has the loudness curve and likely boundaries): bars,
  energy (rising / peak / falling), what the lyrics say, **one visual idea**, colour.
- **One main character or motif** that carries through the whole song and changes with it. A video with a
  protagonist is more watchable than a slideshow of effects.
- **Hit points**: the first beat of each chorus, drops, the last word. These get the biggest moment (cut, flash,
  slam). Use `grid.bar(k)` and line/word times — never hand-typed seconds.
- **Contrast**: chorus 2 must not look like chorus 1 (the check measures it). Verses cut on an uneven rhythm
  (2 bars, 1 bar, 3 bars …), not every bar.
- **Text**: which lines become big type in the scene (`Slam`, `BigLine`), which stay as bottom captions.

Ask yourself honestly: would a stranger watch this past the first chorus? If the answer is "it is correct", it is
not done — make it funnier, stranger, more specific to this song.

## 4. Build scenes

```bash
song2mv render <work>/mv.json --template <work>/video --still 1      # first use copies the template there
```

Write the song's scenes in `<work>/video/src/scenes/` and export them from `src/scenes/index.ts` (`Scene` and
`linesDrawnByScene`). Use the kit in `src/kit/`. Rules that held up:

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
