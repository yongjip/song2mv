import React from "react";
import { AbsoluteFill } from "remotion";
import { mix } from "./color";
import { clamp01, rng } from "./math";
import { useSong } from "./song";

/**
 * Backgrounds and light. Everything here may move with the beat — it is not text.
 * Coordinates are a 1920×1080 stage; the 9:16 frame scales the stage into a band.
 */

const STARS = (() => {
  const r = rng(11);
  return Array.from({ length: 240 }, () => ({ x: r() * 1920, y: r() * 1080, s: 0.6 + r() * 1.8, ph: r() * 6.28, k: r() }));
})();

/** Night sky: a tinted glow from below and drifting, twinkling stars. streak > 4 turns stars into speed lines */
export const Sky: React.FC<{ T: number; tint: string; drift?: number; streak?: number; opacity?: number }> = ({
  T, tint, drift = 18, streak = 0, opacity = 1,
}) => {
  const { theme } = useSong();
  const [c0, c1 = c0, c2 = c1] = theme.stars;
  const D = drift * T;
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 100%, ${tint} 0%, ${theme.bg} 72%)` }} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {STARS.map((s, i) => {
          const c = s.k < 0.16 ? c2 : s.k < 0.3 ? c1 : c0;
          const depth = 0.4 + s.s / 3;
          const y = (((s.y + D * depth) % 1080) + 1080) % 1080;
          if (streak > 4) {
            return <line key={i} x1={s.x} y1={y - streak * depth} x2={s.x} y2={y} stroke={c} strokeWidth={s.s} strokeOpacity={0.75} strokeLinecap="round" />;
          }
          return <circle key={i} cx={s.x} cy={y} r={s.s} fill={c} opacity={0.45 + 0.4 * Math.sin(T * 2.2 + s.ph)} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** Glow rising from the bottom edge that kicks on every beat (harder on the bar's first beat) */
export const BeatGlow: React.FC<{ T: number; color: string; strength?: number }> = ({ T, color, strength = 1 }) => {
  const { grid } = useSong();
  return (
    <AbsoluteFill
      style={{ background: `radial-gradient(60% 45% at 50% 108%, ${color} 0%, transparent 70%)`, opacity: (0.2 + 0.42 * grid.pulse(T)) * strength }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(85% 75% at 50% 45%, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />
);

/** White flashes [time, strength] decaying in ~0.1 s */
export const Flash: React.FC<{ T: number; flashes: [number, number][] }> = ({ T, flashes }) => {
  let o = 0;
  for (const [t, a] of flashes) if (T >= t && T < t + 1) o = Math.max(o, Math.exp(-(T - t) / 0.09) * a);
  return <AbsoluteFill style={{ background: "#fff", opacity: o }} />;
};

/** Light rays from a point, slowly turning */
export const Rays: React.FC<{ T: number; color: string; opacity: number; cx?: number; cy?: number; n?: number }> = ({
  T, color, opacity, cx = 960, cy = 470, n = 18,
}) => {
  const id = `rays-${color.replace(/[^a-z0-9]/gi, "")}-${cy}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity }}>
      <defs>
        <radialGradient id={id} cx={cx} cy={cy} r={1100} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} stopOpacity={0.9} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={`rotate(${T * 9} ${cx} ${cy})`}>
        {Array.from({ length: n }, (_, i) => {
          const a0 = ((i / n) * 360 * Math.PI) / 180, w = (3.2 * Math.PI) / 180, R = 1600;
          return (
            <polygon key={i} fill={`url(#${id})`}
              points={`${cx},${cy} ${cx + R * Math.cos(a0 - w)},${cy + R * Math.sin(a0 - w)} ${cx + R * Math.cos(a0 + w)},${cy + R * Math.sin(a0 + w)}`} />
          );
        })}
      </g>
    </svg>
  );
};

/** SVG blur filters — use as filter="url(#blur-14)" inside a scene's <Svg> */
export const Blurs: React.FC = () => (
  <defs>
    <filter id="blur-2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2" /></filter>
    <filter id="blur-6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
    <filter id="blur-10" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" /></filter>
    <filter id="blur-14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
    <filter id="blur-22" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22" /></filter>
  </defs>
);

/** Full-stage SVG with the blur filters defined; `w` × `h` is its size: 1080 × 1920 fills a VerticalScene's frame */
export const Svg: React.FC<{ children: React.ReactNode; opacity?: number; w?: number; h?: number }> = ({ children, opacity = 1, w = 1920, h = 1080 }) => (
  <svg width={w} height={h} style={{ position: "absolute", inset: 0, opacity }}>
    <Blurs />
    {children}
  </svg>
);

/** Slow camera: from t0 over dur seconds, zoom and pan the children. Keep text outside it */
export const Drift: React.FC<{ T: number; t0: number; dur?: number; zoom?: number; dx?: number; dy?: number; cx?: number; cy?: number; children: React.ReactNode }> = ({
  T, t0, dur = 4, zoom = 1.06, dx = 0, dy = 0, cx = 960, cy = 540, children,
}) => {
  const k = clamp01((T - t0) / dur);
  const z = 1 + (zoom - 1) * k;
  return <g transform={`translate(${cx + dx * k} ${cy + dy * k}) scale(${z}) translate(${-cx} ${-cy})`}>{children}</g>;
};

/** Floating specks, slowly rising (or falling) — breath for a still scene. Use inside <Svg> */
export const Dust: React.FC<{ T: number; n?: number; color: string; speed?: number; seed?: number; up?: boolean; scale?: number }> = ({
  T, n = 70, color, speed = 40, seed = 141, up = true, scale = 1,
}) => {
  const r = rng(seed);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x0 = r() * 1920, y0 = r() * 1080, sp = speed * (0.5 + r()), sz = (1.5 + r() * 3) * scale, ph = r() * 6.28;
        const y = (((y0 + (up ? -1 : 1) * sp * T) % 1080) + 1080) % 1080;
        const x = x0 + 30 * Math.sin(T * 0.7 + ph);
        return <circle key={i} cx={x} cy={y} r={sz} fill={color} opacity={0.25 + 0.35 * Math.sin(T * 2 + ph)} />;
      })}
    </g>
  );
};

/** Large soft out-of-focus lights in the foreground — depth. Use inside <Svg> */
export const Bokeh: React.FC<{ T: number; color: string; n?: number; seed?: number; opacity?: number }> = ({ T, color, n = 8, seed = 161, opacity = 1 }) => {
  const r = rng(seed);
  return (
    <g opacity={opacity}>
      {Array.from({ length: n }, (_, i) => {
        const x = r() * 1920, y = r() * 1080, rad = 40 + r() * 90, ph = r() * 6.28;
        return <circle key={i} cx={x + 20 * Math.sin(T * 0.4 + ph)} cy={y + 14 * Math.cos(T * 0.3 + ph)} r={rad} fill={color} opacity={0.05 + 0.04 * Math.sin(T + ph)} filter="url(#blur-22)" />;
      })}
    </g>
  );
};

/** Big flakes or embers — for quiet scenes. Larger and brighter than Dust, so they still read at a glance */
export const Snow: React.FC<{ T: number; n?: number; color: string; speed?: number; seed?: number; up?: boolean }> = ({
  T, n = 70, color, speed = 45, seed = 481, up = true,
}) => {
  const r = rng(seed);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x0 = r() * 1920, y0 = r() * 1080, sp = speed * (0.6 + r()), sz = 3 + r() * 5, ph = r() * 6.28;
        const y = (((y0 + (up ? -1 : 1) * sp * T) % 1080) + 1080) % 1080;
        const x = x0 + 50 * Math.sin(T * 0.6 + ph);
        return <circle key={i} cx={x} cy={y} r={sz} fill={color} opacity={0.35 + 0.35 * Math.sin(T * 1.5 + ph)} />;
      })}
    </g>
  );
};

/** Perspective floor grid rolling toward the viewer, one line per beat, brighter on the beat. Use inside <Svg> */
export const GridFloor: React.FC<{ T: number; color: string; horizon?: number; opacity?: number }> = ({ T, color, horizon = 640, opacity = 1 }) => {
  const { grid } = useSong();
  const b = grid.beatPos(T);
  const frac = b - Math.floor(b);
  const f = 190;
  const kick = 0.55 + 0.45 * grid.pulse(T, 0.2);
  const id = `floor-${color.replace(/[^a-z0-9]/gi, "")}`;
  const rows = Array.from({ length: 16 }, (_, k) => {
    const z = 0.42 + (k + 1 - frac) * 0.42;
    return { y: horizon + f / z, o: Math.min(1, 0.9 / z) };
  }).filter((r) => r.y <= 1100);
  return (
    <g opacity={opacity}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.55} />
          <stop offset="0.45" stopColor={color} stopOpacity={0.12} />
          <stop offset="1" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <rect x={0} y={horizon} width={1920} height={1080 - horizon} fill={`url(#${id})`} opacity={0.7 + 0.3 * kick} />
      <rect x={0} y={horizon - 10} width={1920} height={20} fill={color} opacity={0.8 * kick} filter="url(#blur-10)" />
      <rect x={0} y={horizon - 1.5} width={1920} height={3} fill="#fff" opacity={0.5 * kick} />
      {rows.map((r, i) => (
        <line key={`h${i}`} x1={0} x2={1920} y1={r.y} y2={r.y} stroke={color} strokeWidth={2 + 3 * r.o} opacity={r.o * 0.85 * kick} />
      ))}
      {Array.from({ length: 25 }, (_, i) => {
        const k = i - 12;
        return <line key={`v${i}`} x1={960 + k * 36} y1={horizon} x2={960 + k * 420} y2={1080 + 200} stroke={color} strokeWidth={2.5} opacity={0.55 * kick} />;
      })}
    </g>
  );
};

/** Seas (soft darker patches) and craters on the moon, as fractions of its radius */
const MOON_SEAS = [
  { x: -0.3, y: -0.2, rx: 0.34, ry: 0.24, a: -18 }, { x: 0.16, y: -0.02, rx: 0.27, ry: 0.2, a: 24 },
  { x: -0.06, y: 0.34, rx: 0.24, ry: 0.15, a: -8 }, { x: 0.36, y: 0.36, rx: 0.15, ry: 0.11, a: 30 },
];
const MOON_CRATERS = [
  { x: 0.4, y: -0.44, r: 0.1 }, { x: -0.5, y: 0.2, r: 0.075 }, { x: 0.1, y: 0.58, r: 0.115 },
  { x: -0.16, y: -0.58, r: 0.06 }, { x: 0.6, y: 0.06, r: 0.065 }, { x: -0.34, y: 0.56, r: 0.05 }, { x: -0.62, y: -0.22, r: 0.045 },
];

/**
 * A large low moon with a halo — a quiet focal point for calm sections. Use inside <Svg>. `color` tints the disk,
 * the halo and the stepped glow rings around it; faint seas and craters give the disk a surface (`craters`).
 * `id` keeps the gradients of two moons apart (by default it comes from the colour and position).
 */
export const Moon: React.FC<{ T: number; color: string; x?: number; y?: number; r?: number; id?: string; craters?: boolean }> = ({
  T, color, x = 1380, y = 360, r = 150, id, craters = true,
}) => {
  const uid = id ?? `moon-${color.replace(/[^a-z0-9]/gi, "")}-${Math.round(x)}-${Math.round(y)}-${Math.round(r)}`;
  const breathe = 1 + 0.03 * Math.sin(T * 0.8);
  // colours from a song's theme may not be #rrggbb (rgb(), names): then skip the tints and use the colour as is
  const tint = (a: string, b: string, k: number) => (/^#[0-9a-f]{6}$/i.test(color) ? mix(a, b, k) : color);
  const disk = tint(color, "#fffaf0", 0.62);
  const sea = tint(disk, color, 0.55);
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0.27" stopColor={tint(color, "#ffffff", 0.35)} stopOpacity={0.5} />
          <stop offset="0.36" stopColor={color} stopOpacity={0.2} />
          <stop offset="0.6" stopColor={color} stopOpacity={0.06} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}-disk`} cx="0.4" cy="0.36" r="0.72">
          <stop offset="0" stopColor={tint(disk, "#ffffff", 0.55)} />
          <stop offset="0.6" stopColor={disk} />
          <stop offset="1" stopColor={tint(disk, color, 0.38)} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}><circle cx={x} cy={y} r={r} /></clipPath>
      </defs>
      <circle cx={x} cy={y} r={r * 3.4 * breathe} fill={`url(#${uid}-halo)`} />
      <circle cx={x} cy={y} r={r * 1.6} fill={tint(color, "#ffffff", 0.55)} opacity={0.045} />
      <circle cx={x} cy={y} r={r * 1.26} fill={tint(color, "#ffffff", 0.55)} opacity={0.07} />
      <circle cx={x} cy={y} r={r} fill={`url(#${uid}-disk)`} />
      {craters && (
        <g clipPath={`url(#${uid}-clip)`}>
          {MOON_SEAS.map((m, i) => (
            <ellipse key={`m${i}`} cx={x + m.x * r} cy={y + m.y * r} rx={m.rx * r} ry={m.ry * r} fill={sea} opacity={0.17}
              transform={`rotate(${m.a} ${x + m.x * r} ${y + m.y * r})`} />
          ))}
          {MOON_CRATERS.map((c, i) => (
            <g key={`c${i}`} opacity={0.38}>
              <circle cx={x + c.x * r} cy={y + c.y * r} r={c.r * r} fill={sea} />
              <circle cx={x + (c.x + c.r * 0.28) * r} cy={y + (c.y + c.r * 0.28) * r} r={c.r * r * 0.86} fill={disk} />
            </g>
          ))}
          <circle cx={x + r * 0.16} cy={y + r * 0.16} r={r * 1.06} fill="none" stroke={tint(disk, color, 0.5)} strokeWidth={r * 0.14} opacity={0.22} />
        </g>
      )}
    </g>
  );
};
