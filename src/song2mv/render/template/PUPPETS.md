# Artwork-ready puppet template

Experimental. These APIs and drawings may change or be removed. Try them in a copied template and send focused pull requests. Geometry tests do not establish finished animation quality.

Use `PuppetFigure` when a character needs finished artwork rather than the simple geometry of `ProfileFigure`.
`PuppetFigure` owns motion, joint positions, contacts and depth. A `PuppetParts` object supplies drawings.
The same rig accepts SVG components, transparent image parts, or a mixture. `cleanPuppetParts` is the bundled
neutral vector example. Character-specific illustration atlases belong in the video's work folder.

## Start with the working example

```tsx
import {PuppetFigure, cleanPuppetParts, roundProfile} from "../kit";

<PuppetFigure parts={cleanPuppetParts} profile={roundProfile}
  action={{kind: "bass", time: T - 12, bpm: 112}}
  x={600} y={850} scale={1.5} />
```

Render an action only during its planned interval. Elapsed action time must be finite and non-negative.
The default performance continues; use `performance={{kind: "phrase", duration: 5}}` for a finite phrase
that eases its accents and holds the complete final pose. `performance={{kind: "none"}}` keeps the basic
pose motion. Phrase duration is explicit; the example's five seconds is not a global action limit.

After installing the template dependencies:

```bash
npm run typecheck
npm run test:assets
node render.mjs src/sample-song.json --composition Puppet-Gallery --out /tmp/puppet-preview
npx remotion render Puppet-Actions /tmp/puppet-preview/actions.mp4
```

The gallery shows walk, phone and bass. `Puppet-Actions` shows six seconds of each, with intentional cuts.
No song or audio is needed. The first render may download Remotion's browser.
See the repository's `docs/install.md` for setup and browser options. These are exercise scenes, not a continuous prop exchange.

## Joint exercises and dance presets

`PuppetFigure` also accepts `PuppetAction` free motions. These leave the legacy `FigureAction` API unchanged.
Use the same parts/profile as the existing walk, phone and bass actions.

```tsx
<PuppetFigure parts={cleanPuppetParts} action={{kind: "pose", exercise: "balance", time: T, duration: 4}} />
<PuppetFigure parts={cleanPuppetParts} action={{kind: "dance", style: "step-touch", time: T, bpm: 112, cycles: 2}} />
```

| Exercise | What it tests |
|---|---|
| `arm-raise` | Both arms follow outward arcs, with fixed segment lengths and open hands. |
| `hands-together` | Separate hand centres bring their palm edges together, then separate. |
| `squat` | A shallow frontal bend with planted soles and lowering hips. |
| `balance` | Weight moves over the left support foot before the right foot rises; it returns after landing. |
| `weight-shift` | Hips and upper body shift left/right while both shoes remain planted. |

Exercises approach, hold and release within `duration` (default 4 s), then hold the neutral end pose.
They do not automatically repeat; pass elapsed time modulo the duration when repetition is intended.

| Dance | Cycle length | Motion |
|---|---|---|
| `bounce` | 4 beats | Grounded knee pulse with a smaller delayed head/shoulder response. |
| `step-touch` | 8 beats | Half-time side step and touch, support preload before every lift, then return. |
| `funk` | 4 beats | Side weight shift, knee pulse and offset upper-body/arm accents. |

`bpm` defaults to 112 (positive and <=240). With no `cycles`, dance continues after an initial arm pickup.
A positive integer `cycles` ends on a complete cycle, eases velocity and holds the entire final pose.
Use `puppetCycleBeats(style)` for scheduling; equal BPM does not mean equal phrase length.
For a planned stop, prefer complete cycles over clamping an arbitrary time in the middle of a step.

`Puppet-Motion-Lab` is a 20 s silent study: exercises at0–4 s, the same exercises with joint overlays at4–8 s,
three dances at8–16.57 s, then final holds. `Puppet-Motion-Gallery` shows the eight presets as a still.
Use these composition names with the preview commands above. `showRig` draws cyan bones/joints and green
planted-foot or amber lifted-foot markers at the actual rendered transforms.

Free motions keep feet in world space while hips move in body space. Their exported contact flags identify
planted feet and palm contact. Hand art must implement the new `open` and `palm` kinds; the bundled skin does.
A `palm` hand's contact point is `[8,0]` on the left, `[-8,0]` on the right, with separate hand centres.
Adapters with only gripping-hand artwork need additional drawings before those exercises can read correctly.

`test-puppet-motion.mjs` checks 16,476 poses across three profiles, 29,562 planted intervals, palm contacts,
weight transfer before lift, loop position/velocity, finite-stop velocity, complete final holds and seek stability.
The inspected artwork is the Round neutral skin; passing geometry does not certify every skin/profile.
The presets are stylized authored 2D gestures. They do not model full-body physics, self-collision, toe/heel
roll, ankle rotation, spins, jumps or continuous walk-to-dance transitions. The lab intentionally cuts between
exercise and dance pages. Visible cloth segmentation remains an artwork/2D projection limitation.

## Replace the artwork, keep the motion

A `PuppetParts` object contains these component slots. Slot components receive plain values, not a private clock.
Keep action-specific placement and visibility in the shared renderer.

| Slot | Coordinate contract | What to supply |
|---|---|---|
| `Head` | Local origin is the head centre; scale to `profile.head.rx/ry`. Renderer applies head rotation. | Head drawing or image; use `look`, `blink`, `joy`, `antenna` and `pose.headTurn` when the artwork supports them. |
| `Torso` | Draw in profile body coordinates, shoulder/hip given in `profile`. Receives `pose`. | Clothes, collar and neck. Respect narrowed walking shoulders (`half * .62`) and body width (`*.74`). |
| `Segment` | Start joint `(0,0)`, end joint `(0,length)`; `width` is nominal cloth thickness. | Upper arm, forearm, thigh or shin. Use solid, slightly overlapping end caps; never hollow socket openings. |
| `Hand` | Local origin is the calibrated contact point. Renderer places and turns it with the prop. | Relaxed, phone, fret, pluck, open and palm poses. `amount` drives touch/pluck articulation. |
| `Shoe` | Local origin is ground/sole. Top meets the ankle 12 units above it. | Shoe; keep its sole at y=0. |
| `Bass` | Body centred `(0,0)`, neck to the right; string contacts are `[-9,0]` and `[fret,0]`. | Instrument artwork matching the existing 4-string geometry. Recalibrate the interaction if its shape changes. |
| `Phone` | Centre `(0,0)`, nominal 34×56; grip at `[16,18]`. | Phone artwork. |
| `Back` (optional) | Body coordinates; drawn behind the figure. | Tail, abdomen or a rear accessory. |

The renderer orders far walking arm/hand behind legs and torso. It rotates upper body, instrument and both
hands in one space; the strap also uses the instrument transform. Feet stay in ground space when the body
lowers. New anatomy or a different instrument is a rig calibration task, not just an artwork replacement.

## Use an illustration atlas

An atlas is one image containing separate parts, with transparent space between them. Keep it under
`public/` in the copied video template. `render.mjs` now carries that folder into its temporary public directory,
while staging input audio under a separate generated filename. Remotion's `Img` waits for parts to load.

`AtlasSprite` selects a part around a pivot. `AtlasSegment` aligns two painted joint anchors with the rig.
Both crop the original image at render time. They do not modify the source pixels.

```tsx
import {staticFile} from "remotion";
import {AtlasSprite, AtlasSegment, type AtlasSource, type AtlasBone, type PuppetSegmentProps} from "../kit";

const atlas: AtlasSource = {src: staticFile("character-parts.png"), width: 1536, height: 1024};
const sleeve: AtlasBone = {
  cell: {x: 800, y: 50, width: 240, height: 300},
  start: [930, 105], end: [910, 285], width: 165,
};
const Segment = ({length, width}: PuppetSegmentProps) =>
  <AtlasSegment atlas={atlas} bone={sleeve} length={length} width={width} />;
```

All coordinates are **absolute pixels in the source atlas**. `bone.width` measures the painted part, excluding
transparent gutter; the cell is its crop. Supply separate records for each segment and appropriate hand pose.
A head uses `{cell, pivot}` with `AtlasSprite` and a requested output width/height. A part must stay inside its
cell throughout the intended crop. The adapter validates cell bounds, finite positive dimensions and distinct
bone anchors; validation cannot identify a misplaced artistic pivot.

Generate or draw parts with closed cloth caps, clean alpha, enough joint overlap, distinct hand poses and the
approved character reference. Inspect the assembled puppet before drawing more scenes. The first illustrated
proof had hollow knee sockets despite valid anchors; the source artwork had to be repaired.

A flattened head contains fixed eyes and mouth. To animate facial expressions, provide separate facial layers or
an expression atlas and choose its cells from the Head props. A static head does not acquire a blink because the
rig sends one. The same applies to finger poses. This template performs layered cutout animation; it does not
implement a deforming image mesh, automatic artwork segmentation or an external animation-editor integration.

## Review before reuse

Run the supplied checks, then inspect the actual gallery and moving actions. Check joint seams, limb length,
sole/ankle fit, far-hand depth, face/prop overlap, all hand contacts, clip boundaries and source alpha. Check
start, contact, release and settled frames, plus normal-speed motion when available. Recheck at the actual
camera size and aspect ratio. Passing numeric checks does not establish appealing acting.

`test-puppets.mjs` covers 1,083 performance poses across all three proportions, 63 artwork/action cases,
8 atlas transforms, finite phrase holding, continuing loops, unique SVG IDs and invalid atlas inputs. Other
asset tests retain planted-feet and prop-contact coverage. Recalibrate and review every new artwork adapter.

The bundled clean skin and work-folder illustrated/vector examples demonstrate the API. Their quality is not a
promise that arbitrary replacement artwork will fit. The current built-in actions do not implement continuous
walking with a prop, starts/stops/turns, storage, exchanges, note-accurate fingering, lip-sync or all camera angles.
