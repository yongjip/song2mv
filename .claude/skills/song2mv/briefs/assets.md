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
2. **No logos, wordmarks, letters or brand symbols** on anything, and no real person's face. Shapes and colours
   only.
3. **One look for every painter.** TODO: the concept's style in two or three rules. For flat illustration: two or
   three tones per material (base, shade, highlight), smooth curves (no jagged polylines), one light from the top
   left, panel lines in a darker tone of the material, and no outline baked in, so that a style pack can add one.
4. **Component shape.** `export const Name: React.FC<{ T: number; x: number; y: number; s?: number; id?: string; … }>`,
   SVG for the kit's `<Svg>` (the 1920×1080 stage). The origin is the bottom middle, where the piece meets the
   ground, unless its doc comment says otherwise (a planet: its centre); `s` scales about it. A pure function of `T`
   and its props, with `rng` from `../../kit/math` for randomness. `id` names every gradient, clip path and filter,
   so two copies don't clash.
5. **Motion through props** (`legs` 0–1, `flame` 0–1, `distance` for wheels, `pose` and `phase` for a character),
   plus small idle motion from `T` where it helps (a blinking light, a flickering flame).
6. **Sizes at s = 1**, in each doc comment. People match the kit's `Person`, about 300 px tall at s = 1.
7. **Colours** from the palette by default, and props where a scene may want another.
8. **Every look the video uses.** Each piece reads well in each of them. TODO: the looks, such as plain, toon
   (`<toon.Ink id>` round each piece, one `<toon.Defs id>` in the Svg) and neon (`<line.Lines id look="neon">`), with
   `import { toon, line } from "../../kit"`.
9. **Look at your renders** at full size and in 1:1 crops (`ffmpeg -i in.png -vf crop=W:H:X:Y out.png`), and fix
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
- `out/gallery-*.png`: every piece in its states, in every look the video uses.
- A note: each piece's props, size at s = 1 and origin, and what is still weak.
