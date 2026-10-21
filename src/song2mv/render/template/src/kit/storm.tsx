import React from "react";
import { mix } from "./color";
import { clamp01, rng } from "./math";
import { Clouds } from "./sky";

/**
 * Lightning, and a storm built from the kit's Clouds. Use inside <Svg>. For the white flash over the whole frame,
 * pass strikeFlashes(strikes) to the kit's <Flash> (an HTML layer, outside the <Svg>, over the scene).
 * Style-neutral: colours, a natural forked bolt or a flat zigzag one, its width, branches and the glow are props.
 */

type Pt = [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
/** mix() that leaves colours it cannot read (rgb(), names) as they are */
const tint = (a: string, b: string, k: number) => (isHex(a) && isHex(b) ? mix(a, b, k) : a);

/** A strike at song time `t`, from (x, y) in the clouds to `to` (default: straight down to the ground, a little off) */
export type Strike = { t: number; x: number; y?: number; to?: Pt };

/** How long a strike can be seen, s */
const LIFE = 0.5;
/** A strike's brightness at `age` s: a stroke and two return strokes, each dying in a few hundredths of a second */
function flicker(age: number): number {
  if (age < 0 || age > LIFE) return 0;
  const pulse = (t0: number, a: number) => (age >= t0 ? a * Math.exp(-(age - t0) / 0.04) : 0);
  return Math.min(1, pulse(0, 1) + pulse(0.075, 0.75) + pulse(0.16, 0.5) + 0.12 * Math.exp(-age / 0.15));
}

/**
 * The white flashes for the kit's <Flash>: one per strike and a weaker one on its return stroke. `a` is how white the
 * frame goes (0–1).
 */
export function strikeFlashes(strikes: Strike[], a = 0.3): [number, number][] {
  return strikes.flatMap((s) => [[s.t, a], [s.t + 0.075, a * 0.6]] as [number, number][]);
}

/** A jagged channel from a to b in `steps` segments: a random walk across the line that keeps coming back to it */
function channel(r: () => number, a: Pt, b: Pt, steps: number, jag: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L, seg = L / steps;
  const pts: Pt[] = [a];
  let off = 0;
  for (let i = 1; i < steps; i++) {
    off = off * 0.72 + (r() - 0.5) * 2 * jag * seg;
    const t = (i + (r() - 0.5) * 0.4) / steps;
    pts.push([a[0] + dx * t + px * off, a[1] + dy * t + py * off]);
  }
  pts.push(b);
  return pts;
}

type Bolt = { pts: Pt[]; w: number; o: number }[];

/** A whole bolt: the main channel, branches off its upper part and a few twigs off those, each thinner and dimmer */
function forkBolt(seed: number, a: Pt, b: Pt, branches: number): Bolt {
  const r = rng(seed);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const main = channel(r, a, b, Math.max(8, Math.round(L / 34)), 0.9);
  const out: Bolt = [{ pts: main, w: 1, o: 1 }];
  const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let k = 0; k < branches; k++) {
    const i = 1 + Math.floor(r() * (main.length * 0.7 - 1));
    const s = main[i];
    const ang = dir + (k % 2 ? -1 : 1) * (0.45 + 0.45 * r());
    const len = L * (0.14 + 0.24 * r()) * (1 - (i / main.length) * 0.5);
    const e: Pt = [s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len];
    const br = channel(r, s, e, Math.max(4, Math.round(len / 30)), 0.7);
    out.push({ pts: br, w: 0.5, o: 0.75 });
    if (r() < 0.6) {
      const j = 1 + Math.floor(r() * (br.length - 2));
      const a2 = ang + (k % 2 ? -1 : 1) * (0.35 + 0.4 * r()), l2 = len * (0.3 + 0.3 * r());
      const s2 = br[j];
      out.push({ pts: channel(r, s2, [s2[0] + Math.cos(a2) * l2, s2[1] + Math.sin(a2) * l2], 4, 0.8), w: 0.3, o: 0.55 });
    }
  }
  return out;
}

/**
 * A flat cartoon bolt from a to b: a ribbon along a zigzag, wide at the top and coming to a point, each kink cut with a
 * step (the edge on the side it turns to sits a little lower), like the ⚡ sign
 */
function zigzagBolt(seed: number, a: Pt, b: Pt, width: number, swing = width): string {
  const r = rng(seed);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  const at = (t: number, o: number): Pt => [a[0] + dx * t + px * o, a[1] + dy * t + py * o];
  const m = 4; // kinks
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const t = i / m, side = i % 2 ? 1 : -1;
    const o = side * swing * 0.75 * (1 - 0.4 * t) * (0.8 + 0.4 * r());
    const hw = (width * (1 - t * 0.8)) / 2;
    left.push(at(t + (side > 0 ? 0.1 : 0) / m, o - hw));
    right.push(at(t + (side > 0 ? 0 : 0.1) / m, o + hw));
  }
  const pts = [...left, b, ...right.reverse()];
  return `M${pts.map((p) => `${n1(p[0])} ${n1(p[1])}`).join("L")}Z`;
}

const polyline = (p: Pt[]) => `M${p.map((q) => `${n1(q[0])} ${n1(q[1])}`).join("L")}`;

/**
 * Lightning bolts at the strikes' times, each from (x, y) to its `to` (default: down to `ground`, a little off).
 * A strike flickers like real lightning (a stroke and two return strokes) and is gone in half a second; every strike
 * draws a new bolt. `look` "fork": a jagged channel with `branches` branches, a white core in a coloured glow;
 * "zigzag": a flat cartoon bolt (with `flat`-looking colours, `glow={0}`). `width` is the core's width at s = 1.
 * `color` the glow (or the zigzag's fill), `core` the hot middle. `id` keeps the filters of two of them apart.
 */
export const Lightning: React.FC<{
  T: number; strikes: Strike[]; ground?: number; look?: "fork" | "zigzag"; width?: number; branches?: number;
  color?: string; core?: string; glow?: number; seed?: number; id?: string;
}> = ({ T, strikes, ground = 1080, look = "fork", width = 3.5, branches = 4, color = "#9fb4ff", core = "#ffffff", glow = 1, seed = 1, id = "lightning" }) => {
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const live = strikes.map((s, i) => ({ s, i, k: flicker(T - s.t) })).filter((v) => v.k > 0.02);
  if (!live.length) return null;
  return (
    <g>
      <defs>
        <filter id={`${gid}-soft`} x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation={n1(width * 2.4)} /></filter>
      </defs>
      {live.map(({ s, i, k }) => {
        const a: Pt = [s.x, s.y ?? 240];
        const sd = seed * 7907 + i * 131 + Math.round(s.t * 1000);
        const b: Pt = s.to ?? [s.x + (rng(sd)() - 0.5) * (ground - a[1]) * 0.35, ground];
        if (look === "zigzag") {
          const d = zigzagBolt(sd, a, b, width * 14), inner = zigzagBolt(sd, a, b, width * 5, width * 14);
          return (
            <g key={i} opacity={n2(Math.min(1, k * 1.4))}>
              {glow > 0 && <path d={d} fill={color} opacity={n2(0.6 * glow)} filter={`url(#${gid}-soft)`} />}
              <path d={d} fill={color} />
              <path d={inner} fill={core} />
            </g>
          );
        }
        const bolt = forkBolt(sd, a, b, branches);
        return (
          <g key={i} strokeLinejoin="round" strokeLinecap="round" fill="none">
            {glow > 0 && bolt.map((c, j) => (
              <path key={`g${j}`} d={polyline(c.pts)} stroke={color} strokeWidth={n1(width * c.w * 7)} opacity={n2(0.55 * glow * k * c.o)} filter={`url(#${gid}-soft)`} />
            ))}
            {bolt.map((c, j) => (
              <path key={`m${j}`} d={polyline(c.pts)} stroke={tint(color, core, 0.35)} strokeWidth={n1(width * c.w * 2.4)} opacity={n2(0.8 * k * c.o)} />
            ))}
            {bolt.map((c, j) => (
              <path key={`c${j}`} d={polyline(c.pts)} stroke={core} strokeWidth={n1(Math.max(0.8, width * c.w))} opacity={n2(Math.min(1, k * 1.3) * c.o)} />
            ))}
          </g>
        );
      })}
    </g>
  );
};

/**
 * A thunderstorm: a dark overcast and a deck of storm clouds whose underside hangs at `y`, with lightning at the
 * strikes' times that comes out of the deck and lights it from inside, around the bolt, flickering with it. The deck's
 * billows are the kit's Clouds hung upside down under a shelf of cloud, so they face the ground; a strike's light is
 * the same Clouds again in `lit`. `strikes` take only t and x here (the bolts start in the deck).
 * - `color`, `belly`, `rim`: the dark clouds (billows, the shelf, their lit edges); `lit`: the clouds in a strike's
 *   light; `sky`: the overcast above and between them.
 * - `bolt`: props for the Lightning (look, width, branches, color, core, glow); `ground`: where bolts end.
 * - `n` billows, `size` times the kit's usual clouds, drifting at `speed`; `seed` picks them; `id` keeps the gradients
 *   and masks apart.
 * Over the scene, outside the <Svg>, add <Flash T={T} flashes={strikeFlashes(strikes)} /> for the frame's flash.
 */
export const Storm: React.FC<{
  T: number; strikes: Strike[]; y?: number; n?: number; size?: number; speed?: number; ground?: number;
  color?: string; belly?: string; rim?: string; lit?: string; sky?: string;
  bolt?: { look?: "fork" | "zigzag"; width?: number; branches?: number; color?: string; core?: string; glow?: number };
  seed?: number; id?: string;
}> = ({
  T, strikes, y = 260, n = 16, size = 1.4, speed = 22, ground = 1080, color = "#2f3558", belly = "#13152a", rim = "#4a5384",
  lit = "#c8d0ff", sky = "#161a30", bolt = {}, seed = 5, id = "storm",
}) => {
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  // the brightest strike right now lights the clouds and the sky behind them
  let k = 0, at: Strike | null = null;
  for (const s of strikes) {
    const v = flicker(T - s.t);
    if (v > k) [k, at] = [v, s];
  }
  const shown = strikes.map((s) => ({ ...s, y: s.y ?? y - 20 }));
  // the shelf: the deck's underside across the whole sky, its edge billowing a little and drifting
  const shelf = (() => {
    const pts: string[] = [];
    for (let x = 2140; x >= -220; x -= 40) {
      const v = y + 14 * Math.sin(x * 0.0061 + T * speed * 0.004 + seed) + 8 * Math.sin(x * 0.0173 - T * speed * 0.007 + seed * 2);
      pts.push(`${x} ${n1(v)}`);
    }
    return `M-220 -220H2140V${pts[0].split(" ")[1]}L${pts.join("L")}Z`;
  })();
  // billows: Clouds on one row at y 0, flipped about the shelf so their flat bases sit up inside it (in its colour)
  const hang = `translate(0 ${n1(y)}) scale(1 -1)`;
  const clouds = { T, n, y0: 0, y1: 0, size, speed, seed, light: at ? { x: at.x, y: 60 } : undefined };
  return (
    <g>
      <defs>
        <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint(sky, "#000000", 0.5)} />
          <stop offset={n2(y / 1080)} stopColor={sky} />
          <stop offset="1" stopColor={sky} stopOpacity={0} />
        </linearGradient>
        {/* over the billows' flat tops, so they melt into the shelf instead of ending in a line */}
        <linearGradient id={`${gid}-melt`} gradientUnits="userSpaceOnUse" x1={0} y1={n1(y - 110)} x2={0} y2={n1(y - 20)}>
          <stop offset="0" stopColor={belly} />
          <stop offset="1" stopColor={belly} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${gid}-meltLit`} gradientUnits="userSpaceOnUse" x1={0} y1={n1(y - 110)} x2={0} y2={n1(y - 20)}>
          <stop offset="0" stopColor={tint(lit, belly, 0.7)} />
          <stop offset="1" stopColor={tint(lit, belly, 0.7)} stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`${gid}-burst`}>
          <stop offset="0" stopColor={lit} stopOpacity={0.6} />
          <stop offset="0.4" stopColor={lit} stopOpacity={0.18} />
          <stop offset="1" stopColor={lit} stopOpacity={0} />
        </radialGradient>
        {/* a strike lights the clouds around it, not the whole deck */}
        <radialGradient id={`${gid}-reach`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        {at && (
          <mask id={`${gid}-near`} maskUnits="userSpaceOnUse" x={-400} y={-400} width={2720} height={1880}>
            <ellipse cx={at.x} cy={y + 40} rx={760} ry={360} fill={`url(#${gid}-reach)`} />
          </mask>
        )}
      </defs>
      <rect x={-200} y={-200} width={2320} height={y + 620} fill={`url(#${gid}-sky)`} />
      {at && k > 0.02 && <ellipse cx={at.x} cy={y + 60} rx={760} ry={420} fill={`url(#${gid}-burst)`} opacity={n2(k)} />}
      <Lightning T={T} strikes={shown} ground={ground} seed={seed} id={`${gid}-bolt`} {...bolt} />
      <path d={shelf} fill={belly} />
      <g transform={hang}>
        <Clouds {...clouds} color={color} belly={belly} rim={rim} id={`${gid}-dark`} />
      </g>
      <rect x={-220} y={-220} width={2360} height={n1(y + 200)} fill={`url(#${gid}-melt)`} />
      {at && k > 0.02 && (
        <g mask={`url(#${gid}-near)`} opacity={n2(clamp01(k))}>
          <path d={shelf} fill={tint(lit, belly, 0.7)} />
          <g transform={hang}>
            <Clouds {...clouds} color={lit} belly={tint(lit, belly, 0.7)} rim="#ffffff" id={`${gid}-lit`} />
          </g>
          <rect x={-220} y={-220} width={2360} height={n1(y + 200)} fill={`url(#${gid}-meltLit)`} />
        </g>
      )}
    </g>
  );
};
