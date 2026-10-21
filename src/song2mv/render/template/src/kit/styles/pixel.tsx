import React from "react";

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
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        if (width <= 1) this.set(x, y, c); else this.disc(x, y, width / 2 - 0.3, width / 2 - 0.3, c);
      }
    }
  }

  stamp(sprite: Canvas, outline?: string, dx = 0, dy = 0) {
    if (outline)
      for (const key of sprite.cells.keys()) {
        const [x, y] = xy(key);
        for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (sprite.get(x + ex, y + ey) === undefined) this.set(x + ex + dx, y + ey + dy, outline);
      }
    for (const [key, c] of sprite.cells) {
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

export const textWidth = (s: string, scale = 1) => Math.max(0, [...s].length * 6 - 1) * scale;

export const Pixels: React.FC<{ canvas: Canvas; px?: number; x?: number; y?: number; opacity?: number }> = ({
  canvas, px = 8, x = 0, y = 0, opacity,
}) => {
  const rows = new Map<number, Pt[]>();
  for (const key of canvas.cells.keys()) {
    const [cx, cy] = xy(key);
    if (!rows.has(cy)) rows.set(cy, []);
    rows.get(cy)!.push([cx, key]);
  }
  const rects: React.ReactNode[] = [];
  // the +0.5 hides seams on a scaled stage; drawn top down, each row covers the overlap of the row above
  for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(cy)!.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cells.length; ) {
      const c = canvas.cells.get(cells[i][1])!;
      let j = i;
      while (j + 1 < cells.length && cells[j + 1][0] === cells[j][0] + 1 && canvas.cells.get(cells[j + 1][1]) === c) j++;
      rects.push(<rect key={`${cy} ${cells[i][0]}`} x={x + cells[i][0] * px} y={y + cy * px} width={(j - i + 1) * px + 0.5} height={px + 0.5} fill={c} />);
      i = j + 1;
    }
  }
  return <g shapeRendering="crispEdges" opacity={opacity}>{rects}</g>;
};

export const Pixelate: React.FC<{ id: string; block?: number; stageScale?: number; outline?: string; children: React.ReactNode }> = ({
  id, block = 8, stageScale = 1, outline, children,
}) => {
  const h = block / 2, dot = 1 / Math.max(0.1, stageScale);
  return (
    <g>
      <defs>
        {/* sample dots start at the origin and are a screen px wide: anywhere else, or smaller, they fall between pixels */}
        <filter id={id} x={-240} y={-240} width={2400} height={2400} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB">
          <feFlood x={0} y={0} width={dot} height={dot} floodColor="#000" result="dot" />
          <feComposite in="dot" x={0} y={0} width={block} height={block} result="cell" />
          <feTile in="cell" result="dots" />
          <feOffset in="SourceGraphic" dx={-h} dy={-h} result="centred" />
          <feComposite in="centred" in2="dots" operator="in" result="samples" />
          <feComponentTransfer in="samples" result="hard">
            <feFuncA type="discrete" tableValues="0 1" />
          </feComponentTransfer>
          <feMorphology in="hard" operator="dilate" radius={h} result="blocks" />
          {outline && <feMorphology in="blocks" operator="dilate" radius={block} result="grown" />}
          {outline && <feFlood floodColor={outline} result="ink" />}
          {outline && <feComposite in="ink" in2="grown" operator="in" result="ring" />}
          {outline && <feMerge result="ringed"><feMergeNode in="ring" /><feMergeNode in="blocks" /></feMerge>}
          <feOffset in={outline ? "ringed" : "blocks"} dx={h} dy={h} />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </g>
  );
};

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
