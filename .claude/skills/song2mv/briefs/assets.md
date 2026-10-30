# Asset brief: TODO song title

You draw shared pieces for a music video made with song2mv: React components that draw SVG, every frame a pure
function of song time `T`. Other painters draw the other groups at the same time, each in a workspace of its own.
Section builders then film your pieces all through the song, so a weak piece shows in many shots.

- **The video:** TODO: the concept in one line (its idea, its art style, its main character).
- **The pieces:** TODO: one line per group, each piece with the lyric-map moments it appears in and the states,
  poses or props they need, such as "vehicles: a bus (pulls in on v1-03, doors open on ch1-01)". Your group is named
  in your task.
- **Your workspace:** `<work>/video-<group>/`, a copy of the song's template. The palette is
  `src/scenes/assets/palette.ts`. TODO: the fonts and any other shared file.

## Rules

1. **Recognisable at a glance.** A viewer names each piece from its silhouette, so give it the real thing's
   proportions as you know them. TODO: what must read, such as the bus being long and boxy, the cat's ears high.
2. **People look their age.** TODO: each character's age, height and clothes, such as "the child, 18 months: half
   the mother's height". An adult is about 300 px tall at s = 1, like the kit's `Person`; draw each child at its
   height beside that adult at the same s: a toddler of one to two about half, a child of four or five about 0.6.
   Count heads against the style's adult (the kit's is about 6 heads tall): a toddler about 2 fewer, with short,
   chubby limbs, arms that reach just over the head and a round belly; a child of four or five 1 to 1.5 fewer. Size
   alone does not make a child younger: drawn with a 5-year-old's long legs, a small child still reads as five. A
   piece that pictures a character (a photo, a drawing, a face on a screen) draws it from that character's face, so
   a redesign reaches it too: one desk photo kept the old child after she was redrawn.
3. **No logos, wordmarks, letters or brand symbols** on anything, and no real person's face. Shapes and colours
   only.
4. **One look for every painter.** TODO: the concept's style in two or three rules. For flat illustration: two or
   three tones per material (base, shade, highlight), smooth curves (no jagged polylines), one light from the top
   left, panel lines in a darker tone of the material, and no outline baked in, so that a style pack can add one.
5. **Component shape.** `export const Name: React.FC<{ T: number; x: number; y: number; s?: number; id?: string; … }>`,
   SVG for the kit's `<Svg>` (the 1920×1080 stage). The origin is the bottom middle, where the piece meets the ground,
   unless its doc comment says otherwise (a planet: its centre); `s` scales about it and a figure's `flip` mirrors it. A
   pure function of `T` and its props, with `rng` from `../../kit/math` for randomness. `id` names every gradient, clip
   path and filter, so two copies don't clash. No prop is called `key` or `ref`: React keeps those, and the piece never
   gets them.
6. **Arms and legs bend like arms and legs.** Draw every arm that reaches for something (a hand to hold, a prop, the
   face) with the kit's `arm(shoulder, target, upper, lower, toward, { holds, head, who, T })` (`../../kit`), never
   with a solver of your own, and every knee with `limb(hip, foot, upper, lower, toward)`, `toward` the way the figure
   faces. For an arm, `toward` is where the elbow goes: down and out from the body's side (`[-1, 1]` on the picture's
   left, `[1, 1]` on its right), or straight down (`[0, 1]`) for a hand in front of the mouth or face. With the hand
   almost along `toward` or against it (a phone at the ear and `[0, 1]`), the elbow has no side to go to and the arm
   is drawn squashed short: point `toward` elsewhere. Draw the hand, and whatever it holds, at the `end` `arm()`
   returns: a target beyond the arm's length leaves it short, the arm straight. Pass `holds: true` when the hand meets
   something there (another hand, a prop), so that a target out of reach is reported; a hanging or outstretched arm is
   straight anyway. Pass `who` (the `id` and which arm) and `T` on every arm, and `head: { c: [x, y], r }` (the skull,
   with the hair above the ears) on an arm drawn in front of the head, except in a pose that puts the hand at the face
   on purpose (a phone, a microphone, a hand on a cheek). A video render then prints what a viewer would see wrong,
   the first time each arm shows it (`arm: WHO: FAULT at T s`): out of reach, folded into a V with the elbow up,
   squashed short, a hand on its own head. A still prints nothing the page logs, so in your test tiles write each
   arm's `faults` (what `arm()` returns) beside the figure. A hand target a scene passes in (a `hand` prop) is a stage
   point: turn it into the piece's own drawing with `toLocal(hand, { x, y, s, flip })`, and export each hand's spot at
   s = 1 (a function of the pose) for scenes to place with `toStage`. Hand in hand with a child, an adult's anchor
   puts the child where the joined hands sit out to her side, clear of her head and within her reach. A standing
   adult's hanging hand is level with a toddler's head and bigger than hers, so the joined hands touch her hair unless
   the adult bends to bring them down to her shoulder: in one video they sat on the toddler's temple in every scene.
   Reaching round someone, the hands go to their back or under them, never to their shoulders or head, and a hug or
   carry splits the figure into back and front layers so the far arm passes behind the other figure.
7. **Hands read as hands:** a mitten with a thumb at least, never a plain disc or a cuff over a blob, and a hand that
   holds something closes on it. A hand drawn on a front layer takes its forearm with it, never a hand alone, and a
   forearm seen edge-on keeps at least half its width.
8. **Motion through props** (`legs` 0–1, `flame` 0–1, `distance` for wheels, `pose` and `phase` for a character),
   plus small idle motion from `T` where it helps (a blinking light, a flickering flame). Where a scene moves a
   person from one pose to another inside a shot (sits down, reaches up), give the change a 0–1 prop or a hand
   target, so it can take 0.2–0.6 s instead of snapping in one frame. A turn from facing us to side-on needs a
   three-quarter pose between them, or it snaps however smoothly the arms move.
9. **Sizes at s = 1**, in each doc comment. People match the kit's `Person`, about 300 px tall at s = 1.
10. **Past the stage's bottom edge.** Ground, floors, walls and sky run on down to about y 3000: the 9:16 frame shows
    below y 1080, the further the wider its shot.
11. **Colours** from the palette by default, and props where a scene may want another.
12. **Every look the video uses.** Each piece reads well in each of them. TODO: the looks, such as plain, toon
    (`<toon.Ink id>` round each piece, one `<toon.Defs id>` in the Svg) and neon (`<line.Lines id look="neon">`), with
    `import { toon, line } from "../../kit"`.
13. **Look at your renders** at full size and in 1:1 crops (`ffmpeg -i in.png -vf crop=W:H:X:Y out.png`), and fix
    rough edges, gaps, wrong overlaps and floating parts before you report. Compare each piece with the real thing.

## Render, in your workspace only

If your workspace has no `node_modules`, run `song2mv render <work>/mv.json --template <work>/video-<group> --still 1`
once: it links the workspace to the shared Remotion install. Draw test tiles as components of `T` in
`src/scenes/concepts/` and export them from `src/scenes/concepts/index.ts` (replace its exports). Then, in your
workspace:

```bash
node render.mjs ../mv.json --composition Concepts --props concepts.json --name gallery-plain
```

It draws the tiles at the moment written in `concepts.json`, such as `{"T": 10}`, side by side (one export fills the
frame, four share it at half size), and prints the PNG's path. Stop only the processes you started (never `pkill`),
download nothing, and leave the other workspaces and every git repository alone.

## Deliver

- The components in `src/scenes/assets/`, their colours from `./palette`.
- `out/gallery-*.png`: every piece in its states, in every look the video uses, and every pose of a person with each
  prop it takes (a toy held, hugged, none), large enough to judge the hands at 1:1.
- A note: each piece's props, size at s = 1 and origin, and what is still weak.
- Anchors as exported functions of the pose: where a hand grips, where a child sits on a hip, the face's centre, the
  top of the head. Scenes place people against each other with them, never with typed coordinates.
