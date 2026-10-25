# Reusable portrait actions

`PortraitInteraction` combines the shared SVG body, hands and held object into a complete action. It takes a
calibrated head profile, placement, outfit colors and song-relative time. It imports no portrait image, song,
Remotion frame hook or application state. Use the same component with a photograph or an SVG head.

## A photograph as the head

Put the photo in the song's template copy, next to its scenes, and import it: `song2mv render` ignores `public/`.
PNG and JPEG imports type-check, as Remotion declares them; WebP does not. Draw it with Remotion's `<Img>` in a
`<foreignObject>` of the photo's size: a missing file then stops the render, whereas an SVG `<image>` rendered
Chrome's broken-image icon into the frame and the render succeeded.

```tsx
import { Img } from "remotion";
import { PortraitBody, PortraitCutout, PortraitInteraction, portraitHeadTransform } from "../kit";
import face from "./face.png";

const s = 0.26,
  anchor: [number, number] = [500, 800];
const body = ([x, y]: [number, number]): [number, number] => [s * (x - anchor[0]), -235 + s * (y - anchor[1])];
const profile = { neck: [0, -235] as const, ear: body([667, 455]), temple: body([645, 390]) };
const mask =
  "M335 430A165 215 0 1 1 665 430A165 215 0 1 1 335 430Z M330 420Q300 200 500 190Q700 200 670 420Z " +
  "M303 455A30 48 0 1 1 363 455A30 48 0 1 1 303 455Z M637 455A30 48 0 1 1 697 455A30 48 0 1 1 637 455Z " +
  "M420 600H580V800H420Z";

const Head = ({ angle = 0, pitch = 0 }) => (
  <g transform={portraitHeadTransform({ neck: profile.neck, angle, pitch })}>
    <PortraitCutout y={-235} s={s} anchor={anchor} path={mask}>
      <foreignObject width={1000} height={1000}>
        <Img src={face} style={{ width: "100%", height: "100%" }} />
      </foreignObject>
    </PortraitCutout>
  </g>
);

<PortraitInteraction action="phone" time={T - 12.4} profile={profile} x={1300} y={900} s={1.4}
  renderHead={(angle, pitch) => <Head angle={angle} pitch={pitch} />} />
<PortraitBody x={600} y={900} s={1.4} foregroundCollar><Head /></PortraitBody>
```

Measure once, in the photo's pixels: the neckline (`anchor`, which lands on the body's collar at (0, −235)), the
screen-right ear and the temple, where the hair meets the skin beside the eyebrow. `mask` goes round the head, the
hair and the neck and ends at the neckline; a whole bust doubles the body's shoulders. The profile takes body units,
`neck + s × (point − anchor)`, never the photo's pixels. Keep `s`, `anchor`, `mask` and the landmarks in one profile
per character next to the song's scenes, and one head component that every pose and action reuses.
`foregroundCollar` draws a `PortraitBody`'s collar over the cut, as `PortraitInteraction` always does.

Choose `s` so that the ear lands in reach. A call reaches an ear right of the neck and about 40 to 100 above it;
head-touch, a temple right of the neck, above the ear and up to about 125 above the neck (the demo's two heads: ears
79.5 and 91.5 above the neck, temples 110 and 118). Outside that the action throws a `RangeError`: change `s` or
`anchor`, not the limits. A call sways the head about a degree each way, so an ear within 2 of the upper limit passes
the first frame and throws up to 1.3 s in: keep a margin, or draft the whole call.

Then look at each character at the camera's scale. Check the crop in a pose that leaves the head clear, since a
call's hand and phone cover the ear side, and check that the hand at the temple leaves the eye in view. Hair that
falls past the neckline is cut there and can leave a gap above a shoulder: in one trial a long-haired portrait got two
small hair-colored shapes, one behind the head and one at the collar. A photo keeps its expression and its gaze, so
the acting is the head's turn and nod, the lean and the hands.

## The plain body

`PortraitBody` with `gesture="hold"` grips at (±72, −116) in body units: the lower corners of `poster.Notebook` at
(0, −160), s 0.3, or of anything 144 wide whose bottom edge is at −116, such as a sign. The sleeves and fingers go
behind `frontProp` and the thumbs in front.

Its `phone` gesture holds the phone in one place, by a sample head's jaw, whatever the head: on two photo heads in a
trial it floated beside the cheek. An arm raised by angle does not reach the head either: `armR` 170 left a fist
beside the face that read as cheering. For a call or a hand at the head use `PortraitInteraction`, which puts the
phone on each profile's ear and the hand on its temple.

## Compact head touch

The action still reaches the calibrated temple in 0.55 seconds and holds there. Its reach bends two arm segments
while interpolating each segment's length from rest to the held pose. This prevents the short, collapsing forearm
that can result from directly interpolating elbow/wrist positions. A sampled joint/fingertip path distributes
progress over time so the tighter path does not rush through its bend. The sampler is deterministic and has no
cache or frame state; rendering an excerpt uses the same pose as rendering the whole song.

The head callback rotates around the same neck used for the temple landmark. The hand stays in front, its wrist
rotation follows the forearm, and the open index contour meets the transformed temple when the reach completes.
Do not pass independent arm angles or patch a wrist for a particular scene.

## Writing posture and head projection

The notebook, support hand, writing arm, nib and visible ink retain their common contact geometry. During the
0.6-second preparation the torso leans toward the book and the head settles into an 8-degree turn and a bounded
16-degree downward projection. Previously, the notebook moved independently of the frontal head posture. The book
rises 24 into place meanwhile: start the action 0.6 s before the first stroke and keep `progress` at 0 until then.

The second `renderHead` argument is downward pitch in degrees. Existing callbacks accepting only `angle` continue
to work. Adapters can apply both with `portraitHeadTransform`:

```tsx
<PortraitInteraction
  action="write" time={elapsed} progress={writingProgress}
  profile={{neck: [0, -235], ear: [51, -326.5]}}
  x={600} y={800} s={1.2}
  look={{color: "#245c88"}}
  renderHead={(angle, pitch) => (
    <g transform={portraitHeadTransform({neck: [0, -235], angle, pitch})}>
      <MyHead />
    </g>
  )}
/>
```

Keep chest decoration outside the projected head group. `portraitHeadTransform` preserves the calibrated neck,
keeps horizontal scale, and clamps projection to 0–30 degrees. It throws on malformed/nonfinite inputs. It projects
a flat head plane; it does not alter eyes inside a photograph. A code-drawn head can direct its own eyes from the
same pitch value. Portrait images remain application assets, not dependencies of this library.

## Adding an action

A new action goes into `resolveInteraction` and `PortraitInteraction`, so that every scene gets its contacts from
one place. What building the call, writing and head-touch taught:

- Decide first what touches what and what is drawn in front, at rest, through the move and held, and keep the contact
  point through the move.
- Draw a held object and the hand parts on it under one transform, as the phone, its palm and its grip share one, so
  that they cannot drift apart.
- Turn the hand from the current forearm by a wrist angle normalized to ±180°. Interpolating between two absolute
  angles bent the wrist backwards halfway through a reach whose two ends were both right.
- Test the rendered SVG through the whole move, not only the resolver's ends, and add a mutation that breaks each
  rule to show that the test catches it.
- Look at the first, middle, extreme and held frames at the camera's scale with both test profiles: a first open
  hand met the temple and passed the contact checks but read as a salute, and only looking at the frames caught it.

## Verification

Run `npm run typecheck` and `npm run test:assets` in the template. The asset suites inspect emitted SVG and preserve
the existing contact, layer, arm-length, wrist-angle and 1ms motion limits. Narrow/wide head profiles, multiple
scales, rotations and reflected placements are covered. Independent posture assertions inspect the actual head
matrix and neck marker. Deliberate sideways-sweep and frozen-head mutations must fail, alongside the previous
contact and wrist mutations. These checks do not replace reviewing the action with the actual head and camera.

Kit gallery tile 27 uses the head projection callback with two different heads for phone/writing. Tile 28 shows
the reusable head-touch action at rest, approach, contact and hold. No generated bitmap is needed for either tile.

## Standalone asset demo

The `Portrait-Actions` composition (`src/PortraitDemo.tsx`) animates the same three actions with two code-drawn
head profiles, outfit colors and scales. It uses no portrait media or song input. From the template:

```sh
npx remotion render src/index.ts Portrait-Actions portrait-actions.mp4
```

Use an explicit free `--port` when another Studio is open. The production `render.mjs` wrapper selects a free port
automatically for song rendering. This demonstration uses native Remotion because it has no song or lyric timing
for `song2mv check`; inspect its encoded frames and run the SVG asset suite instead of treating music checks as
passes.
