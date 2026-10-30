#!/usr/bin/env python3
"""Export the song2mv brand assets from their layered SVG source."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SVG = "http://www.w3.org/2000/svg"
INKSCAPE = "http://www.inkscape.org/namespaces/inkscape"
ET.register_namespace("", SVG)
ET.register_namespace("inkscape", INKSCAPE)


def element(name: str, **attributes: str) -> ET.Element:
    return ET.Element(f"{{{SVG}}}{name}", attributes)


def by_id(root: ET.Element, name: str) -> ET.Element:
    return next(node for node in root.iter() if node.get("id") == name)


def remove(root: ET.Element, name: str) -> ET.Element:
    node = by_id(root, name)
    parent = next(parent for parent in root.iter() if node in list(parent))
    parent.remove(node)
    return node


def write_svg(root: ET.Element, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(destination, encoding="utf-8", xml_declaration=True)


def document(source: ET.Element, title: str, viewbox: str, groups: list[ET.Element]) -> ET.Element:
    root = element("svg", viewBox=viewbox, role="img", **{"aria-labelledby": "title description"})
    _, _, width, height = viewbox.split()
    root.set("width", width)
    root.set("height", height)
    heading = element("title", id="title")
    heading.text = title
    root.append(heading)
    description = element("desc", id="description")
    description.text = "The song2mv waveform character and original outlined lettering."
    root.append(description)
    root.append(deepcopy(source.find(f"{{{SVG}}}defs")))
    root.extend(deepcopy(group) for group in groups)
    return root


def monochrome(root: ET.Element, palette: dict[str, str], ink: str) -> ET.Element:
    face = remove(root, "face")
    for node in face.iter():
        if node.get("fill") == palette["paper"]:
            node.set("fill", "#000000")
        elif node.get("fill") == palette["primary"]:
            node.set("fill", "#FFFFFF")
    mask = element("mask", id="face-cutouts", maskUnits="userSpaceOnUse", x="0", y="0", width="1254", height="1254")
    mask.append(element("rect", x="0", y="0", width="1254", height="1254", fill="#FFFFFF"))
    mask.append(face)
    root.find(f"{{{SVG}}}defs").append(mask)
    wrapper = element("g", **{"mask": "url(#face-cutouts)"})
    for group in list(root):
        if group.tag == f"{{{SVG}}}g":
            root.remove(group)
            for node in group.iter():
                if node.get("fill") in (palette["primary"], palette["accent"]):
                    node.set("fill", ink)
            wrapper.append(group)
    root.append(wrapper)
    return root


def export_vectors(source: ET.Element, palette: dict[str, str]) -> dict[str, Path]:
    mascot = by_id(source, "mascot")
    wordmark = by_id(source, "wordmark")
    compact = deepcopy(mascot)
    remove(compact, "painted-line")
    small = deepcopy(compact)
    remove(small, "drawing-arm")
    horizontal_mascot = element("g", transform="translate(-77.8 -32.2) scale(0.45)")
    horizontal_mascot.append(compact)
    horizontal_wordmark = element("g", transform="translate(215.17 -663.11) scale(0.9887)")
    horizontal_wordmark.append(wordmark)

    layouts = {
        "mascot": ("212 284 999 520", [mascot]),
        "icon": ("200 128 824 824", [compact]),
        "icon-small": ("196 196 680 680", [small]),
        "wordmark": ("168 763 933 239", [wordmark]),
        "logo-stacked": ("160 280 1050 730", [mascot, wordmark]),
        "logo-horizontal": ("0 70 1320 280", [horizontal_mascot, horizontal_wordmark]),
    }
    documents = {name: document(source, f"song2mv — {name}", box, groups) for name, (box, groups) in layouts.items()}
    for name, base, ink in [
        ("logo-monochrome", "logo-stacked", palette["ink"]),
        ("logo-reversed", "logo-stacked", "#FFFFFF"),
        ("icon-monochrome", "icon", palette["ink"]),
        ("icon-reversed", "icon", "#FFFFFF"),
    ]:
        documents[name] = monochrome(deepcopy(documents[base]), palette, ink)
        documents[name].find(f"{{{SVG}}}title").text = f"song2mv — {name}"

    paths = {}
    for name, root in documents.items():
        ids = [node.get("id") for node in root.iter() if node.get("id")]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate SVG IDs in {name}")
        paths[name] = ROOT / "svg" / f"song2mv-{name}.svg"
        write_svg(root, paths[name])
    return paths


def rasterize(renderer: str, svg: Path, output: Path, width: int, background: str | None = None) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [renderer, str(svg), "--width", str(width), "--keep-aspect-ratio", "--output", str(output)]
    if background is not None:
        command += ["--background-color", background]
    subprocess.run(command, check=True)


def review_images(paths: dict[str, Path], palette: dict[str, str], renderer: str) -> dict:
    from PIL import Image, ImageDraw, ImageFont

    review = ROOT / "review"
    review.mkdir(exist_ok=True)
    paper, ink = palette["paper"], palette["ink"]

    def font(size):
        for candidate in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
            if Path(candidate).exists():
                return ImageFont.truetype(candidate, size)
        return ImageFont.load_default(size=size)

    def contain(board, path, box):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((box[2], box[3]), Image.Resampling.LANCZOS)
        board.alpha_composite(image, (int(box[0] + (box[2] - image.width) / 2), int(box[1] + (box[3] - image.height) / 2)))

    board = Image.new("RGBA", (1600, 1120), paper)
    draw = ImageDraw.Draw(board)
    draw.text((56, 36), "song2mv / Beat Cloud", font=font(30), fill=ink)
    draw.text((56, 78), "Layered SVG source and reusable exports", font=font(20), fill=ink)
    draw.rounded_rectangle((40, 130, 1010, 830), radius=20, fill="#FFFFFF")
    contain(board, ROOT / "png/song2mv-logo-stacked.png", (66, 152, 918, 638))
    draw.rounded_rectangle((1040, 130, 1560, 460), radius=20, fill=ink)
    contain(board, ROOT / "png/song2mv-logo-reversed.png", (1072, 160, 456, 280))
    draw.rounded_rectangle((1040, 490, 1560, 830), radius=20, fill="#FFFFFF")
    contain(board, ROOT / "png/song2mv-logo-monochrome.png", (1072, 520, 456, 280))
    draw.text((56, 876), "Icons at native size", font=font(24), fill=ink)
    x = 66
    for size in (16, 32, 48, 64, 128):
        icon = Image.open(ROOT / f"png/song2mv-icon-{size}.png").convert("RGBA")
        board.alpha_composite(icon, (x + (150 - size) // 2, 970 - size // 2))
        draw.text((x + 40, 1060), f"{size}px", font=font(19), fill=ink)
        x += 175
    draw.text((1040, 900), "Transparent background", font=font(21), fill=ink)
    draw.text((1040, 937), "Outlined lettering / no font required", font=font(21), fill=ink)
    draw.text((1040, 974), "Body, eyes, pupils, arm and brush", font=font(21), fill=ink)
    draw.text((1040, 1011), "separated for future motion", font=font(21), fill=ink)
    board.convert("RGB").save(review / "asset-preview.png")

    reference = Image.open(ROOT / "reference/beat-cloud-concept.png").convert("RGB")
    source = ET.parse(ROOT / "source.svg").getroot()
    source.set("viewBox", "0 0 1254 1254")
    source.set("width", "1254")
    source.set("height", "1254")
    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        write_svg(source, temporary / "full.svg")
        rasterize(renderer, temporary / "full.svg", temporary / "full.png", 1254, paper)
        rebuilt = Image.open(temporary / "full.png").convert("RGB")

    comparison = Image.new("RGB", (1500, 620), paper)
    draw = ImageDraw.Draw(comparison)
    draw.text((40, 26), "Generated concept", font=font(25), fill=ink)
    draw.text((790, 26), "Layered vector", font=font(25), fill=ink)
    crop = (160, 280, 1210, 1010)
    for image, x in [(reference, 30), (rebuilt, 780)]:
        image = image.crop(crop)
        image.thumbnail((690, 480), Image.Resampling.LANCZOS)
        comparison.paste(image, (x, 95))
    comparison.save(review / "reference-comparison.png")

    intersection = union = 0
    for a, b in zip(reference.getdata(), rebuilt.getdata()):

        def foreground(rgb):
            r, g, blue = rgb
            return (blue > 120 and blue > r * 1.8 and blue > g * 1.5) or (r > 180 and r > g * 1.8 and r > blue * 1.6)

        first, second = foreground(a), foreground(b)
        intersection += first and second
        union += first or second
    return {"reference_size": list(reference.size), "comparison_crop": list(crop), "foreground_overlap_iou": round(intersection / union, 5)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--svg-only", action="store_true", help="Export vectors without Pillow or librsvg.")
    args = parser.parse_args()
    source = ET.parse(ROOT / "source.svg").getroot()
    for node in source.iter():
        if node.tag in (f"{{{SVG}}}image", f"{{{SVG}}}text"):
            raise ValueError("The source must contain outlined paths, without bitmap or font dependencies.")
    palette = {key: source.get(f"data-{key}") for key in ("primary", "accent", "paper", "ink")}
    paths = export_vectors(source, palette)
    (ROOT / "palette.json").write_text(json.dumps(palette, indent=2) + "\n")
    if args.svg_only:
        print(f"Exported {len(paths)} SVG files to {ROOT / 'svg'}")
        return

    renderer = shutil.which("rsvg-convert")
    if not renderer:
        raise SystemExit("Install librsvg (macOS: brew install librsvg), or use --svg-only.")
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("Install the separate asset dependencies: python3 -m pip install -r assets/brand/requirements.txt") from None

    for name, width in [
        ("mascot", 1600),
        ("wordmark", 1600),
        ("logo-stacked", 1600),
        ("logo-horizontal", 1920),
        ("logo-monochrome", 1600),
        ("logo-reversed", 1600),
    ]:
        rasterize(renderer, paths[name], ROOT / "png" / f"song2mv-{name}.png", width)
    for size in (16, 32, 48, 64, 128, 256, 512, 1024):
        rasterize(renderer, paths["icon-small" if size <= 32 else "icon"], ROOT / "png" / f"song2mv-icon-{size}.png", size)
    rasterize(renderer, paths["icon"], ROOT / "png/song2mv-avatar-512.png", 512, palette["paper"])
    with tempfile.TemporaryDirectory() as temporary:
        ico_source = Path(temporary) / "icon-small.png"
        rasterize(renderer, paths["icon-small"], ico_source, 256)
        Image.open(ico_source).save(ROOT / "favicon.ico", sizes=[(s, s) for s in (16, 32, 48, 64, 128, 256)])
    (ROOT / "webp").mkdir(exist_ok=True)
    for name in ("mascot", "logo-stacked"):
        Image.open(ROOT / "png" / f"song2mv-{name}.png").save(ROOT / "webp" / f"song2mv-{name}.webp", lossless=True)

    verification = review_images(paths, palette, renderer)
    verification["required_layers"] = [
        "body",
        "eye-left",
        "eye-right",
        "pupil-left",
        "pupil-right",
        "mouth",
        "drawing-arm",
        "brush",
        "painted-line",
        "wordmark",
    ]
    for name in verification["required_layers"]:
        by_id(source, name)
    verification["svg_files"] = len(paths)
    verification["png_dimensions_and_transparency"] = {}
    for path in sorted((ROOT / "png").glob("*.png")):
        with Image.open(path) as im:
            alpha = im.convert("RGBA").getchannel("A")
            transparent = alpha.getextrema()[0] == 0
            if "avatar" not in path.name and not transparent:
                raise ValueError(f"{path.name} lost transparency")
            if "icon-" in path.name:
                expected = int(path.stem.rsplit("-", 1)[1])
                if im.size != (expected, expected):
                    raise ValueError(f"{path.name} has an incorrect size")
            verification["png_dimensions_and_transparency"][path.name] = {"size": list(im.size), "transparent": transparent}
    verification["source_sha256"] = hashlib.sha256((ROOT / "source.svg").read_bytes()).hexdigest()
    (ROOT / "review/verification.json").write_text(json.dumps(verification, indent=2) + "\n")
    print(f"Exported {len(paths)} SVG files, 15 PNG files, 2 WebP files, ICO, and review previews to {ROOT}")


if __name__ == "__main__":
    main()
