import React from "react";
import { mix } from "./color";
import { rng } from "./math";

/**
 * Sky by time of day, the sun and clouds. Use inside <Svg> on the 1920×1080 stage, behind places and people.
 * Move the sun or blend the sky from T in the scene (`y={lerp(980, 420, span(T, t0, t1))}`): nothing here keeps state.
 */

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";
type Stops = [number, string][];
export const SKIES: Record<TimeOfDay, Stops> = {
  dawn: [[0, "#1b2452"], [0.3, "#3a3f7c"], [0.55, "#8a5f8f"], [0.75, "#d9878a"], [0.9, "#ffbb94"], [1, "#ffdcb0"]],
  day: [[0, "#2468c8"], [0.35, "#3f86da"], [0.68, "#72aeea"], [0.88, "#a9d2f5"], [1, "#d6ecfb"]],
  dusk: [[0, "#14163d"], [0.24, "#2c205c"], [0.46, "#5b2a6d"], [0.66, "#a23f6f"], [0.8, "#dc5e69"], [0.92, "#fb8d5e"], [1, "#ffb470"]],
  night: [[0, "#03040b"], [0.35, "#070a1d"], [0.65, "#0c1234"], [0.87, "#161d4c"], [1, "#24295e"]],
};

/** How many stars each time of day shows (0 none, 1 a clear night) */
const STARS_AT: Record<TimeOfDay, number> = { dawn: 0.15, day: 0, dusk: 0.3, night: 1 };

/** The colour of a gradient at position p (0–1) */
function at(stops: Stops, p: number): string {
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
  }
  return stops[stops.length - 1][1];
}

const STAR_FIELD = (() => {
  const r = rng(29);
  return Array.from({ length: 230 }, () => {
    const m = Math.pow(r(), 3);
    return { x: r() * 1920, v: r(), m, ph: r() * 6.283, tint: r() };
  });
})();

/** Faint stars over the upper sky: many dim points, a few brighter ones with a soft halo; fewer towards the horizon */
const StarField: React.FC<{ k: number; horizon: number; T?: number }> = ({ k, horizon, T }) => {
  if (k <= 0.01) return null;
  return (
    <g>
      {STAR_FIELD.map((s, i) => {
        const y = Math.pow(s.v, 1.4) * horizon * 0.86;
        const fade = Math.pow(Math.max(0, 1 - y / (horizon * 0.9)), 0.8);
        const tw = T === undefined ? 1 : 0.72 + 0.28 * Math.sin(T * (1.1 + s.tint) + s.ph);
        const o = k * fade * (0.22 + 0.78 * s.m) * tw;
        if (o < 0.035) return null;
        const r = 0.6 + 1.4 * s.m;
        const c = s.tint < 0.14 ? "#ffe2bd" : s.tint < 0.3 ? "#cddcff" : "#ffffff";
        if (s.m > 0.55) {
          return (
            <g key={i} opacity={o}>
              <circle cx={s.x} cy={y} r={r * 4} fill={c} opacity={0.12} />
              <circle cx={s.x} cy={y} r={r * 2} fill={c} opacity={0.22} />
              <circle cx={s.x} cy={y} r={r} fill={c} />
            </g>
          );
        }
        return <circle key={i} cx={s.x} cy={y} r={r} fill={c} opacity={o} />;
      })}
    </g>
  );
};

/**
 * The sky from the top of the stage down to `horizon` (below it, the last colour). `time` picks a preset; with
 * `to` and `k` it blends towards another one (k 0–1 — a sunset over a chorus). `stops` overrides both.
 * Night (and a little of dusk and dawn) brings a faint star field: `stars` sets how much (0–1); pass T to let
 * the stars twinkle.
 */
export const SkyGradient: React.FC<{
  time?: TimeOfDay; to?: TimeOfDay; k?: number; stops?: Stops; horizon?: number; id?: string; stars?: number; T?: number;
}> = ({ time = "night", to, k = 0, stops, horizon = 1080, id = "sky-gradient", stars, T }) => {
  const a = stops ?? SKIES[time];
  const b = to ? SKIES[to] : a;
  const ps = [...new Set([...a.map((s) => s[0]), ...b.map((s) => s[0])])].sort((x, y) => x - y);
  const blend: Stops = ps.map((p) => [p, mix(at(a, p), at(b, p), k)]);
  const starK = stars ?? (stops ? 0 : STARS_AT[time] + (to ? (STARS_AT[to] - STARS_AT[time]) * k : 0));
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
          {blend.map(([p, c], i) => <stop key={i} offset={p} stopColor={c} />)}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={1920} height={1080} fill={`url(#${id})`} />
      <StarField k={starK} horizon={horizon} T={T} />
    </g>
  );
};

/**
 * The sun: a wide soft bloom, stepped halo rings, the disk and (optional) slowly turning rays. With `horizon`
 * everything is cut where it meets the sea or the land, so it can sink. `glow` scales the bloom (0–2).
 */
export const Sun: React.FC<{
  T: number; x?: number; y?: number; r?: number; color?: string; core?: string; rays?: boolean; horizon?: number; id?: string; glow?: number;
}> = ({ T, x = 960, y = 640, r = 150, color = "#ff8a5c", core = "#ffe9b8", rays = false, horizon, id = "sun", glow = 1 }) => {
  const clip = horizon !== undefined ? `url(#${id}-clip)` : undefined;
  const R = r * 7 * (1 + 0.015 * Math.sin(T * 0.7));
  const e = 1 / 7; // the disk's edge on the bloom's radius
  const halo = mix(color, core, 0.25);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-bloom`} cx={x} cy={y} r={R} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={core} stopOpacity={Math.min(1, 0.9 * glow)} />
          <stop offset={e} stopColor={mix(core, color, 0.45)} stopOpacity={Math.min(1, 0.6 * glow)} />
          <stop offset={e * 1.7} stopColor={halo} stopOpacity={0.3 * glow} />
          <stop offset={e * 3} stopColor={halo} stopOpacity={0.13 * glow} />
          <stop offset={e * 4.8} stopColor={halo} stopOpacity={0.045 * glow} />
          <stop offset={1} stopColor={halo} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-disk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(core, "#ffffff", 0.5)} />
          <stop offset="0.5" stopColor={core} />
          <stop offset="1" stopColor={mix(core, color, 0.42)} />
        </linearGradient>
        <radialGradient id={`${id}-hot`} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        {rays && (
          <radialGradient id={`${id}-ray`} cx={x} cy={y} r={1500} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={core} stopOpacity={0.5} />
            <stop offset={0.25} stopColor={color} stopOpacity={0.22} />
            <stop offset={1} stopColor={color} stopOpacity={0} />
          </radialGradient>
        )}
        {horizon !== undefined && <clipPath id={`${id}-clip`}><rect x={-200} y={-200} width={2320} height={horizon + 200} /></clipPath>}
      </defs>
      <g clipPath={clip}>
        <circle cx={x} cy={y} r={R} fill={`url(#${id}-bloom)`} />
        {rays && (
          <g opacity={0.5 * glow}>
            {Array.from({ length: 12 }, (_, i) => {
              const a0 = (i / 12) * Math.PI * 2 + T * 0.05, w = 0.05 + 0.03 * (i % 3);
              const p = (a: number) => `${(x + 1500 * Math.cos(a)).toFixed(1)},${(y + 1500 * Math.sin(a)).toFixed(1)}`;
              return <polygon key={i} points={`${x},${y} ${p(a0 - w)} ${p(a0 + w)}`} fill={`url(#${id}-ray)`} />;
            })}
          </g>
        )}
        {[2.15, 1.7, 1.36].map((k, i) => (
          <circle key={i} cx={x} cy={y} r={r * k} fill={mix(mix(color, core, 0.25 + 0.3 * i), "#ffffff", 0.3)} opacity={(0.07 + 0.035 * i) * Math.min(1.5, glow)} />
        ))}
        <circle cx={x} cy={y} r={r} fill={`url(#${id}-disk)`} />
        <circle cx={x} cy={y} r={r} fill={`url(#${id}-hot)`} />
      </g>
    </g>
  );
};

// ── clouds ───────────────────────────────────────────────────
type Circle = { x: number; y: number; r: number };
/** a flattened circle: r across, ry tall */
type Bump = Circle & { ry: number };
const f1 = (v: number) => v.toFixed(1);

function circlePath(c: Circle): string {
  const r = f1(c.r);
  return `M ${f1(c.x - c.r)} ${f1(c.y)} A ${r} ${r} 0 1 0 ${f1(c.x + c.r)} ${f1(c.y)} A ${r} ${r} 0 1 0 ${f1(c.x - c.r)} ${f1(c.y)} Z`;
}

/** Where circles a and b cross (null when they don't): the two points and the arc flags for the shapes below */
function crossing(a: Circle, b: Circle) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d === 0 || d >= a.r + b.r || d <= Math.abs(a.r - b.r)) return null;
  const ux = dx / d, uy = dy / d;
  const m = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - m * m));
  const mx = a.x + ux * m, my = a.y + uy * m;
  return { p1: `${f1(mx - uy * h)} ${f1(my + ux * h)}`, p2: `${f1(mx + uy * h)} ${f1(my - ux * h)}`, la: m < 0 ? 1 : 0, lb: d - m < 0 ? 1 : 0 };
}

/** The part of circle a inside circle b */
function lensPath(a: Circle, b: Circle): string {
  const c = crossing(a, b);
  if (!c) return Math.hypot(b.x - a.x, b.y - a.y) >= a.r + b.r ? "" : circlePath(a.r < b.r ? a : b);
  return `M ${c.p1} A ${f1(a.r)} ${f1(a.r)} 0 ${c.la} 0 ${c.p2} A ${f1(b.r)} ${f1(b.r)} 0 ${c.lb} 0 ${c.p1} Z`;
}

/** The part of circle a outside circle b (a crescent) */
function crescentPath(a: Circle, b: Circle): string {
  const c = crossing(a, b);
  if (!c) {
    if (Math.hypot(b.x - a.x, b.y - a.y) >= a.r + b.r) return circlePath(a);
    return b.r >= a.r ? "" : `${circlePath(a)} ${circlePath(b)}`;
  }
  return `M ${c.p2} A ${f1(a.r)} ${f1(a.r)} 0 ${1 - c.la} 0 ${c.p1} A ${f1(b.r)} ${f1(b.r)} 0 ${c.lb} 1 ${c.p2} Z`;
}

/**
 * One cumulus, w wide, its flat base on y = 0. A front mass of lobes along a dome (rounder and lower at the
 * ends, every one reaching down to the base, a body filling between them), a back mass (the crown) that
 * billows over its top, and two rows of bumps along the base for the shaded underside.
 */
function cumulus(r: () => number, w: number, flat: number) {
  // three builds: a wide flat bank, the usual heap, a tall tower
  const kind = r();
  const hmax = w * (kind < 0.3 ? 0.24 + 0.06 * r() : kind > 0.82 ? 0.5 + 0.1 * r() : 0.34 + 0.12 * r()) * flat;
  const skew = (r() - 0.5) * 0.6; // where the dome peaks: clouds lean one way or the other
  const n = (kind < 0.3 ? 6 : 5) + Math.floor(r() * 3);
  const front: Circle[] = [];
  for (let i = 0; i < n; i++) {
    const u = (-1 + (2 * i) / (n - 1)) * 0.92 + (i > 0 && i < n - 1 ? (r() - 0.5) * (0.5 / (n - 1)) : 0);
    const v = (u - skew) / (u > skew ? 1 - skew : 1 + skew);
    const dome = Math.pow(Math.max(0, 1 - v * v), 0.6);
    const rad = w * (0.075 + 0.1 * dome) * (0.85 + 0.3 * r());
    const top = -hmax * (0.3 + 0.48 * dome) * (0.9 + 0.2 * r());
    front.push({ x: (u / 0.92) * (w / 2 - rad), y: Math.max(top + rad, -rad * 0.8), r: rad });
  }
  const nb = 2 + Math.floor(r() * 2);
  const back: Circle[] = Array.from({ length: nb }, (_, k) => {
    const rad = w * (0.13 + 0.06 * r());
    const x = ((k + 0.5) / nb - 0.5) * w * 0.48 + skew * w * 0.32 + (r() - 0.5) * w * 0.1;
    return { x, y: -hmax * (0.86 + 0.16 * r()) * (1 - Math.abs(x - skew * w * 0.4) / w) + rad, r: rad };
  });
  /** a row of flattish bumps along the base, radius lo–hi (of w), centres k radii below the base */
  const bumps = (lo: number, hi: number, k: number) => {
    const out: Bump[] = [];
    for (let x = -w / 2 + r() * w * 0.08; x < w / 2 + w * 0.05;) {
      const R = w * (lo + (hi - lo) * r());
      out.push({ x, y: R * k, r: R * (1.35 + 0.4 * r()), ry: R });
      x += R * (1.5 + 0.9 * r());
    }
    return out;
  };
  // the body fills between the lobes, low down: a flat dome over the base (an ellipse, not a polygon — Chrome's
  // union of clip shapes breaks on a polygon overlapping the circles and leaves wedge-shaped holes)
  const body = { cx: (front[0].x + front[n - 1].x) / 2, rx: (front[n - 1].x - front[0].x) / 2, ry: hmax * 0.45 };
  return { front, back, body, belly: bumps(0.05, 0.085, 0.35), mid: bumps(0.07, 0.12, -0.1), h: hmax * 1.08, w };
}

/** Day, dusk, dawn and night looks for clouds; pass `time` instead of colours */
const CLOUD_TONES: Record<TimeOfDay, { color: string; belly: string; rim: string }> = {
  day: { color: "#ffffff", belly: "#a9bbdc", rim: "#ffffff" },
  dawn: { color: "#ffd2c2", belly: "#8f73a6", rim: "#fff1e0" },
  dusk: { color: "#ffb08a", belly: "#b85579", rim: "#ffe2c4" },
  night: { color: "#2c3473", belly: "#141a42", rim: "#6f7cc4" },
};

/**
 * Drifting cumulus clouds between y0 and y1, nearer ones bigger, faster and crisper. Each billows on top and sits
 * on a flat base, shaded in flat tones that merge (no circles showing): a back mass a step darker than the front
 * one, a scalloped middle band and a shadowed underside in `belly`, and a thin lighter rim on the side towards
 * the light. Day: white and grey-blue (the defaults); dusk and night: pass `color` and `belly` from the sky, or
 * `time`. `light` is where the light comes from (the sun or moon on the stage): from below (a low sun) the
 * underside lights up and the tops darken; without it the light comes from above. `size` scales every cloud (2: twice
 * as wide and tall), for a heavy overcast deck with more of them.
 */
export const Clouds: React.FC<{
  T: number; n?: number; y0?: number; y1?: number; speed?: number; color?: string; belly?: string; seed?: number; opacity?: number;
  rim?: string; light?: { x: number; y: number }; time?: TimeOfDay; id?: string; size?: number;
}> = ({ T, n = 7, y0 = 120, y1 = 420, speed = 14, color, belly, seed = 7, opacity = 1, rim, light, time, id, size = 1 }) => {
  const tones = CLOUD_TONES[time ?? "day"];
  const lit = color ?? tones.color;
  const dark = belly ?? tones.belly;
  const rimC = rim ?? (color && !time ? mix(lit, "#ffffff", 0.36) : tones.rim);
  const uid = id ?? `clouds-${seed}-${(lit + dark).replace(/[^a-z0-9]/gi, "")}`;
  const r = rng(seed);
  const M = 320 * Math.max(1, size), span = 1920 + 2 * M;
  const clouds = Array.from({ length: n }, (_, i) => {
    const depth = 0.35 + r() * 0.65;
    const w = (220 + r() * 380) * (0.38 + 0.62 * depth) * size;
    // spread along the band (one cloud per slot), so they overlap less than at random
    const x0 = ((i + 0.15 + 0.7 * r()) / n) * span;
    return { x0, y: y0 + (y1 - y0) * (1 - depth) + (r() - 0.5) * 90, depth, shape: cumulus(r, w, 0.78 + 0.22 * depth) };
  }).sort((a, b) => a.depth - b.depth);
  const dots = (cs: Circle[], dx = 0, dy = 0) => cs.map((l, j) => <circle key={j} cx={f1(l.x + dx)} cy={f1(l.y + dy)} r={f1(l.r)} />);
  const dome = (b: { cx: number; rx: number; ry: number }, dx = 0, dy = 0) => <ellipse cx={f1(b.cx + dx)} cy={f1(dy)} rx={f1(b.rx)} ry={f1(b.ry)} />;
  return (
    <g opacity={opacity}>
      <defs>
        <filter id={`${uid}-soft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1" /></filter>
        <filter id={`${uid}-far`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.8" /></filter>
      </defs>
      {clouds.map((c, i) => {
        const { front, back, body, belly: under, mid: band, w, h } = c.shape;
        const x = ((c.x0 + speed * c.depth * T) % span + span) % span - M;
        const base = c.y + h * 0.45;
        let lx = 0.28, ly = -1;
        if (light) { lx = light.x - x; ly = light.y - (base - h / 2); }
        const ll = Math.hypot(lx, ly) || 1;
        lx /= ll; ly /= ll;
        // far clouds: lower contrast (closer to the middle tone) — they sit behind more air
        const haze = (1 - c.depth) * 0.45;
        const mid = mix(lit, dark, 0.45);
        const tone = (col: string) => mix(col, mid, haze);
        const up = ly < 0.35; // light from above or the side: lit tops, shaded underside; else the other way round
        const [cBack, cFront, cBand, cUnder] = up
          ? [tone(mix(lit, mid, 0.42)), tone(lit), tone(mid), tone(dark)]
          : [tone(dark), tone(mix(dark, mid, 0.6)), tone(mix(mid, lit, 0.5)), tone(lit)];
        const cid = `${uid}-${i}`;
        const rimW = w * 0.012;
        const near = c.depth > 0.5;
        return (
          <g key={i} transform={`translate(${f1(x)} ${f1(base)})`} opacity={0.82 + 0.18 * c.depth} filter={`url(#${uid}-${near ? "soft" : "far"})`}>
            <defs>
              {/* masks, not clip paths: a mask's union of shapes is painted, so it can't break the way Chrome's
                  clip-path unions sometimes do (wedge-shaped holes where shapes overlap) */}
              <mask id={`${cid}-shape`}>
                <g fill="#fff">{dome(body)}{dots(front)}{dots(back)}</g>
              </mask>
              <clipPath id={`${cid}-base`}><rect x={-w} y={-h * 2} width={w * 2} height={h * 2} /></clipPath>
              <mask id={`${cid}-inner`}>
                <g fill="#fff">
                  {dome(body, -lx * rimW, -ly * rimW)}
                  {dots(front, -lx * rimW, -ly * rimW)}
                  {dots(back, -lx * rimW, -ly * rimW)}
                  {!up && <rect x={-w} y={-h * 2} width={w * 2} height={h * 2 - rimW * ly} />}
                </g>
              </mask>
              <linearGradient id={`${cid}-shade`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0.45} stopColor={up ? cUnder : cBack} stopOpacity={0} />
                <stop offset={1} stopColor={up ? cUnder : cBack} stopOpacity={up ? 0.35 : 0} />
              </linearGradient>
            </defs>
            <g clipPath={`url(#${cid}-base)`}>
              <g mask={`url(#${cid}-shape)`}>
                <rect x={-w} y={-h * 1.3} width={w * 2} height={h * 1.4} fill={near ? rimC : cFront} />
                <g mask={near ? `url(#${cid}-inner)` : undefined}>
                  <rect x={-w} y={-h * 1.3} width={w * 2} height={h * 1.4} fill={cBack} />
                  <g fill={cFront}>{dome(body)}{dots(front)}</g>
                  <rect x={-w} y={-h * 1.15} width={w * 2} height={h * 1.2} fill={`url(#${cid}-shade)`} />
                  <g fill={cBand}>{band.map((b, j) => <ellipse key={j} cx={f1(b.x)} cy={f1(b.y)} rx={f1(b.r)} ry={f1(b.ry)} />)}</g>
                  <g fill={cUnder}>{under.map((b, j) => <ellipse key={j} cx={f1(b.x)} cy={f1(b.y)} rx={f1(b.r)} ry={f1(b.ry)} />)}</g>
                </g>
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
};
