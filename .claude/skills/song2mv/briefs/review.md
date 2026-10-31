# Review brief: TODO song title

You watch one stretch of a finished music video the way a viewer will, and report everything that looks wrong. You
did not make it, so look at it fresh. Fix nothing. Other reviewers have the other stretches at the same time.

- **The video:** TODO: the concept in one line; each character with its age, clothes and what it carries; the art
  style.
- **Your stretch:** TODO: the video file, the song time at its 0 s (0 for a full render; a short's `--from`, with or
  without `--hold`), your range in the video's own seconds (A to B), and what happens in it. Or: "the characters",
  every pose and prop the scenes use, wherever they appear, with the paths of the painters' galleries and the fit
  tiles. Or: "the pieces", before the build: the galleries and fit tiles only, at 1:1 (skip steps 1 and 3 below).
- **Your lens:** TODO: "every lens", or one of bodies, framing, continuity, motion, story, text and 9:16 (at the max
  quality level, in the first round, one reviewer per lens over the whole video). With one lens, report only what it
  covers, and look at every frame that matters to it.
- **Read first:** `<work>/lyrics-map.md` (what each line shows, on which word), `<work>/map.md` (the concept and the
  continuity table: who wears and carries what, where, at what time of day). Line times are in `<work>/mv.json`.
- **Meant to look like that:** TODO: what is odd on purpose, or "nothing".
- **The render's arm warnings:** TODO: the `arm:` lines `song2mv render --json` listed under `warnings`, or "none".
  Each is the first time that arm showed the fault: look from there on.

## What a viewer finds wrong, by lens

1. **Bodies.**
   - An arm folded into a V, its elbow pointing up or across a face.
   - An arm locked straight like a strap, its hand short of what it should hold.
   - A hand drawn as a disc or a blob, with no thumb.
   - A limb through a body or a prop, or a part detached or floating.
   - Feet above or sunk into the floor.
   - In a hug or a carry, the wrong figure in front: an arm across a face.
   - A character who doesn't look their age: a toddler drawn like a school child.
2. **Framing.** A face cut by the frame's edge (at the eyes is the worst) or behind a prop; a face or the line's
   prop under the captions; an empty or dull frame (half of it floor or sky), a subject too small to read, an awkward
   crop; seams and odd colour patches.
3. **Continuity.**
   - A prop that appears or vanishes inside a shot (a toy, a bag, shoes).
   - Clothes, props or the time of day against the continuity table or the shot before.
   - A hand-over nobody sees; a prop in front of the wrong figure.
4. **Motion.** A pose that snaps in one frame; a turn from facing us to side-on with no in-between; a figure that
   jumps across the stage between two frames of one shot; flicker.
5. **Story.** The picture `lyrics-map.md` promises, on its key word: missing, late, small or off screen; an
   expression against the line; a joke that is only in the sound, nowhere in the picture.
6. **Text and 9:16.** Captions hard to read, text cut off or outside a short's safe box, a short's subject under the
   captions or the apps' buttons.

## How

Use your own folder for every file, `<work>/review/<your stretch>/` (called `DIR` below).

1. Cut out your stretch, then scan a sheet of it at 2 frames a second, each frame labelled with its song time and
   the line sung. S is the song time at the stretch's first frame: A plus the song time at the video's 0 s.

   ```bash
   ffmpeg -ss A -to B -i VIDEO -c:v libx264 -crf 16 -an DIR/stretch.mp4
   song2mv sheet DIR/stretch.mp4 --song <work>/mv.json --from S --every 0.5 --out DIR/sheet.png
   ```

   Look at every page. For the characters, scan the whole video every 3 s instead (`--every 3`), then the
   galleries and fit tiles.
2. In every shot with a person, take a full-size frame and crop each person at 1:1, then look at the hands, arms,
   face and feet (T in the video's own seconds):
   `ffmpeg -ss T -i VIDEO -frames:v 1 DIR/f_T.png` and `ffmpeg -i DIR/f_T.png -vf crop=W:H:X:Y DIR/c_T.png`.
3. Around each cut, pose change and hand-over, step through one second at 30 frames a second:
   `ffmpeg -ss T -t 1 -i VIDEO DIR/s_T_%03d.png`.
4. Only then read the scenes, without changing them, to name the culprit: `<work>/video/src/scenes/`.

With one lens, take the whole video instead of a stretch, and spend the time where the lens needs it:
- **bodies** and **framing:** step 2 in every shot, at its first and its tightest frame (a shot's drift pushes in);
- **continuity:** a list of what each character wears and carries in every shot, against the table;
- **motion:** step 3 at every cut, pose change and hand-over;
- **story:** a `--lines` sheet of every line id (a frame in each line's last word), then `--times` at a key word's
  time from `<work>/mv.json` where the picture looks missing or late;
- **text and 9:16:** every captioned line in the 16:9 video and in each short.

Edit nothing, render nothing (others may be rendering), stop only the processes you started, and stay on this
machine. Report within about 20 minutes, finished or not.

## Report

Findings, the worst first, each with:
- its song time (and a short's video time), where in the frame, what is wrong in concrete words;
- its severity: **high** a viewer notices at normal speed, **med** noticed on a pause, **low** a nitpick;
- the path of a crop that shows it, and the scene or piece that draws it if you can tell.

Then what you checked and found fine, and what you did not cover.
