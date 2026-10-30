---
name: song2mv
description: Make a beat-synced music video or lyric video for a song, drawn in code — lyric and beat timing, scene design, 16:9 and 9:16 renders, objective checks, fixes. Also for synced lyrics only (LRC, SRT, word-timed JSON) or a song's beat grid. Use when the user asks for a music video, lyric video, visualizer, karaoke video, Shorts/Reels clip, LRC/SRT or beat timing for a song file.
---

# Music video from a song (song2mv)

You turn one audio file into a music video whose every frame is code (React/SVG in Remotion), synced to the song's
beat and lyrics. `song2mv` has the tools; this file is the order to use them in and what to watch for.

The loop is: **timing → reading the lyrics → scene design → render → check → fix**. You cannot hear the song, so
every judgement that needs ears goes to the user as a short clip or click track that makes it a ten-second check.

**Before you deliver, check that the video went through these steps.** Each one missing showed in a trial video:

1. Ear-check clips for the lines `sync` flags, sent to the user (step 1).
2. A lyric map with something happening on the key word of each line (step 3).
3. Two or three concept stills, one chosen (step 3).
4. Characters with an age and its proportions, and a continuity table (step 3).
5. Every piece in a gallery at 1:1, and every touch between characters in a fit tile, fixed before the scenes
   (step 4).
6. `check` passing on the whole song (step 5).
7. A review by fresh eyes with no high or medium finding left (steps 5 and 6).

**Checkpoints don't block.** At each one, show the user what you have, with your pick and the reason in one line,
and keep going; they can redirect you at any time. Decide timing by measurement, send the ear-check clips anyway and
list the spots nobody has heard when you deliver. Wait only for what you can neither measure nor recommend: the
song's rights, or a lyric only the user knows.

## 0. Before anything

- **Rights.** Ask whose song it is and whether the user may publish a video of it (AI music services' plan terms
  count). Never copy the song, its lyrics or renders into a repository; everything song-specific lives in the work
  folder (`song2mv-work/<song>/`).
- **Setup**, once: `uv tool install --python 3.13 "song2mv[sync]"` (faster-whisper has no Python 3.15
  wheels). Needs ffmpeg; `render` needs Node 18+ and installs Remotion
  and a headless Chrome (~700 MB) on its first run.
- **What they want**: full 16:9 video, 9:16 short(s), LRC/SRT only, or all. Title text. Mood or references. If you
  make the song too (Suno and the like), name a BPM in the style prompt: it tends to give a steady tempo. If the song
  is about real people (a family, a couple), ask whether they would share a photo or a short clip: one user's family
  photo and a clip of their toddler running gave the characters their hair and clothes and the run into the reunion,
  and made the video theirs. Take the look and the movement in the video's own style, not a portrait, and leave the
  files where the user put them: never in a repository or anything published.

## 1. Timing

```bash
song2mv sync <audio> --lyrics <lyrics.txt> --language <code> --title "<title>" --json   # run in the background; minutes
```

A Suno download also carries timed lines, a subtitle track (`ffmpeg -i song.m4a -map 0:s:0 suno.srt`): on two songs
they agreed with `sync`'s line starts to a median 0.07 s and 0.32 s and were 1.3–2.8 s apart on three lines, where
the whisper runs sided with `sync` twice. Read them as a second opinion on `check_by_ear`, not as the timing.

`--lyrics` is optional when the audio has a lyrics tag (Suno writes one). If you also have a lyric sheet, pass it:
where it and the tag differ, `warnings` names the lines and says which of the two the whisper runs support there (for
one song the sheet was right, for another the tag). `off_sheet` lists stretches where the runs agree on words that no
line matched: chants, ad-libs, changed lines, a repeat the sheet has once, or a line of the sheet placed elsewhere
(its words are on the sheet; that line is then usually on `check_by_ear`). Sync again with a sheet that matches what
the runs heard (`<work>/asr/run*.json` has every word), and put the stretches you add into the user's ear check. A
chant without words to read ("oh, oh, oh") may stay off the sheet and the captions when the song map gives its stretch
an event of its own (a break, step 3). Read the progress log and the JSON:

- **Section parsing** (`── [Chorus] → ch1 (hot)`): are the kinds right? A section named calm (a bridge, an outro)
  that is about as loud as the verses becomes `mid`, and `warnings` says so. Fix with `section_kinds` in `song.json`.
  Lines in `( )` were skipped as stage directions unless their section is in `keep_parenthesized_in`. A `/` or `–`
  between words stays in the line's `text`, where a scene can split on it, but is not a word: it has no time and is
  left out of the captions, `song.lrc` and `song.srt`. A sheet without `[Section]` lines gets sections proposed from
  its repeated lines, listed in `warnings` and written to `<work>/lyrics.sections.txt`: if one is wrong, edit that file
  and sync again with `--lyrics` pointing to it.
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
  almost one time or two that another copy of the line has apart (`◀ … stacked: …`), with runs that disagree by more
  than 0.7 s (`◀ runs disagree by …`; the log flags it from 0.4 s, and below 0.7 s such lines mostly start on time) or
  on a word (`◀ no run times "…" near …`), or heard alike by the runs but not as written while another copy of it is
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

## 3. Lyrics, concept, then the song map

**Read the lyrics first, line by line,** into `<work>/lyrics-map.md`: a row per line id from `mv.json`, with the line
(its key word in bold), what it does (a device, or "says it"), the picture on the key word and any text. Most lines
just say something. The lines that do something (a pun, a metaphor, a parody) are the jokes and images the song is
made of, and drawing their nouns misses them. One trial's first take gave each line a prop for its nouns: 6 of its 17
wordplay lines never reached the screen, 4 showed one of their two meanings, and its on-screen tags read out what the
picture already showed. The user's first note was that the jokes were missing. For each line that does something,
write the device, the picture and the text it needs:

| The line … | Show |
|---|---|
| makes a metaphor or simile ("my heart's a stereo") | its image (a heart-shaped boombox), not the singer saying it |
| means two things (a pun, a double meaning) | both meanings, one turning into the other |
| sounds like another word ("I knead you") | the other word's picture (hands in dough) and both words as text, "knead → need": a picture cannot show that two words sound alike |
| bends a famous line (a parody, a quote) | the famous image, then the twist |
| names a person, brand or work | what the song uses the name for (its sound, its trait), never the real person |
| lists or rhymes several things | one picture per word, each on its word |
| comes back (a callback, the hook again) | the earlier picture, changed |

A line you would rather not draw (a slur, a sexual line) gets the harmless reading the song itself offers, such as
the word its rhyme turns it into, or a censor gag; never nothing, since a skipped punchline reads as a video that
missed the joke. On-screen text names the twist ("knead → need"), not what the picture shows. Choose the concept with
the map in hand: a song with a device in every other line needs a frame where a new picture per line fits (a TV
show's screen, a comic strip, a quiz), not one long scene. Show the user the lines you found doing something, with
your reading of each, and carry on: a slang word or an in-joke you misread costs a row of the map now and a scene
later.

Every song gets its own look. One kit or template applied to every song makes every video look alike, so the look is
decided before you touch the kit.

**Propose two or three concepts and pick one.** They must differ in more than colour: a different art style and a
different central image. For each, write:

- **Idea:** one line, the image that carries the song, taken from its lyrics and mood.
- **Art style:** what fits this song, not what is quickest to build. Some options:
  - flat illustration (the kit's own style);
  - paper cut-out with drop shadows (the kit has a style pack for it);
  - line art: ink on paper, chalk on a blackboard, a blueprint or neon tubes on brick (the kit has a style pack for
    all four, which traces any drawing, kit pieces included);
  - pixel art (the kit has a style pack for it too);
  - toon: an ink outline round each character and prop, shading from a lit side and a shine on round forms (the kit
    has a style pack for it, which outlines kit pieces as they are);
  - watercolour washes over a pencil drawing (the kit has a style pack for it, which paints kit pieces as they are),
    or collage;
  - an isometric miniature;
  - kinetic typography only;
  - over any of these, an old film, a VHS tape or a halftone print (the kit's `finish` pack).
- **Palette, texture and typeface.** The typeface is part of the look: rather than a system font, use an OFL font
  file imported from `src/` (`song2mv render` ignores `public/`) and loaded with the kit's `loadFont` at the top of a
  module: `import lilita from "../fonts/LilitaOne-Regular.ttf"` and `export const DISPLAY = loadFont("Lilita One",
  lilita)` give `fontFamily` its value, and every frame waits for the file. Name the family in `theme.font` to set the
  captions in it; the module loads only if a scene file imports it (one that nothing imported left captions in a serif). Not a `delayRender()` of your own at the top of a module: Remotion drops its handle, and the timer
  left behind failed one full render and stalled the next.
- **Main character or motif,** and how it changes over the song.
- **First chorus:** how it hits, the song's biggest moment.

**What the user judged fun.** Four new-user runs were ranked by fun, not by the checks. Two judged fun did all of
these; the one judged less fun did none of the first three and saved minutes with a plainer concept (27 against 40 and
43): don't buy minutes that way. The latest, made from this list and the lyric map without any earlier run's clips or
notes, was judged more fun than the run before it on the same song ("both good, the newer one more to my taste"): a
device on the key word of 32 of its 33 lines and five kinds of shot (a telestrator, a photo finish, a jumbotron
replay, a press conference, a thermal camera), though only its cat's face was in view.

1. **Something happens on the key word of each line,** not a picture of the line's noun: a paw pushes the mug off the
   desk on "three", a telestrator draws the play as it is rapped. The lyric map says which word and what.
2. **Reactions.** Cut from the act to someone reacting: a crowd, an old man yelling, a mug sweating. Props with faces
   are cheap extra reactors.
3. **A viewpoint that shows faces.** Top-down or far wide shots hide the acting: the dull run's toy-town view turned
   its people into dots.
4. **A frame that turns the everyday into an event:** a sports broadcast, a heist, a nature film, a period cartoon, a
   TV show. It brings its own overlays, sound words and title cards.
5. **Change the kind of shot, not just its zoom:** a diagram, a side view, a close-up, a new world for a punchline.

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
  energy (rising / peak / falling), what the lyrics say, **one visual idea**, colour and light (the time of day), and
  where the lyric map's pictures go in it.
- **One main character or motif** that carries through the whole song and changes with it. A video with a
  protagonist is more watchable than a slideshow of effects.
- **Characters and continuity.** Give each character an age, and draw its proportions from it (`briefs/assets.md`
  lists them: a toddler is about half an adult's height, with about 2 heads fewer). Then a table, section by section:
  what each one wears and carries (a bag, a toy, shoes on or off), where they are, the time of day. Builders and
  reviewers check every board against it.
- **Hit points**: the first beat of each chorus, drops, the last word. These get the biggest moment (cut, flash,
  slam). Use `grid.bar(k)` and line/word times — never hand-typed seconds.
- **Breaks**: list every stretch of 4 s or more without a sung line in `mv.json` (an intro, an instrumental, an
  "oh-oh" that `off_sheet` names) and give each an event of its own: everything dances, someone joins in, a new
  world. One world held through a break is the dullest part of a chorus clip.
- **Contrast**: no chorus may look like another (the check measures each against the first). The same words in the
  same place look alike to it even over another sky: move or restyle chorus 2's big type and boxes too. Verses cut on
  an uneven rhythm (2 bars, 1 bar, 3 bars …), not every bar.
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

**A whole song is more drawing than one agent's context holds: split it among agents** (two songs, audio to videos,
in about two hours: five agents drew the shared pieces, then seven built the sections). The README's two demo videos
were made this way, with far more drawing than one agent does: about 12,000 lines of pieces and scenes for one song,
where one agent alone wrote 750–1200 (below). When you can start agents of your own, propose it to the user with the
concepts. Their briefs are templates next to this guide, `briefs/assets.md`, `briefs/section.md` and
`briefs/review.md`: copy them into the work folder, replace every `TODO` and `<work>`, and name each agent's group,
section or stretch in its task. Without agents of your own, ask the user to give each brief to a session of its own;
in one session, take the roles in turn with the same briefs (each group, the fit tiles, a section at a time, a
review a stretch at a time) and expect less drawing.

1. **Painters.** After step 3, put a palette in `<work>/video/src/scenes/assets/palette.ts` and group the shared
   pieces (people, vehicles, places, effects). One painter per group, each in its own copy (below). Copy their pieces
   into `<work>/video/src/scenes/assets/` and list each piece's props, size and origin in `<work>/ASSETS.md`.
2. **Fit tiles.** Before any builder starts, draw every touch the lyric map has (hand in hand, a hug, a carry, two at
   a table, hands on a wheel) with the painters' pieces at the scenes' scale, as tiles in
   `<work>/video/src/scenes/concepts/` rendered with step 3's `Concepts` command, and look at the hands at 1:1. A
   pose that fails here fails in every board that uses it: send it back to its painter now. Name in
   `<work>/ASSETS.md` the anchor function each touch uses (where a hand grips, where a child sits on a hip). Give
   the pieces now, as props, the variants the continuity table asks for (shoes off, a coat off, a bag on): in one
   video the child piece had no socks, and four builders each faked them their own way.
3. **The builders' frame.** In `<work>/video`: a section file per builder exporting an empty `Board[]`, a
   `boards.tsx` that joins them in song order, `index.ts` exporting `Scene`, `VerticalScene` and `linesDrawnByScene`
   from it, and the files every board shares (the look, an overlay). Typecheck it.
4. **Builders,** three or four per song, each in its own copy made now, each owning one section file.
5. **Merge** by copying each builder's section file into `<work>/video`; nothing else in its copy should have changed.
   Then check the whole song, not stretch by stretch (a line that passed in a stretch starting mid-line failed in the
   whole song), and look at a 9:16 sheet of every board (builders left out `tall` framings), a sheet every 3 s, a
   `--lines` sheet of every line id, and the seams between builders' stretches against the continuity table.
6. **Review** the full render with fresh agents, then fix (step 5).

A copy is `<work>/video` copied to `<work>/video-<name>/` without `node_modules` and `out`. Its first
`song2mv render <work>/mv.json --template <work>/video-<name>` links it to the shared Remotion install (where its
`package-lock.json` differs from this song2mv's, it installs its own, about 500 MB). Each agent renders only in its own
copy, since one half-edited file breaks every render that bundles it. Their drafts may render at the same time while
memory lasts (one render takes about 2.3 GB); a full-size render runs alone (step 5). Nine agents rendering at once
on a 12-core, 24 GB Mac stretched one minute-long draft to 25 minutes: run that many in two waves.

**Plan the cuts with the kit; don't write cut logic.** In five trial videos every agent wrote 750–1200 lines of scene
code and rebuilt the same cut machinery, and one lost half an hour iterating cut plans against `check`. The kit has it:

- `planShots(ctx, from, to, framings)` (`src/kit/plan.ts`) plans a stretch's cuts, which framing each takes, its drift
  and the hits, by section kind: verses cut unevenly on bar lines and a 16th before a line's first word, never twice
  in a short line, at least every 5.2 s; calm sections hold slow shots; hot sections cut on downbeats with a punch;
  copy n of a section opens on framing n − 1 (chorus 2 on the second). It returns the kit camera's `shots` and `hits`;
  `pattern` sets your own bar counts.
- A `Board` (`src/kit/storyboard.tsx`) is a stretch that starts at a line id, a section id or a time: a `world` (SVG of
  `T` on the stage), its `framings` (and `tall` ones for 9:16), and optionally `pattern`, `drift`, `hits`, an
  `overlay` (text over the camera) and `big` (its lines as big type, where the captions go). A section cuts in the
  `pattern` of the board it opens on, one at the section, at its first line or at a line sung into it just before;
  a video render's log names a pattern no section takes.
  `<Storyboard T={T} boards={…} />` draws the board on at T (`wrap` holds the filmed world in a style pack's
  `paper.Stack` or the like), the same with `vertical` is the `VerticalScene`, and `linesDrawnBy(song, boards)` gives
  `linesDrawnByScene`. A board's start is a cut, planned with its section's other cuts: the rhythm counts it, and a
  section with boards at its lines cuts inside as few lines as its rhythm allows, inside none under 2.5 s if it can.
  Key boards to the lyric map's lines whose picture needs a new place or subject, every 2 lines or more and unevenly:
  in one outro three boards 2 lines apart cut too evenly for `cuts.rhythm`. The map's other lines change something
  inside the board on their own line (a prop, a sign, a screen; `liveLine(span.lines, T)` is the line sung at T).
  Take a board's lines from `span.lines`, not from the song by time: a board keyed to a line opens only a 16th
  before its first word (0.1 s at 150 BPM). One song's overlay tags started 0.12 s before each first word and were
  dropped when that fell before the board's start, so the tag of the line each of 11 boards was keyed to never
  showed. A board at a line opens on its first framing in every copy of the section; a board at a section opens on
  framing n − 1 in copy n (`v2` on `framings[1]`), so put that copy's opening there.
  So does a board at the same line of every copy with the same framings (`ch1-04`, `ch2-04`): a board repeated in
  each chorus needs as many framings as there are copies, each composing the subject differently (off-centre,
  rolled, close). Another background alone measured alike in one chorus (0.81 → 0.73); another composition passed
  (0.36). A video render's log names boards at one line of two copies that open on the same framing.
- A cut counts only when the picture changes: give a world framings that show different parts of it (the sky, the
  ground, the subject up close), not one layout at two zooms. A large still overlay hides cuts from `check`. Framings
  next to each other in the list need 1.35× apart in zoom, another part of the world or 4° of roll: the planner skips
  a framing too alike to the one before it (a close-up at 2.4 after one at 1.8 never showed), and a draft's render
  log names one it skipped that never shows (`storyboard: the board at v2-08 never shows framing 2 …`). The 9:16
  frame skips a `tall` framing too alike to the one before it the same way.
- **Point a framing at its subject's middle**: the character or the thing the line is about; for a person in a close
  shot, the face, with room above it. Both frames put the point in the middle of their picture, above the captions
  and big type: y 0–840 of the 16:9 frame (`WIDE` in the kit), y 269–1080 of the 9:16 one (`VERTICAL`). Zoom so the
  subject fits the picture, also when the shot's drift pushes in by up to 15 %: a `Person` 300·s px tall fits up to
  zoom 2.3 / s, and no frame edge may cross a face. A closer shot runs on behind the captions; let that be the
  ground, never a face or the line's prop. Both frames show the world past the stage's bottom edge (16:9 by 120 px at
  zoom 1): draw the ground on below y 1080. A contact sheet draws the captions' top as a dashed line.

**The starter** (`src/scenes/Starter.tsx`) is a whole video built that way from kit worlds (a street, a room, a stage,
fireworks, a beach, hills) that passes `check` on any song as it is. To start from it, put the line given in
`src/scenes/index.ts` in place of the `LyricScene` one. Then make it this song's: edit its marked block (`SHOW`: what
each section, copy or line shows and which lines are big type; `PALETTE`; `HERO`) and replace its worlds with the
concept's. Its look is the kit's: a starting point, never the video. When a line runs into the next section (a
count-in such as "one, two, three" that ends after the chorus starts), that section's board starts at its own first
line instead, so the line stays on screen to its last word.

**The frame comes from the song config.** Around your scenes the template draws a background, the title and the
captions in `theme`'s colours and font; in 9:16 its starry sky fills the screen above and below the stage. Over the
scenes it lays a dark vignette, and a white flash at the start of each hot section, placed on the one-tempo grid.
Left at the defaults, they put the kit's neon night around every concept, and the title is the file name. Set `title`
and `theme` (`bg`, `stars`, the text colours, `font`) in `song.json` to fit the concept. `bg` also shades the
picture behind the captions, so keep it dark under the default white text; a light `bg` takes dark text colours
and `unsungShadow: "none"`, or the captions fade into the band. `"vignette": false` keeps the scene's corners as
drawn, and `"flashes": [[song time, strength 0–1], …]` puts the flashes on the song's real hits (`[]` when the
scenes flash themselves). Then run `song2mv sync <work>/song.json --from build`.

### The scene kit

Look at it before you design anything (in `<work>/video`):

```bash
node render.mjs src/sample-song.json --composition Kit-Gallery             # out/src-Kit-Gallery.png: all 32 scenes
node render.mjs src/sample-song.json --composition Kit-Gallery --frame 4   # out/src-Kit-Gallery-4.png: one (1–32)
```

`src/Gallery.tsx` shows how each of those scenes is put together. Every piece is a pure function of `T`; its doc
comment in `src/kit/` lists what each prop does. Scenes 1–12 are the kit's pieces, in one flat illustrated style.
Scene 13 is the paper style pack. Scenes 14–20 are helpers that fit any style, their colours and shapes being props
(most of those tiles draw the helper again, flat on paper), and a person in bed: one world filmed as shots (14), hits
(15), flames (16), a storm (17), tears (18), lying awake in bed (19), falling cash (20). Scene 21 is a recipe that
combines them. Scene 22 is the pixel style pack, scene 23 the comic style pack, scene 24 the pixel pack's type.
Scenes 25–28 are a body for a head of your own, such as a portrait: walking and gestures (25), the poster props (26),
a call and writing (27), a hand at the temple (28). Scenes 29–32 are the toon, line, paint and finish style packs.

| family | pieces | for |
|---|---|---|
| sky and light | `SkyGradient` (dawn, day, dusk, night; `to` + `k` blend; `stars`), `Sun`, `Moon`, `Clouds` (`time`, `light`, `size`), `Rays`, `BeatGlow`, `Flash`, `Bokeh`, `Dust`, `Snow` | time of day, mood, the beat in light |
| camera | `Camera` (one world filmed as `shots`: each cuts in at a bar or word time and looks at `x`, `y` with `zoom` and `rotate`, may drift `to` the next cut or `glide` in; `hits` punch the zoom in), `cameraAt()` (the same camera as numbers and as SVG or CSS transforms), `Drift` (a slow zoom), `planShots` and `Storyboard` (above) | cutting on the music |
| places | `City` (night, `dusk`, `day`; `shift` pans by depth), `Street` (pavement, road, lamps), `Room` (`view` through the window; `bed` + `sleeper`), `Bed` (a sleeper between mattress and blanket, `cover`, `head`; `over` for what lies on the bedding), `Ground` (ridges, town, trees), `Sea` (`light` path, `beach`), `GridFloor` | where it happens |
| people | `Person` (15 poses, `lie` on the back among them; `walk`/`run` by `phase`; `look`: outfit, hair, skin, colours; `prop` + `personHand()`; `personEye()` for tears or a glint), `Crowd` (`handsUp`, `jump`, `idle`, `lights`), `MiniPerson`; for a head of your own, such as a photo portrait: `PortraitCutout` (clips the head and neck out of a bust, so its shoulders don't double the body's), `PortraitBody` (from the front; arm angles, `feet`, `lean`; `gesture` `phone`, `point`, `smoke` or `hold` a `frontProp`), `portraitMotion()` (walk and run on planted feet, gestures that settle; turn the head by its `headAngle`), `PortraitInteraction` (a call, writing, a hand at the temple: hands, prop and contact worked out together from the head's `profile`; check them with the real portrait at the real camera size) | the protagonist, the audience |
| objects | `Phone` (`messages`, `typing`, `call`), `Clock` (`spin`, `ticks` on the beat, alarm `ring`), `Heart` (`beat`, `crack`), `Car` (`distance` turns the wheels), `Plane` (`trail`), `Lantern`/`Lanterns` | what the lyrics are about |
| effects | `Rain` (`strength`, splashes on `ground`), `Fireworks` (`bursts` at times), `Confetti`, `Hit` (`burst`, `sparkle` or `ring` at a point and time), `Flames` (a fire to a candle; `flat`, `wind`, `strength`) and `FlamesAlong` (an object's edge on fire), `Storm` (a storm deck of `Clouds` lit from inside by its `strikes`) and `Lightning` (`fork` or `zigzag` bolts; a strike's `to` aims it at a point), `strikeFlashes()` (for `Flash`), `Tears` (well up, run down a cheek, drip; `spot` dampens where they land), `Cash` (banknotes tumbling down) | weather, hits and the big moments |
| text | `Slam`, `Quiet`, `BigLine`, `Captions` | lines in the scene |

**Style packs** (`src/kit/styles/`, one namespace each: `import { paper, pixel, comic, poster } from "../kit"`).
Their filters cost little on a Mac, where `song2mv render` has Chrome draw on the GPU; in software (Linux, Windows,
`SONG2MV_GL=off`) Chrome draws them one frame at a time on one core: 16 s of the starter with `toon` over the whole
frame rendered in 21 s on the GPU and 5.6 min in software. A filter of your own: shift an `feOffset` a hair over a
whole or half number (1.01, not 1). Offsets land on whole pixels, and Chrome rounds an exact half up in software and
down on the GPU, where a line-pack draft (half size, so a shift of half a pixel) came out blank.
`paper`, for paper cut-out:
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
  it with `loadFont` and pass what it returns as `font`;
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

`poster`, office and street props drawn flat as on a poster, in `poster.colors`: `poster.Phone` (its `children` on
the screen, such as `poster.Bubble`s with a `tail`), `poster.Notebook` (`write` 0–1), `poster.CoffeeCup`,
`poster.Glass` (`fill`), `poster.Lighter`, `poster.Smoke` (steam, or a `PortraitBody`'s cigarette from
`portraitPropTip()` given the body's props), `poster.Building` (`sign`), `poster.Light` (`lit`), `poster.Cloud`, and
`poster.SleevedHand` going into a `poster.Pocket`. Check a held prop at both ends of its move and in between.

`toon`, an ink outline and shading for any drawing (gallery tile 29: kit pieces as drawn, then in the pack):
- `toon.Defs id` once in the scene's `<Svg>`, then `<toon.Ink id>` round each character or prop: one outline round
  its silhouette, kit pieces included (a `Person`, a `Car`); their soft ground shadows and glows stay without a line.
  One Ink per character or prop: an Ink round a whole group outlines only the group's outer edge;
- `toon.Shade id color` (`round` for a ball lit from the top left) with `fill={toon.fill(id)}` shades a form from its
  lit side, and `toon.Shine` puts a highlight there;
- `toon.Line` draws a limb, cord or handle with an outline of its own, outside an Ink.

In one trial the user's first note on a flat first take was that its pictures were lacking; the second take drew
every character and prop this way, and the user liked the outlines. Outlines are fine high-contrast detail, which
measures as motion under drift: that video's boards ran at `drift` 0.5–0.6.

`line`, line art traced from any drawing (gallery tile 30: kit pieces in its four looks):
- `<line.Lines id look>` round a character, a prop or a whole world traces its outline and the edges inside it where
  the brightness changes, and draws only those lines. `look` is `ink`, `chalk`, `blueprint` or `neon`; `color` gives
  another line colour (one neon tube per colour). Soft shadows and glows leave no line, detail too dense for the
  lines (a wheel's spokes at half size) is drawn round instead of filled in, and `soften` drops small detail. A world
  wider than the frame takes `region`, as `paint.Paint` does, or the trace covers all of it;
- `<line.Paper id look>` lays the look's ground: grained paper, a chalkboard, blueprint paper with its grid, a brick
  wall in the dark;
- `line.looks` has each look's paper and line colours, for type and anything drawn beside the traced pieces.

Shading steps become lines too, so pieces drawn flat trace cleanest, and two colours of one brightness meet without a
line inside a piece (its outline always draws). Traced worlds are fine high-contrast detail, so calm their drift
(step 5). It traces at any size, a concept board's tile or a draft under a camera that pulls back included. On a
12-core Mac's GPU a still of the street traced over the whole frame takes 2.2 s against 2.0 s untraced, 16 half-size
pieces 2.3 s; in software 10.5 s and 3.6 s. Concept boards in six new-user runs proposed these looks five times (an
ink diagram or blueprint three times, chalk and neon once each) and dropped them for the drawing they needed; the
sixth run's blueprint tile came out blank, before the pack traced at that size. One trial video drew its navy ink by
hand.

`paint`, watercolour for any drawing (gallery tile 31: a street world painted on paper):
- `<paint.Paper id>` lays cold-press paper, and `<paint.Paint id>` paints what it holds on it, kit pieces included:
  edges that wander (`wobble`), thinned and uneven washes (`seed` moves the blooms), pigment pooling darker at the
  edges of each wash, and a pencil underdrawing traced from the same drawing (`pencil={false}` leaves it out);
- paint a world in one `Paint`, so that what is in front covers what is behind: separate Paints lay their washes over
  each other like glazes, and buildings showed through the people. A world wider than the frame takes `region`, such
  as the stage `[-60, -60, 2040, 1200]`, or the filter covers all of it;
- on a 12-core Mac's GPU a still of the painted street takes 2.3 s against 2.0 s unpainted; in software 8.0 s.

`finish`, a whole frame as an old film, a VHS tape or a halftone print, over any style (gallery tile 32). Wrap the
frame, camera and all, in `<finish.Film id T>` (`tone` `sepia` or `bw`; grain, scratches, dust, flicker, gate weave,
a vignette), `<finish.Vhs id T>` (colour fringing, scanlines, a rolling band, a `label` and a counter) or
`<finish.Print id>` (cyan, magenta, yellow and black halftone dots, off register). Each clips what it holds to its
`w` × `h`, so a finish on a screen inside a scene stays on the screen. `finish.step(T)` holds the picture for a
twelfth of a second, for film-era motion: pass it to the scene as its T. Keep the song's captions outside. On a
Mac's GPU a still of the street takes 2.1–2.2 s in each against 2.0 s; in software 3.2 s as film, 2.5 s as VHS and
5.4 s as print.

Concept boards in five new-user runs proposed a watercolour dreamland and a monster-movie poster once each, and one
run drew a 1930s rubber-hose cartoon by hand (about 1,250 lines): `toon` under `finish.Film` comes close to that look.

**A photo as the head.** Import the image from the song's `src/` (PNG or JPEG; `song2mv render` ignores `public/`)
and draw it with Remotion's `<Img>` in a `<foreignObject>`: a missing file then stops the render, where an SVG
`<image>` leaves Chrome's broken-image icon in the frame. `PortraitCutout` clips it to the head and neck and puts its
neckline (`anchor`) on the collar at (0, −235). Give the profile's ear and temple in body units,
`neck + s × (point in the photo − anchor)`, and pick `s` so that the ear is 40–100 above the neck, where a call
reaches it. A call, writing or a hand at the head goes through `PortraitInteraction`, not a scene's own joint
coordinates: `PortraitBody`'s `phone` gesture holds the phone in one place, by the gallery head's jaw, and misses a
photo's ear. On a `PortraitBody`, `foregroundCollar` covers the cut, and `hold` grips at (±72, −116), the lower
corners of what it holds. `renderHead(angle, pitch)` can use `portraitHeadTransform({neck, angle, pitch})` to nod a
flat head about its neckline; a photo keeps its expression, so the acting is the head's turn, the lean and the hands.
`docs/portrait-acting.md` has an example, the checks and how to add an action.

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
`"vertical": true`: the 9:16 frame), and run this in `<work>/video`. It draws the bare scene, for scene work; once
there is a video, `song2mv sheet` shows it as rendered (step 5):

```bash
node render.mjs ../mv.json --composition Contact --props sheet.json
```

A sheet draws every tile in one page, where an SVG id names one definition for all of them: a gradient, clip or filter
that changes with T needs T in its id (`id={"glow-" + Math.round(T * 100)}`), or every tile shows the first tile's.

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
song2mv check <work>/renders/<name>-16x9-A-B-draft.mp4 --song <work>/mv.json --from A --to B --src "<work>/video/src/scenes/**/*.tsx" --json > <work>/check.json
song2mv sheet <work>/renders/<name>-16x9-A-B-draft.mp4 --cuts <work>/check.json
```

A draft is the video at 10 fps and half size (960×540), enough for `check`, which measures 10 frames a second at
320×180: 30 s of a paper-cut scene renders in 15 s instead of 55–70 s at full size (and about 2.5 min as the finished
video), and `check` gives it the same passes, fails and cuts as the full render. Per-line motion is up to 0.3 higher
at full size, never lower (a line that opens on a cut can differ by about 1), so a draft's `warnings` name the lines
within 0.3 under `motion.max`: bring them lower, or the full render may fail them (a line at 8.94 in a grainy draft
measured 9.20 at full size). When the stretch passes, render it once without `--draft` and check that too; the user
only ever sees full renders, since a draft looks choppy and soft.
Before that full render, look at a few frames at full size (`--still T` renders one): a contact sheet's small tiles
hid a scene drawn twice, a band across the picture that cost one trial its final render.
Run one full-size render, still or sync at a time: each uses every core, and two at once have hung, in one template
copy and in two (two songs' final videos both stopped about ten minutes in, their pages closed).
Take the video's path from `outputs` in `render --json` instead of building it (the file name starts with the
work folder's name, or `--name`). `--src` should cover the video's scene files only: keep review helpers such as
contact sheets outside `src/scenes/`. Fix every FAIL, re-measure, and say which numbers moved. Checks under `skipped`
did not run on this stretch; they did not pass. If a FAIL is the ruler's fault (a deliberately still, quiet
intro line), copy the goals file, add the line id to `motion.quiet_allow`, pass `--goals` and tell the user why —
don't quietly bend the goals.

Each failing line says where: the stretch measured, the cuts in it, and the part under the goal (a still or empty
line) or the biggest change and the motion without the cuts (a frantic line). Change that moment, not the whole scene.
In a pixel scene a whole-pixel camera step (`pixel.cameraAt`) can count as a cut, in the list and in that motion.

**Look at what you rendered.** `song2mv sheet` tiles the video's own frames into a PNG, captions, title and strips
included, each labelled with its song time and the line sung then (or the section between lines). With `--cuts` it
takes a frame 0.3 s into each shot from the saved check result, whose `--from` and `--song` it reuses; `--every S`
takes one from the middle of every S seconds, `--times` the song times you list, `--lines` one in the last word of
each line id you list, and `--crop X,Y,W,H` zooms into one region as `Contact`'s `crop` does. A long sheet goes on
more pages, all listed in `outputs` (`--json`): look at every page. No number catches two lyric lines on screen at
once, a caption over big type or a cut-off title; a sheet does. Make one of every full render too (`--every 3 --song
<work>/mv.json`), and one of the lyric map's lines (`--lines` with their ids): each frame must show its row's
picture, or the line's joke is not in the video. The frame is in the line's last word, where an event on a late key
word has landed: in one run the lines' middle frames showed the pictures of 26 of 32 rows, frames on the key words all
32.

- **Held shots** measure still; a slow drift (the shot's `to`) keeps one alive. On one pixel street a 4–6 pixel drift
  over a 2–3 s close-up measured 2–5; a 14-pixel drift measured up to 16 (frantic). A small thing moving across a
  wide shot measures still too (a car crossing a street measured 0.14): frame it closer or pan with it. Fine
  high-contrast detail (window grids, railings, stripes, stair treads) measures as motion under any drift: over one
  brownstone street the planner's drift alone measured 8–9 on most verse lines, and `check` says "the whole frame
  changes" when such a line is frantic without a cut. Draw that detail coarser or lower in contrast, or calm the
  drift: `drift: 0.5` on the street's boards (`planShots(…, { drift })`) took its verse lines from 5.4 to 3.6 on
  average, none of them still.
- **Shot variety.** `check` does not see a shot coming back: one video cut back to the same wide street shot about
  30 times. The `--cuts` sheet has a frame of every shot. A shot that continues across neighbouring tiles is one shot;
  reframe a framing that returns after other shots.
- **Dense lines** (a line every 1.5 s or less, as in rap): don't cut on every line of a mid section. A short line
  that holds two cuts reads frantic, and even spacing fails `cuts.rhythm`; cut every 2–3 lines, unevenly, and keep
  the fast cutting for hot sections (`planShots` does all this). Big type that changes on every line counts as a cut,
  and so does a large transform such as a flip; a reframe of a flat or dark set may not, so change the set or its
  palette between shots. `cuts.max_gap` names the sudden changes in each long stretch that did not count as a cut,
  with their correlation (a cut is under 0.62) and difference (over 2.5): a high correlation is a reframe too alike to count, a
  low difference one too dim. A thermal-camera board's two framings left one run 8.5 s without a cut; on a made-up
  frame like it, a 10 px reframe measured correlation 0.85. Cut a 16th before a line's first word or on it, not just after it: `check` counts that cut
  as the line's own, not as motion in the line before.
- **Fast change inside one shot** measures frantic without any cut. In one video a rewind gag that flipped between
  old frames measured 29.5 (goal ≤ 9) and one crossfade under a slow scan bar 4.7; a windmill spinning in a close
  shot 14.2, and filmed wide at 70° a second 5.5; a wobbling stack of burgers with new ones popping in 14.5, and the
  stack still with one burger held up per line (`drift: 0.5`) 6.8. Keep the gag and slow its motion: the line still
  needs its event.

**Review it like a viewer, with fresh eyes.** `check` measures motion, cuts and coverage; it does not see an arm
folded into a V. In the two videos that taught this, six reviewer agents, about 20 minutes each, found about 120
defects after every check had passed, such as arms folded into a V and faces cut at the eyes by the frame's edge
(`briefs/review.md` lists what they look for). Before you deliver a full render:

- Start fresh agents with `briefs/review.md` (copy it into the work folder and fill in its `TODO`s): one per minute
  or two of video, one for the characters (every pose and prop the scenes use, at 1:1) and one per short. Each crops
  every figure at 1:1, edits nothing and reports with severities.
- Fix every high and medium finding, render again, and give the changed stretches to a new reviewer. A pose a
  reviewer flags is usually its piece's fault: fix it in the piece, and every board that uses it is fixed.
- Without agents of your own, review it yourself with the same brief once the build is done, a stretch at a time,
  every crop as if someone else had drawn it, or ask the user to give the brief to a second session.

**Passing is necessary, not proof of fun.** After the numbers pass, send the user a clip of the full render and ask
what is boring. Their answer outranks the check.

## 6. Shorts (9:16)

Pick 10–35 s around the hook (usually the first chorus). The first two seconds decide whether people stay: start
on the hit and use `--hold` so the first frame shows the payoff fully drawn; check it with `--still` at from + hold.

```bash
song2mv render <work>/mv.json --template <work>/video --from <hit> --to <+33> --aspect 9x16 --hold <s>
```

While you fix the short, render and check it as a draft (`--draft`), as in step 5. Review the finished short with
`briefs/review.md` as in step 5, too.

By default the short shows `Scene` shrunk into a band, with the template's sky above and below it and the title on
top. That frame puts the template's look around every concept, and a scene that draws its own lyrics leaves the
bottom of the screen empty. To fill the phone screen instead, export a `VerticalScene` from `src/scenes/index.ts`:
a component of `T` that draws the whole 1080×1920 frame. The template then adds only the captions of lines the
scenes don't draw (on a strip of `theme.bg`), the flashes and the fade-out; the background and any title are the
scene's. It is usually the
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
  Point a board's `tall` framings at the subject's middle too (step 4), with the starter's `tall()`, not `at()`, which
  keeps a framing on the 16:9 stage and so moves a tall frame's subject off its middle.
  A close-up shows more below its point than in 16:9, and that part sits under the captions: if it is the subject's
  body, zoom out until the subject fits above y 1080.
- **Below y 1248** the apps cover the frame: picture only. The view keeps the frame on the stage's sides and top but
  runs on past its bottom (the kit's places end at y 1080), so draw the ground on down there, or a foreground such
  as a crowd. How far it runs on depends on the zoom: the frame ends 1245 / zoom stage px below the view's point, so
  a 2× close-up of a subject at y 760 shows only about 300 px below y 1080. Put the foreground just under y 1080, not
  350–700 px down, where only wide shots reach. The view also stops at the stage's top edge, so a subject near it
  lands above (540, 675); a scene whose background reaches above the stage passes the area it fills as `world`
  (`verticalView(cam, { world: [0, -900, 1920, Infinity] })`, or with boards
  `<Storyboard T={T} boards={BOARDS} vertical world={[0, -900, 1920, Infinity]} />`).

A contact sheet draws the captions' top as a dashed line, and with `"vertical": true` the safe box too (a crop sheet
leaves them out): check them there before rendering the short. `check` measures the top 56 % of a short, above the
captions, also with a `VerticalScene`; a large still overlay there (a HUD, a dialogue box) hides cuts from it, so cut
between shots that look different.

## 7. Deliver

Full render(s), short(s), `song.srt` / `song.lrc`, a short list of what was hand-fixed (manual timing values, goals
changed and why) and the spots nobody has heard yet, each with its clip. Nothing from the work folder gets committed.

For uploading, ask where the user will post it:
- a platform with a size limit gets `song2mv render <work>/mv.json --template <work>/video --max-mb N`, which encodes the
  finished video again to fit and keeps its sound;
- an album or playlist page gets a square cover from `--cover T` at a title or hook frame;
- music platforms that show synced lyrics take `<work>/song.lrc` (`song.words.lrc` has word times).

A finished render is already capped at 8 Mbit/s, about 60 MB a minute at most; pass `--max-mb` when the limit is
lower than that.

**Give back what other songs can use.** Look over what you drew for the video. Some pieces are generic, not tied to
this song: an object, a pose, a place, a style pack. Offer those to the user as a pull request to song2mv, following
`CONTRIBUTING.md` ("Adding an asset or a style pack"): original drawings, no media files, the kit's rules, a gallery
tile and a still. Open it only if the user agrees, and leave the song, its lyrics and its own scenes out. Give back
what the video taught as well: what the user found fun or dull and what fixed it, with the numbers that moved, as a
change to this skill, so the next agent starts where you finished. Describe the song in general terms and make up
the examples.
