# Experimental hybrid figure

This standalone study draws 2D SVG artwork over a procedural 3D body. It is an early prototype. Its API, proportions and drawings may change or be removed. Try it, report what fails, and send focused pull requests.

Clone this repository to run the study. It is not included in the Python wheel or copied video template.

The regular song2mv template does not import this study. Its Three.js dependency stays in this folder. No song, audio, generated images or private timing data is included.

## Run the study

Use Node 22 or newer. From this folder:

```sh
npm ci
npm run typecheck
npm test
npm run studio
```

Render silent previews:

```sh
node render.mjs Hybrid-Gallery out/gallery.png
node render.mjs Hybrid-Actions out/actions.mp4
node render.mjs Head-Turn out/head-turn.mp4
```

The first render may download Remotion's browser. To use an existing Chrome executable, set `REMOTION_BROWSER_EXECUTABLE` to its path. No personal browser path is stored in the code. These are Remotion renders, so the repository's Remotion licensing note also applies.

`Hybrid-Actions` has seven separate six-second exercises: walk, phone, bass, heel/toe roll, torso turn, forward reach and dance. Cuts separate the exercises. `Hybrid-Gallery` shows the walk, phone and bass with three drawing variants. `Head-Turn` isolates the directional head drawing.

## Reuse the parts

```tsx
import {HybridFigure} from "./src/HybridFigure";

<svg viewBox="0 0 1920 1080">
  <HybridFigure action="bass" time={2.4} bpm={112} view="quarter" />
</svg>
```

Pass elapsed seconds, not a frame number. The `front` and `quarter` cameras use a 1920 by 1080 stage. Place the whole figure with an outer SVG transform.

- `rig/pose-rig.js` solves joints and support. `foot.js` contains the heel/toe pivots. `gait-source.js` contains the authored walking and dance exercises.
- `rig/projection.js` turns 3D points, depth and shoe outlines into drawing coordinates.
- `src/Character.tsx` draws sleeves, trousers, hands and instrument layers. `HybridFigure` accepts optional `Head` and `Body` components using the props in `src/types.ts`.
- `src/AntHead2D.tsx` is an original example with five authored views. It keeps the same anatomical eyes across angles and hides far features at the silhouette. A different character needs its own drawings.
- `runtime.js` joins those pieces without a song. Bass rhythm takes `bpm`. Walking and dance use the fixed timing of the original exercises.

The `appearance` values `lead`, `guitarist` and `drummer` select example artwork. They do not select a role in a story. Keep a sampler per independent rig when using `createSampler` directly. Calls are deterministic and do not depend on seeking order.

## Known limits

The body has fixed proportions and two arms and legs. New anatomy, body proportions, instruments and grasped props need calibration. This is not automatic character retargeting, motion capture, collision simulation or full-body physics.

Heads support front through left/right profile, within 90 degrees. There is no rear head view. Head pitch does not supply separately authored up/down face drawings. Some sleeve and torso overlaps remain stylized. New camera angles and extreme reaches need their own visual proof.

Walking stops at the end of its short authored path. Dance is a finite study, not a general dance library. The phone exercise is separate from walking. Bass fingers show a rhythmic gesture, not transcribed notes. Facial expressions do not provide lip-sync.

The tests check fixed bone lengths, foot support, deterministic seeking, BPM input and the front-view drawing boundary. They do not certify attractive or natural motion. Inspect the rendered head turns, grips, complete actions and cuts before using this study in a finished video.

## Contribute or simplify

Open a PR with one small change and its reproduction command. Include before/after frames or a short clip as a PR attachment, not as a repository media file. State the action, camera, time and expected behavior. Run the checks above. Improvements to depth, artwork, support, contacts and packaging are welcome. Removing an unsuccessful preset or reducing this experiment is welcome too.
