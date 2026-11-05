# Failed raster arm fitting pilot

Status: **experimental, reconstruction quality failed**. This directory preserves the solver for research.
The scene kit does not import it. It is not an implementation of the full LiveSVG pipeline.

In a three-second driving scene, the fitted forearm detached from its hand during the return motion.
The decisive frame was 66 of 72 at 24 fps, or 2.750 seconds. The fitted path also left a small fragment.
These defects remained after pixel loss and contour initialization checks. Do not use a lower fitting loss as
evidence of correct hand contact.

The final fit took 120.441 seconds as a process, with 116.187 seconds in the solver.
The whole trial took 66.0 minutes, including setup, failed attempts, rendering, and review.
One warmed render took 4.478 seconds for the authored control and 3.386 seconds for the fitted version.
This single ordered pair does not establish a speed advantage. The fitter required the authored control as its
raster teacher. The control's authoring time was not measured.

## Preserved method

`fit_arm.py` retains the pilot's CPU optimization: DiffVG rasterization, group homographies, local Bezier offsets,
blurred pixel loss, spatial and tangent penalties, and a distance-field penalty. Raster contours initialize each
moving key. The optimizer reads the first drawing and raster frames. It does not read future vector poses.

The original setup remains deliberately narrow: 72 RGB PNGs at 256 by 112 pixels, 24 fps, white background,
fixed colors, and manually separated paths. Raster motion detection examines all frames, so intermediate frames
are not an unseen test set. The optional three-path branch assumes an arm, palm, and crease in that order.
The selected failed run used one closed forearm path, 75 steps per moving key, and zero joint steps.
There is no hand contact constraint, semantic grouping, video generation, tracking model, or layer ordering model.

The archived solver adds `--work` to keep all inputs and outputs outside this checkout. It also validates output
version names and step counts. The fitting algorithm and its fixed canvas assumptions remain unchanged.
Formatting and local variable names follow the repository's lint rules.
The original scene, reference frames, fitted motion, and music are not distributed.

The paper is [LiveSVG](https://arxiv.org/abs/2605.30174).
The rasterizer is [DiffVG](https://github.com/BachiLi/diffvg), an optional dependency under Apache 2.0.
No DiffVG source is vendored here. The pilot ran with Torch 2.5.1 and NumPy 1.26.4 on a CPU.
It also needs Pillow, SciPy, scikit-image, and a locally built `pydiffvg`.
DiffVG installation and compiler compatibility are outside song2mv's supported setup.

## Run a synthetic smoke test

Use a separate environment with the dependencies above. Do not add them to song2mv's standard environment.
From the repository root, run:

```sh
python experiments/raster-arm-fit/make_fixture.py /tmp/arm-fit-smoke
python experiments/raster-arm-fit/fit_arm.py --work /tmp/arm-fit-smoke --arm-only --steps 1 --version smoke
```

The first command creates a translating disk and the pilot's input layout.
The second writes `fit-smoke.json` and `fitted-arm-smoke.svg` there. An existing JSON fit is preserved.
This test checks that the solver runs and produces finite coordinates. A disk has no joints or hand contact.
It cannot establish character animation quality or resolve the known failure.

For the archived run's iteration count, use `--steps 75 --joint-steps 0` with a new version name.
Review every transition and its neighboring frames against the authored control with the
[shared review tools](../../docs/animation-review.md).
