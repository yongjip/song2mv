# Section brief: TODO song title

You build one stretch of a music video in your own copy of the song's song2mv template, `<work>/video-<section>/`
(named in your task): React components of song time `T` that draw SVG on the 1920×1080 stage, filmed by the kit's
storyboard. Other builders work on the other stretches at the same time, each in a copy of its own. Your section
file is merged into `<work>/video/` at the end. Read first, in this order:

1. `<work>/lyrics-map.md`: what every line shows and the key word it happens on. This is the contract.
2. `<work>/map.md`: the concept, the look, each section's energy, the hit points, how chorus 2 differs from chorus 1.
3. Steps 4 ("Build scenes") and 5 ("Render and check") of the song2mv guide (`song2mv --help` prints its path).
4. `src/kit/storyboard.tsx` and `src/kit/plan.ts` in your copy: boards, framings and planned cuts. Never write cut
   logic.

## Your files

- Write only `src/scenes/<your section file>`. It exports `BOARDS_<NAME>: Board[]` and the worlds those boards film.
  `boards.tsx` already joins every section's boards in song order (the others are empty in your copy). Don't edit
  it, nor `index.ts`, the shared files or the assets.
- Shared, read-only: `src/scenes/assets/` (`<work>/ASSETS.md` gives each piece's props, size and origin) and TODO:
  each shared file, what it exports and how every board uses it, such as "wrap each piece in `<toon.Ink id={INK}>`
  from `look.tsx`; the overlay is already over every board".
- If a piece lacks something you need (a pose, a prop), draw it in your section file and say so in your report, so
  the lead can move it into the piece. Place people against each other with the pieces' anchors (where a hand grips,
  where a child sits), never typed coordinates, and draw any arm of your own with the kit's `limb()`.
- No logos, wordmarks or brand symbols, and no real person's face.

## Boards

- Start your first board where your stretch starts, at its first section: the song's first board also covers the
  time before it, so in your copy a later start hides a gap.
- Give every board `tall` framings for the 9:16 frame. They default to the 16:9 ones, and builders who left them out
  put the subject under the captions or an overlay in the short.
- **No frame edge crosses a face.** Cut a person at the chest, waist or knees, or show the whole head; a face cut at
  the eyes looks like a mistake. Check every framing with people in it, the tall ones too.
- **Nothing snaps.** A figure changes pose over 0.2–0.6 s (move its targets) or across a cut, never in one frame; a
  prop changes hands on screen; nothing appears or vanishes inside a shot.
- **Continuity.** Every board follows the continuity table in `map.md`: what each character wears and carries, where
  they are, the time of day. A cap on a head in one shot and in a hand the next, with nothing between, is the first
  thing a viewer catches.
- **Who is in front.** Where figures touch, the one in front is drawn later: in a hug or a carry, the smaller figure
  goes between the other's back and front layers, never under a whole figure, whose arm then lies across its face.
- TODO: what is special about this song, such as "the tempo drifts: time motion by line and word times, not
  `grid.pulse` or bars".

## Render and check your stretch

Render only your copy: a half-edited file breaks every render that bundles it. A is the start of your first section
and B the start of the next builder's (`sections` in `mv.json`): a check that starts inside a line misses that line's
problem.

```bash
song2mv render <work>/mv.json --template <work>/video-<section> --from A --to B --draft --name <section> --json
song2mv check <video> --song <work>/mv.json --from A --to B --src "<work>/video-<section>/src/scenes/**/*.tsx" --json > <work>/check-<section>.json
song2mv sheet <video> --cuts <work>/check-<section>.json
song2mv sheet <video> --song <work>/mv.json --lines <your lyric map ids, comma separated> --out <work>/renders/<section>-lines.png
song2mv render <work>/mv.json --template <work>/video-<section> --from A --to B --aspect 9x16 --draft --name <section> --json
song2mv sheet <tall video> --song <work>/mv.json --every 2 --out <work>/renders/<section>-tall.png
```

`<video>` and `<tall video>` are the paths under `outputs` in the renders' results. Iterate until `check` passes and
every row of the lines sheet shows its picture on its key word, and until the tall sheet shows each subject above the
captions' dashed line and the picture down to the frame's bottom edge; look at every page. Stop only the processes
you started; never `pkill`.

## Report

What you built (boards and worlds), the check result, the sheet paths, the continuity state your stretch starts and
ends in (who wears and carries what), and anything you could not do.
