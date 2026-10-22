import React from "react";
import { cameraAt as kitCameraAt, CameraView, Shot } from "../camera";
import { mix } from "../color";
import { DEFAULT_THEME, Line, useSong } from "../song";
import { liveLine } from "../text";

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

/**
 * Anything inside as blocks `block` stage px wide on the stage grid (`stageScale`: the size it is drawn at on screen),
 * with a `shadow` one block below them and `outline` one block wide round both
 */
export const Pixelate: React.FC<{
  id: string; block?: number; stageScale?: number; outline?: string; shadow?: string; children: React.ReactNode;
}> = ({ id, block = 8, stageScale = 1, outline, shadow, children }) => {
  const b = 2 * Math.max(1, Math.round(block / 2)), px = 1 / Math.max(0.1, stageScale), r = b / 2 - px;
  const body = shadow ? "body" : "blocks";
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
          {shadow && <feOffset in="blocks" dy={b} result="dropped" />}
          {shadow && <feFlood floodColor={shadow} result="shade" />}
          {shadow && <feComposite in="shade" in2="dropped" operator="in" result="cast" />}
          {shadow && <feMerge result="body"><feMergeNode in="cast" /><feMergeNode in="blocks" /></feMerge>}
          {/* across and down apart, not as a square: a square ring doubles every diagonal step */}
          {outline && <feMorphology in={body} operator="dilate" radius={`${b} 0`} result="wide" />}
          {outline && <feMorphology in={body} operator="dilate" radius={`0 ${b}`} result="tall" />}
          {outline && <feFlood floodColor={outline} result="ink" />}
          {outline && <feComposite in="ink" in2="wide" operator="in" result="ring1" />}
          {outline && <feComposite in="ink" in2="tall" operator="in" result="ring2" />}
          {outline && <feMerge result="ringed"><feMergeNode in="ring1" /><feMergeNode in="ring2" /><feMergeNode in={body} /></feMerge>}
          <feOffset in={outline ? "ringed" : body} dx={r} dy={r} />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </g>
  );
};

/**
 * The kit's camera (`cameraAt`) for a pixel world drawn from the stage origin: each shot's zoom rounds to a whole
 * number (1 at least) and the frame to whole pixels of the world, kept on the stage, so every block on screen is `px`
 * × zoom stage px, as if one small picture were scaled up. A shot that changes the zoom cuts on its time, glide or not,
 * since blocks can only change size in one jump; a glide or a drift at one zoom pans by whole pixels. A drift in zoom,
 * a punch or a roll does not show.
 */
export function cameraAt(
  T: number, shots: Shot[], o: { hits?: number[]; punch?: number; px?: number; w?: number; h?: number } = {},
): CameraView {
  const { px = 8, w = 1920, h = 1080 } = o;
  const whole = (z = 1) => Math.max(1, Math.round(z));
  const list = [...shots].sort((a, b) => a.t - b.t);
  const steady = list.map((s, i): Shot => ({
    ...s, zoom: whole(s.zoom), to: s.to && { ...s.to, zoom: undefined },
    glide: i > 0 && whole(list[i - 1].zoom) !== whole(s.zoom) ? 0 : s.glide,
  }));
  const view = kitCameraAt(T, steady, { w, h, punch: 0 });
  const zoom = whole(view.zoom), cell = Math.max(1, Math.round(px)) * zoom;
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
  $: F("00100", "01111", "10100", "01110", "00101", "11110", "00100"),
  "@": F("01110", "10001", "10111", "10101", "10111", "10000", "01110"),
  "[": F("01110", "01000", "01000", "01000", "01000", "01000", "01110"),
  "]": F("01110", "00010", "00010", "00010", "00010", "00010", "01110"),
  "{": F("00010", "00100", "00100", "01000", "00100", "00100", "00010"),
  "}": F("01000", "00100", "00100", "00010", "00100", "00100", "01000"),
  "\\": F("10000", "01000", "01000", "00100", "00010", "00010", "00001"),
  "|": F("00100", "00100", "00100", "00100", "00100", "00100", "00100"),
  "^": F("00100", "01010", "10001", "00000", "00000", "00000", "00000"),
  "`": F("01000", "00100", "00010", "00000", "00000", "00000", "00000"),
  "~": F("00000", "00000", "01000", "10101", "00010", "00000", "00000"),
  " ": F("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
};

// ── lettering ────────────────────────────────────────────────

type Glyph = { bits: Pt[]; adv: number };
/** A typeface in bits: glyphs, the space between words, letter height, row pitch and what it does to a text first */
type Face = { glyph: (ch: string) => Glyph; space: number; cap: number; height: number; row: number; spell: (s: string) => string };

const LOOKALIKES: Record<string, string> = {
  "\u00d8": "O", "\u00c6": "AE", "\u0152": "OE", "\u0141": "L", "\u0110": "D", "\u00d0": "D", "\u00de": "TH",
  "\u00a1": "!", "\u00bf": "?", "\u00d7": "X", "\u00ab": '"', "\u00bb": '"', "\u00b4": "'", "`": "'",
};

/**
 * The 5×7 font's spelling: capitals, accents dropped, curly quotes, dashes and ellipses made plain, and symbols it
 * lacks (music notes, emoji) dropped, so only letters it lacks call for another face
 */
const plain = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u2026/g, "...")
    .replace(/./gsu, (ch) => LOOKALIKES[ch] ?? (font[ch] !== undefined || /[\s\p{L}\p{N}]/u.test(ch) ? ch : ""));

const inFont = (s: string) => [...plain(s)].every((ch) => font[ch] !== undefined || /\s/.test(ch));

const FIVE_BY_SEVEN: Face = {
  glyph: (ch) => ({ bits: (font[ch] ?? font[" "]).flatMap((row, y) => [...row].flatMap((b, x): Pt[] => (b === "1" ? [[x, y]] : []))), adv: 6 }),
  space: 4, cap: 7, height: 7, row: 10, spell: plain,
};

/** Text the 5×7 font lacks (Hangul, kana, Cyrillic …) comes from a font at 16 bits to the em: Hangul is 14 bits tall */
const EM = 16, ASCENT = 13, DESCENT = 4, SUPERSAMPLE = 8;
let raster: CanvasRenderingContext2D | null | undefined;
const glyphs = new Map<string, Glyph>();

/**
 * One glyph of `family` at EM bits to the em, weight 500 so strokes are one bit wide, drawn at the sub-bit shift
 * that leaves the fewest half-covered bits: its strokes then land on whole bits
 */
function fontGlyph(ch: string, family: string): Glyph {
  const key = `${family}|${ch}`;
  const known = glyphs.get(key);
  if (known) return known;
  if (raster === undefined) raster = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const css = `500 ${EM * SUPERSAMPLE}px ${family}`, S = SUPERSAMPLE;
  let glyph: Glyph = { bits: [], adv: EM };
  if (raster) {
    raster.font = css;
    const adv = Math.max(1, Math.round(raster.measureText(ch).width / S));
    const W = adv + 4, H = ASCENT + DESCENT + 2;
    raster.canvas.width = W * S;
    raster.canvas.height = H * S;
    let crispest = -1;
    for (const dy of [0, 0.25, 0.5, 0.75])
      for (const dx of [0, 0.25, 0.5, 0.75]) {
        raster.clearRect(0, 0, W * S, H * S);
        raster.font = css;
        raster.fillText(ch, (2 + dx) * S, (1 + ASCENT + dy) * S);
        const alpha = raster.getImageData(0, 0, W * S, H * S).data;
        const bits: Pt[] = [];
        let crisp = 0;
        for (let by = 0; by < H; by++)
          for (let bx = 0; bx < W; bx++) {
            let sum = 0;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sum += alpha[((by * S + y) * W * S + bx * S + x) * 4 + 3];
            const cover = sum / (255 * S * S);
            crisp += Math.abs(cover - 0.5);
            if (cover >= 0.5) bits.push([bx - 2, by - 1]);
          }
        if (crisp > crispest) { crispest = crisp; glyph = { bits, adv }; }
      }
  }
  glyphs.set(key, glyph);
  return glyph;
}

const fontFace = (family: string): Face => ({
  glyph: (ch) => fontGlyph(ch, family), space: Math.max(fontGlyph(" ", family).adv, (EM * 3) / 8), cap: ASCENT, height: ASCENT + DESCENT, row: ASCENT + DESCENT + 2,
  spell: (s) => s,
});

/** The 5×7 font if it has every letter of every text, else `family` */
const faceFor = (texts: string[], family: string) => (texts.every(inFont) ? FIVE_BY_SEVEN : fontFace(family));

type Setting = { rows: { bits: Pt[]; word: number }[][]; widest: number };

/**
 * Words in rows no wider than `width` bits (a longer word gets a row of its own, one with nothing to draw takes no
 * space), each row centred on x 0
 */
function setWords(words: string[], face: Face, width: number): Setting {
  const shaped = words.map((w) => {
    const bits: Pt[] = [];
    let x = 0, right = 0;
    for (const ch of face.spell(w)) {
      const g = face.glyph(ch);
      for (const [bx, by] of g.bits) { bits.push([x + bx, by]); right = Math.max(right, x + bx + 1); }
      x += g.adv;
    }
    return { bits, w: right };
  });
  const rows: number[][] = [];
  let used = 0;
  shaped.forEach((s, i) => {
    const row = rows[rows.length - 1], next = used && s.w ? used + face.space + s.w : used + s.w;
    if (row && (!used || !s.w || next <= width)) { row.push(i); used = next; } else { rows.push([i]); used = s.w; }
  });
  let widest = 0;
  return {
    rows: rows.map((row) => {
      const shown = row.filter((i) => shaped[i].w);
      const w = shown.reduce((a, i) => a + shaped[i].w, 0) + face.space * Math.max(0, shown.length - 1);
      widest = Math.max(widest, w);
      let x = -Math.floor(w / 2);
      return row.map((i) => {
        const placed = { bits: shaped[i].bits.map(([bx, by]): Pt => [x + bx, by]), word: i };
        if (shaped[i].w) x += shaped[i].w + face.space;
        return placed;
      });
    }),
    widest,
  };
}

/**
 * The empty cells boxed in by a shape that a one-cell ring would close up, or leave as a pinhole no `side` cells
 * across: a counter that a shadow has nearly filled
 */
function pinholes(shape: Canvas, side: number): Pt[] {
  const pts = [...shape.cells.keys()].map(xy);
  if (!pts.length) return [];
  const x0 = Math.min(...pts.map((p) => p[0])) - 1, y0 = Math.min(...pts.map((p) => p[1])) - 1;
  const W = Math.max(...pts.map((p) => p[0])) - x0 + 2, H = Math.max(...pts.map((p) => p[1])) - y0 + 2;
  const solid = new Uint8Array(W * H), seen = new Uint8Array(W * H);
  for (const [x, y] of pts) solid[(y - y0) * W + x - x0] = 1;
  const flood = (start: number) => {
    const cells = [start], stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i - x) / W;
      for (const [dx, dy] of SIDES) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !solid[j] && !seen[j]) { seen[j] = 1; stack.push(j); cells.push(j); }
      }
    }
    return cells;
  };
  flood(0);
  const out: Pt[] = [];
  for (let i = 0; i < W * H; i++) {
    if (solid[i] || seen[i]) continue;
    const hole = flood(i);
    const open = new Set(hole.filter((c) => {
      const x = c % W, y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (solid[(y + dy) * W + x + dx]) return false;
      return true;
    }));
    const square = (c: number) => {
      for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) if (!open.has(c + dy * W + dx)) return false;
      return true;
    };
    if (![...open].some(square)) for (const c of hole) out.push([(c % W) + x0, Math.floor(c / W) + y0]);
  }
  return out;
}

type Lettering = {
  /** blocks to a bit of the font */
  scale?: number;
  color?: string;
  /** the colour of the letters' lower part, for two-tone letters */
  lower?: string;
  /** a drop shadow one bit below the letters, inside the outline */
  shadow?: string;
  outline?: string;
  /** wraps to rows this many blocks wide, and steps the scale down while a word alone is wider */
  width?: number;
  /** for text the 5×7 font lacks */
  font?: string;
};

/** BigText's letters on a canvas, centred on x with its top row at y, and the scale they end up at */
function lettering(text: string, x: number, y: number, o: Lettering): { canvas: Canvas; scale: number } {
  const { width, color = colors.white, lower, shadow, outline = colors.ink, font: family = DEFAULT_THEME.font } = o;
  const face = faceFor([text], family);
  const paragraphs = text.split("\n").map((p) => p.split(/\s+/).filter(Boolean));
  let s = Math.max(1, Math.round(o.scale ?? 4));
  const set = () => paragraphs.map((words) => setWords(words, face, width ? width / s : Infinity));
  let sets = set();
  while (width && s > 1 && Math.max(...sets.map((st) => st.widest)) * s > width) { s--; sets = set(); }
  const split = Math.round((face.cap * 4) / 7);
  const shape = new Canvas(), letters = new Canvas();
  sets.flatMap((st) => st.rows).forEach((row, r) => {
    for (const { bits } of row)
      for (const [bx, by] of bits) letters.box(x + bx * s, y + (r * face.row + by) * s, s, s, lower && by >= split ? lower : color);
  });
  const slit = (cx: number, cy: number) =>
    letters.get(cx, cy) !== undefined && letters.get(cx, cy + s) === undefined && letters.get(cx, cy + 2 * s) !== undefined;
  for (const key of shadow ? letters.cells.keys() : []) {
    const [cx, cy] = xy(key);
    shape.set(cx, cy + s, slit(cx, cy) && (slit(cx - s, cy) || slit(cx + s, cy)) ? outline : shadow!);
  }
  for (const [key, c] of letters.cells) shape.cells.set(key, c);
  for (const [hx, hy] of pinholes(shape, Math.max(2, s))) shape.set(hx, hy, shadow ?? outline);
  const canvas = new Canvas();
  canvas.stamp(shape, outline);
  for (const key of [...canvas.cells.keys()]) {
    if (canvas.cells.get(key) !== outline) continue;
    const [cx, cy] = xy(key);
    for (const [dx, dy] of [[1, 0], [0, 1]])
      if (canvas.get(cx + dx, cy + dy) === undefined && canvas.get(cx + 2 * dx, cy + 2 * dy) === outline) canvas.set(cx + dx, cy + dy, outline);
  }
  return { canvas, scale: s };
}

/**
 * Big type in pixels: the 5×7 font at `scale` blocks to a bit (text it lacks, such as Korean, from a font at 16 bits
 * to the em), two-tone with `lower`, a drop `shadow`, one clean block of `outline` round it all. Centred on x, top at
 * y, both in blocks of a `px` grid like Pixels, so it sits on the scene's grid at the camera's whole-number zooms.
 * With `t` it pops in once, one bit high for its first 0.1 s, and holds still until `until`.
 */
export const BigText: React.FC<Lettering & { text: string; x: number; y: number; px?: number; T?: number; t?: number; until?: number }> = ({
  text, x, y, px = 8, T, t, until, ...look
}) => {
  if (T !== undefined && t !== undefined && (T < t || (until !== undefined && T >= until))) return null;
  const { canvas, scale } = lettering(text, x, y, look);
  const pop = T !== undefined && t !== undefined && T - t < 0.1 ? scale : 0;
  return <Pixels canvas={canvas} px={px} y={-pop * Math.round(px)} />;
};

/**
 * A game dialog box that letters the line being sung (from `lines`, else the song's) word by word: sung words in
 * `color`, the rest `dim`. Each line is set once, wrapped to the box, so its words never move; a line longer than
 * `rows` rows turns the page when the singing reaches the next one. The box is `width` blocks wide and its height
 * fits `rows` rows of the face the song's lines need: the 5×7 font, or a font at 16 bits to the em when a line
 * has letters it lacks (Korean), at `scale`.
 */
export const Dialog: React.FC<{
  T: number; x: number; y: number; width: number; rows?: number; lines?: Line[]; px?: number; scale?: number;
  color?: string; dim?: string; fill?: string; edge?: string; font?: string;
}> = ({
  T, x, y, width, rows = 2, lines, px = 8, scale = 1, color = colors.white, dim, fill = colors.ink, edge = colors.stone,
  font: family = DEFAULT_THEME.font,
}) => {
  const { song } = useSong();
  const all = lines ?? song.lines;
  const line = liveLine(all, T, 0.12, song.lines);
  if (!line) return null;
  const s = Math.max(1, Math.round(scale)), face = faceFor(all.map((l) => l.words.map((w) => w.w).join(" ")), family);
  const pad = 2 + 2 * s, h = 2 * pad + ((rows - 1) * face.row + face.height) * s;
  const c = new Canvas();
  c.box(x + 1, y, width - 2, h, fill);
  c.box(x, y + 1, width, h - 2, fill);
  c.box(x + 2, y + 1, width - 4, 1, edge);
  c.box(x + 2, y + h - 2, width - 4, 1, edge);
  c.box(x + 1, y + 2, 1, h - 4, edge);
  c.box(x + width - 2, y + 2, 1, h - 4, edge);
  const { rows: set } = setWords(line.words.map((w) => w.w), face, (width - 2 * pad) / s);
  const sung = line.words.filter((w) => T >= w.t).length;
  const rowOf = set.flatMap((row, r) => row.map(() => r));
  const page = sung ? Math.floor(rowOf[sung - 1] / rows) : 0;
  const shown = set.slice(page * rows, page * rows + rows);
  const top = y + pad + Math.floor(((rows - shown.length) * face.row * s) / 2), mid = x + Math.floor(width / 2);
  const faded = dim ?? mix(color, fill, 0.6);
  shown.forEach((row, r) => {
    for (const { bits, word } of row)
      for (const [bx, by] of bits) c.box(mid + bx * s, top + (r * face.row + by) * s, s, s, T >= line.words[word].t ? color : faded);
  });
  return <Pixels canvas={c} px={px} />;
};
