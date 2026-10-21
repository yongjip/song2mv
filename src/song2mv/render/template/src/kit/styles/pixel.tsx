import React from "react";

/**
 * Style pack: pixel art. Draw into a Canvas of big square pixels, the way sprites were drawn for old game consoles
 * (boxes, discs, polygons, lines, dithered tones, a 5×7 font, a dark 1-px outline around each sprite), then show the
 * canvas on the stage with Pixels, `px` stage px to a pixel. Pixelate turns anything else into the same big pixels:
 * type in any font, or any of the kit's drawings.
 *
 *   const c = new pixel.Canvas();                          240 × 135 pixels fill the stage at px 8
 *   c.box(0, 100, 240, 35, pixel.colors.green);            the ground
 *   const coin = new pixel.Canvas();
 *   coin.disc(60, 90, 4, 5, pixel.colors.gold);
 *   c.stamp(coin, pixel.colors.ink);                       a coin, outlined
 *   c.text("SCORE 100", 4, 4, pixel.colors.white);
 *   <Svg><pixel.Pixels canvas={c} /></Svg>
 *
 * A canvas is plain data: build it from T in the scene, every frame. Positions round to whole pixels, so things move
 * a pixel at a time; run their motion on step(T) for the held frames of sprite animation. Latin letters and digits go
 * in the canvas with text(); other type (Korean) stays type: crisp for lyrics, through Pixelate only when it is big.
 * Gallery tile 22 (src/Gallery.tsx) draws a street corner at dusk this way.
 */

type Pt = [number, number];
/** A canvas keeps its pixels by key (y + 4096) · 16384 + x + 4096: x and y from −4096 to 12287 */
const OFF = 4096, ROW = 16384;
const xy = (k: number): Pt => [(k % ROW) - OFF, Math.floor(k / ROW) - OFF];
/** A 4×4 ordered dither: a pixel takes the tone k when its entry is under 16 k */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class Canvas {
  /** The colour of every pixel drawn, by key; later drawing paints over earlier */
  readonly cells = new Map<number, string>();

  /** One pixel; x and y round to whole pixels */
  set(x: number, y: number, c: string) {
    x = Math.round(x); y = Math.round(y);
    if (x >= -OFF && x < ROW - OFF && y >= -OFF && y < ROW - OFF) this.cells.set((y + OFF) * ROW + x + OFF, c);
  }

  /** The colour at a pixel, undefined where nothing is drawn */
  get(x: number, y: number): string | undefined {
    return this.cells.get((Math.round(y) + OFF) * ROW + Math.round(x) + OFF);
  }

  /** A w × h box, its top left pixel at x, y */
  box(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /**
   * A w × h box of c as a tone: k (0–1) of its pixels set, in an ordered dither fixed to the canvas, so that toned
   * boxes side by side join up. For the bands of a sky, light on a wall, a shadow on the ground.
   */
  dither(x: number, y: number, w: number, h: number, c: string, k = 0.5) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const X = Math.round(x + i), Y = Math.round(y + j);
        if (BAYER[(Y & 3) * 4 + (X & 3)] < k * 16) this.set(X, Y, c);
      }
  }

  /** A filled ellipse around cx, cy, rx and ry pixels in radius */
  disc(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }

  /** A filled polygon through `pts` */
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

  /** A line through `pts`, w pixels thick: 1 is a single pixel trail, thicker lines have round ends */
  line(pts: Pt[], w: number, c: string) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        if (w <= 1) this.set(x, y, c); else this.disc(x, y, w / 2 - 0.3, w / 2 - 0.3, c);
      }
    }
  }

  /**
   * Another canvas painted on this one, moved by dx, dy: a sprite drawn on a canvas of its own. With `outline`, the
   * pixels around its shape (left, right, above, below) take that colour first: the dark edge that lifts a sprite
   * off the scene. Draw a sprite once and stamp it wherever it goes.
   */
  stamp(o: Canvas, outline?: string, dx = 0, dy = 0) {
    if (outline)
      for (const k of o.cells.keys()) {
        const [x, y] = xy(k);
        for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (o.get(x + ex, y + ey) === undefined) this.set(x + ex + dx, y + ey + dy, outline);
      }
    for (const [k, c] of o.cells) {
      const [x, y] = xy(k);
      this.set(x + dx, y + dy, c);
    }
  }

  /**
   * Text in the 5×7 font, its top left at x, y: letters (as capitals), digits and . , : ; ! ? ' " - + = / % # & * ( )
   * < > _, each font pixel `scale` pixels big, 6 · scale pixels a character. `shadow` draws it once more, a font pixel
   * down and right, behind. A character the font lacks leaves a space. Returns the width drawn.
   */
  text(s: string, x: number, y: number, c: string, scale = 1, shadow?: string): number {
    const draw = (ox: number, oy: number, col: string) =>
      [...s.toUpperCase()].forEach((ch, n) =>
        (font[ch] ?? font[" "]).forEach((row, j) =>
          [...row].forEach((b, i) => b === "1" && this.box(ox + (n * 6 + i) * scale, oy + j * scale, scale, scale, col))));
    if (shadow) draw(x + scale, y + scale, shadow);
    draw(x, y, c);
    return textWidth(s, scale);
  }
}

/** How many pixels wide text() draws s */
export const textWidth = (s: string, scale = 1) => Math.max(0, [...s].length * 6 - 1) * scale;

/**
 * A canvas on the stage: each pixel a px × px square, the canvas's pixel 0, 0 at stage x, y. Keep x and y on
 * multiples of px, so that every canvas and Pixelate share one grid. Each row is drawn as runs of one colour, a rect a
 * run, a hair wider and taller than its pixels so that no seam shows where the stage is drawn scaled.
 */
export const Pixels: React.FC<{ canvas: Canvas; px?: number; x?: number; y?: number; opacity?: number }> = ({
  canvas, px = 8, x = 0, y = 0, opacity,
}) => {
  const rows = new Map<number, Pt[]>();
  for (const k of canvas.cells.keys()) {
    const [cx, cy] = xy(k);
    if (!rows.has(cy)) rows.set(cy, []);
    rows.get(cy)!.push([cx, k]);
  }
  const out: React.ReactNode[] = [];
  // top to bottom, so that each row's extra hair lies under the row below
  for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(cy)!.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cells.length; ) {
      const c = canvas.cells.get(cells[i][1])!;
      let j = i;
      while (j + 1 < cells.length && cells[j + 1][0] === cells[j][0] + 1 && canvas.cells.get(cells[j + 1][1]) === c) j++;
      out.push(<rect key={`${cy} ${cells[i][0]}`} x={x + cells[i][0] * px} y={y + cy * px} width={(j - i + 1) * px + 0.5} height={px + 0.5} fill={c} />);
      i = j + 1;
    }
  }
  return <g shapeRendering="crispEdges" opacity={opacity}>{out}</g>;
};

/**
 * Anything inside turns into big pixels: blocks `block` stage px square on the stage's grid (the grid of a Canvas at
 * px = block), each the colour of the picture at its centre, or empty where that is less than half opaque. For type in
 * any font and for any of the kit's drawings; `outline` rings the result with one block of that colour, the way
 * stamp() outlines a sprite. `id` names the filter: one per Pixelate on a stage.
 * - Pop, slide or scale the children inside, so that the blocks stay put while the picture moves under them; a camera
 *   around Pixelate moves the grid along with everything else.
 * - A block takes the colour at its centre, blends included: where two colours meet inside one Pixelate (a fill and
 *   its stroke), some blocks come out a mix of both. Give each colour its own Pixelate (a shadow, then the face).
 * - Korean type smears into blots below about 18 blocks to the em (70 px type with 4 px blocks, 140 px with 8): keep
 *   lyrics crisp type, and pixelate big type only.
 * - The picture is sampled with one dot a stage px wide per block. Where the stage is drawn smaller than full size
 *   (0.76 in the 9:16 band, or a camera pulled back), a dot can fall between screen pixels, and the picture flickers or
 *   vanishes as it moves: pass that size as `scale` (a little low is safe, too high is not). A still stage placed on
 *   whole pixels keeps blocks down to one screen pixel wide, as in the gallery overview (0.2).
 */
export const Pixelate: React.FC<{ id: string; block?: number; scale?: number; outline?: string; children: React.ReactNode }> = ({
  id, block = 8, scale = 1, outline, children,
}) => {
  const h = block / 2, dot = 1 / Math.max(0.1, scale);
  return (
    <g>
      <defs>
        {/* a dot per block, the first at the group's origin (a dot anywhere else drops between screen pixels at some
            scales); the picture moved half a block up and left so that each dot takes a block's centre, then the
            blocks moved back */}
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

/** Song time held on 8 steps a second, the frame rate of sprite animation; pass it instead of T to a sprite's motion */
export const step = (T: number, fps = 8) => Math.floor(T * fps + 1e-6) / fps;

/** A box of crayons for night and day: saturated, a dark ink for outlines, every colour readable on ink */
export const colors = {
  ink: "#1b1530", night: "#2a2350", dusk: "#4b3a7a", plum: "#80508f", rose: "#d9668f",
  red: "#e8434f", coral: "#f2806b", orange: "#f59a3c", gold: "#ffcf4a", cream: "#fff2d2", white: "#ffffff",
  leaf: "#79c95a", green: "#3e9a5c", teal: "#2c8c95", sky: "#7cc6ef", blue: "#3f6fd8", navy: "#25306b",
  grey: "#8b8fa8", stone: "#c4bfd6", brown: "#8a5636", tan: "#d9a066", brick: "#a8483c",
};

const F = (...rows: string[]) => rows;
/** The 5×7 font: seven rows of five, "1" lit. Add a glyph by key (pixel.font["♥"] = F(…)) if a song needs one */
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
