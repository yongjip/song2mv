import React from "react";
import { mix } from "./color";
import { clamp01, rng } from "./math";

/**
 * Tears. Use inside <Svg>, on a Person (at personEye(), with the person's s) or on a face the scene draws (s = the
 * face's height / 48, a Person's face being 48 px tall at s = 1), or alone as a big sign. Style-neutral: colours,
 * glossy or flat drops and the wet trail are props, so a style pack or a song can redraw them (flat: `flat`, its own
 * colours).
 */

type Pt = [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
/** mix() that leaves colours it cannot read (rgb(), names) as they are */
const tint = (a: string, b: string, k: number) => (isHex(a) && isHex(b) ? mix(a, b, k) : a);

/** A tear's life, s: it wells up at the eye, runs down the cheek, hangs at the end and falls */
const WELL = 0.55, RUN = 1.1, HANG = 0.3;
/** How fast a falling tear speeds up, px/s² at s = 1 (a Person 300 px tall: 1 m is about 175 px) */
const G = 1700;

/** A drop with its round head at (x, y), radius r, its tail pointing at angle `a` (radians; −π/2 is straight up) */
function drop(x: number, y: number, r: number, tail: number, a: number): string {
  const c = Math.cos(a), s = Math.sin(a);
  const P = (u: number, v: number): string => `${n1(x + u * c - v * s)} ${n1(y + u * s + v * c)}`;
  // in drop coordinates: +u towards the tail. Head: a half circle; sides meet at the tail's tip
  const L = r * tail;
  return `M${P(0, -r)}C${P(L * 0.45, -r * 0.92)} ${P(L * 0.8, -r * 0.18)} ${P(L, 0)}C${P(L * 0.8, r * 0.18)} ${P(L * 0.45, r * 0.92)} ${P(0, r)}A${n1(r)} ${n1(r)} 0 0 1 ${P(0, -r)}Z`;
}

/** Where along a polyline a fraction k of its length lies, and the direction there */
function along(pts: Pt[], k: number): { p: Pt; a: number; i: number } {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let d = clamp01(k) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const u = seg[i] ? Math.min(1, d / seg[i]) : 0;
      const [a, b] = [pts[i], pts[i + 1]];
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], a: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
    }
    d -= seg[i];
  }
  return { p: pts[pts.length - 1], a: Math.PI / 2, i: seg.length - 1 };
}

/**
 * Tears from an eye at (x, y) (its lower lid, where they well up), at the kit's scale `s`: s = 1 fits a Person at
 * s = 1 (a drop about 2 px across); on a Person put them at personEye(pose, s) with the same s.
 * - When: at each of `times` (song times), or one every `every` seconds from `from` (a little irregular) until
 *   `until`. Each wells up, runs down the cheek leaving a wet trail, hangs at the end and falls to `fall` (a y).
 * - `path`: the cheek it runs down, as points relative to (x, y) ending where it drips (default: a gentle curve
 *   `side` −1 or 1 outward, 18 × s px long, down the cheek of a Person facing that way).
 * - `color` the water, `shine` its highlight; `trail` 0–1 how much the wet trail shows; `flat`: one solid colour
 *   with a highlight dot, no translucency, for flat or paper looks.
 * - `seed` varies the timing of `every`.
 */
export const Tears: React.FC<{
  T: number; x: number; y: number; s?: number; times?: number[]; every?: number; from?: number; until?: number;
  path?: Pt[]; side?: number; fall?: number; color?: string; shine?: string; trail?: number; flat?: boolean; seed?: number;
}> = ({ T, x, y, s = 1, times, every = 1.8, from = 0, until = Infinity, path, side = 1, fall = 1200, color = "#8fd3ff", shine = "#ffffff", trail = 1, flat = false, seed = 1 }) => {
  const pts: Pt[] = (path ?? [[0, 0], [side * 1.3 * s, 5.7 * s], [side * 2.8 * s, 11.8 * s], [side * 3.3 * s, 18 * s]]).map(([u, v]) => [x + u, y + v]);
  const end = pts[pts.length - 1];
  const R = 0.94 * s;
  const fallTime = Math.sqrt((2 * Math.max(0, fall - end[1])) / (G * s)) + 0.05;
  const LIFE = WELL + RUN + HANG + fallTime;
  // the tears to draw now: their own times, or the beats of `every` that are still alive
  let when: number[] = [];
  if (times) when = times.filter((t) => T >= t && T < t + LIFE + 2);
  else if (every > 0) {
    const k0 = Math.max(0, Math.floor((T - from - LIFE - 2) / every)), k1 = Math.floor((T - from) / every);
    for (let k = k0; k <= k1; k++) {
      const t = from + (k + 0.35 * (rng(seed * 7919 + k * 31)() - 0.5)) * every;
      if (t >= from && t < until && T >= t) when.push(t);
    }
  }
  if (!when.length) return null;
  const water = flat ? color : tint(color, "#ffffff", 0.2);
  const edge = tint(color, "#1a3a6a", 0.35);
  const line = `M${pts.map((p) => `${n1(p[0])} ${n1(p[1])}`).join("L")}`;
  const total = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  return (
    <g>
      {when.map((t0, j) => {
        const a = T - t0;
        const out: React.ReactNode[] = [];
        // the wet trail: drawn as far as the tear has run, drying off over two seconds after it has passed
        const ran = a < WELL ? 0 : clamp01((a - WELL) / RUN);
        const dry = a < WELL + RUN ? 1 : Math.exp(-(a - WELL - RUN) / 1.6);
        if (trail > 0 && ran > 0 && dry > 0.03) {
          const o = n2(trail * dry);
          out.push(
            <path key="w" d={line} fill="none" stroke={water} strokeWidth={n1(R * 1.1)} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={`${n1(total * ran)} ${n1(total + 10)}`} opacity={n2(o * (flat ? 0.55 : 0.28))} />,
          );
          if (!flat) {
            out.push(
              <path key="g" d={line} fill="none" stroke={shine} strokeWidth={n1(R * 0.2)} strokeLinecap="round" strokeDasharray={`${n1(total * ran * 0.85)} ${n1(total + 10)}`}
                opacity={n2(o * 0.4)} />,
            );
          }
        }
        // the tear
        let p: Pt, r: number, tail: number, ang: number;
        if (a < WELL) {
          // welling: a bead swelling at the lid
          const k = clamp01(a / WELL);
          p = [pts[0][0], pts[0][1] + R * 0.4 * k];
          r = R * (0.35 + 0.75 * k * k);
          tail = 1.1;
          ang = -Math.PI / 2;
        } else if (a < WELL + RUN) {
          // running: slow at first, then steady; a little thinner as it leaves water behind
          const u = (a - WELL) / RUN, k = u * u * (1.6 - 0.6 * u);
          const at = along(pts, k);
          p = at.p;
          r = R * (1.1 - 0.2 * k);
          tail = 2.4 + 0.6 * Math.sin(Math.PI * k);
          ang = at.a + Math.PI; // the tail trails back up the cheek
        } else if (a < WELL + RUN + HANG) {
          // hanging at the end, gathering
          const k = (a - WELL - RUN) / HANG;
          p = [end[0], end[1] + R * 0.6 * k];
          r = R * (0.9 + 0.25 * k);
          tail = 1.6 + 0.8 * k;
          ang = -Math.PI / 2;
        } else {
          // falling: speeding up, stretching
          const tf = a - WELL - RUN - HANG;
          const dy = 0.5 * G * s * tf * tf;
          if (end[1] + dy > fall) return <g key={j}>{out}</g>;
          p = [end[0], end[1] + R * 0.6 + dy];
          r = R * 1.05;
          tail = 1.8 + Math.min(2.2, tf * 6);
          ang = -Math.PI / 2;
        }
        const d = drop(p[0], p[1], r, tail, ang);
        out.push(<path key="d" d={d} fill={water} opacity={flat ? 1 : 0.82} />);
        if (!flat) out.push(<path key="e" d={`M${n1(p[0] + r * 0.2)} ${n1(p[1] + r * 0.98)}A${n1(r)} ${n1(r)} 0 0 0 ${n1(p[0] + r * 0.98)} ${n1(p[1] + r * 0.2)}`} fill="none" stroke={edge} strokeWidth={n1(r * 0.28)} opacity={0.55} />);
        out.push(<ellipse key="h" cx={n1(p[0] - r * 0.32)} cy={n1(p[1] - r * 0.3)} rx={n1(r * 0.3)} ry={n1(r * 0.22)} fill={shine} opacity={flat ? 1 : 0.9} />);
        return <g key={j}>{out}</g>;
      })}
    </g>
  );
};
