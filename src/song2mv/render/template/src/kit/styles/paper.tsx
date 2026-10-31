import React, { createContext, useContext, useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { mix } from "../color";
import { rng } from "../math";

/**
 * Style pack: paper cut-out. Anything drawn with these pieces looks cut from coloured paper and stacked: hand-cut
 * edges, a shadow under every piece that grows as the piece is lifted, the paper's grain and a lit edge.
 *
 *   <Svg>
 *     <paper.Stack id="s1">
 *       <paper.Cut d={paper.rect(-20, -20, 1960, 1120, 1)} fill={paper.colors.cream} />      the sheet under it all
 *       <paper.Cut d={paper.ellipse(0, 0, 90, 90, 2)} x={1500} y={260} lift={12} fill={paper.colors.mustard} />
 *     </paper.Stack>
 *   </Svg>
 *
 * Outlines are cut around their own origin; place a piece with x, y, rotate and s on its Cut, so that its grain and
 * lit edge move with it and its shadow keeps falling away from the light. Pieces stack in drawing order, back to
 * front. Nothing here keeps state: lift, sway and drift come from T in the scene, and a shape keeps its seed, so its
 * cut stays the same from frame to frame. Letters are not cut: text stays type that holds still (text.tsx).
 * Gallery tile 13 (src/Gallery.tsx) draws a room of everyday things this way.
 */

type Pt = [number, number];
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
/** scissors cut a long edge or a curve as straight cuts about this long */
const STEP = 24;
const close = (p: Pt[]) => `M ${p.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(" L ")} Z`;

/**
 * A polygon as cut by hand: every corner nudged by up to `jitter` px, long edges broken into straight cuts with their
 * joints off the line by up to as much (never more than 6 % of the shape's smaller side). The same seed always cuts
 * the same outline. For a curve, pass points about 20–30 px apart.
 */
export function poly(points: Pt[], seed = 1, jitter = 2.5): string {
  const r = rng(seed);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const j = Math.min(jitter, 0.06 * Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const out: Pt[] = [];
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    const L = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.round(L / STEP));
    out.push([ax + (r() - 0.5) * j, ay + (r() - 0.5) * j]);
    for (let k = 1; k < n; k++) {
      const t = (k + (r() - 0.5) * 0.6) / n, o = (r() - 0.5) * 2 * j;
      out.push([ax + (bx - ax) * t - ((by - ay) / L) * o, ay + (by - ay) * t + ((bx - ax) / L) * o]);
    }
  });
  return close(out);
}

/** A rectangle cut by hand, its top left corner at x, y */
export const rect = (x: number, y: number, w: number, h: number, seed = 1, jitter = 2.5) =>
  poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, jitter);

/** An ellipse cut by hand: straight cuts about 24 px long all round, each joint up to `jitter` px in or out */
export function ellipse(cx: number, cy: number, rx: number, ry: number, seed = 1, jitter = 2.5): string {
  const r = rng(seed);
  const j = Math.min(jitter, 0.12 * Math.min(rx, ry));
  const n = Math.max(10, Math.round((2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2)) / STEP));
  const a0 = r() * 2 * Math.PI;
  return close(Array.from({ length: n }, (_, k): Pt => {
    const a = a0 + ((k + (r() - 0.5) * 0.5) / n) * 2 * Math.PI, o = (r() - 0.5) * 2 * j;
    return [cx + (rx + o) * Math.cos(a), cy + (ry + o) * Math.sin(a)];
  }));
}

/** A strip of paper along a line through `points`, w0 px wide at the start and w1 at the end: stems, cords, steam, tails */
export function strip(points: Pt[], w0: number, w1 = w0, seed = 1, jitter = 1.5): string {
  const n = points.length;
  const side = (sign: number) => points.map(([x, y], i): Pt => {
    const [px, py] = points[Math.max(0, i - 1)], [qx, qy] = points[Math.min(n - 1, i + 1)];
    const L = Math.hypot(qx - px, qy - py) || 1, w = (sign * (w0 + ((w1 - w0) * i) / Math.max(1, n - 1))) / 2;
    return [x - ((qy - py) / L) * w, y + ((qx - px) / L) * w];
  });
  return poly([...side(1), ...side(-1).reverse()], seed, Math.min(jitter, 0.1 * Math.max(w0, w1)));
}

/** A packet of coloured paper: matte tones that sit well together */
export const colors = {
  white: "#f6f0e4", cream: "#efe0c2", kraft: "#c99e6e", brown: "#7d5234",
  red: "#d4483b", coral: "#ec8466", pink: "#eeb0b8", orange: "#e8873a", mustard: "#e8b440",
  leaf: "#79a650", green: "#3f7d4c", teal: "#2e7a7b", sky: "#93c8de", blue: "#3f6faa", navy: "#29395f",
  plum: "#7b4d78", charcoal: "#35312e",
};

/** Any colour as matte paper: pulled k of the way towards cream, so that screen-bright colours look printed */
export const matte = (c: string, k = 0.15) => (/^#[0-9a-f]{6}$/i.test(c) ? mix(c, colors.cream, k) : c);

/** Song time held on 12 steps a second, the way cut-out animation moves; pass it instead of T to a piece's motion */
export const step = (T: number, fps = 12) => Math.floor(T * fps + 1e-6) / fps;

// ── pieces ───────────────────────────────────────────────────

const Ctx = createContext<{ id: string; grain: number; shadow: Pt; tiles: boolean } | null>(null);
/** shadows on paper look warm and dark, not grey */
const SHADOW = "0 0 0 0 0.11  0 0 0 0 0.07  0 0 0 0 0.04";
const INK = "#1c120a";
/** the lit edge: the strip of a piece that a copy of it moved this far down and right does not cover */
const LIT = 1.8;
/** a piece lifted higher than this casts its shadow through a blur filter: the outlines `halo` stacks would step too visibly */
const HIGH = 12;
/** the specks repeat every SPECK px and the blotches every BLOTCH px */
const SPECK = 128;
const BLOTCH = 512;
/** a piece under TINY px² (the area of its bounding box) gets no grain, one under LARGE no blotches */
const TINY = 1024;
const LARGE = 250 * 250;

/**
 * The paper's surface: fine specks over soft blotches, each drawn once by Chrome as a tile of dark and light alpha and
 * laid over every piece in the piece's own coordinates, so that it turns with the piece and what is drawn over the
 * piece covers it. A turbulence filter on every piece drew the noise again in every frame, which took more than half
 * of a whole render. The specks are one octave at 0.5 a px: finer noise turns into harsh speckle where the stage is
 * drawn smaller (0.76 in the 9:16 band, 0.25 in the gallery overview).
 */
const tileSvg = (size: number, frequency: number, octaves: number, seed: number, dark: string, light: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
  + `<filter id="g" filterUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}" color-interpolation-filters="sRGB">`
  + `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch" result="noise"/>`
  + `<feColorMatrix in="noise" type="matrix" values="${dark}" result="dark"/><feColorMatrix in="noise" type="matrix" values="${light}" result="light"/>`
  + `<feMerge><feMergeNode in="dark"/><feMergeNode in="light"/></feMerge></filter>`
  + `<rect width="${size}" height="${size}" fill="none" filter="url(#g)"/></svg>`;

function drawTile(size: number, svg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("paper: the grain did not draw"));
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });
}

let drawn: [string, string] | null = null;
let drawing: Promise<[string, string]> | undefined;
const drawGrain = () => (drawing ??= Promise.all([
  drawTile(SPECK, tileSvg(SPECK, 0.5, 1, 3, `${SHADOW}  0.44 0 0 0 -0.22`, "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.44 0 0 0 0.22")),
  drawTile(BLOTCH, tileSvg(BLOTCH, 0.01, 3, 8, `${SHADOW}  0 0.3 0 0 -0.15`, "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 -0.3 0 0 0.15")),
]).then((t) => (drawn = t)));

/** The speck and blotch tiles as images once Chrome has drawn them; every frame waits for them (not on a server) */
function useGrain(on: boolean): [string, string] | null {
  const browser = typeof document !== "undefined";
  const [handle] = useState(() => (on && browser && !drawn ? delayRender("paper grain") : null));
  const [urls, setUrls] = useState(drawn);
  useEffect(() => {
    if (on && browser && !urls) drawGrain().then(setUrls, cancelRender);
  }, [on, browser, urls]);
  useEffect(() => {
    if (urls && handle !== null) continueRender(handle);
  }, [urls, handle]);
  return on ? urls : null;
}

const boxes = new Map<string, Pt>();
/** The width and height of an outline's bounding box, from the numbers in its path */
function box(d: string): Pt {
  let b = boxes.get(d);
  if (b === undefined) {
    const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) {
      x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
    }
    b = [Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
    if (boxes.size > 4000) boxes.clear();
    boxes.set(d, b);
  }
  return b;
}

const PIXELS = { imageRendering: "pixelated" } as const;

/** The lit edge as a filter, for a piece whose outline cannot be read or that is lifted past HIGH; 1.6 px wide, which a pixel grid rounds to 2 */
const Rim: React.FC<{ id: string }> = ({ id }) => (
  <filter id={id} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
    <feOffset in="SourceAlpha" dx={1.6} dy={1.6} result="moved" />
    <feComposite in="SourceAlpha" in2="moved" operator="out" result="band" />
    <feColorMatrix in="band" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0" result="rim" />
    <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="rim" /></feMerge>
  </filter>
);

/**
 * The shadow of a piece `lift` px above the paper under it: a tight one where the edge almost touches, and a cast one
 * that falls further, softer and lighter the higher the piece is.
 */
const Shadow: React.FC<{ id: string; lift: number; shadow: Pt }> = ({ id, lift, shadow: [sx, sy] }) => {
  const near = Math.min(lift, 1.5);
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x={-4000} y={-4000} width={10000} height={10000} colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={f2(0.5 + 0.4 * lift)} />
      <feOffset dx={f1(sx * lift)} dy={f1(sy * lift)} />
      <feColorMatrix type="matrix" values={`${SHADOW}  0 0 0 ${f2(Math.max(0.25, 0.5 - 0.008 * lift))} 0`} result="cast" />
      <feGaussianBlur in="SourceAlpha" stdDeviation={0.7} />
      <feOffset dx={f1(sx * near)} dy={f1(sy * near)} />
      <feColorMatrix type="matrix" values={`${SHADOW}  0 0 0 0.35 0`} result="contact" />
      <feMerge><feMergeNode in="cast" /><feMergeNode in="contact" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  );
};

// A blurred shadow, drawn without a filter: the outline grown by a few widths and filled, the widest the faintest, so
// that the alpha steps down across the edge the way a blur's does. A filter costs the renderer a pass of its own for
// every piece in every frame; a path costs almost nothing.

const erfc = (x: number) => {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
    + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
};
const tail = (t: number) => 0.5 * erfc(t / Math.SQRT2);

type Halo = { at: number; grow: number[]; alpha: number[] };

/**
 * Growths (px, negative inside the outline) and alphas that stack, widest first, to `alpha(d)`: the shadow's alpha d px
 * outside the edge of the shape that casts it, rising to `alpha(-depth)` inside it, as far as the piece above leaves
 * it in view. The edges sit where the alpha has changed by equal steps, so that no step stands out.
 */
function halo(alpha: (d: number) => number, steps: number, at: number, depth: number): Halo {
  const top = alpha(-depth);
  const edge = (a: number) => {
    let lo = -depth - 40, hi = 40;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (alpha(mid) > a) lo = mid; else hi = mid;
    }
    return lo;
  };
  const grow = Array.from({ length: steps }, (_, j) => edge((top * (j + 1)) / (steps + 1)));
  const mean = (from: number, to: number) => Array.from({ length: 8 }, (_, k) => alpha(from + ((to - from) * (k + 0.5)) / 8)).reduce((u, v) => u + v) / 8;
  const out: number[] = [];
  let under = 0;
  for (let i = 0; i < steps; i++) {
    const a = i + 1 < steps ? mean(grow[i + 1], grow[i]) : top;
    out.push(Math.max(0, 1 - (1 - a) / (1 - under)));
    under = a;
  }
  return { at, grow, alpha: out };
}

const halos = new Map<number, Halo[]>();
function halosFor(lift: number): Halo[] {
  let h = halos.get(lift);
  if (!h) {
    const sigma = 0.5 + 0.4 * lift, near = Math.min(lift, 1.5), a = Math.max(0.25, 0.5 - 0.008 * lift);
    const cast = (d: number) => a * tail(d / sigma), contact = (d: number) => 0.35 * tail(d / 0.7);
    h = lift <= 1.5
      ? [halo((d) => 1 - (1 - cast(d)) * (1 - contact(d)), 4, lift, 0.9 * lift)]
      : [halo(cast, sigma < 2.5 ? 5 : 7, lift, 0.9 * lift), halo(contact, 3, near, 0.9 * near)];
    halos.set(lift, h);
  }
  return h;
}

/** The rings of an outline made of M, L and Z, or null for anything else */
function rings(d: string): Pt[][] | null {
  if (/[^MLZ\d\s.,eE+-]/.test(d)) return null;
  const out: Pt[][] = [];
  const t = d.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let ring: Pt[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "Z") {
      if (ring.length > 2) out.push(ring);
      ring = [];
    } else if (t[i] === "M" || t[i] === "L") {
      const x = Number(t[i + 1]), y = Number(t[i + 2]);
      if (!(Number.isFinite(x) && Number.isFinite(y))) return null;
      if (t[i] === "M" && ring.length > 2) out.push(ring);
      if (t[i] === "M") ring = [];
      ring.push([x, y]);
      i += 2;
    } else {
      return null;
    }
  }
  if (ring.length > 2) out.push(ring);
  return out;
}

const turn = (r: Pt[]) => r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0);
const inside = (p: Pt, r: Pt[]) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};

/** An outline read once: for each ring the unit normal of every edge, pointing out of the paper (into a hole) */
type Outline = { rings: Pt[][]; normals: Pt[][]; lit?: string; grown: Map<string, string> };
const outlines = new Map<string, Outline | null>();
function outline(d: string): Outline | null {
  let read = outlines.get(d);
  if (read === undefined) {
    const rs = rings(d);
    read = rs && rs.length > 0 ? {
      rings: rs,
      grown: new Map<string, string>(),
      normals: rs.map((r, k) => {
        const hole = rs.filter((o, j) => j !== k && inside(r[0], o)).length % 2;
        const material = (turn(r) > 0 ? 1 : -1) * (hole ? -1 : 1);
        return r.map(([ax, ay], i): Pt => {
          const [bx, by] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, by - ay) || 1;
          return [(material * (by - ay)) / L, (-material * (bx - ax)) / L];
        });
      }),
    } : null;
    if (outlines.size > 4000) outlines.clear();
    outlines.set(d, read);
  }
  return read;
}

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

/**
 * The lit edge of an outline as a path: for every edge that faces up and left, the strip it sweeps when moved by LIT
 * down and right, cut short where the next edge turns away from the light, so that the strip stays on the paper.
 */
function litEdge(o: Outline): string {
  if (o.lit === undefined) {
    const quads: string[] = [];
    o.rings.forEach((r, k) => {
      const n = r.length, faces = o.normals[k].map(([nx, ny]) => nx + ny < -0.02);
      r.forEach(([ax, ay], i) => {
        if (!faces[i]) return;
        const [bx, by] = r[(i + 1) % n], [cx, cy] = r[(i + 2) % n], [px, py] = r[(i + n - 1) % n];
        const e: Pt = [bx - ax, by - ay];
        let from = 0, to = 1;
        if (!faces[(i + n - 1) % n]) {
          const g: Pt = [ax - px, ay - py], den = cross(e, g), t = -cross([LIT, LIT], g) / den;
          if (Math.abs(den) > 1e-6 && t >= 0 && t <= 1) from = t;
        }
        if (!faces[(i + 1) % n]) {
          const f: Pt = [cx - bx, cy - by], den = cross(e, f), t = cross([bx - ax - LIT, by - ay - LIT], f) / den;
          if (Math.abs(den) > 1e-6 && t >= 0 && t <= 1) to = t;
        }
        const q: Pt[] = [[ax, ay], [bx, by], [ax + LIT + e[0] * to, ay + LIT + e[1] * to], [ax + LIT + e[0] * from, ay + LIT + e[1] * from]];
        if (turn(q) < 0) q.reverse();
        quads.push(close(q));
      });
    });
    o.lit = quads.join(" ");
  }
  return o.lit;
}

/** The outline grown by `e` px: every vertex moved out along the bisector of its two edges, the corner kept sharp up to a limit */
function grown(o: Outline, e: number): string {
  const key = e.toFixed(2);
  let g = o.grown.get(key);
  if (g === undefined) {
    g = o.rings.map((r, k) => close(r.map(([x, y], i): Pt => {
      const [ax, ay] = o.normals[k][(i + r.length - 1) % r.length], [bx, by] = o.normals[k][i];
      const mx = ax + bx, my = ay + by, w = 1 + ax * bx + ay * by;
      const len = Math.hypot(mx, my), f = w > 0.3 ? e / w : len > 1e-3 ? (e * 2) / len : e;
      return [x + mx * f, y + my * f];
    }))).join(" ");
    o.grown.set(key, g);
  }
  return g;
}

/**
 * A stack of cut paper: the grain and the light for every Cut inside it. Use one inside <Svg> per scene, with an id
 * of its own (its filters are named after it). `grain` scales the texture (0: none); `shadow` is how far a shadow
 * falls per px of lift, away from the light: by default the light comes from the upper left, like the rest of the kit.
 */
export const Stack: React.FC<{ id: string; grain?: number; shadow?: Pt; children: React.ReactNode }> = ({
  id, grain = 1, shadow = [0.4, 0.8], children,
}) => {
  const tiles = useGrain(grain > 0);
  return (
    <g>
      {grain > 0 && (
        <defs>
          <Rim id={`${id}-rim`} />
          {tiles && (
            <>
              <pattern id={`${id}-specks`} patternUnits="userSpaceOnUse" width={SPECK} height={SPECK}>
                <image href={tiles[0]} width={SPECK} height={SPECK} style={PIXELS} />
              </pattern>
              <pattern id={`${id}-blotches`} patternUnits="userSpaceOnUse" width={BLOTCH} height={BLOTCH}>
                <image href={tiles[1]} width={BLOTCH} height={BLOTCH} style={PIXELS} />
              </pattern>
            </>
          )}
        </defs>
      )}
      <Ctx.Provider value={{ id, grain, shadow, tiles: tiles !== null }}>{children}</Ctx.Provider>
    </g>
  );
};

/**
 * One piece of paper: the outline `d` (poly, rect, ellipse, strip; join outlines to cut holes) filled with `fill`,
 * placed at x, y, turned by `rotate` degrees about that point and scaled by s. `lift` is how high in px it lies above
 * the paper under it; 0 lies flat and casts no shadow. Children are glued onto the piece, in its own coordinates: a
 * Cut inside a Cut lies on it. Inside a Stack the piece gets the paper's grain, and a lit edge once it is lifted.
 */
export const Cut: React.FC<{
  d: string; fill: string; lift?: number; x?: number; y?: number; rotate?: number; s?: number; opacity?: number; children?: React.ReactNode;
}> = ({ d, fill, lift = 0, x = 0, y = 0, rotate = 0, s = 1, opacity, children }) => {
  const st = useContext(Ctx);
  const id = st?.id ?? "paper";
  const q = Math.round(Math.max(0, lift) * 4) / 4; // shadows for lifts a quarter px apart look the same
  const lit = !!st && st.grain > 0 && q > 0;
  const read = q > 0 && q <= HIGH ? outline(d) : null;
  const soft = read !== null;
  const sh = q > 0 && !soft ? `${id}-lift${q * 4}` : undefined;
  const rim = lit && !soft ? `url(#${id}-rim)` : undefined;
  const place = x || y || rotate || s !== 1 ? `translate(${f1(x)} ${f1(y)}) rotate(${f2(rotate)}) scale(${s})` : undefined;
  const [sx, sy] = st?.shadow ?? [0.4, 0.8];
  const [w, h] = box(d);
  const size = w * h * s * s;
  const grained = !!st && st.tiles && st.grain > 0 && size >= TINY;
  return (
    <g opacity={opacity}>
      {sh && <defs><Shadow id={sh} lift={q} shadow={[sx, sy]} /></defs>}
      {read && halosFor(q).map(({ at, grow, alpha }, i) => {
        const to = `translate(${Math.round(sx * at)} ${Math.round(sy * at)})${place ? ` ${place}` : ""}`;
        return alpha.map((a, j) => a > 0.004 && (
          <path key={`${i}.${j}`} d={grow[j] === 0 ? d : grown(read, Math.max(grow[j], -0.2 * Math.min(w, h)))} fill={INK} fillOpacity={f2(a)} fillRule="evenodd" transform={to} />
        ));
      })}
      <g filter={sh && `url(#${sh})`}>
        <g transform={place}>
          <path d={d} fill={fill} fillRule="evenodd" filter={rim} />
          {grained && size >= LARGE && <path d={d} fill={`url(#${id}-blotches)`} fillOpacity={st.grain} fillRule="evenodd" />}
          {grained && <path d={d} fill={`url(#${id}-specks)`} fillOpacity={st.grain} fillRule="evenodd" />}
          {read && lit && <path d={litEdge(read)} fill="#ffffff" fillOpacity={0.45} />}
          {children}
        </g>
      </g>
    </g>
  );
};
