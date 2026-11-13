# A 3D skeleton, drawn per part and per view

Experimental. These APIs may change or be removed. Geometry tests do not establish finished animation quality.

Use `skeleton` from the kit for shots where a character moves in depth or the camera looks down or up at it: a child
running toward the camera and stopping, a lift toward the camera, a camera that bends down to someone. The skeleton is
code: joints in metres, posed by hand and foot targets, seen through a camera. The drawings stay yours, one per part
and per view. For a side-on or three-quarter shot at a steady distance, a 2D rig (`arm()`, `limb()`, `PuppetFigure`,
your own) with a torso drawn for that view is as good and cheaper.

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

Three shots were built both ways from one brief, reviewed blind, then fixed once each and measured again (numbers in
the repository's `experiments/hybrid-figure/PARTS-AND-VIEWS.md`):

- **Never swap whole-body drawings inside a shot.** The run-to-stop pop (hands 30 % bigger in one frame), tube legs
  and jumping feet came from swapping whole-body pose drawings. One continuous rig across the hand-over removed them,
  in 2D as in 3D: hand pops in the run fell from 27 to 0 when the flat build's fix replaced its drawings with a 2D rig.
- **Depth is what the 3D skeleton adds.** A camera above showed the crown of the head and a body shortening toward
  the floor, a knee came at the camera, sizes followed distance, and the adult's hands held the child under the arms
  from world points. The 2D builds showed a front view scaled up, and a knee toward the camera only suggested.
- **Heads, hands and feet are drawings, one per view,** placed and sized by the skeleton (`k`, px per metre at their
  depth). Draw every pose of a hand on one grid (the same palm width); a hand goes end-on (`tips`, `wrist`) only within
  about 25 degrees of the line of sight. `fingers` bends a wrist so a gripping hand turns. A swap from an open palm to
  an edge-on grip still changes the outline in one frame: draw an in-between for a close-up.
- **A structured torso is a drawing per view, shoulders in its outline.** The fix that passed lays the view's drawing
  along the projected spine (neck base to pelvis), its height from the spine's projected length and its width from how
  wide the chest's 3D section is seen, and draws a round deltoid at each projected shoulder, bridged to the neck, in the
  same `OneOutline` pass: the arms hang where the skeleton puts them and the near sleeve's top is the shoulder's own
  outline. Straps go over that shoulder. The outline of rings (`hullOf`) worked only for a toddler's round body; on an
  adult in three-quarter view it read as facing front, each arm's round end a cap on the chest.
- **Hold views for the shot.** Perspective turned a three-quarter walk toward profile by itself; one `steady()`
  decision driving head and torso made them swap together in one frame instead of the head snapping alone.
- **Limbs drawn as plain tapered shapes read as sticks** when raised toward a high camera; reaching at the camera they
  show at about 45 % of their length, which reads as reaching.
- **Feet and contact.** `gait()` plants each foot while the body passes over it; `strides()` ends a walk or run with
  the last two footfalls side by side. A foot shows its sole only when it faces the camera (`footView`). A hand's
  target is a point of the other figure's skeleton; `freeArm()` poses the arms of whoever holds the camera.

## What it cannot do

- **No in-betweens between views:** a swap changes the outline in one frame. A view picked by angle flickers where the
  angle sits on a bin's border: pass the pick through `steady()` or pose away from the border.
- **Head pitch, back views and new camera angles** each need drawings of their own and a look at the frames.
- **One depth per part:** parts are painted far to near by their middle's depth, so a long part crossing another can
  sort wrong; order such parts by hand.
- **No deformation:** no cloth folds, squash and stretch or bulge unless drawn.
- **It costs more:** over a build and a fix round, 1.36 times the tokens and 1.65 times the tool calls of the 2D way
  (756 k against 555 k tokens), part of it fixing this module.

Check the result as any character: the skill's head-turn and contact rules, `bodycheck`'s marks, and the rendered
frames at full size at every swap of drawing.
