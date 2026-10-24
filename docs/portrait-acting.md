# Reusable portrait actions

`PortraitInteraction` combines the shared SVG body, hands and held object into a complete action. It takes a
calibrated head profile, placement, outfit colors and song-relative time. It imports no portrait image, song,
Remotion frame hook or application state. Use the same component with a photograph or an SVG head.

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
16-degree downward projection. Previously, the notebook moved independently of the frontal head posture.

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
