import argparse
import hashlib
import json
import re
from pathlib import Path
from time import perf_counter

import numpy as np
import pydiffvg
import torch
import torch.nn.functional as F
from PIL import Image
from scipy.ndimage import binary_fill_holes, distance_transform_edt
from skimage.measure import find_contours

torch.set_num_threads(1)
torch.manual_seed(7)
pydiffvg.set_use_gpu(False)


class ArmFit:
    def __init__(self, initial):
        self.meta = initial["paths"]
        self.width = initial["canvas"]["width"]
        self.height = initial["canvas"]["height"]
        self.center = torch.tensor([self.width / 2, self.height / 2])
        self.scale = self.width / 2
        self.base = [torch.tensor(p["points"], dtype=torch.float32) for p in self.meta]
        self.sizes = [len(p) for p in self.base]
        self.offsets = np.cumsum([0] + self.sizes).tolist()
        self.count = sum(self.sizes)
        self.ink = torch.tensor([71, 60, 53, 255], dtype=torch.float32) / 255
        axis = torch.arange(-2, 3, dtype=torch.float32)
        kernel = torch.exp(-axis.square() / 2)
        kernel = kernel / kernel.sum()
        self.kernel = (kernel[:, None] * kernel[None, :])[None, None].repeat(3, 1, 1, 1)
        self.smooth_masks = []
        for p, meta in zip(self.base, self.meta):
            anchors = torch.arange(0, len(p) if meta["closed"] else len(p) - 1, 3)
            if not meta["closed"]:
                anchors = anchors[1:]
            before = p[anchors] - p[(anchors - 1) % len(p)]
            after = p[(anchors + 1) % len(p)] - p[anchors]
            cosine = (F.normalize(before, dim=1) * F.normalize(after, dim=1)).sum(1)
            self.smooth_masks.append(anchors[cosine > np.cos(np.deg2rad(10))])

    def blur(self, rgb):
        return F.conv2d(rgb.permute(2, 0, 1)[None], self.kernel, padding=2, groups=3)

    def points(self, homographies, offsets):
        result = []
        for i, (p, meta) in enumerate(zip(self.base, self.meta)):
            local = p + offsets[self.offsets[i] : self.offsets[i + 1]]
            local = (local - self.center) / self.scale
            h = homographies[meta["group"]]
            numerator = torch.stack([(1 + h[0]) * local[:, 0] + h[1] * local[:, 1] + h[2], h[3] * local[:, 0] + (1 + h[4]) * local[:, 1] + h[5]], 1)
            denominator = (h[6] * local[:, 0] + h[7] * local[:, 1] + 1).clamp(min=0.25)
            result.append(numerator / denominator[:, None] * self.scale + self.center)
        return result

    def render(self, points):
        shapes, groups = [], []
        for i, (p, meta) in enumerate(zip(points, self.meta)):
            segments = len(p) // 3
            shapes.append(
                pydiffvg.Path(torch.full((segments,), 2, dtype=torch.int32), p.contiguous(), meta["closed"], stroke_width=torch.tensor(meta["width"] / 2))
            )
            fill = torch.tensor(meta["color"]) if meta["color"] else None
            groups.append(pydiffvg.ShapeGroup(torch.tensor([i]), fill, use_even_odd_rule=False, stroke_color=self.ink))
        args = pydiffvg.RenderFunction.serialize_scene(self.width, self.height, shapes, groups)
        rgba = pydiffvg.RenderFunction.apply(self.width, self.height, 2, 2, 9, None, *args)
        return rgba[:, :, :3] * rgba[:, :, 3:] + 1 - rgba[:, :, 3:]

    def regularize(self, points, offsets, sdf):
        spatial = offsets.new_tensor(0.0)
        tangent = offsets.new_tensor(0.0)
        for i, (p, base, anchors, _meta) in enumerate(zip(points, self.base, self.smooth_masks, self.meta)):
            d = offsets[self.offsets[i] : self.offsets[i + 1]]
            distance = (base[1:] - base[:-1]).square().sum(1)
            weights = torch.exp(-distance / (0.01 * self.width) ** 2)
            spatial = spatial + ((d[1:] - d[:-1]).square().sum(1) * weights).mean()
            if len(anchors):
                before = p[anchors] - p[(anchors - 1) % len(p)]
                after = p[(anchors + 1) % len(p)] - p[anchors]
                tangent = tangent + (1 - (F.normalize(before, dim=1) * F.normalize(after, dim=1)).sum(1)).mean()
        all_points = torch.cat(points)
        grid = all_points / torch.tensor([self.width - 1, self.height - 1]) * 2 - 1
        containment = F.grid_sample(sdf, grid[None, None], align_corners=True, padding_mode="border").square().mean()
        return 0.5 * spatial + 3 * tangent + 0.03 * containment + 0.0001 * offsets.square().mean()


def centroid(rgb, color):
    mask = np.linalg.norm(rgb - np.asarray(color[:3]), axis=2) < 0.18
    y, x = np.where(mask)
    return np.array([x.mean(), y.mean()]) if len(x) else None


def curve_samples(points, closed):
    p = np.concatenate([points, points[:1]]) if closed else points
    u = np.linspace(0, 1, 33)[:, None]
    segments = []
    for j in range(0, len(p) - 1, 3):
        a, b, c, d = p[j : j + 4]
        segments.append((1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u**2 * c + u**3 * d)
    return segments


def resample(points, count):
    p = np.concatenate([points, points[:1]])
    distance = np.concatenate([[0], np.linalg.norm(np.diff(p, axis=0), axis=1).cumsum()])
    positions = np.linspace(0, distance[-1], count, endpoint=False)
    return np.stack([np.interp(positions, distance, p[:, i]) for i in range(2)], 1)


def contour_initialize(model, rgb, previous):
    results = []
    for index, (base, prior, meta) in enumerate(zip(model.base, previous, model.meta)):
        base = base.numpy()
        if not meta["closed"]:
            source_center = model.base[1].numpy().mean(0)
            results.append(base + (results[1].mean(0) - source_center))
            continue
        mask = np.linalg.norm(rgb - np.asarray(meta["color"][:3]), axis=2) < 0.18
        mask = binary_fill_holes(mask)
        mask = distance_transform_edt(~mask) <= meta["width"] / 2
        contours = find_contours(mask.astype(float), 0.5)
        if not contours:
            results.append(prior)
            continue
        contour = max(contours, key=len)[:, ::-1].copy()
        source_segments = curve_samples(base, True)
        source = np.concatenate(source_segments)
        area = lambda p: np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1))
        if area(contour) * area(source) < 0:
            contour = contour[::-1]
        if index == 0:
            start = np.linalg.norm(contour - base[0], axis=1).argmin()
            contour = np.roll(contour, -int(start), axis=0)
        else:
            contour = resample(contour, 256)
            old = resample(np.concatenate(curve_samples(prior, True)), 256)
            old += contour.mean(0) - old.mean(0)
            shift = min(range(256), key=lambda s: np.square(np.roll(contour, -s, axis=0) - old).mean())
            contour = np.roll(contour, -shift, axis=0)
        contour = resample(contour, 512)
        lengths = np.asarray([np.linalg.norm(np.diff(s, axis=0), axis=1).sum() for s in source_segments])
        knots = np.concatenate([[0], lengths.cumsum() / lengths.sum()])
        interpolate = lambda f, contour=contour: np.stack(
            [np.interp(np.asarray(f) * 512, np.arange(513), np.concatenate([contour, contour[:1]])[:, i]) for i in range(2)], 1
        )
        points = [interpolate([0])[0]]
        u = np.linspace(0, 1, 25)
        design = np.stack([3 * (1 - u) ** 2 * u, 3 * (1 - u) * u**2], 1)
        for a, b in zip(knots[:-1], knots[1:]):
            samples = interpolate(a + (b - a) * u)
            residual = samples - (1 - u[:, None]) ** 3 * samples[0] - u[:, None] ** 3 * samples[-1]
            controls = np.linalg.lstsq(design, residual, rcond=None)[0]
            points.extend([controls[0], controls[1], samples[-1]])
        results.append(np.asarray(points[:-1], dtype=np.float32))
    return results


def write_svg(file, frames, initial, times):
    def path_d(points, closed):
        p = points + [points[0]] if closed else points
        text = "M" + " ".join(f"{v:.4f}" for v in p[0])
        for i in range(1, len(p), 3):
            text += "C" + " ".join(f"{v:.4f}" for pair in p[i : i + 3] for v in pair)
        return text + ("Z" if closed else "")

    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="256" height="112" viewBox="0 0 256 112">']
    key_times = ";".join(str(t / 3) for t in times + [3])
    for i, meta in enumerate(initial["paths"]):
        values = [path_d(f[i], meta["closed"]) for f in frames]
        values.append(values[-1])
        fill = "#584943" if meta["color"] else "none"
        parts.append(f'<path fill="{fill}" stroke="#473c35" stroke-width="{meta["width"]}" stroke-linejoin="round" stroke-linecap="round" d="{values[0]}">')
        parts.append(
            f'<animate attributeName="d" values="{";".join(values)}" keyTimes="{key_times}" dur="3s" repeatCount="indefinite" calcMode="linear"/></path>'
        )
    parts.append("</svg>")
    file.write_text("\n".join(parts))


def main():
    parser = argparse.ArgumentParser(description="Failed reference-raster fitting pilot, not production animation")
    parser.add_argument("--work", required=True, type=Path, help="External folder with the pilot input layout")
    parser.add_argument("--steps", type=int, default=180)
    parser.add_argument("--joint-steps", type=int, default=0)
    parser.add_argument("--version", default="v1")
    parser.add_argument("--arm-only", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", args.version):
        parser.error("--version must contain only letters, digits, underscores, and hyphens")
    if args.steps < 1 or args.joint_steps < 0:
        parser.error("--steps must be positive and --joint-steps nonnegative")
    root = args.work.resolve()
    output = root / ("fit-" + args.version + ".json")
    if output.exists():
        raise SystemExit("Existing fit preserved. Choose another version for another attempt.")
    started = perf_counter()
    initial_file = root / ("initial-arm.json" if args.arm_only else "initial.json")
    target_file = root / ("target-arm.mp4" if args.arm_only else "target.mp4")
    frame_folder = root / ("target-arm-frames" if args.arm_only else "target-frames")
    initial = json.loads(initial_file.read_text())
    model = ArmFit(initial)
    reference_files = sorted(frame_folder.glob("*.png"))
    assert len(reference_files) == 72
    refs = [np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255 for p in reference_files]
    key_indices = np.rint(np.linspace(0, 71, 15)).astype(int).tolist()
    movement = np.asarray([False] + [np.square(refs[i] - refs[i - 1]).mean() > 0.00001 for i in range(1, 72)])
    for i in range(1, 72):
        if movement[i] != movement[i - 1]:
            key_indices.extend([i - 1, i])
    key_indices = sorted(set(key_indices))
    times = [i / 24 for i in key_indices]
    targets = [torch.from_numpy(refs[i]) for i in key_indices]
    blurred = [model.blur(p) for p in targets]
    sdfs = [torch.from_numpy(np.maximum(distance_transform_edt(p.numpy().min(2) > 0.96) - 1, 0).astype(np.float32))[None, None] for p in targets]
    homographies = [torch.nn.Parameter(torch.zeros(2, 8)) for _ in targets]
    offsets = [torch.nn.Parameter(torch.zeros(model.count, 2)) for _ in targets]
    trace = []
    render_start = perf_counter()
    probe = model.render(model.points(homographies[0], offsets[0]))
    probe.mean().backward()
    assert torch.isfinite(offsets[0].grad).all() and offsets[0].grad.norm() > 0
    print(json.dumps({"stage": "gradient_probe", "seconds": perf_counter() - render_start, "gradient_norm": offsets[0].grad.norm().item()}), flush=True)
    held_keys = []
    initial_positions = [None for _ in targets]
    for k, _target in enumerate(targets):
        stage = perf_counter()
        if k:
            with torch.no_grad():
                homographies[k].copy_(homographies[k - 1])
                offsets[k].copy_(offsets[k - 1])
                for group, path in enumerate(initial["paths"][:2]):
                    previous = centroid(refs[key_indices[k - 1]], path["color"])
                    current = centroid(refs[key_indices[k]], path["color"])
                    if previous is not None and current is not None:
                        delta = (current - previous) / model.scale
                        homographies[k][group, 2].add_(float(delta[0]))
                        homographies[k][group, 5].add_(float(delta[1]))
        held = k == 0 or np.square(refs[key_indices[k]] - refs[key_indices[k - 1]]).mean() < 0.000003
        if held:
            homographies[k].requires_grad_(False)
            offsets[k].requires_grad_(False)
            held_keys.append(k)
            with torch.no_grad():
                data = (model.blur(model.render(model.points(homographies[k], offsets[k]))) - blurred[k]).square().mean() * 1000
            trace.append({"key": k, "frame": key_indices[k], "seconds": perf_counter() - stage, "held": True, "final_data_loss": data.item()})
            print(json.dumps(trace[-1]), flush=True)
            continue
        with torch.no_grad():
            prior = [p.numpy() for p in model.points(homographies[k - 1], offsets[k - 1])]
            initialized = contour_initialize(model, refs[key_indices[k]], prior)
            homographies[k].zero_()
            offsets[k].copy_(torch.cat([torch.from_numpy(p) - base for p, base in zip(initialized, model.base)]))
            stable_start = torch.cat([torch.from_numpy(p) for p in initialized])
            initial_positions[k] = stable_start
        optimizer = torch.optim.Adam([{"params": [homographies[k]], "lr": 0.004}, {"params": [offsets[k]], "lr": 0.25}], betas=(0.9, 0.9))
        initial_loss = None
        for _iteration in range(args.steps):
            optimizer.zero_grad()
            points = model.points(homographies[k], offsets[k])
            rgb = model.render(points)
            data = (model.blur(rgb) - blurred[k]).square().mean() * 1000
            loss = data + model.regularize(points, offsets[k], sdfs[k]) + 0.02 * (torch.cat(points) - stable_start).square().mean()
            if initial_loss is None:
                initial_loss = data.item()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([homographies[k], offsets[k]], 100)
            optimizer.step()
        row = {"key": k, "frame": key_indices[k], "seconds": perf_counter() - stage, "initial_data_loss": initial_loss, "final_data_loss": data.item()}
        trace.append(row)
        print(json.dumps(row), flush=True)
    optimizer = torch.optim.Adam([{"params": homographies, "lr": 0.0005}, {"params": offsets, "lr": 0.06}], betas=(0.9, 0.9))
    for iteration in range(args.joint_steps):
        k = iteration % len(targets)
        if k in held_keys:
            continue
        optimizer.zero_grad()
        points = model.points(homographies[k], offsets[k])
        rgb = model.render(points)
        loss = (model.blur(rgb) - blurred[k]).square().mean() * 1000 + model.regularize(points, offsets[k], sdfs[k])
        loss = loss + 0.02 * (torch.cat(points) - initial_positions[k]).square().mean()
        if 0 < k < len(targets) - 1:
            previous = torch.cat(model.points(homographies[k - 1], offsets[k - 1]))
            following = torch.cat(model.points(homographies[k + 1], offsets[k + 1]))
            acceleration = torch.cat(points) - (previous + following) / 2
            loss = loss + 0.002 * acceleration.square().mean()
        loss.backward()
        optimizer.step()
    with torch.no_grad():
        for k in held_keys:
            if k:
                homographies[k].copy_(homographies[k - 1])
                offsets[k].copy_(offsets[k - 1])
    frames = [[p.detach().tolist() for p in model.points(h, d)] for h, d in zip(homographies, offsets)]
    record = {
        "method": "LiveSVG-inspired minimum reference-raster fitting; not official LiveSVG",
        "version": args.version,
        "canvas": initial["canvas"],
        "paths": [{key: p[key] for key in ["id", "group", "closed", "width"]} for p in initial["paths"]],
        "key_indices": key_indices,
        "times": times,
        "frames": frames,
        "steps_per_key": args.steps,
        "joint_steps": args.joint_steps,
        "held_keys": held_keys,
        "fitting_seconds": perf_counter() - started,
        "trace": trace,
        "device": "CPU",
        "torch": torch.__version__,
        "inputs": {
            "initial_file": initial_file.name,
            "target_file": target_file.name,
            "frame_folder": frame_folder.name,
            "initial_sha256": hashlib.sha256(initial_file.read_bytes()).hexdigest(),
            "target_sha256": hashlib.sha256(target_file.read_bytes()).hexdigest(),
        },
        "deviations": [
            "Manually separated/recolored existing B reference arm; no generated video or automatic grouping",
            f"{len(set(p['group'] for p in initial['paths']))} active groups and {len(initial['paths'])} paths on a 256x112 crop",
            "Raster contour initialization and cyclic correspondence in place of TAPNext",
            "Additional keyframes at raster-detected movement boundaries",
            "Reduced iteration count and adjusted regularization weights for the CPU pilot",
            "Optional temporal acceleration penalty during joint refinement; selected arm-only run uses zero joint steps",
            "No SAM2 layer reordering or foreground segmentation model",
        ],
        "training_boundary": (
            f"Optimizer reads {initial_file.name} and PNG target frames only. Future reference vector poses are not inputs. "
            "Raster motion detection examines all 72 frames; remaining frames are not used for geometry optimization."
        ),
    }
    output.write_text(json.dumps(record, indent=2) + "\n")
    write_svg(root / ("fitted-arm-" + args.version + ".svg"), frames, initial, times)
    print(json.dumps({"output": str(output), "fitting_seconds": record["fitting_seconds"]}), flush=True)


if __name__ == "__main__":
    main()
