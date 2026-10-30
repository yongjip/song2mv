# song2mv brand assets

Beat Cloud is a blue waveform character that paints a red rhythm. This kit
turns the selected concept into editable, reusable 2D artwork.

## Source

**Edit `source.svg`.** It contains actual vector paths, including outlined
lettering. There are no embedded bitmaps, external fonts, or linked images.
The groups are named layers in SVG editors that support Inkscape layer metadata.

The owner selected the first of two attached character references and approved
asset production on 2026-10-31. `reference/beat-cloud-concept.png` preserves that
ImageGen concept. The vector retains its silhouette, expression, brush, and
lettering. Paper texture and subtle color variation have been flattened. Eye
outlines and the brush joint have been cleaned for separate editing.

| Layer ID | Purpose |
| --- | --- |
| `mascot` | Complete character and painted rhythm |
| `body` | Waveform silhouette without the drawing arm |
| `eye-left`, `eye-right` | Eye shapes and their pupils |
| `pupil-left`, `pupil-right` | Separate pupils for gaze changes |
| `mouth` | Smile |
| `drawing-arm` | Arm and complete brush; pivot at `(815, 550)` |
| `brush` | Collar and bristles |
| `painted-line` | Painted rhythm, separate from the brush |
| `wordmark` | Outlined `song2mv` lettering, one path per character |

The source uses the concept image's coordinate system. Animation can address
these IDs directly. The kit supplies static artwork; motion can be added from
the same source.

## Use an export

| File under `svg/` | Use |
| --- | --- |
| `song2mv-logo-stacked.svg` | Primary logo with the character above the name |
| `song2mv-logo-horizontal.svg` | Character beside the name |
| `song2mv-mascot.svg` | Character and painted rhythm without lettering |
| `song2mv-wordmark.svg` | Name without the character |
| `song2mv-icon.svg` | Square icon with the brush and without the painted line |
| `song2mv-icon-small.svg` | Body and face; reduced detail for 16–32 px |
| `song2mv-logo-monochrome.svg` | Single dark ink, with transparent facial cutouts |
| `song2mv-logo-reversed.svg` | White version for dark backgrounds |
| `song2mv-icon-monochrome.svg`, `song2mv-icon-reversed.svg` | Single-ink icon variants |

Use SVG when the destination supports it. Otherwise, use a transparent file
from `png/`. The PNG icon sizes are 16, 32, 48, 64, 128, 256, 512, and 1024 px.
The 16 and 32 px files use the simplified body and face. At 16 px, rely on the
silhouette; use 32 px or more when the expression matters.

`png/song2mv-avatar-512.png` has an opaque cream background for profile uploads.
The other production PNGs have transparent backgrounds. `favicon.ico` contains
six sizes of the simplified icon. `webp/` contains lossless transparent versions
of the primary logo and mascot.

The eye fill is deliberately cream in the color artwork. Monochrome and reversed
artwork use transparent facial cutouts rather than a background-colored patch.

## Rebuild

Run from the repository root. These dependencies are separate from song2mv's
runtime dependencies:

```sh
python3 -m pip install -r assets/brand/requirements.txt
brew install librsvg
python3 assets/brand/build.py
```

On other platforms, install `rsvg-convert` through the system package manager.
The vector exports alone require only Python's standard library:

```sh
python3 assets/brand/build.py --svg-only
```

Change artwork in `source.svg`, then rebuild. For a palette change, update its
matching fill values and root `data-primary`, `data-accent`, and `data-paper`
attributes together. `palette.json` is generated from those source attributes.

## Review

- `review/asset-preview.png`: color, single-ink, reversed, and native-size icons.
- `review/reference-comparison.png`: the selected concept and vector at the same crop and scale.
- `review/verification.json`: source hash, required layers, raster dimensions,
  transparency checks, and foreground overlap against the concept.

The overlap calculation compares the two colored silhouettes. It is a geometry
check, not a measure of visual quality or a record of user approval. Review the
images when changing the source. Product-page integration and public profile
uploads are separate actions.
