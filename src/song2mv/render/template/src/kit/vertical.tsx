import type { CameraView } from "./camera";

/**
 * The 16:9 frame, 1920×1080, and where things go in it. The template's captions and a board's big type take its
 * bottom, `captions`, so a Storyboard puts each framing's point, its subject's middle, in the middle of `picture`
 * above them (wideView), as the 9:16 frame does.
 */
export const WIDE = {
  w: 1920,
  h: 1080,
  captions: { top: 840, bottom: 1080 },
  picture: { left: 0, top: 0, right: 1920, bottom: 840 },
} as const;

/**
 * The 9:16 frame a VerticalScene draws, 1080×1920, and where things go in it. Reels, Shorts and TikTok lay their
 * buttons and caption overlay over its edges: text inside `safe` stays clear of them on all three. The template's
 * captions (the lines the scenes don't draw) take the bottom of the safe box, `captions`, so the scene's subject goes
 * above them, in `picture`. Below the safe box the apps cover the frame: draw picture there (the ground, a
 * foreground), nothing to read or follow.
 */
export const VERTICAL = {
  w: 1080,
  h: 1920,
  safe: { left: 120, top: 269, right: 960, bottom: 1248 },
  captions: { top: 1082, bottom: 1240 },
  picture: { left: 120, top: 269, right: 960, bottom: 1080 },
} as const;

/**
 * A view of the 16:9 world filmed again for the 9:16 frame. The stage point it looks at (a shot's x, y, or what
 * `cameraAt` gives) lands in the middle of VERTICAL.picture, at the view's zoom, so things are as large as in the
 * 16:9 frame (pass a larger zoom to go closer), and rolled as the view is. Where it can, the frame keeps inside
 * `world` [left, top, right, bottom], by default the stage's sides and top but open below: under the picture the frame
 * runs on past the stage's bottom edge, behind the captions and the apps' buttons, so draw the ground on down there,
 * or a foreground. A pixel scene films its shots with pixel.cameraAt(T, shots, { px, vertical: true }) instead, which
 * keeps the blocks whole and changes the zoom when its 16:9 version does.
 *
 *   const cam = verticalView(cameraAt(T, shots, { hits }));        // the 16:9 scene's own shots
 *   <Svg w={1080} h={1920}><g transform={cam.svg}>…the world, as drawn for 16:9…</g></Svg>
 *   verticalView({ x: 900, y: 820, zoom: 1.5 })                    // a subject of the tall frame's own
 */
export function verticalView(
  view: { x: number; y: number; zoom?: number; rotate?: number; shot?: number },
  o: { world?: [number, number, number, number] } = {},
): CameraView {
  return tallView(view, 0, o.world);
}

/**
 * A view of the 16:9 world for the 16:9 frame, as a Storyboard films it: the stage point it looks at lands in the
 * middle of WIDE.picture, above the captions, and the frame keeps inside `world` as verticalView's does, so a subject
 * there stays clear of them. Under the picture the frame runs on past the stage's bottom edge: draw the ground on
 * down there, as for the 9:16 frame.
 */
export function wideView(
  view: { x: number; y: number; zoom?: number; rotate?: number; shot?: number },
  o: { world?: [number, number, number, number] } = {},
): CameraView {
  return frameView(WIDE, view, 0, o.world);
}

/** verticalView on whole pixels of `cell` stage px, with a whole zoom and no roll; 0 for a smooth frame */
export function tallView(
  view: { x: number; y: number; zoom?: number; rotate?: number; shot?: number },
  cell: number,
  world?: [number, number, number, number],
): CameraView {
  return frameView(VERTICAL, view, cell, world);
}

function frameView(
  frame: { w: number; h: number; picture: { left: number; top: number; right: number; bottom: number } },
  view: { x: number; y: number; zoom?: number; rotate?: number; shot?: number },
  cell: number,
  world: [number, number, number, number] = [0, 0, 1920, Infinity],
): CameraView {
  const { w, h, picture } = frame;
  const [x0, y0, x1, y1] = world;
  const zoom = cell ? Math.max(1, Math.round(view.zoom ?? 1)) : Math.max(0.05, view.zoom ?? 1);
  const rotate = cell ? 0 : view.rotate ?? 0;
  const ax = (picture.left + picture.right) / 2, ay = (picture.top + picture.bottom) / 2;
  // where the world's origin lands in the frame: the subject on the anchor, on whole pixels, the world over the frame
  const place = (anchor: number, v: number, lo: number, hi: number, size: number) => {
    const raw = anchor - v * zoom;
    const at = cell ? Math.round(raw / (cell * zoom)) * cell * zoom : raw;
    const min = size - hi * zoom, max = -lo * zoom;
    return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, at));
  };
  const left = place(ax, view.x, x0, x1, w), top = place(ay, view.y, y0, y1, h);
  const cx = (ax - left) / zoom, cy = (ay - top) / zoom;
  // the stage point at the middle of the frame, through the roll about the anchor
  const a = (rotate * Math.PI) / 180, dx = (w / 2 - ax) / zoom, dy = (h / 2 - ay) / zoom;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const z = r(zoom), rot = r(rotate);
  const transform = (u: string, deg: string) => rot
    ? `translate(${ax}${u}, ${ay}${u}) rotate(${rot}${deg}) scale(${z}) translate(${-r(cx)}${u}, ${-r(cy)}${u})`
    : `translate(${r(left)}${u}, ${r(top)}${u}) scale(${z})`;
  return {
    x: r(cx + dx * Math.cos(a) + dy * Math.sin(a)), y: r(cy - dx * Math.sin(a) + dy * Math.cos(a)), zoom: z, rotate: rot,
    shot: view.shot ?? 0, svg: transform("", ""), css: transform("px", "deg"),
  };
}
