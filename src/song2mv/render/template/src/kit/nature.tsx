import React from "react";
import { mix } from "./color";
import { rng } from "./math";
import { useSong } from "./song";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

// ── hills ────────────────────────────────────────────────────
const TOWN = (() => {
  const r = rng(131);
  return Array.from({ length: 60 }, (_, i) => ({ x: i * 33 + r() * 20, h: 20 + r() * 90, w: 14 + r() * 26, lit: r() < 0.7 }));
})();

/** Rolling land on y: a near ridge, a far ridge in haze and (optional) a small town's lights in between */
export const Ground: React.FC<{ T?: number; y?: number; town?: boolean; shift?: number; glow?: string; color?: string; far?: string; id?: string }> = ({
  T = 0, y = 900, town = true, shift = 0, glow, color, far, id = "ground",
}) => {
  const { theme } = useSong();
  const g = glow ?? theme.kinds.mid.glow;
  const near = color ?? mix(theme.bg, "#1c2560", 0.25);
  const farC = far ?? mix(theme.bg, "#1c2560", 0.6);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={g} stopOpacity={0} />
          <stop offset="1" stopColor={g} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      <rect x={0} y={y - 260} width={1920} height={260} fill={`url(#${id}-haze)`} />
      <path d={`M -60 ${y - 60} Q 380 ${y - 170} 820 ${y - 90} Q 1260 ${y - 20} 1980 ${y - 140} L 1980 1100 L -60 1100 Z`} fill={farC} transform={`translate(${-shift * 0.4} 0)`} />
      {town && (
        <g transform={`translate(${-shift * 0.55} 0)`} opacity={0.85}>
          {TOWN.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={y - 40 - b.h * 0.6} width={b.w} height={b.h * 0.6 + 40} fill={farC} />
              {b.lit && <rect x={b.x + 4} y={y - 40 - b.h * 0.6 + 8} width={4} height={4} fill="#ffd88a" opacity={0.6 + 0.4 * Math.sin(T * 3 + i)} />}
              {b.lit && <rect x={b.x + b.w - 8} y={y - 40 - b.h * 0.6 + 22} width={4} height={4} fill="#bfe3ff" opacity={0.5 + 0.4 * Math.cos(T * 2 + i)} />}
            </g>
          ))}
        </g>
      )}
      <path d={`M -60 ${y} Q 600 ${y - 80} 960 ${y - 40} Q 1400 ${y} 1980 ${y - 50} L 1980 1100 L -60 1100 Z`} fill={near} transform={`translate(${-shift} 0)`} />
    </g>
  );
};

// ── sea ──────────────────────────────────────────────────────
/**
 * Water from the horizon down: glints moving on rows that crowd towards the horizon, a shimmering path under the
 * light (sun or moon at light.x) and, with `beach`, sand and foam that washes in and out.
 */
export const Sea: React.FC<{
  T: number; horizon?: number; color?: string; deep?: string; light?: { x: number; color: string }; beach?: boolean; sand?: string; seed?: number; id?: string;
}> = ({ T, horizon = 640, color = "#2a3f8a", deep = "#070b24", light, beach = false, sand = "#d9b98a", seed = 51, id = "sea" }) => {
  const r = rng(seed);
  const H = 1080 - horizon;
  const rows = 26;
  const glints = Array.from({ length: rows }, (_, k) => {
    const p = Math.pow((k + 1) / rows, 1.8);
    return { y: horizon + p * H, p, items: Array.from({ length: 5 + Math.floor(r() * 4) }, () => ({ x0: r() * 1920, ph: r() * 6.28, sp: 8 + r() * 14 })) };
  });
  const foam = 950 + 14 * Math.sin(T * 0.8);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1={horizon} x2="0" y2={1080} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <rect x={0} y={horizon} width={1920} height={H} fill={`url(#${id}-water)`} />
      <line x1={0} y1={horizon} x2={1920} y2={horizon} stroke={mix(color, "#ffffff", 0.35)} strokeWidth={2} opacity={0.6} />
      {glints.map((row, k) => row.items.map((g, i) => {
        const len = 10 + 70 * row.p;
        const x = (((g.x0 + g.sp * T * (0.4 + row.p)) % 2000) + 2000) % 2000 - 40;
        return <line key={`${k}-${i}`} x1={x} y1={row.y} x2={x + len} y2={row.y} stroke={mix(color, "#ffffff", 0.5)} strokeWidth={1 + 2 * row.p} strokeLinecap="round" opacity={0.18 + 0.2 * Math.sin(T * 1.7 + g.ph)} />;
      }))}
      {light && glints.map((row, k) => {
        const half = 30 + 260 * row.p;
        return [0, 1, 2].map((j) => {
          const x = light.x + half * Math.sin(T * (1.3 + j * 0.7) + k * 1.9 + j * 2.2);
          const len = 18 + 90 * row.p;
          return <line key={`l${k}-${j}`} x1={x - len / 2} y1={row.y} x2={x + len / 2} y2={row.y} stroke={light.color} strokeWidth={1.5 + 3 * row.p} strokeLinecap="round" opacity={0.35 + 0.35 * (1 - row.p * 0.5)} />;
        });
      })}
      {beach && (
        <>
          <path d={`M -40 ${foam + 10} Q 500 ${foam - 18} 980 ${foam + 4} Q 1460 ${foam + 24} 1960 ${foam - 6} L 1960 1100 L -40 1100 Z`} fill={mix(sand, "#000000", 0.35)} />
          <path d={`M -40 ${foam + 26} Q 500 ${foam} 980 ${foam + 20} Q 1460 ${foam + 40} 1960 ${foam + 10} L 1960 1100 L -40 1100 Z`} fill={sand} />
          <path d={`M -40 ${foam + 10} Q 500 ${foam - 18} 980 ${foam + 4} Q 1460 ${foam + 24} 1960 ${foam - 6}`} stroke="#ffffff" strokeWidth={6} fill="none" opacity={0.75} />
        </>
      )}
    </g>
  );
};
