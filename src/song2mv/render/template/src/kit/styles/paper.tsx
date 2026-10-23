import React, { createContext, useContext } from "react";
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
 * Outlines are cut around their own origin; place a piece with x, y, rotate and s on its Cut, so that its grain moves
 * with it and its shadow keeps falling away from the light. Pieces stack in drawing order, back to front. Nothing here
 * keeps state: lift, sway and drift come from T in the scene, and a shape keeps its seed, so its cut stays the same
 * from frame to frame. Letters are not cut: text stays type that holds still (text.tsx).
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

const Ctx = createContext<{ id: string; grain: number; shadow: Pt } | null>(null);
/** shadows on paper look warm and dark, not grey */
const SHADOW = "0 0 0 0 0.11  0 0 0 0 0.07  0 0 0 0 0.04";

/**
 * The paper's surface, as an SVG filter: fine specks over soft blotches and, with `rim`, a light edge on the sides
 * that face the light. In the piece's own coordinates, so the grain moves with the piece. The specks are one octave
 * at 0.5 a px: finer noise turns into harsh speckle where the stage is drawn smaller (0.76 in the 9:16 band, 0.25 in
 * the gallery overview).
 */
const Grain: React.FC<{ id: string; k: number; rim: boolean }> = ({ id, k, rim }) => (
  <filter id={id} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency={0.5} numOctaves={1} seed={3} result="speck" />
    <feTurbulence type="fractalNoise" baseFrequency={0.01} numOctaves={3} seed={8} result="blotch" />
    {/* light where the specks' red channel is low, dark where it is high; the blotches' green channel the same */}
    <feColorMatrix in="speck" type="matrix" values={`${SHADOW}  ${f2(0.44 * k)} 0 0 0 ${f2(-0.22 * k)}`} result="dark" />
    <feColorMatrix in="speck" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${f2(-0.44 * k)} 0 0 0 ${f2(0.22 * k)}`} result="light" />
    <feColorMatrix in="blotch" type="matrix" values={`${SHADOW}  0 ${f2(0.3 * k)} 0 0 ${f2(-0.15 * k)}`} result="shade" />
    <feColorMatrix in="blotch" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 ${f2(-0.3 * k)} 0 0 ${f2(0.15 * k)}`} result="bright" />
    <feMerge result="grain"><feMergeNode in="shade" /><feMergeNode in="bright" /><feMergeNode in="dark" /><feMergeNode in="light" /></feMerge>
    <feComposite in="grain" in2="SourceAlpha" operator="in" result="surface" />
    {rim && <feOffset in="SourceAlpha" dx={1.6} dy={1.6} result="moved" />}
    {rim && <feComposite in="SourceAlpha" in2="moved" operator="out" result="band" />}
    {rim && <feColorMatrix in="band" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0" result="rim" />}
    <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="surface" />{rim && <feMergeNode in="rim" />}</feMerge>
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

/**
 * A stack of cut paper: the grain and the light for every Cut inside it. Use one inside <Svg> per scene, with an id
 * of its own (its filters are named after it). `grain` scales the texture (0: none); `shadow` is how far a shadow
 * falls per px of lift, away from the light: by default the light comes from the upper left, like the rest of the kit.
 */
export const Stack: React.FC<{ id: string; grain?: number; shadow?: Pt; children: React.ReactNode }> = ({
  id, grain = 1, shadow = [0.4, 0.8], children,
}) => (
  <g>
    {grain > 0 && (
      <defs>
        <Grain id={`${id}-grain`} k={grain} rim={false} />
        <Grain id={`${id}-grain-rim`} k={grain} rim />
      </defs>
    )}
    <Ctx.Provider value={{ id, grain, shadow }}>{children}</Ctx.Provider>
  </g>
);

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
  const sh = q > 0 ? `${id}-lift${q * 4}` : undefined;
  const grain = st && st.grain > 0 ? `url(#${id}-grain${q > 0 ? "-rim" : ""})` : undefined;
  const place = x || y || rotate || s !== 1 ? `translate(${f1(x)} ${f1(y)}) rotate(${f2(rotate)}) scale(${s})` : undefined;
  return (
    <g opacity={opacity}>
      {sh && <defs><Shadow id={sh} lift={q} shadow={st?.shadow ?? [0.4, 0.8]} /></defs>}
      <g filter={sh && `url(#${sh})`}>
        <g transform={place}>
          <path d={d} fill={fill} fillRule="evenodd" filter={grain} />
          {children}
        </g>
      </g>
    </g>
  );
};
