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
  dawn: [[0, "#1d2a5a"], [0.55, "#c76a7a"], [0.85, "#f7a978"], [1, "#ffe0b0"]],
  day: [[0, "#2f7fd6"], [0.7, "#8cc8f2"], [1, "#d8f0ff"]],
  dusk: [[0, "#141743"], [0.45, "#5b2d6e"], [0.8, "#d5546a"], [1, "#ff9a5c"]],
  night: [[0, "#04050b"], [0.7, "#0d1236"], [1, "#1c2560"]],
};

/** The colour of a gradient at position p (0–1) */
function at(stops: Stops, p: number): string {
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
  }
  return stops[stops.length - 1][1];
}

/**
 * The sky from the top of the stage down to `horizon` (below it, the last colour). `time` picks a preset; with
 * `to` and `k` it blends towards another one (k 0–1 — a sunset over a chorus). `stops` overrides both.
 */
export const SkyGradient: React.FC<{ time?: TimeOfDay; to?: TimeOfDay; k?: number; stops?: Stops; horizon?: number; id?: string }> = ({
  time = "night", to, k = 0, stops, horizon = 1080, id = "sky-gradient",
}) => {
  const a = stops ?? SKIES[time];
  const b = to ? SKIES[to] : a;
  const ps = [...new Set([...a.map((s) => s[0]), ...b.map((s) => s[0])])].sort((x, y) => x - y);
  const blend: Stops = ps.map((p) => [p, mix(at(a, p), at(b, p), k)]);
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
          {blend.map(([p, c], i) => <stop key={i} offset={p} stopColor={c} />)}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={1920} height={1080} fill={`url(#${id})`} />
    </g>
  );
};

/**
 * The sun: a soft glow, the disk and (optional) slowly turning rays. With `horizon` the disk is cut where it meets
 * the sea or the land, so it can sink.
 */
export const Sun: React.FC<{ T: number; x?: number; y?: number; r?: number; color?: string; core?: string; rays?: boolean; horizon?: number; id?: string }> = ({
  T, x = 960, y = 640, r = 150, color = "#ff8a5c", core = "#ffe9b8", rays = false, horizon, id = "sun",
}) => (
  <g>
    <defs>
      <radialGradient id={`${id}-disk`}>
        <stop offset="0" stopColor={core} />
        <stop offset="0.7" stopColor={mix(core, color, 0.6)} />
        <stop offset="1" stopColor={color} />
      </radialGradient>
      {horizon !== undefined && <clipPath id={`${id}-clip`}><rect x={0} y={0} width={1920} height={horizon} /></clipPath>}
    </defs>
    <circle cx={x} cy={y} r={r * 3.2} fill={color} opacity={0.16} filter="url(#blur-22)" />
    <circle cx={x} cy={y} r={r * 1.7} fill={color} opacity={0.28} filter="url(#blur-22)" />
    {rays && (
      <g opacity={0.12}>
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2 + T * 0.12;
          return <line key={i} x1={x} y1={y} x2={x + 1500 * Math.cos(a)} y2={y + 1500 * Math.sin(a)} stroke={color} strokeWidth={34} />;
        })}
      </g>
    )}
    <g clipPath={horizon !== undefined ? `url(#${id}-clip)` : undefined}>
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-disk)`} />
    </g>
  </g>
);

/**
 * Drifting clouds between y0 and y1, nearer ones bigger, faster and more opaque. Each is a flat-bottomed puff with a
 * darker belly. Day: white and grey-blue; night: pass `color` and `belly` from the sky.
 */
export const Clouds: React.FC<{
  T: number; n?: number; y0?: number; y1?: number; speed?: number; color?: string; belly?: string; seed?: number; opacity?: number;
}> = ({ T, n = 7, y0 = 120, y1 = 420, speed = 14, color = "#ffffff", belly = "#c9d6ee", seed = 7, opacity = 0.9 }) => {
  const r = rng(seed);
  const clouds = Array.from({ length: n }, () => {
    const depth = 0.4 + r() * 0.6;
    return {
      x0: r() * 2400, y: y0 + (y1 - y0) * (1 - depth) + r() * 40, w: (160 + r() * 260) * depth, depth,
      puffs: Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({ dx: r(), r: 0.22 + r() * 0.2 })),
    };
  }).sort((a, b) => a.depth - b.depth);
  return (
    <g opacity={opacity}>
      {clouds.map((c, i) => {
        const x = ((c.x0 + speed * c.depth * T) % 2400) - 240;
        const puff = (fill: string, dy: number) => (
          <g fill={fill}>
            {c.puffs.map((p, k) => <circle key={k} cx={x + (p.dx - 0.5) * c.w} cy={c.y + dy - p.r * c.w * 0.35} r={p.r * c.w * 0.6} />)}
            <rect x={x - c.w * 0.62} y={c.y + dy - c.w * 0.12} width={c.w * 1.24} height={c.w * 0.12} rx={c.w * 0.06} />
          </g>
        );
        return (
          <g key={i} opacity={0.55 + 0.45 * c.depth} filter="url(#blur-2)">
            {puff(belly, 10)}
            {puff(color, -2)}
          </g>
        );
      })}
    </g>
  );
};
