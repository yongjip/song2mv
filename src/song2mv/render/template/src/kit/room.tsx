import React from "react";
import { mix, shade } from "./color";
import { clamp01 } from "./math";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

// ── room ─────────────────────────────────────────────────────
type Pt = [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const poly = (p: Pt[]) => "M" + p.map(([x, y]) => `${n1(x)} ${n1(y)}`).join("L") + "Z";
const box = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;

const STARS: [number, number, number][] = [[0.08, 0.12, 1.4], [0.22, 0.3, 1], [0.35, 0.08, 1.6], [0.48, 0.42, 1.1], [0.15, 0.55, 1.2], [0.86, 0.6, 1], [0.92, 0.15, 1.4], [0.6, 0.65, 1.2], [0.28, 0.75, 0.9], [0.75, 0.82, 1.1], [0.42, 0.2, 0.9]];

/** A smooth closed path through pts (Catmull-Rom as cubic Béziers) */
function smoothPath(pts: Pt[]): string {
  const n = pts.length, at = (i: number) => pts[((i % n) + n) % n];
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return `${d}Z`;
}

/** A smooth open path through pts */
function smoothLine(pts: Pt[]): string {
  const n = pts.length, at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return d;
}

/** Catmull-Rom through pts, k samples per span */
function smooth(pts: Pt[], k: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** Half a monstera leaf in leaf units (u base→tip, v < 0 one side), split along its side veins */
function monsteraEdge(cuts: number[]): Pt[] {
  const e = smooth([[0.06, 0], [-0.03, -0.12], [-0.01, -0.28], [0.12, -0.42], [0.3, -0.5], [0.5, -0.47], [0.68, -0.36], [0.84, -0.2], [0.95, -0.07], [1, 0]], 4);
  const out: Pt[] = [];
  e.forEach((p, i) => {
    out.push(p);
    if (cuts.includes(i) && i + 1 < e.length) {
      // a narrow slit: in towards the midrib (angled to the tip) and straight back out
      const q = e[i + 1];
      out.push([p[0] + 0.12, p[1] * 0.26], [p[0] + (q[0] - p[0]) * 0.75, p[1] + (q[1] - p[1]) * 0.75]);
    }
  });
  return out;
}
const MONSTERA = [monsteraEdge([12, 17, 22, 27]), monsteraEdge([14, 19, 25])];
/** A monstera leaf from (x, y) at angle a, length L: [the half on v < 0, the other half, the midrib] */
function monstera(x: number, y: number, a: number, L: number): [string, string, string] {
  const c = Math.cos(a), s = Math.sin(a);
  const P = (u: number, v: number) => `${n1(x + (u * c - v * s) * L)} ${n1(y + (u * s + v * c) * L)}`;
  const half = (e: Pt[], sg: number) => "M" + e.map(([u, v]) => P(u, v * sg)).join("L") + "Z";
  return [half(MONSTERA[0], 1), half(MONSTERA[1], -1), `M${P(0.06, 0)}Q${P(0.5, 0.03)} ${P(0.93, 0)}`];
}

/** A leaf from (x, y) at angle a (radians), length L, half-width W: [upper half, lower half, midrib] */
function leaf(x: number, y: number, a: number, L: number, W: number): [string, string, string] {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number) => `${n1(x + u * c - v * s)} ${n1(y + u * s + v * c)}`;
  return [
    `M${p(0, 0)}C${p(L * 0.22, -W)} ${p(L * 0.72, -W * 0.9)} ${p(L, 0)}Z`,
    `M${p(0, 0)}C${p(L * 0.22, W)} ${p(L * 0.72, W * 0.9)} ${p(L, 0)}Z`,
    `M${p(L * 0.06, 0)}Q${p(L * 0.5, -W * 0.06)} ${p(L * 0.9, 0)}`,
  ];
}

/**
 * A drape between x0 and x1 at the rod, hanging to `bottom` in `n` folds; the hem stirs with T.
 * Returns one path per fold (each filled with the fold gradient, so it reads round) and the inner edge line.
 */
function drape(x0: number, x1: number, top: number, bottom: number, T: number, n: number, ph: number, inner: number) {
  const H = bottom - top, cx = (x0 + x1) / 2;
  const lines = Array.from({ length: n + 1 }, (_, j) => {
    const xt = x0 + ((x1 - x0) * j) / n, xb = cx + (xt - cx) * 1.14;
    // the cloth stirs more towards the hem and towards the window side
    const reach = 0.55 + 0.45 * (inner > 0 ? j / n : 1 - j / n);
    const s = reach * (7 * Math.sin(T * 0.9 + ph + j * 0.5) + 3 * Math.sin(T * 1.7 + ph * 2 + j));
    const yb = bottom + (j % 2 ? 0 : 7);
    return { xt, c1: [xt, top + H * 0.35] as Pt, c2: [xt + (xb - xt) * 0.6 + s * 0.45, top + H * 0.72] as Pt, end: [xb + s, yb] as Pt };
  });
  const P = (p: Pt) => `${n1(p[0])} ${n1(p[1])}`;
  const strips = lines.slice(0, n).map((a, i) => {
    const b = lines[i + 1];
    const sag = (a.end[1] + b.end[1]) / 2 + 9;
    return `M${n1(a.xt)} ${n1(top)}C${P(a.c1)} ${P(a.c2)} ${P(a.end)}Q${n1((a.end[0] + b.end[0]) / 2)} ${n1(sag)} ${P(b.end)}C${P(b.c2)} ${P(b.c1)} ${n1(b.xt)} ${n1(top)}Z`;
  });
  const e = inner > 0 ? lines[n] : lines[0];
  const edge = `M${n1(e.xt)} ${n1(top)}C${P(e.c1)} ${P(e.c2)} ${P(e.end)}`;
  return { strips, edge };
}

/**
 * An interior at night: a wall lit by the window and by a desk lamp, a window with a deep frame and a sill whose
 * `view` (anything drawn on the 1920×1080 stage, shown through the glass) defaults to a night sky with a moon,
 * floor-length curtains that stir, a wooden floor with the window's light on it and a rug, and, optionally, a desk
 * with an anglepoise lamp, books and a steaming mug, a shelf of books, framed prints and a plant. Put a Person in
 * front of it. The window opening is at win {x, y, w, h}; furniture and decor that would overlap it are left out.
 * `bed` puts a Bed where the desk stands (the desk and its lamp go, so only the window lights the room); `sleeper`
 * is drawn in it, under the blanket: <Room bed sleeper={<Person x={0} y={0} pose="lie" T={T} />} />, and `onBed` on
 * top of the bedding in the same coordinates (Bed's `over`). `cover` is how far up the blanket reaches (see Bed).
 */
export const Room: React.FC<{
  T: number; wall?: string; floorY?: number; win?: { x: number; y: number; w: number; h: number }; view?: React.ReactNode;
  curtains?: boolean; desk?: boolean; lamp?: boolean; curtain?: string; id?: string;
  plant?: boolean; shelf?: boolean; poster?: boolean; rug?: boolean; bed?: boolean; sleeper?: React.ReactNode; onBed?: React.ReactNode; cover?: number;
}> = ({
  T, wall = "#1a1f45", floorY = 900, win = { x: 260, y: 170, w: 620, h: 520 }, view, curtains = true, desk = true, lamp = true,
  curtain = "#5b2d6e", id = "room", plant = true, shelf = true, poster = true, rug = true, bed = false, sleeper, onBed, cover,
}) => {
  const { x, y, w, h } = win;
  const cool = "#9fb1ff", warm = "#ffc777";
  const wallTop = shade(wall, 0.62), wallLow = mix(wall, "#3a4290", 0.16);
  const trim = mix(wall, "#dfe2ff", 0.17);
  const wood = mix("#8f5d3d", wall, 0.42), woodDark = shade(wood, 0.62), woodTop = mix(wood, warm, 0.22);
  const floorC = mix("#6a4634", wall, 0.58);
  const deskY = floorY - 180, dx0 = 1180, dx1 = 1740;
  /** decor stays out of the window's way (a caller may move the window); curtains reach `cm` past it */
  const cm = curtains ? 150 : 40;
  const clear = (x0: number, x1: number, y0: number, y1: number, m = cm) => x1 < x - m || x0 > x + w + m || y1 < y - 70 || y0 > y + h + 30;

  // ── window geometry: the opening, its reveals (we see the side nearer the middle of the stage) and the glass
  const d = Math.max(12, Math.min(26, w * 0.045));
  const rv = x + w / 2 < 960 ? 1 : -1;
  const gl = rv > 0 ? x + 4 : x + d, gr = rv > 0 ? x + w - d : x + w - 4, gt = y + d * 0.75, gb = y + h - d * 0.45;
  const fb = 13, mb = 9, midX = (gl + gr) / 2, tY = gt + (gb - gt) * 0.4;
  const panes: [number, number, number, number][] = [
    [gl + fb, gt + fb, midX - mb / 2, tY - mb / 2], [midX + mb / 2, gt + fb, gr - fb, tY - mb / 2],
    [gl + fb, tY + mb / 2, midX - mb / 2, gb - fb], [midX + mb / 2, tY + mb / 2, gr - fb, gb - fb],
  ];
  const frameC = mix(wall, "#e8eaff", 0.24), frameShade = shade(frameC, 0.7);
  const frameD = box(gl, gt, gr - gl, gb - gt) + panes.map(([a, b, c, e]) => box(a, b, c - a, e - b)).join("");

  // ── the lamp: base on the desk, two arms, the shade aimed down-left at the desk
  const baseX = 1662, j1: Pt = [1694, deskY - 132], j2: Pt = [1562, deskY - 196];
  const aim = (-145 * Math.PI) / 180;
  const mouth: Pt = [j2[0] + 44 * Math.cos(aim) - 6, j2[1] + 44 * Math.sin(aim) + 34];
  const poolX = 1430;

  // ── curtains
  const rodY = y - 58, cTop = rodY + 7, cBot = floorY - 10;
  const left = drape(x - 122, x + 26, cTop, cBot, T, 5, 0.3, 1);
  const right = drape(x + w - 26, x + w + 122, cTop, cBot, T, 5, 1.9, -1);

  // ── floor planks fan out from the vanishing point
  const VX = 960, VY = 470;
  const fan = (xw: number, yy: number) => VX + (xw - VX) * ((yy - VY) / (floorY - VY));
  const planks: string[] = [];
  for (let xw = -900; xw < 2900; xw += 128) planks.push(`M${n1(xw)} ${n1(floorY)}L${n1(fan(xw, 1080))} 1080`);
  const joints: string[] = [];
  for (let i = 0; i < 26; i++) {
    const xw = -900 + 128 * i + 64, yy = floorY + 22 + ((i * 53) % 140);
    const a = fan(xw - 64, yy), b = fan(xw + 64, yy);
    if (yy < 1075) joints.push(`M${n1(a)} ${n1(yy)}L${n1(b)} ${n1(yy)}`);
  }

  // ── the window's light on the floor: the opening projected into the room, cut by the frame's shadow
  const patch = (u0: number, u1: number, v0: number, v1: number) => {
    // u across the window (0 left … 1 right), v from the wall (0) towards the viewer (1)
    const P = (u: number, v: number): Pt => {
      const yy = floorY + 12 + v * (1080 - floorY) * 0.78;
      const xl = x + w * 0.08 + v * 90, xr = x + w * 0.96 + v * 260;
      return [xl + (xr - xl) * u, yy];
    };
    return poly([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]);
  };
  const lightD = patch(0, 0.47, 0, 0.36) + patch(0.53, 1, 0, 0.36) + patch(0, 0.47, 0.44, 1) + patch(0.53, 1, 0.44, 1);

  // ── shelf, books, prints, plant
  const shelfY = 404, sx0 = 1560, sx1 = 1850;
  const showShelf = shelf && clear(sx0, sx1, shelfY - 100, shelfY + 20);
  const BOOKS: [number, number, string][] = [[15, 80, "#c45a3c"], [19, 88, "#e2b04f"], [12, 70, "#4f86a8"], [17, 84, "#e8dcc0"], [13, 76, "#6c9a72"], [21, 72, "#8a5a86"], [14, 82, "#d07b52"]];
  const showPoster = poster && clear(1150, 1440, 200, 440);
  const showPlant = plant && clear(20, 180, 540, floorY - 60, 30);
  const showBed = bed && clear(1160, 1760, floorY - 360, floorY);
  const showDesk = desk && !showBed && clear(dx0, dx1, deskY - 250, floorY);
  /** the lamp is the room's key light: without it only the window lights the room */
  const lit = showDesk && lamp;

  const steam = (i: number) => {
    const mx = 1404 + i * 9, y0 = deskY - 46, len = 58;
    const pts = Array.from({ length: 6 }, (_, k) => {
      const u = k / 5;
      return `${n1(mx + 7 * Math.sin(T * 2.1 + i * 2.3 - u * 4) * u)} ${n1(y0 - u * len)}`;
    });
    return `M${pts[0]}C${pts[1]} ${pts[2]} ${pts[3]}S${pts[4]} ${pts[5]}`;
  };

  const sway = (k: number) => 0.04 * Math.sin(T * 0.8 + k * 1.3);
  const potTop = floorY - 64;
  const plantLeaves: [number, number, number, number][] = [
    // where the petiole meets the leaf (x, y above the pot), angle (deg), length
    [70, -250, -122, 92], [106, -318, -84, 104], [134, -246, -46, 96], [50, -170, -166, 84], [146, -168, -14, 88], [78, -104, -150, 70], [120, -98, -34, 72],
  ];

  return (
    <g>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wallTop} />
          <stop offset="1" stopColor={wallLow} />
        </linearGradient>
        <radialGradient id={`${id}-spill`} cx={x + w / 2} cy={y + h * 0.55} r={Math.max(w, h) * 1.1} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={cool} stopOpacity={0.24} />
          <stop offset="0.5" stopColor={cool} stopOpacity={0.08} />
          <stop offset="1" stopColor={cool} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-lamp`} cx={poolX + 40} cy={deskY - 120} r={620} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={warm} stopOpacity={0.5} />
          <stop offset="0.35" stopColor={warm} stopOpacity={0.2} />
          <stop offset="1" stopColor={warm} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(floorC, wallLow, 0.3)} />
          <stop offset="1" stopColor={shade(floorC, 0.62)} />
        </linearGradient>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(curtain, 0.62)} />
          <stop offset="0.4" stopColor={curtain} />
          <stop offset="0.68" stopColor={mix(curtain, cool, 0.16)} />
          <stop offset="1" stopColor={shade(curtain, 0.72)} />
        </linearGradient>
        <linearGradient id={`${id}-patch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cool} stopOpacity={0.17} />
          <stop offset="1" stopColor={cool} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-cone`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={warm} stopOpacity={0.32} />
          <stop offset="1" stopColor={warm} stopOpacity={0.06} />
        </linearGradient>
        <radialGradient id={`${id}-pool`}>
          <stop offset="0" stopColor="#ffe3a8" stopOpacity={0.75} />
          <stop offset="0.55" stopColor={warm} stopOpacity={0.25} />
          <stop offset="1" stopColor={warm} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-vig`} cx="0.5" cy="0.55" r="0.75">
          <stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.42} />
        </radialGradient>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070a24" />
          <stop offset="0.7" stopColor="#141a4a" />
          <stop offset="1" stopColor="#2a2a66" />
        </linearGradient>
        <clipPath id={`${id}-window`}><rect x={gl} y={gt} width={gr - gl} height={gb - gt} /></clipPath>
      </defs>

      {/* wall: darker towards the ceiling, cool light round the window, warm round the lamp */}
      <rect x={0} y={0} width={1920} height={floorY} fill={`url(#${id}-wall)`} />
      <rect x={0} y={0} width={1920} height={floorY} fill={`url(#${id}-spill)`} />
      {lit && <rect x={0} y={0} width={1920} height={floorY} fill={`url(#${id}-lamp)`} />}

      {/* framed prints */}
      {showPoster && (
        <g>
          <rect x={1146} y={206} width={178} height={238} rx={3} fill="#000000" opacity={0.22} filter="url(#blur-6)" />
          <rect x={1140} y={198} width={178} height={238} rx={2} fill={mix("#4a3326", wall, 0.38)} />
          <rect x={1140} y={198} width={178} height={3} fill={mix("#a07858", wall, 0.4)} />
          <rect x={1340} y={198} width={92} height={3} fill={mix("#a07858", wall, 0.4)} />
          <rect x={1150} y={208} width={158} height={218} fill={mix("#efe4d2", wall, 0.5)} />
          <rect x={1162} y={220} width={134} height={194} fill={mix("#f0b48c", wall, 0.48)} />
          <circle cx={1229} cy={300} r={30} fill={mix("#fbe3b0", wall, 0.42)} />
          <path d="M1162 344 C1196 318 1218 326 1240 340 C1262 352 1280 338 1296 330 V414 H1162 Z" fill={mix("#3f8f8c", wall, 0.5)} />
          <path d="M1162 372 C1190 356 1226 366 1250 376 C1270 384 1284 374 1296 368 V414 H1162 Z" fill={mix("#24566a", wall, 0.48)} />
          <rect x={1340} y={198} width={92} height={124} rx={2} fill={mix("#4a3326", wall, 0.38)} />
          <rect x={1348} y={206} width={76} height={108} fill={mix("#e9dfcc", wall, 0.5)} />
          <path d="M1362 296 V262 A24 24 0 0 1 1410 262 V296 Z" fill={mix("#d9774f", wall, 0.48)} />
          <circle cx={1386} cy={238} r={9} fill={mix("#e5b04a", wall, 0.45)} />
        </g>
      )}

      {/* shelf with books and a trailing plant */}
      {showShelf && (
        <g>
          <rect x={sx0 + 6} y={shelfY + 14} width={sx1 - sx0 - 12} height={14} fill="#000000" opacity={0.3} filter="url(#blur-6)" />
          {(() => {
            let bx = sx0 + 18;
            const out: React.ReactNode[] = [];
            BOOKS.forEach(([bw, bh, c], i) => {
              const col = mix(c, wall, 0.45);
              out.push(
                <g key={i}>
                  <rect x={bx} y={shelfY - bh} width={bw} height={bh} rx={1.5} fill={col} />
                  <rect x={bx} y={shelfY - bh + 8} width={bw} height={3} fill={shade(col, 0.72)} />
                  <rect x={bx} y={shelfY - 14} width={bw} height={3} fill={shade(col, 0.72)} />
                  <rect x={bx + bw - 3} y={shelfY - bh} width={3} height={bh} fill={shade(col, 0.82)} />
                </g>,
              );
              bx += bw + 1.5;
            });
            // a leaning book, then a pot
            out.push(<path key="lean" d={poly([[bx + 3, shelfY], [bx + 19, shelfY], [bx + 40, shelfY - 72], [bx + 24, shelfY - 76]])} fill={mix("#3f6d8f", wall, 0.45)} />);
            return out;
          })()}
          <path d={leaf(1778, shelfY - 36, -2.2, 34, 12)[0] + leaf(1790, shelfY - 38, -1.4, 40, 13)[0] + leaf(1802, shelfY - 36, -0.8, 32, 11)[0]} fill={mix("#6fae74", wall, 0.42)} />
          <path d={leaf(1778, shelfY - 36, -2.2, 34, 12)[1] + leaf(1790, shelfY - 38, -1.4, 40, 13)[1] + leaf(1802, shelfY - 36, -0.8, 32, 11)[1]} fill={mix("#3f7f55", wall, 0.45)} />
          <rect x={sx0} y={shelfY} width={sx1 - sx0} height={4} fill={mix(woodTop, "#ffffff", 0.08)} />
          <rect x={sx0} y={shelfY + 4} width={sx1 - sx0} height={11} fill={wood} />
          <path d={`${box(sx0 + 40, shelfY + 15, 6, 16)}${box(sx1 - 46, shelfY + 15, 6, 16)}`} fill={woodDark} />
          {[0, 1, 2].map((i) => {
            const vx = 1774 + i * 16, len = 64 + i * 26;
            const swing = 4 * Math.sin(T * 0.7 + i * 1.7);
            const path = `M${vx} ${shelfY - 34}C${vx - 14 + i * 6} ${shelfY - 30} ${vx - 6 + i * 6} ${shelfY + 8} ${vx + i * 2} ${shelfY + 16}S${vx + swing} ${shelfY + len * 0.6} ${vx + swing * 1.4} ${shelfY + len}`;
            const leaves = Array.from({ length: 3 + i }, (_, k) => {
              const u = (k + 1) / (3 + i), ly = shelfY + 14 + (len - 14) * u, lx = vx + i * 2 + swing * 1.3 * u;
              return leaf(lx, ly, (k % 2 ? 25 : 155) * (Math.PI / 180) + swing * 0.03, 17, 8);
            });
            return (
              <g key={i}>
                <path d={path} stroke={mix("#3d6b48", wall, 0.45)} strokeWidth={2} fill="none" />
                <path d={leaves.map((l) => l[0]).join("")} fill={mix("#6fae74", wall, 0.42)} />
                <path d={leaves.map((l) => l[1]).join("")} fill={mix("#3f7f55", wall, 0.45)} />
              </g>
            );
          })}
          <path d={`M1770 ${shelfY}L1766 ${shelfY - 34}H1814L1810 ${shelfY}Z`} fill={mix("#d9d2c4", wall, 0.45)} />
          <path d={`M1770 ${shelfY}L1766 ${shelfY - 34}H1776L1778 ${shelfY}Z`} fill={mix("#a9a296", wall, 0.45)} />
          <rect x={1764} y={shelfY - 38} width={52} height={7} rx={2} fill={mix("#e6dfd2", wall, 0.4)} />
        </g>
      )}

      {/* the view through the window, then glass */}
      <g clipPath={`url(#${id}-window)`}>
        {view ?? (
          <>
            <rect x={gl} y={gt} width={gr - gl} height={gb - gt} fill={`url(#${id}-night)`} />
            <path d={STARS.map(([sx, sy, sr]) => `M${n1(gl + sx * (gr - gl))} ${n1(gt + sy * (gb - gt) * 0.8)}m${-sr} 0a${sr} ${sr} 0 1 0 ${2 * sr} 0a${sr} ${sr} 0 1 0 ${-2 * sr} 0`).join("")} fill="#dfe6ff" opacity={0.7} />
            <circle cx={x + w * 0.68} cy={y + h * 0.3} r={130} fill="#fff1c2" opacity={0.14} filter="url(#blur-22)" />
            <circle cx={x + w * 0.68} cy={y + h * 0.3} r={44} fill="#fff1c2" />
            <path d={`M${n1(x + w * 0.68 - 18)} ${n1(y + h * 0.3 - 8)}m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M${n1(x + w * 0.68 + 14)} ${n1(y + h * 0.3 + 12)}m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M${n1(x + w * 0.68 + 6)} ${n1(y + h * 0.3 - 22)}m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0`} fill="#e8d6a6" opacity={0.6} />
          </>
        )}
        <rect x={gl} y={gt} width={gr - gl} height={gb - gt} fill={cool} opacity={0.05} />
        {panes.map(([a, b, c, e], i) => (
          <path key={i} d={poly([[a + (c - a) * 0.12, b], [a + (c - a) * 0.36, b], [a, b + (e - b) * 0.55], [a, b + (e - b) * 0.2]]) + poly([[a + (c - a) * 0.46, b], [a + (c - a) * 0.54, b], [a, b + (e - b) * 0.88], [a, b + (e - b) * 0.76]])} fill="#ffffff" opacity={0.06} />
        ))}
      </g>

      {/* casing round the opening, the reveals inside it, the sash and its bars */}
      <rect x={x - 30} y={y - 30} width={w + 60} height={h + 38} fill="#000000" opacity={0.28} filter="url(#blur-10)" />
      <path d={box(x - 24, y - 24, w + 48, h + 24) + box(x, y, w, h)} fillRule="evenodd" fill={trim} />
      <path d={`${box(x - 24, y - 24, w + 48, 3)}`} fill={mix(trim, "#ffffff", 0.12)} />
      <path d={poly([[x, y], [x + w, y], [gr, gt], [gl, gt]])} fill={shade(trim, 0.52)} />
      <path d={rv > 0 ? poly([[x + w, y], [x + w, y + h], [gr, gb], [gr, gt]]) : poly([[x, y], [gl, gt], [gl, gb], [x, y + h]])} fill={mix(shade(trim, 0.78), cool, 0.08)} />
      <path d={rv > 0 ? poly([[x, y], [gl, gt], [gl, gb], [x, y + h]]) : poly([[x + w, y], [x + w, y + h], [gr, gb], [gr, gt]])} fill={shade(trim, 0.66)} />
      <path d={poly([[gl, gb], [gr, gb], [x + w, y + h], [x, y + h]])} fill={mix(trim, cool, 0.22)} />
      <path d={frameD} fillRule="evenodd" fill={frameC} />
      <path d={box(midX - mb / 2, gt + fb, mb, gb - gt - 2 * fb) + box(gl + fb, tY - mb / 2, gr - gl - 2 * fb, mb)} fill={frameC} />
      <path d={panes.map(([a, b, c, e]) => box(a, e - 2.5, c - a, 2.5) + box(c - 2, b, 2, e - b)).join("")} fill={mix(frameC, warm, 0.18)} opacity={0.8} />
      <path d={panes.map(([a, b, c]) => box(a, b, c - a, 3)).join("")} fill={frameShade} />
      {/* the sill: its top catches the light, its front is in shade, a soft shadow under it */}
      <rect x={x - 40} y={y + h + 18} width={w + 80} height={16} fill="#000000" opacity={0.3} filter="url(#blur-6)" />
      <rect x={x - 40} y={y + h - 3} width={w + 80} height={10} rx={2} fill={mix(trim, cool, 0.3)} />
      <rect x={x - 40} y={y + h + 7} width={w + 80} height={13} rx={2} fill={shade(trim, 0.78)} />
      <rect x={x - 40} y={y + h + 17} width={w + 80} height={3} fill={shade(trim, 0.6)} />

      {floorY - (y + h) > 150 && (() => {
        // a column radiator under the sill
        const r0 = x + w * 0.2, r1 = x + w * 0.8, ry0 = y + h + 64, ry1 = floorY - 34, n = Math.floor((r1 - r0) / 22);
        const cw = (r1 - r0) / n, rc = mix(trim, cool, 0.12);
        return (
          <g>
            <rect x={r0 - 4} y={ry0 + 6} width={r1 - r0 + 8} height={ry1 - ry0} rx={6} fill="#000000" opacity={0.25} filter="url(#blur-6)" />
            <path d={Array.from({ length: n }, (_, i) => `M${n1(r0 + i * cw + 2)} ${ry0 + 6}a${n1(cw / 2 - 2)} 6 0 0 1 ${n1(cw - 4)} 0V${ry1 - 6}a${n1(cw / 2 - 2)} 6 0 0 1 ${n1(-(cw - 4))} 0Z`).join("")} fill={rc} />
            <path d={Array.from({ length: n }, (_, i) => box(r0 + i * cw + cw - 7, ry0 + 8, 4, ry1 - ry0 - 16)).join("")} fill={shade(rc, 0.78)} />
            <path d={`${box(r0 - 2, ry0 + 16, r1 - r0 + 4, 5)}${box(r0 - 2, ry1 - 22, r1 - r0 + 4, 5)}`} fill={shade(rc, 0.85)} />
            <path d={`${box(r0 + 8, ry1 - 4, 6, floorY - ry1 + 4)}${box(r1 - 14, ry1 - 4, 6, floorY - ry1 + 4)}`} fill={shade(rc, 0.7)} />
          </g>
        );
      })()}

      {curtains && (
        <g>
          {[left, right].map((c, k) => (
            <g key={k}>
              <path d={c.strips.join("")} fill={shade(curtain, 0.55)} transform="translate(4 6)" opacity={0.35} />
              {c.strips.map((d0, i) => <path key={i} d={d0} fill={`url(#${id}-fold)`} />)}
              <path d={c.edge} stroke={mix(curtain, cool, 0.55)} strokeWidth={3} fill="none" opacity={0.55} />
            </g>
          ))}
          <path d={[...Array.from({ length: 6 }, (_, i) => x - 122 + i * 29.6), ...Array.from({ length: 6 }, (_, i) => x + w - 26 + i * 29.6)].map((rx) => `M${n1(rx - 6.5)} ${rodY + 1}a6.5 9 0 1 0 13 0a6.5 9 0 1 0 -13 0z`).join("")} fill="none" stroke={mix("#b48c5c", wall, 0.38)} strokeWidth={2.6} />
          <rect x={x - 158} y={rodY - 6} width={w + 316} height={12} rx={6} fill={mix("#b48c5c", wall, 0.46)} />
          <rect x={x - 158} y={rodY - 5} width={w + 316} height={3.5} rx={1.75} fill={mix("#efd29c", wall, 0.36)} />
          <rect x={x - 158} y={rodY + 3} width={w + 316} height={3} rx={1.5} fill={mix("#6d5236", wall, 0.4)} />
          {[x - 166, x + w + 166].map((fx) => (
            <g key={fx}>
              <rect x={fx - 4} y={rodY - 4} width={8} height={26} rx={3} fill={mix("#6d5236", wall, 0.42)} />
              <circle cx={fx} cy={rodY} r={11} fill={mix("#b48c5c", wall, 0.42)} />
              <circle cx={fx - 3} cy={rodY - 4} r={4} fill={mix("#efd29c", wall, 0.38)} />
            </g>
          ))}
        </g>
      )}

      {/* floor: boards fanning towards us, the baseboard, the window's light, a rug */}
      <rect x={0} y={floorY} width={1920} height={1080 - floorY} fill={`url(#${id}-floor)`} />
      <path d={planks.join("") + joints.join("")} stroke={shade(floorC, 0.72)} strokeWidth={1.6} fill="none" opacity={0.75} />
      <rect x={0} y={floorY} width={1920} height={18} fill="#000000" opacity={0.28} filter="url(#blur-6)" />
      <rect x={0} y={floorY - 18} width={1920} height={18} fill={shade(trim, 0.86)} />
      <rect x={0} y={floorY - 18} width={1920} height={3} fill={mix(trim, "#ffffff", 0.1)} />
      {rug && (
        <g>
          <ellipse cx={1010} cy={floorY + 92} rx={380} ry={68} fill="#000000" opacity={0.25} filter="url(#blur-6)" />
          <ellipse cx={1010} cy={floorY + 88} rx={372} ry={64} fill={mix("#b8604a", wall, 0.52)} />
          <ellipse cx={1010} cy={floorY + 88} rx={344} ry={54} fill={mix("#d8a35f", wall, 0.55)} />
          <ellipse cx={1010} cy={floorY + 88} rx={318} ry={46} fill={mix("#b8604a", wall, 0.55)} />
          <ellipse cx={1010} cy={floorY + 88} rx={210} ry={28} fill="none" stroke={mix("#e8c99a", wall, 0.55)} strokeWidth={3} />
        </g>
      )}
      <path d={lightD} fill={`url(#${id}-patch)`} filter="url(#blur-10)" />
      {lit && <ellipse cx={poolX + 40} cy={floorY + 30} rx={360} ry={40} fill={`url(#${id}-pool)`} opacity={0.28} />}

      {/* a plant in the corner, its leaves catching the window's light on one side */}
      {showPlant && (
        <g>
          <ellipse cx={96} cy={floorY + 38} rx={66} ry={11} fill="#000000" opacity={0.32} filter="url(#blur-6)" />
          <ellipse cx={96} cy={potTop} rx={50} ry={9} fill={mix("#2a1d18", wall, 0.3)} />
          {plantLeaves.map(([lx, ly, deg, L], i) => {
            const a = (deg * Math.PI) / 180 + sway(i), bx = lx + 4 * Math.sin(T * 0.8 + i * 1.3), by = potTop + ly;
            const [h1, h2, rib] = monstera(bx, by, a, L);
            // the half facing the window (to the right of the plant) is the lit one; h1 is on the right when sin(a) > 0
            const h1Right = Math.sin(a) > 0;
            const light = mix("#6fb27a", wall, 0.34), dark = mix("#2f6a4a", wall, 0.42);
            return (
              <g key={i}>
                <path d={`M${96 + (i - 3) * 3} ${potTop}Q${n1((96 + bx) / 2 + (bx - 96) * 0.1)} ${n1(by + (potTop - by) * 0.35)} ${n1(bx)} ${n1(by)}`} stroke={mix("#4f8a58", wall, 0.42)} strokeWidth={3.2} fill="none" strokeLinecap="round" />
                <path d={h1} fill={h1Right ? light : dark} />
                <path d={h2} fill={h1Right ? dark : light} />
                <path d={rib} stroke={mix("#9fd0a0", wall, 0.45)} strokeWidth={1.5} fill="none" opacity={0.8} />
              </g>
            );
          })}
          <path d={`M46 ${potTop}H146L138 ${floorY + 30}Q137 ${floorY + 37} 130 ${floorY + 37}H62Q55 ${floorY + 37} 54 ${floorY + 30}Z`} fill={mix("#e4d9c6", wall, 0.42)} />
          <path d={`M46 ${potTop}H70L72 ${floorY + 37}H62Q55 ${floorY + 37} 54 ${floorY + 30}Z`} fill={mix("#b3a690", wall, 0.45)} />
          <rect x={47} y={potTop + 30} width={98} height={12} fill={mix("#c9744e", wall, 0.45)} />
          <path d={`M46 ${potTop}a50 9 0 0 0 100 0`} stroke={mix("#f2ead8", wall, 0.38)} strokeWidth={4} fill="none" />
        </g>
      )}

      {/* desk: a top with thickness, a drawer unit, tapered legs */}
      {showDesk && (
        <g>
          <ellipse cx={(dx0 + dx1) / 2} cy={floorY + 26} rx={300} ry={16} fill="#000000" opacity={0.35} filter="url(#blur-10)" />
          <path d={poly([[dx0 + 58, deskY + 14], [dx0 + 66, deskY + 14], [dx0 + 60, floorY + 8], [dx0 + 54, floorY + 8]])} fill={shade(woodDark, 0.8)} />
          <path d={poly([[dx1 - 210, deskY + 14], [dx1 - 202, deskY + 14], [dx1 - 206, floorY + 8], [dx1 - 212, floorY + 8]])} fill={shade(woodDark, 0.8)} />
          <path d={poly([[dx0 + 22, deskY + 14], [dx0 + 36, deskY + 14], [dx0 + 26, floorY + 26], [dx0 + 16, floorY + 26]])} fill={woodDark} />
          <path d={poly([[dx1 - 36, deskY + 14], [dx1 - 22, deskY + 14], [dx1 - 16, floorY + 26], [dx1 - 26, floorY + 26]])} fill={woodDark} />
          <rect x={dx1 - 218} y={deskY + 14} width={196} height={108} fill={wood} />
          <rect x={dx1 - 218} y={deskY + 14} width={10} height={108} fill={woodDark} />
          <rect x={dx1 - 204} y={deskY + 66} width={176} height={3} fill={woodDark} />
          <rect x={dx1 - 140} y={deskY + 34} width={44} height={7} rx={3.5} fill={mix("#d8d0c0", wall, 0.35)} />
          <rect x={dx1 - 140} y={deskY + 88} width={44} height={7} rx={3.5} fill={mix("#d8d0c0", wall, 0.35)} />
          <path d={poly([[dx0 + 14, deskY - 12], [dx1 - 14, deskY - 12], [dx1, deskY], [dx0, deskY]])} fill={woodTop} />
          <rect x={dx0} y={deskY} width={dx1 - dx0} height={16} rx={2} fill={wood} />
          <rect x={dx0} y={deskY} width={dx1 - dx0} height={2} fill={mix(woodTop, "#ffffff", 0.15)} />
          {lit && <ellipse cx={poolX} cy={deskY - 4} rx={190} ry={20} fill={`url(#${id}-pool)`} />}
          {/* books lying flat, a mug with steam */}
          <path d={`${box(1238, deskY - 30, 96, 10)}`} fill={mix("#3f6d8f", wall, 0.35)} />
          <path d={`${box(1244, deskY - 20, 88, 9)}`} fill={mix("#c45a3c", wall, 0.32)} />
          <path d={`${box(1234, deskY - 11, 100, 11)}`} fill={mix("#e2b04f", wall, 0.35)} />
          <path d={`${box(1244, deskY - 27, 86, 3)}${box(1250, deskY - 17, 78, 3)}${box(1242, deskY - 7, 88, 3)}`} fill={mix("#f2ead8", wall, 0.3)} />
          <path d={`M1388 ${deskY - 40}H1422V${deskY - 5}Q1422 ${deskY} 1416 ${deskY}H1394Q1388 ${deskY} 1388 ${deskY - 5}Z`} fill={mix("#e9e4da", wall, 0.25)} />
          <path d={`M1422 ${deskY - 32}a10 10 0 0 1 0 20`} stroke={mix("#e9e4da", wall, 0.3)} strokeWidth={4} fill="none" />
          <rect x={1388} y={deskY - 40} width={9} height={40} fill={mix("#b9b2a6", wall, 0.3)} />
          <ellipse cx={1405} cy={deskY - 40} rx={17} ry={3.5} fill={mix("#4a2f22", wall, 0.2)} />
          <path d={steam(0) + steam(1)} stroke="#ffffff" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.16} />
        </g>
      )}

      {/* the anglepoise lamp and its light */}
      {showDesk && lamp && (
        <g>
          <path d={poly([[mouth[0] - 40, mouth[1] - 8], [mouth[0] + 30, mouth[1] + 22], [poolX + 150, deskY - 4], [poolX - 170, deskY - 4]])} fill={`url(#${id}-cone)`} filter="url(#blur-10)" />
          <ellipse cx={baseX} cy={deskY - 5} rx={36} ry={8} fill={shade(wood, 0.5)} opacity={0.6} />
          <path d={`M${baseX - 30} ${deskY - 6}C${baseX - 28} ${deskY - 24} ${baseX + 28} ${deskY - 24} ${baseX + 30} ${deskY - 6}Z`} fill={mix("#2c2f45", wall, 0.2)} />
          <path d={`M${baseX - 30} ${deskY - 6}C${baseX - 28} ${deskY - 24} ${baseX - 6} ${deskY - 22} ${baseX - 2} ${deskY - 20}`} stroke={mix("#ffd9a0", wall, 0.35)} strokeWidth={2} fill="none" />
          <path d={`M${baseX} ${deskY - 18}L${j1[0]} ${j1[1]}L${j2[0]} ${j2[1]}`} stroke={mix("#2c2f45", wall, 0.2)} strokeWidth={7} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <path d={`M${baseX + 8} ${deskY - 22}L${j1[0] + 7} ${j1[1] + 10}M${j1[0] - 6} ${j1[1] - 8}L${j2[0] + 4} ${j2[1] - 9}`} stroke={mix("#ffd9a0", wall, 0.45)} strokeWidth={2} fill="none" opacity={0.8} />
          <circle cx={j1[0]} cy={j1[1]} r={8} fill={mix("#3a3d58", wall, 0.2)} />
          <circle cx={j1[0]} cy={j1[1]} r={3} fill={mix("#ffd9a0", wall, 0.4)} />
          <g transform={`rotate(-35 ${j2[0]} ${j2[1]})`}>
            <path d={`M${j2[0] + 8} ${j2[1] - 10}C${j2[0] - 4} ${j2[1] - 14} ${j2[0] - 22} ${j2[1] - 4} ${j2[0] - 30} ${j2[1] + 22}L${j2[0] - 50} ${j2[1] + 58}H${j2[0] + 40}L${j2[0] + 22} ${j2[1] + 20}C${j2[0] + 18} ${j2[1] + 4} ${j2[0] + 16} ${j2[1] - 6} ${j2[0] + 8} ${j2[1] - 10}Z`} fill={mix("#e0a83e", wall, 0.22)} />
            <path d={`M${j2[0] + 8} ${j2[1] - 10}C${j2[0] + 16} ${j2[1] - 6} ${j2[0] + 18} ${j2[1] + 4} ${j2[0] + 22} ${j2[1] + 20}L${j2[0] + 40} ${j2[1] + 58}H${j2[0] + 18}L${j2[0] + 6} ${j2[1] + 14}Z`} fill={mix("#f7d27a", wall, 0.12)} />
            <ellipse cx={j2[0] - 5} cy={j2[1] + 58} rx={45} ry={9} fill="#fff4d4" />
            <ellipse cx={j2[0] - 5} cy={j2[1] + 62} rx={56} ry={22} fill={warm} opacity={0.6} filter="url(#blur-14)" />
          </g>
          <circle cx={j2[0]} cy={j2[1]} r={7} fill={mix("#3a3d58", wall, 0.2)} />
        </g>
      )}

      {showBed && (
        <Bed x={1450} y={floorY + 26} s={1.4} wall={wall} cover={cover} over={onBed} id={`${id}-bed`}>{sleeper}</Bed>
      )}

      {/* the room's own vignette */}
      <rect x={0} y={0} width={1920} height={1080} fill={`url(#${id}-vig)`} />
    </g>
  );
};

// ── bed ──────────────────────────────────────────────────────

/** Bed sizes at s = 1: the mattress' half length and its top and bottom, the frame rail, where the hips lie */
const BED = { half: 185, top: -112, bot: -62, rail: -30, hip: 10 };
/**
 * The blanket's top over a sleeper in the `lie` pose, as heights above the mattress along the bed (x from the hips):
 * the chest with a hand on it, the belly, the hips, the thighs, the near knee, the shins (bridged), the toes
 */
const OVER_SLEEPER: Pt[] = [[-110, 58], [-80, 63], [-45, 64], [-12, 62], [16, 56], [44, 50], [72, 53], [100, 47], [126, 45], [150, 54], [164, 51], [178, 36], [190, 22]];

/**
 * A bed seen from the side, standing on (x, y) with its middle there, `s` times a size that fits a Person of the same
 * s: a wooden frame with a headboard and a low footboard, a mattress in a sheet, a pillow and a blanket.
 * - The sleeper goes in as children, drawn between the mattress and the blanket, at (0, 0) where a lying Person's hips
 *   go: <Bed …><Person x={0} y={0} pose="lie" T={T} /></Bed> (the bed scales them with it); the pillow's near side
 *   comes up over the back of their head, so it sinks in. Without children the blanket lies flat.
 * - `over` is drawn on top of the bedding, in the same coordinates: what lies on the pillow or the blanket (tears that
 *   run onto the pillow, a phone, a cat).
 * - `head` "left" or "right": the end with the headboard (right mirrors the bed and the sleeper). `cover` 0–1: how far
 *   up the sleeper the blanket reaches (0 folded at the foot, 1 to the shoulders).
 * - Colours: `frame`, `sheet`, `blanket`, `pillow`; they lean towards `wall`, the room's colour, as everything does in
 *   a dim room (the Room's night wall by default; pass a light colour by day). `id` keeps the gradients apart.
 */
export const Bed: React.FC<{
  x: number; y: number; s?: number; head?: "left" | "right"; cover?: number; wall?: string;
  frame?: string; sheet?: string; blanket?: string; pillow?: string; id?: string; children?: React.ReactNode; over?: React.ReactNode;
}> = ({ x, y, s = 1, head = "left", cover = 0.75, wall = "#1a1f45", frame = "#9a6644", sheet = "#e9e5f2", blanket = "#c8644e", pillow, id = "bed", children, over }) => {
  const { half: H, top, bot, rail, hip } = BED;
  const wood = mix(frame, wall, 0.4), woodDark = shade(wood, 0.66), woodHi = mix(wood, "#ffd9a8", 0.2);
  const sheetC = mix(sheet, wall, 0.32), sheetS = mix(sheetC, wall, 0.3);
  const pillowC = mix(pillow ?? sheet, wall, 0.26);
  const blank = mix(blanket, wall, 0.36), blankS = shade(blank, 0.72), blankHi = mix(blank, "#ffe2c8", 0.22);
  // the blanket's top along the bed, from its edge (at `cover`) to the foot end; then it hangs down the near side
  const edge = hip + 150 - 250 * clamp01(cover);
  const heights: Pt[] = (children ? OVER_SLEEPER : [[-200, 12], [200, 12]]).map(([u, h]) => [u + hip, top - h] as Pt);
  const lift = (bx: number) => {
    for (let i = 0; i < heights.length - 1; i++) {
      const [a, b] = [heights[i], heights[i + 1]];
      if (bx <= b[0]) return a[1] + (b[1] - a[1]) * clamp01((bx - a[0]) / (b[0] - a[0]));
    }
    return heights[heights.length - 1][1];
  };
  const ridge: Pt[] = [[edge, lift(edge)], ...heights.filter((p) => p[0] > edge + 12 && p[0] < H - 14), [H - 2, lift(H - 2)]];
  const hem = bot + 14;
  const foot: Pt = [H + 10, hem - 4];
  const blanketD = smoothPath([
    [edge - 1, hem], [edge - 3, (ridge[0][1] + hem) / 2], ...ridge, [H + 6, lift(H) + 8], [H + 11, (lift(H) + hem) / 2], foot,
    [H - 30, hem + 3], [(edge + H) / 2, hem + 1], [edge + 30, hem + 3],
  ]);
  const ridgeD = smoothLine(ridge);
  // the sheet turned down over the blanket at its edge, a band down the side
  const tw = 11;
  const turn = smoothPath([[edge - 3, hem + 1], [edge - 5, (ridge[0][1] + hem) / 2], [edge - 1, ridge[0][1] - 3], [edge + tw, lift(edge + tw) - 2], [edge + tw + 2, (lift(edge + tw) + hem) / 2], [edge + tw, hem + 2]]);
  const folds = [0.3, 0.56, 0.8].map((k) => {
    const fx = edge + (H - edge) * k, fy = lift(fx) + 18;
    return `M${n1(fx)} ${n1(fy)}Q${n1(fx - 9)} ${n1((fy + hem) / 2)} ${n1(fx - 3)} ${n1(hem - 3)}`;
  });
  // the pillow's near side, drawn over the sleeper: it swells round where the head lies, so the head sinks in
  const lipD = smoothPath([[-176, top + 1], [-178, top - 8], [-160, top - 17], [-138, top - 26], [-116, top - 33], [-96, top - 35], [-80, top - 31], [-68, top - 20], [-62, top - 6], [-64, top + 2], [-120, top + 4]]);
  const pillowD = smoothPath([[-178, top + 2], [-182, top - 18], [-166, top - 40], [-130, top - 46], [-104, top - 34], [-84, top - 36], [-66, top - 22], [-62, top], [-120, top + 4]]);
  return (
    <g transform={`translate(${x} ${y}) scale(${head === "right" ? -s : s} ${s})`}>
      <defs>
        <linearGradient id={`${id}-blanket`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={blank} />
          <stop offset="1" stopColor={blankS} />
        </linearGradient>
      </defs>
      {/* the shadow it casts, the legs, the rail */}
      <ellipse cx={0} cy={4} rx={H + 30} ry={14} fill="#000000" opacity={0.35} filter="url(#blur-10)" />
      {[-H + 8, H - 14].map((lx) => (
        <path key={lx} d={`M${lx} ${rail}h12l-2 ${-rail}h-8Z`} fill={woodDark} />
      ))}
      <rect x={-H - 6} y={bot - 2} width={2 * H + 12} height={rail - bot + 2} rx={4} fill={wood} />
      <rect x={-H - 6} y={bot - 2} width={2 * H + 12} height={3} fill={woodHi} />
      <rect x={-H - 6} y={rail - 6} width={2 * H + 12} height={6} fill={woodDark} opacity={0.6} />
      {/* the headboard and the footboard: posts down to the floor, a rounded top, a lit edge */}
      <path d={`M${-H - 26} 0V-236Q${-H - 26} -252 ${-H - 10} -252H${-H - 4}V0Z`} fill={wood} />
      <path d={`M${-H - 26} -236Q${-H - 26} -252 ${-H - 10} -252H${-H - 4}V-246H${-H - 12}Q${-H - 20} -246 ${-H - 20} -232V0H${-H - 26}Z`} fill={woodHi} />
      <rect x={-H - 18} y={-226} width={9} height={100} rx={4.5} fill={woodDark} opacity={0.55} />
      <path d={`M${H + 4} 0V-122Q${H + 4} -134 ${H + 14} -134H${H + 20}V0Z`} fill={wood} />
      <path d={`M${H + 4} -122Q${H + 4} -134 ${H + 14} -134H${H + 20}V-129H${H + 15}Q${H + 9} -129 ${H + 9} -118V0H${H + 4}Z`} fill={woodHi} />
      {/* the mattress in its sheet */}
      <rect x={-H} y={top} width={2 * H} height={bot - top} rx={14} fill={sheetC} />
      <rect x={-H} y={bot - 12} width={2 * H} height={12} rx={6} fill={sheetS} />
      <path d={`M${-H + 14} ${top + 1.5}H${H - 14}`} stroke={mix(sheetC, "#ffffff", 0.35)} strokeWidth={3} strokeLinecap="round" />
      {/* the pillow, dented where a head lies */}
      <path d={pillowD} fill={pillowC} />
      <path d={`M-170 ${top - 4}Q-120 ${top + 6} -70 ${top - 4}`} stroke={shade(pillowC, 0.8)} strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d={`M-160 ${top - 38}Q-140 ${top - 46} -118 ${top - 42}`} stroke={mix(pillowC, "#ffffff", 0.4)} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* the sleeper, lying with the hips at (0, 0) */}
      {children && (
        <>
          <g transform={`translate(${hip} ${top})`}>{children}</g>
          <path d={lipD} fill={pillowC} />
          <path d={`M-160 ${top - 15}Q-130 ${top - 29} -100 ${top - 33}Q-84 ${top - 33} -74 ${top - 26}`} stroke={mix(pillowC, "#ffffff", 0.35)} strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d={`M-170 ${top - 4}Q-120 ${top + 6} -70 ${top - 4}`} stroke={shade(pillowC, 0.8)} strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      )}
      {/* the blanket over them, its sheet turned down at the edge, folds where it hangs */}
      <path d={blanketD} fill={`url(#${id}-blanket)`} />
      <path d={ridgeD} transform="translate(0 2.5)" stroke={blankHi} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d={folds.join("")} stroke={blankS} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.6} />
      <path d={turn} fill={sheetC} />
      <path d={`M${n1(edge + tw + 1)} ${n1(hem)}Q${n1(edge + tw + 3)} ${n1((lift(edge + tw) + hem) / 2)} ${n1(edge + tw)} ${n1(lift(edge + tw) + 2)}`} stroke={sheetS} strokeWidth={3} fill="none" strokeLinecap="round" />
      {over && <g transform={`translate(${hip} ${top})`}>{over}</g>}
    </g>
  );
};
