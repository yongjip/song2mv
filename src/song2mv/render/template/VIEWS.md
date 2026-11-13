# A 3D skeleton, drawn per part and per view

Experimental. These APIs may change or be removed. Geometry tests do not establish finished animation quality.

Use `skeleton` from the kit for shots where a character moves in depth or the camera looks down or up at it: a child
running toward the camera and stopping, a lift toward the camera, a camera that bends down to someone. The skeleton is
code: joints in metres, posed by hand and foot targets, seen through a camera. The drawings stay yours, one per part
and per view. For a side-on or three-quarter shot at a steady distance, a flat rig with a torso drawn for that view
(`arm()`, `PuppetFigure`, your own) did better and cost less.

```tsx
import { skeleton as K } from "../kit";

const cam: K.Camera = { eye: [0, 0.8, 0], at: [0, 0.3, -2.2], fov: 40 };
const s = K.pose3(BUILD, { at: [0, 0, -1.8], hands: { l: [0.15, 0.9, -1.7], r: [-0.15, 0.9, -1.7] },
  feet: { l: { at: [0.05, 0, -1.8] }, r: { at: [-0.05, 0, -1.8] } }, headPitch: 0.3 }, cam);
// s.head.view ("front", "q-left", "right" …) and s.head.pitch ("up", "level", "down") pick the head drawing;
// s.arm("l").handView ("palm", "back", "edge", "tips", "wrist") the hand drawing; s.leg("l").footView the shoe;
// K.place(s.head.at, 0, 0.01) puts a drawing made in centimetres at the head, at that depth's scale.
```

## What the test showed

Three shots were built twice from one brief, once with a flat rig and whole-body pose drawings, once with this
skeleton, and reviewed blind (numbers in the repository's `experiments/hybrid-figure/PARTS-AND-VIEWS.md`):

- **Motion in depth: use the skeleton.** A toddler running toward the camera kept her size, knees and feet: in the
  flat build her legs read as tubes and the run-to-stop hand-over popped (both high severity); with the skeleton the
  reviewer found only low faults, and hand position jumps fell from 18 to 0, foot jumps from 14 to 1.
- **Heads, hands and feet are drawings, one per view,** placed and sized by the skeleton (`k`, px per metre at their
  depth). Draw every pose of a hand on one grid (the same palm width): an open hand drawn bigger than the gripping one
  still shrank 40 % in one frame although the skeleton held its size. Draw an in-between view for a close-up.
- **A structured torso is a drawing per view, with the sleeve tops in it.** The rings outline (`hullOf`) worked for a
  toddler's round body, but an adult's torso in three-quarter view read as facing front, each arm's round end showed as
  a cap on the chest, and the strap ran across it like a sash. The flat build's torso, drawn for that view with the
  sleeve top flowing from the shoulder and the strap over it, passed. Place such drawings through the projected neck,
  shoulders and hips, and hang straps on landmarks of the drawing.
- **Limbs drawn as plain tapered shapes read as sticks** when raised toward a high camera, though they foreshortened.
  Give limbs their shape (a toddler's chubby forearm, an elbow, a cuff) and keep them short of the camera's axis.
- **One outline where parts overlap.** `OneOutline` with `Fill` paints every outline before any fill, so a hand's
  fingers, a shoe's parts or a sleeve and its cuff share one outer outline. Keep an outline where a forearm crosses the
  chest, or the arm disappears into a sweater of the same colour.
- **Feet and contact.** `gait()` plants each foot while the body passes over it; `strides()` ends a walk or run with the
  last two footfalls side by side (a `gait()` that stops leaves a foot in the air). A foot shows its sole only when it
  faces the camera (`footView`). A hand's target is a point of the other figure's skeleton; `freeArm()` poses the arms
  of whoever holds the camera. The skeleton's lift sold the hold under the arms that the flat build missed.

## What it cannot do

- **No in-betweens between views:** a swap changes the outline in one frame. A view picked by angle flickers where the
  angle sits on a bin's border; pass the pick through `steady()` (a change shows after it holds three frames) or pose
  away from the border. Steering poses off the borders took a third of the test build's rounds.
- **Perspective changes views by itself:** a three-quarter walk across the frame turned into profile 3.4 s into a 4 s
  shot, the head snapping while the body stayed. Hold the view for the shot or put the swap on a motion beat.
- **Head pitch, back views and new camera angles** each need drawings of their own and a look at the frames.
- **One depth per part:** parts are painted far to near by their middle's depth, so a long part crossing another can
  sort wrong; order such parts by hand.
- **No deformation:** no cloth folds, squash and stretch or bulge unless drawn.
- **It costs more on first use:** 1.45 times the tokens and 1.8 times the tool calls of the flat build, part of it
  fixing this module. A second video reuses the drawings.

Check the result as any character: the skill's head-turn and contact rules, `bodycheck`'s marks, and the rendered
frames at full size at every swap of drawing.
