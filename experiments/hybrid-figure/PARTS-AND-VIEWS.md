# Whole-body pose drawings or a 3D skeleton with drawings per part and view?

A test run on 2026-11-13, before a video's characters were built. The question came from a warm family video drawn on
a flat 2D rig, where the same faults kept coming back and each fix was a new drawing: perspective (a camera looking
down, a child running toward the camera), joints (arms that looked stuck on, round shoulder caps) and jumps in hand,
head and eye size where one drawing handed over to the next. Should one character be drawn in many whole-body shapes,
one per scene, motion and angle, or drawn per part and per view on a shared skeleton, in 3D where perspective matters?

**Answer, in short:** use a 3D skeleton for motion in depth and camera moves, with heads, hands and feet drawn per
view and a structured torso drawn per view with its sleeve tops. Keep the flat rig with a torso drawn for the view
for side-on and three-quarter shots at a steady distance. Neither way fixes hand-pose swaps or stick-like limbs by
itself: those need drawings on one grid and limbs with shape. The kit now carries the skeleton (`skeleton`, the video
template's `VIEWS.md`).

## Method

- Two invented characters, never real people: Pip, a toddler of about 19 months (81 cm, 4 heads tall, a yellow clip
  on her left), and Rowan, an adult (1.71 m) in a mustard sweater with a backpack. One palette and brief for both builds.
- Three shots at 1920 × 1080, 30 fps, reproducing the faults: **S1** a high camera (the adult's eyes) looks down on
  Pip raising both arms; the camera bends down, adult hands come in from the bottom corners and lift her (3.6 s).
  **S2** Pip runs toward a low camera, stops, raises her arms (3.6 s). **S3** Rowan walks in three-quarter view with
  the backpack and holds a strap with the near hand (4.0 s).
- **A:** the kit as it was (2D `arm()` and `limb()` with fixed bones, whole-body pose drawings swapped at the beats).
  **B:** a 3D skeleton with view picks per part (now `src/kit/skeleton.tsx`), heads, hands and feet drawn per view, the
  torso drawn as the outline of rings on the spine. One painter each, both on Fable, neither seeing the other's work;
  the framing at each beat matched within about 10 %.
- Every frame logged what was drawn: the box, view and pose of each marked part, the arms' joints, the kit's body
  faults, and how many px of an arm's own outline showed over the torso near the shoulder. A fresh Opus reviewer saw
  strips, 1:1 crops and every frame of both builds labelled X and Y only, and listed faults by song2mv's review rules.
  The test harness and renders stayed outside the repository.

## Cost

| | A: flat + pose drawings | B: skeleton + parts |
|---|---|---|
| Agent tokens (harness count, about 60 k of it fixed overhead) | 276 k | 401 k |
| Tool calls / wall time | 42 / 23 min | 77 / 42 min |
| Renders until handed in | 5 | 13 |
| Code written | 828 lines | 1,211 lines + 150 lines of fixes to the skeleton |
| Drawings | heads 3 (+ blink, mouth), hands 7, shoes 2, 12 whole-body poses, 1 three-quarter body | heads 4 (+ 2 mouths), hands 11 × 2 sizes, shoes 4 × 2 looks, no torso or whole-body drawing |

B's painter spent about a third of its rounds steering poses away from view borders where drawings flickered. The
lead's skeleton module and measuring harness (one-time work) are not counted. The blind review took 356 k tokens.

## Numbers, frame to frame

Size pops: a part's box changing by over 6 % in one frame; hand/head pops: a hand's size over the head's changing by
over 15 %; jumps: a part moving over three times its neighbours' median step and over 8 px.

| | S1 A | S1 B | S2 A | S2 B | S3 A | S3 B |
|---|---|---|---|---|---|---|
| Head size pops | 0 | 1 (a view swap) | 0 | 0 | 0 | 0 |
| Hand size pops (worse hand) | 10 | 11 | 27 | 11 | 19 | 16 |
| Largest hand change in one frame | 41 % | 34 % | 60 % | 31 % | 15 % | 34 % |
| Hand/head pops | 8 | 9 | 16 | 2 | 0 | 5 |
| Hand position jumps | 4 | 4 | 18 | 0 | 0 | 0 |
| Foot position jumps | 0 | 1 | 14 | 1 | 0 | 2 |
| Soles shown on a planted foot | 0 | 0 | 0 | 0 | 0 | 0 |
| Arm outline over the chest near the shoulder, mean px | – | 0 | 23 | 4 | 60 | 20 |
| Kit body faults (limb, contact, proportions) | 0 | 0 | 0 | 0 | 0 | 0 |

The shoulder number misled: B's S3 outline over the chest was lower, yet the reviewer saw a round shoulder cap there,
because the cap was the arm's painted round end standing out of the torso, not an outline. Judge joints in the frames.

## Blind review

A: 2 high, 7 medium, 7 low faults. B: 1 high, 7 medium, 9 low.

- **S2, B clearly.** A had both of the old faults at high severity: legs as tubes with no knee, and at the
  run-to-stop hand-over the arms snapped and the hands grew about 30 % in one frame (the head moved 7 px). Its still
  boxer fists and long legs made Pip read older. B's faults were low hand swaps; its Pip ran like a toddler.
- **S1, split.** A's raised arms were a bent goal post (low); B's were long thin sticks with small hands (medium),
  although they foreshortened. A's adult hands gripped Pip's waist like paddles and its lift read as her shorts
  stretching; B held her under the arms and its camera tilt sold the lift, but a hand shrank 40 % at a swap of hand
  drawings and her sleeves hid her forearms. B was the more appealing shot.
- **S3, A clearly.** A passed every check: a sleeve flowing from the shoulder, strap ends on the shoulder and in the
  pack, a fist closed on the strap, planted feet. B failed the sleeve (a round cap on the chest, the arm stuck on, high),
  its strap ran from the collar like a sash, its hand never closed around the strap, its torso read as facing front
  under a three-quarter head, and the head snapped to profile 3.4 s in as perspective turned the walk.

## For the next video's characters

1. **Pick the way per shot.** Motion toward or away from the camera, lifts and carries, and camera moves: the 3D
   skeleton. Side-on or three-quarter shots at a steady distance: a flat rig with a torso drawn for that view.
2. **Draw per part and per view, on one grid.** Heads (front, three-quarter and profile each way, plus up and down
   where the camera is above or below), hands (open, fist, holding, pointing × palm, back, edge; plus an in-between for
   close-ups), shoes (top, toe, side, heel, sole), all at one size grid so a swap keeps the size the skeleton gives.
3. **Joints are drawings, not overlaps.** Draw a structured torso per view with the sleeve tops flowing from the
   shoulders and the straps over them; place it through the projected neck, shoulders and hips. Round bodies (a
   toddler's) can be the rings outline. Draw overlapping parts inside one outline pass; keep an outline where a forearm
   crosses the chest. Give limbs shape (a chubby forearm, an elbow, a cuff): plain tapered shapes read as sticks.
4. **Avoid, or plan for:** a figure crossing the frame in perspective (its view changes by itself: hold it, or put the
   swap on a beat); arms raised toward a high camera in close-up (the sticks); a hand changing pose without an
   in-between in a close-up; head pitch and back views without their own drawings.

## What the skeleton cannot do

No in-betweens between views; flicker at view borders (`steady()` holds a view three frames, untested in a shot);
head pitch, back views and new angles need their own drawings; one depth per part, so a long part crossing another
can sort wrong; no deformation (folds, squash and stretch). It is not the `hybrid-figure` study's Three.js runtime:
it has no dependency and lives in the kit.

## Limits of this test

One painter per way, one take each, on one model; frames only, never at normal speed; the shoulder number did not
match what a viewer sees. The flat build's painter knew the old faults and drew foreshortened arms by hand; the
skeleton's painter replaced per-view torso drawings with the rings outline, which is what failed in S3. A per-view
torso on the skeleton was not tried.
