import React from "react";
import { cameraAt as kitCameraAt, CameraView, Shot } from "../camera";

type Pt = [number, number];
const OFFSET = 4096, ROW_LENGTH = 16384;
const xy = (key: number): Pt => [(key % ROW_LENGTH) - OFFSET, Math.floor(key / ROW_LENGTH) - OFFSET];
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class Canvas {
  readonly cells = new Map<number, string>();

  set(x: number, y: number, c: string) {
    x = Math.round(x); y = Math.round(y);
    if (x >= -OFFSET && x < ROW_LENGTH - OFFSET && y >= -OFFSET && y < ROW_LENGTH - OFFSET) this.cells.set((y + OFFSET) * ROW_LENGTH + x + OFFSET, c);
  }

  get(x: number, y: number): string | undefined {
    return this.cells.get((Math.round(y) + OFFSET) * ROW_LENGTH + Math.round(x) + OFFSET);
  }

  box(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  dither(x: number, y: number, w: number, h: number, c: string, coverage = 0.5) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const X = Math.round(x + i), Y = Math.round(y + j);
        if (BAYER_4X4[(Y & 3) * 4 + (X & 3)] < coverage * 16) this.set(X, Y, c);
      }
  }

  disc(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }

  poly(pts: Pt[], c: string) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      pts.forEach(([ax, ay], i) => {
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      });
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }

  line(pts: Pt[], width: number, c: string) {
    if (width > 1) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
        for (let k = 0; k <= n; k++) this.disc(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, width / 2 - 0.3, width / 2 - 0.3, c);
      }
      return;
    }
    const ends = pts.length === 1 ? [pts[0], pts[0]] : pts, path: Pt[] = [];
    for (let i = 0; i + 1 < ends.length; i++) {
      let [x, y] = ends[i].map(Math.round);
      const [bx, by] = ends[i + 1].map(Math.round);
      const dx = Math.abs(bx - x), dy = -Math.abs(by - y), sx = x < bx ? 1 : -1, sy = y < by ? 1 : -1;
      for (let err = dx + dy; ; ) {
        const last = path[path.length - 1];
        if (!last || last[0] !== x || last[1] !== y) path.push([x, y]);
        if (x === bx && y === by) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
      }
    }
    // pixel perfect: where the path turns a corner through a pixel between two diagonal neighbours, skip that pixel
    const kept: Pt[] = [];
    for (const p of path) {
      const a = kept[kept.length - 2], b = kept[kept.length - 1];
      if (a && b && Math.abs(p[0] - a[0]) === 1 && Math.abs(p[1] - a[1]) === 1) kept.pop();
      kept.push(p);
    }
    for (const [x, y] of kept) this.set(x, y, c);
  }

  stamp(sprite: Canvas, outline?: string, dx = 0, dy = 0) {
    const shape = outline ? filledElbows(sprite) : sprite;
    if (outline)
      for (const key of shape.cells.keys()) {
        const [x, y] = xy(key);
        for (const [ex, ey] of SIDES) if (shape.get(x + ex, y + ey) === undefined) this.set(x + ex + dx, y + ey + dy, outline);
      }
    for (const [key, c] of shape.cells) {
      const [x, y] = xy(key);
      this.set(x + dx, y + dy, c);
    }
  }

  text(s: string, x: number, y: number, c: string, scale = 1, shadow?: string): number {
    const draw = (ox: number, oy: number, color: string) =>
      [...s.toUpperCase()].forEach((ch, n) =>
        (font[ch] ?? font[" "]).forEach((row, j) =>
          [...row].forEach((bit, i) => bit === "1" && this.box(ox + (n * 6 + i) * scale, oy + j * scale, scale, scale, color))));
    if (shadow) draw(x + scale, y + scale, shadow);
    draw(x, y, c);
    return textWidth(s, scale);
  }
}

const SIDES: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * The sprite with every inside corner of its silhouette filled, so the ring `stamp` draws round it turns that corner
 * on a diagonal instead of an L of three outline pixels
 */
function filledElbows(sprite: Canvas): Canvas {
  const out = new Canvas();
  for (const [key, c] of sprite.cells) out.cells.set(key, c);
  const on = (x: number, y: number) => sprite.get(x, y) !== undefined;
  const ring = (x: number, y: number) => !on(x, y) && SIDES.some(([ex, ey]) => on(x + ex, y + ey));
  for (const key of sprite.cells.keys()) {
    const [sx, sy] = xy(key);
    for (const [ex, ey] of SIDES) {
      const x = sx + ex, y = sy + ey;
      if (on(x, y) || out.get(x, y) !== undefined) continue;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = SIDES[i], [bx, by] = SIDES[(i + 1) % 4], [cx, cy] = SIDES[(i + 2) % 4], [dx, dy] = SIDES[(i + 3) % 4];
        if (on(x + ax, y + ay) && on(x + bx, y + by) && ring(x + cx, y + cy) && ring(x + dx, y + dy)
          && !on(x + cx + dx, y + cy + dy) && !ring(x + cx + dx, y + cy + dy)) {
          const [hx, hy] = ay === 0 ? [ax, ay] : [bx, by];
          out.set(x, y, sprite.get(x + hx, y + hy)!);
          break;
        }
      }
    }
  }
  return out;
}

/** A sprite from a character map: a string per row, a character per pixel, coloured by `palette`; any character the palette does not name (".", " ") stays clear */
export function sprite(rows: string[], palette: Record<string, string>): Canvas {
  const canvas = new Canvas();
  rows.forEach((row, y) => [...row].forEach((ch, x) => palette[ch] !== undefined && canvas.set(x, y, palette[ch])));
  return canvas;
}

export const textWidth = (s: string, scale = 1) => Math.max(0, [...s].length * 6 - 1) * scale;

/** A canvas on the stage, `px` stage px to a pixel; size and place round to whole stage px, so every pixel is the same square */
export const Pixels: React.FC<{ canvas: Canvas; px?: number; x?: number; y?: number; opacity?: number }> = ({
  canvas, px = 8, x = 0, y = 0, opacity,
}) => {
  const size = Math.max(1, Math.round(px)), left = Math.round(x), top = Math.round(y);
  const rows = new Map<number, Pt[]>();
  for (const key of canvas.cells.keys()) {
    const [cx, cy] = xy(key);
    if (!rows.has(cy)) rows.set(cy, []);
    rows.get(cy)!.push([cx, key]);
  }
  const rects: React.ReactNode[] = [];
  for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(cy)!.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cells.length; ) {
      const c = canvas.cells.get(cells[i][1])!;
      let j = i;
      while (j + 1 < cells.length && cells[j + 1][0] === cells[j][0] + 1 && canvas.cells.get(cells[j + 1][1]) === c) j++;
      rects.push(<rect key={`${cy} ${cells[i][0]}`} x={left + cells[i][0] * size} y={top + cy * size} width={(j - i + 1) * size} height={size} fill={c} />);
      i = j + 1;
    }
  }
  return <g shapeRendering="crispEdges" opacity={opacity}>{rects}</g>;
};

export const Pixelate: React.FC<{ id: string; block?: number; stageScale?: number; outline?: string; children: React.ReactNode }> = ({
  id, block = 8, stageScale = 1, outline, children,
}) => {
  const b = 2 * Math.max(1, Math.round(block / 2)), px = 1 / Math.max(0.1, stageScale), r = b / 2 - px;
  return (
    <g>
      <defs>
        {/* a screen px sampled at each block's middle by dots from the origin (anywhere else, or smaller, they fall
            between pixels), doubled to 2 × 2 so that it grows to exactly one block */}
        <filter id={id} x={-240} y={-240} width={2400} height={2400} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB">
          <feFlood x={0} y={0} width={px} height={px} floodColor="#000" result="dot" />
          <feComposite in="dot" x={0} y={0} width={b} height={b} result="cell" />
          <feTile in="cell" result="dots" />
          <feOffset in="SourceGraphic" dx={-r} dy={-r} result="centred" />
          <feComposite in="centred" in2="dots" operator="in" result="samples" />
          <feComponentTransfer in="samples" result="sample">
            <feFuncA type="discrete" tableValues="0 1" />
          </feComponentTransfer>
          <feOffset in="sample" dx={px} result="right" />
          <feMerge result="pair"><feMergeNode in="sample" /><feMergeNode in="right" /></feMerge>
          <feOffset in="pair" dy={px} result="below" />
          <feMerge result="hard"><feMergeNode in="pair" /><feMergeNode in="below" /></feMerge>
          <feMorphology in="hard" operator="dilate" radius={r} result="blocks" />
          {/* across and down apart, not as a square: a square ring doubles every diagonal step */}
          {outline && <feMorphology in="blocks" operator="dilate" radius={`${b} 0`} result="wide" />}
          {outline && <feMorphology in="blocks" operator="dilate" radius={`0 ${b}`} result="tall" />}
          {outline && <feFlood floodColor={outline} result="ink" />}
          {outline && <feComposite in="ink" in2="wide" operator="in" result="ring1" />}
          {outline && <feComposite in="ink" in2="tall" operator="in" result="ring2" />}
          {outline && <feMerge result="ringed"><feMergeNode in="ring1" /><feMergeNode in="ring2" /><feMergeNode in="blocks" /></feMerge>}
          <feOffset in={outline ? "ringed" : "blocks"} dx={r} dy={r} />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </g>
  );
};

/**
 * The kit's camera (`cameraAt`) for a pixel world drawn from the stage origin: the zoom rounds to a whole number (1 at
 * least) and the frame to whole pixels of the world, kept on the stage, so every block on screen is `px` × zoom stage
 * px, as if one small picture were scaled up. A glide from 1 to 3 steps through 2; a punch or a roll does not show.
 */
export function cameraAt(
  T: number, shots: Shot[], o: { hits?: number[]; punch?: number; px?: number; w?: number; h?: number } = {},
): CameraView {
  const { px = 8, w = 1920, h = 1080 } = o;
  const view = kitCameraAt(T, shots, o);
  const zoom = Math.max(1, Math.round(view.zoom)), cell = Math.max(1, Math.round(px)) * zoom;
  const snap = (v: number, size: number) => Math.min(0, Math.max(size - size * zoom, Math.round((size / 2 - v * zoom) / cell) * cell));
  const left = snap(view.x, w), top = snap(view.y, h);
  return {
    ...view, x: (w / 2 - left) / zoom, y: (h / 2 - top) / zoom, zoom, rotate: 0,
    svg: `translate(${left} ${top}) scale(${zoom})`,
    css: `translate(${left}px, ${top}px) scale(${zoom})`,
  };
}

export const step = (T: number, fps = 8) => Math.floor(T * fps + 1e-6) / fps;

export const colors = {
  ink: "#1b1530", night: "#2a2350", dusk: "#4b3a7a", plum: "#80508f", rose: "#d9668f",
  red: "#e8434f", coral: "#f2806b", orange: "#f59a3c", gold: "#ffcf4a", cream: "#fff2d2", white: "#ffffff",
  leaf: "#79c95a", green: "#3e9a5c", teal: "#2c8c95", sky: "#7cc6ef", blue: "#3f6fd8", navy: "#25306b",
  grey: "#8b8fa8", stone: "#c4bfd6", brown: "#8a5636", tan: "#d9a066", brick: "#a8483c",
};

const F = (...rows: string[]) => rows;
export const font: Record<string, string[]> = {
  "0": F("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
  "1": F("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
  "2": F("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
  "3": F("11111", "00010", "00100", "00010", "00001", "10001", "01110"),
  "4": F("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
  "5": F("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
  "6": F("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
  "7": F("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
  "8": F("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
  "9": F("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
  A: F("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
  B: F("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
  C: F("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
  D: F("11100", "10010", "10001", "10001", "10001", "10010", "11100"),
  E: F("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
  F: F("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
  G: F("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
  H: F("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
  I: F("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
  J: F("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
  K: F("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
  L: F("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
  M: F("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
  N: F("10001", "10001", "11001", "10101", "10011", "10001", "10001"),
  O: F("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
  P: F("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
  Q: F("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
  R: F("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
  S: F("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
  T: F("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
  U: F("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
  V: F("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
  W: F("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
  X: F("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
  Y: F("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
  Z: F("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
  ".": F("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
  ",": F("00000", "00000", "00000", "00000", "01100", "00100", "01000"),
  ":": F("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
  ";": F("00000", "01100", "01100", "00000", "01100", "00100", "01000"),
  "!": F("00100", "00100", "00100", "00100", "00100", "00000", "00100"),
  "?": F("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
  "'": F("00100", "00100", "01000", "00000", "00000", "00000", "00000"),
  '"': F("01010", "01010", "00000", "00000", "00000", "00000", "00000"),
  "-": F("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
  "+": F("00000", "00100", "00100", "11111", "00100", "00100", "00000"),
  "=": F("00000", "00000", "11111", "00000", "11111", "00000", "00000"),
  "/": F("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
  "%": F("11001", "11010", "00010", "00100", "01000", "01011", "10011"),
  "#": F("01010", "01010", "11111", "01010", "11111", "01010", "01010"),
  "&": F("01100", "10010", "10100", "01000", "10101", "10010", "01101"),
  "*": F("00000", "00100", "10101", "01110", "10101", "00100", "00000"),
  "(": F("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
  ")": F("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
  "<": F("00010", "00100", "01000", "10000", "01000", "00100", "00010"),
  ">": F("01000", "00100", "00010", "00001", "00010", "00100", "01000"),
  _: F("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
  " ": F("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
};
