# Reusable figures

Experimental. These APIs and drawings may change or be removed. Try them in a copied template and send focused pull requests. Geometry tests do not establish finished animation quality.

For finished SVG or illustrated character artwork, start with [PUPPETS.md](PUPPETS.md) and `PuppetFigure`.
The profiles below remain useful for calibrating proportions and the earlier fixed figure.

## Recommended neutral starter: Round

Use `ProfileFigure` for new neutral characters. It separates `profile` (proportions), `look` (palette),
`action` (elapsed time and timing) and `renderHead` (optional custom head drawing). The default is `roundProfile`.
Keep the original `Figure` below for compatibility with the first Donghak-ant study.

```tsx
import {ProfileFigure, roundProfile, pebbleProfile, capsuleProfile, minimalFigure} from "../kit";

<ProfileFigure profile={roundProfile} look={{...minimalFigure, shirt: "#845b94"}}
  action={{kind: "walk", time: T - 4, speed: 30}} x={300} y={850} scale={1.5} />
```

All three presets have a nominal height of 315 local pixels. They use the same motion functions and prop size.
The comparison uses the same palette, 30 local px/s walk, 28 px stride, phone raise/touch/lower timing and
112 BPM bass gesture. The 18 s `Figure-Compare` composition shows walk at 0–6 s, phone at 6–12 s and bass at
12–18 s. `Figure-Compare-Overview` shows all nine combinations as a still. Render these with the same commands
below, replacing the composition names.

| Profile | Head-height ratio | Recommended role | Tradeoff seen in the comparison |
|---|---|---|---|
| `pebbleProfile` / A | About 2.5 heads tall | Cute mascots | Large face, compact legs; narrower range of neutral adult roles. |
| `roundProfile` / B | About 3.2 heads tall | General character starter | Best balance of face, torso and prop readability in the reviewed candidates. |
| `capsuleProfile` / C | About 3.8 heads tall | Adult-human or explanatory scenes | Stronger adult walking silhouette; smaller face at the same total height. |

Two independent agent reviews recommended B for general reuse; the visual reviewer preferred C for adult-human
walking and rated B/C similarly for bass. This is a recommendation for these three candidates, not a universal
optimum or a user preference result. Reviews used sampled and dense frames, not continuous normal-speed viewing.

The new rig keeps neutral knees at about 160 degrees. During walking, the pelvis lowers slightly when needed
for a planted foot, without stretching bones or shortening the stride. The torso and face use a three-quarter
view, and the far hand stays with the far arm behind both torso and legs. Phone raising turns the face toward
the phone. Rear-limb colours derive from the chosen palette.

`test-profiles.mjs` covers 3,249 poses and 1,380 planted intervals across all three profiles. It checks fixed bone
lengths, neutral knee angles, ankle/sole alignment, bounded pelvis travel, independent prop-to-hand transforms,
rendered part counts, deterministic seeking, far-hand layer order and palette propagation. These checks accompany
visual review; they do not establish naturalness on their own.

Limits: the shared bass is a stylized rhythmic gesture, not note-accurate playing. The phone screen stays partly
visible to the viewer for readability. The three actions are independent studies with intentional cuts; storage,
prop exchange, walking with a prop and continuous start/stop/turn transitions still need implementation.
`look.kind` and vest styling belong to the legacy `Figure`; `ProfileFigure` uses the palette, and custom head art
uses `renderHead`. The default neutral drawing is not a finished character identity. Changing its proportions or
custom head requires rechecking contact, silhouette, layers and camera fit.

## Original fixed-proportion figure

`Figure` is a small, front-facing, two-arm/two-leg SVG rig. `minimalFigure` is the neutral starting look;
`donghakAntFigure` is an optional illustrated skin with antennae, a bob, a headband and a vest.
Both use the same motion, limb lengths and prop contacts. The ant is an original simplified interpretation,
not a scan or reproduction of a particular meme image. No external artwork, song or audio is required.

## Use in a scene

```tsx
import {Figure, minimalFigure, donghakAntFigure} from "../kit";

// T is absolute song time; choose the action's start in your scene map.
<Figure x={500} y={850} scale={1.5}
  look={donghakAntFigure} action={{kind: "bass", time: T - 12, bpm: 112}} />
<Figure x={200} y={850}
  look={{...minimalFigure, shirt: "#845b94"}}
  action={{kind: "walk", time: T - 4, speed: 32}} />
```

Render an action only in its planned time interval. `time` must be finite and non-negative.
`x,y` are the initial ground origin, between the feet. `scale` scales the entire figure, including travel.
`Figure` applies walking travel itself: **do not add `figurePose().travel` a second time**.
The returned SVG group belongs inside the scene's SVG. At scale 1, allow roughly x=-90…165 and y=-360…12,
plus walking displacement. Check the actual camera and captions after placement.

| Action | Parameters | Behavior |
|---|---|---|
| `walk` | `time`, optional `speed` (local px/s; default 32, zero is stationary) | Alternating foot lift, planted stance, arm swing and actual root travel. No wrap or automatic stop. |
| `phone` | `time` | Phone is already held; raise at 0.25–1.2 s, read, thumb touch at 2.1–2.95 s, lower at 4.4–5.5 s; then hold at the side. |
| `bass` | `time`, optional `bpm` (default 112; 0 < bpm <= 240) | Four strings, a repeating fret shift, finger pluck and restrained head motion. This is a rhythmic gesture, not transcription of a recording. |

The palette is a `FigureLook`; change colours via a copied preset. `kind` selects the head/clothes drawing.
Keep an identity's look stable throughout a shot. For a new anatomy, change the drawing and calibrate the
rig together; changing colours alone does not make it a winged or four-legged character.

## Reuse the contact structure

`figurePose(action)` returns the geometry the component draws. Feet are ground contact points; leg ends
are ankle joints 12 local pixels above the soles. Arms and legs have fixed segment lengths. `phone.origin`
and both bass contacts share their prop coordinate system; `figurePropPoint` maps a prop point to body space.

Keep layers in this order: rear appendages, legs/shoes, torso, strap, arms, head, props, gripping hands/fingers.
A hand sits over the prop at its shared contact, never at an independently animated per-shot coordinate.
The state is a pure function of elapsed time, so a separately rendered interval matches the same full render.

The demo cuts between independent exercises. It does **not** implement putting away the phone, collecting a bass,
turning around, starting/stopping a walk, walking while holding a prop, a rear view, lip-sync or arbitrary poses.
Plan and implement those transitions explicitly before using them in a continuous narrative. Do not swap `kind`
inside a continuous shot and call the prop change a handover. The preview's 16:9 layout is not a portrait layout.

## Preview and verify

From the copied video template after dependencies are installed:

```bash
npm run typecheck
npm run test:assets
node render.mjs src/sample-song.json --composition Figure-Overview --out /tmp/figure-preview
npx remotion render Figure-Actions /tmp/figure-preview/actions.mp4
```

`Figure-Overview` displays both skins in all three actions. `Figure-Actions` is an 18 s silent 1080p30 study:
0–6 s walk, 6–12 s phone, 12–18 s bass. No song download or sync is required. The first render may download Remotion's browser.
See the repository's `docs/install.md` for setup and browser options.

`test-figures.mjs` samples 1,083 poses and 461 planted-foot intervals at the default settings. It checks fixed
bone lengths, temporal endpoint continuity, planted feet, phone/bass contacts, rendered limb/prop counts and
seek-stable SVG for both skins. It also rejects invalid action inputs. These assertions do not establish appealing
acting or correct occlusion by themselves. Review actual full-size frames and continuous motion after changing
proportions, camera, timing, hands or props. Preserve findings and recheck evidence in the video's work folder.

The first visual review caught an elbow across the chest, excessive arm folding and lower-leg caps below the
soles despite valid numeric contacts. Elbow orientation, fret contact and ankle/sole geometry were corrected.
Use those as required review cases when adapting this starter. This proof is for the two included skins at their
fixed proportions; it does not validate every colour, scale, speed, camera or future character.
