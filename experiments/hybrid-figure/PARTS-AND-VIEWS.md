# Whole-body pose drawings or a 3D skeleton with drawings per part and view?

A test run on 2026-11-13, before a video's characters were built. The question came from a warm family video drawn on
a flat 2D rig, where the same faults kept coming back and each fix was a new drawing: perspective (a camera looking
down, a child running toward the camera), joints (arms that looked stuck on, round shoulder caps) and jumps in hand,
head and eye size where one drawing handed over to the next. Should one character be drawn in many whole-body shapes,
one per scene, motion and angle, or drawn per part and per view on a shared skeleton, in 3D where perspective matters?

**Answer, in short:** never swap whole-body drawings inside a shot; keep one continuous rig per character and swap
only parts (heads, hands, feet) by view, with the torso drawn per view and the shoulders in its outline. Where the
shot has depth (a camera above or below, motion toward or away from it, a lift), make that rig the 3D skeleton: only
it showed the depth, at about 1.4 times the tokens. Elsewhere a 2D rig is as good and cheaper. The kit carries the
skeleton (`skeleton`, the video template's `VIEWS.md`).

## Method

- Two invented characters, never real people: Pip, a toddler of about 19 months (81 cm, 4 heads tall, a yellow clip
  on her left), and Rowan, an adult (1.71 m) in a mustard sweater with a backpack. One palette and brief for both
  builds.
- Three shots at 1920 × 1080, 30 fps, reproducing the faults: **S1** a high camera (the adult's eyes) looks down on
  Pip raising both arms; the camera bends down, adult hands come in from the bottom corners and lift her (3.6 s).
  **S2** Pip runs toward a low camera, stops, raises her arms (3.6 s). **S3** Rowan walks in three-quarter view with
  the backpack and holds a strap with the near hand (4.0 s).
- **A:** the kit as it was (2D `arm()` and `limb()` with fixed bones, whole-body pose drawings swapped at the beats).
  **B:** a 3D skeleton with view picks per part (now `src/kit/skeleton.tsx`), heads, hands and feet drawn per view, the
  torso drawn as the outline of rings on the spine. One painter each on Fable, neither seeing the other's work; the
  framing at each beat matched within about 10 %.
- **Round 2:** after a blind review, a fresh painter per way (Opus) fixed that build's high and medium findings, in
  its own way, in about three rounds of render-and-look.
- **Four ways of judging:** (1) every frame logged the box, view and pose of each marked part, the arms' joints and
  the kit's body faults; (2) a video check on the rendered frames: for each head, hand and foot, the grey-level change
  inside its box from the frame before, after moving and scaling that frame as the head moved, so travel and camera
  moves cancel out; a frame changing over 2.5 times the mean of the 5 frames on each side is a pop a viewer sees at
  normal speed; (3) a blind Opus review of strips, 1:1 crops and every frame of round 1, labelled X and Y only;
  (4) the lead's own frame-by-frame review of both rounds, not blind. The harness and renders stayed outside the
  repository.

## Cost

| | A round 1 | A fix | B round 1 | B fix |
|---|---|---|---|---|
| Agent tokens (harness count; about 60 k of each is fixed overhead) | 276 k | 279 k | 401 k | 355 k |
| Tool calls / wall time | 42 / 23 min | 65 / 26 min | 77 / 42 min | 100 / 32 min |
| Renders | 5 | 6 | 13 | 11 |

Both rounds: A 555 k tokens and 107 calls, B 756 k and 177 (1.36 and 1.65 times). B's first painter spent about a
third of its rounds steering poses away from view borders and fixed four things in the skeleton. The lead's skeleton
module and measuring harness (one-time work) are not counted; the blind review took 356 k tokens.

A's first build had 12 whole-body poses; B's had none: heads 4, hands 11 shapes in two sizes, shoes 4 views. B's fix
added Rowan's torso drawn per view (three-quarter and profile).

## Numbers

Video pops: frames with a part pop (S1's open-and-close grabby hands, a beat of their own, left out). Hand pops: a
hand's box changing over 6 % in one frame (fast smooth growth counts too). Jumps: a part moving over three times its
neighbours' median step and over 8 px.

| | S1 A1 | A2 | B1 | B2 | S2 A1 | A2 | B1 | B2 | S3 A1 | A2 | B1 | B2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Video pops (frames) | 0 | 0 | 1 | 1 | 12 | 1 | 2 | 2 | 1 | 1 | 1 | 1 |
| Hand size pops | 10 | 25 | 11 | 17 | 27 | 0 | 11 | 12 | 19 | 19 | 16 | 12 |
| Hand position jumps | 4 | 6 | 4 | 4 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Foot position jumps | 0 | 0 | 1 | 1 | 14 | 2 | 1 | 1 | 0 | 0 | 2 | 2 |
| Kit body faults | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

A measure of arm outline drawn over the chest near the shoulder was dropped: it counted A's deliberate raglan seam as
a fault and missed B1's shoulder cap, a painted shape with no outline. Judge joints in the frames.

## Blind review of round 1

A: 2 high, 7 medium, 7 low faults. B: 1 high, 7 medium, 9 low.

- **S2, B clearly.** A had legs as tubes with no knee and, at the run-to-stop hand-over, arms that snapped and hands
  that grew about 30 % in one frame (both high); still boxer fists and long legs made Pip read older. B's faults were
  low hand swaps; its Pip ran like a toddler.
- **S1, split.** A's raised arms were a bent goal post (low); B's were long thin sticks with small hands (medium). A's
  adult hands gripped her waist like paddles and its lift read as her shorts stretching; B held her under the arms and
  its camera tilt sold the lift, but a hand shrank 40 % at a swap of hand drawings. B was the more appealing shot.
- **S3, A clearly.** A passed every check. B's arm stood out of the ring torso as a round cap on the chest (high), its
  strap ran from the collar like a sash, its hand never closed on the strap, its torso read as facing front, and the
  head snapped to profile alone 3.4 s in as perspective turned the walk.

## Round 2, the lead's review

- **A's fix replaced the run's swapped drawings with one continuous 2D rig cycle:** the hand-over pop, the tube legs
  (now shaped, with a knee crease) and the jumping feet went; hand pops in S2 fell from 27 to 0 and video pops from 12
  frames to 1 (a head view swap at 3.2 s). It also moved the adult's hands under her arms, drew the fist with a thumb
  and the sleeves into the shirt. What it could not do: a knee coming at the camera is only suggested, and S1 stays a
  front view scaled up, not a child seen from above.
- **B's fix drew Rowan's torso per view,** laid along the projected spine with a deltoid at each projected shoulder in
  the same outline pass: the arm now grows out of the shoulder, the strap goes over it and the fist closes on it. One
  `steady()` decision turns head and torso to profile together. The raised arms now reach at the camera at about 44 %
  of their length. Left: an open palm still swaps to an edge-on grip at 2.7 s (141 to 88 px wide), the collar reads a
  little like a choker, and a folded arm shows an outline at the elbow.
- **After one fix each, the fault levels are close;** the difference left is depth. B shows the crown of a head under
  a high camera, a body shortening toward the floor, knees coming at the camera, sizes following distance and a hold
  under the arms from world points. A, cheaper per round, shows none of these.

## For the next video's characters

1. **One rig per character for the whole shot.** Whole-body pose drawings only between cuts, never swapped mid-shot.
2. **Pick the rig per shot.** Depth (a camera above or below, motion toward or away from it, lifts, carries): the 3D
   skeleton. Side-on or three-quarter at a steady distance: a 2D rig.
3. **Draw per part and per view, on one grid.** Heads (front, three-quarter and profile each way; up and down under
   a high or low camera), hands (open, fist, holding, pointing × palm, back, edge; one palm width; an in-between for
   close-ups), shoes (top, toe, side, heel, sole), a structured torso per view with the shoulders in its outline and
   the straps over them, limbs with shape.
4. **Avoid or plan for:** a figure crossing the frame in perspective (hold its view with `steady()`); a hand changing
   pose in close-up without an in-between; head pitch and back views without their own drawings.

## Limits of this test

One painter per way per round, on two models (round 1 Fable, round 2 Opus); round 2 reviewed by the lead, who knew
which build was which; the video check sees the rendered pixels but misses small swaps inside a moving part (a hand
shrinking during a lift); nothing was watched by a person at normal speed, so the side-by-side clips stay to be seen.
