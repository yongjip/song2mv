# Review facial attachments and compare animation changes

Use the scene kit for facial attachments and controlled comparisons. Use the developer scripts below to inspect
the encoded exports at native resolution. The scripts require a repository checkout, an installed song2mv
development environment, and ffmpeg. They add no song2mv command or standard dependency.

## Attach cheeks to stable facial landmarks

Import `AnchoredCheeks` from `src/kit` in your template copy. Give each anatomical side its own eye anchor.
Keep those names through front, quarter, and profile views. Do not sort eyes by screen position or interpolate
one cheek from one side of the face to the other.

```tsx
<AnchoredCheeks
	eyes={{
		left: { x: 24, y: -10, projection: 1 },
		right: { x: -18, y: -10, projection: 0.6 },
	}}
	style={{
		offsets: { left: { x: 8, y: 26 }, right: { x: -8, y: 26 } },
		rx: 8, ry: 3.5, fill: "#dd8d91",
	}}
/>
```

Coordinates and offsets use the head's local coordinate system. Choose the offsets and radii for your drawing.
`projection` runs from 0 for an occluded side to 1 for full width. It scales the cheek's width and opacity.
Derive it from head orientation or an unblinking eye drawing. Do not drive it from a blinking eyelid's width.
Apply the head's transform to the eyes and cheeks together. Put both inside your own face clip when needed.
The helper does not detect the nose, mouth, or face boundary. Review those overlaps for each character.

## Compare one change at the same time

`Comparison` draws two functions of song time `T` inside equal viewports with the same `viewBox`.
Use the same camera, expression, background, audio, and interval when testing one variable.
Give SVG definitions in the two drawings different IDs. Keep labels fixed.

```tsx
<Comparison T={T} viewBox={{ x: -100, y: -100, width: 200, height: 200 }}
	before={(t) => <OldHead T={t} id="control" />}
	after={(t) => <NewHead T={t} id="candidate" />}
	labels={["Control", "Candidate"]} />
```

The synthetic `Face-Anchors` composition demonstrates a forward and reverse turn with a fixed expression and
camera. It also appears in `Kit-Gallery`. From `src/song2mv/render/template`, run:

```sh
npm ci
npm run typecheck
npm run test:assets
npx remotion render src/index.ts Face-Anchors /tmp/face-anchors.mp4
```

The three-second, 24 fps export compares one moving cheek with two attached cheeks. It contains no song audio.
Its simple face is an example, not an approved character template.

## Inspect encoded frames at native size

Use `song2mv diff BEFORE AFTER` to find changed stretches in full exports.
Use `song2mv sheet VIDEO --times ... --crop ...` for an overview with song-time labels.
For attachment defects, use the developer script from the repository root:

```sh
python scripts/review_video.py /tmp/control.mp4 /tmp/candidate.mp4 \
	--frames 0,12,24,36,48,60,71 --crop 200,100,400,300 --out /tmp/native-review
```

Choose zero-based encoded frame indices. Both exports must have identical dimensions, frame rates, and frame
counts. For a single comparison export, pass that file twice and crop each side in separate runs.
The same crop applies to both inputs in one run. Keep their framing identical.

The new output directory contains separate native PNGs, a labelled pair for each frame, and `manifest.json`.
No image is resized. The manifest records source and image SHA-256 hashes, crop, frame indices, and extraction time.
Its status stays `unreviewed`, and normal-speed review stays `unverified`. For variable frame rate, the frame indices
remain exact, but labels based on the average frame rate are approximate. Use constant frame rate for comparisons.

Inspect before, during, and after each transition, including neighboring frames around a defect.
For a head turn, inspect the front crossing in both directions with the camera and expression fixed.
Check that a cheek keeps its anatomical side, stays below its eye, and clears the nose and mouth.
For an arm, check shoulder attachment, elbow shape, hand contact, and occlusion throughout the transition.
Watch the exact export at normal speed. Frame sheets alone do not establish natural motion.
Save the reviewer, export hash, reviewed interval, findings, and unverified areas beside the manifest.

## Record comparable work times

Wrap each command with the developer timer. Use a new output directory for each run:

```sh
python scripts/time_command.py --cwd src/song2mv/render/template --out /tmp/control-render \
	-- npx remotion render src/index.ts Control /tmp/control.mp4
```

The example assumes your template defines a `Control` composition.
`timing.json` records the command, working directory, UTC start and end, elapsed seconds, and exit code.
`command.log` keeps combined output, including failures. The wrapper returns the child command's exit status.
A command stopped with Ctrl+C keeps its timing record, sets `interrupted` to true, and exits with code 130.
Existing output directories are preserved. Keep logs outside the repository and omit credentials from commands.

Measure setup, asset authoring, all failed attempts, rendering, and review separately. Report the whole elapsed
time as well as individual stages. A warmed render excludes authoring and fitting costs. One ordered pair of
renders does not establish a general speed improvement.

The [failed raster arm fitting pilot](../experiments/raster-arm-fit/README.md) is kept outside the kit and standard
dependencies. Its loss measurements did not detect a detached hand. Do not promote it to a reusable character
component without new contact and motion evidence.
