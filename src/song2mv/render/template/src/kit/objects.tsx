import React from "react";
import { rng } from "./math";

/**
 * Objects that carry a song's images. Use inside <Svg> (they use its blur filters). Each is drawn around its own
 * origin, so place it with x/y and size it with s; motion comes from T and stays a pure function of it.
 */

// ── sky lanterns ─────────────────────────────────────────────
/** The paper bag: a round dome on top, widest at the shoulders, narrowing to the bamboo hoop at the bottom */
const BODY = "M -26 46 C -30 22 -42 -12 -41.5 -44 C -41 -72 -24 -87 0 -87 C 24 -87 41 -72 41.5 -44 C 42 -12 30 22 26 46 A 26 5.5 0 0 1 -26 46 Z";
/** Paper seams: from near the top down to the hoop, bowing out with the paper */
const SEAMS = [-0.68, -0.25, 0.25, 0.68].map((f) => {
  const p = (x: number, y: number) => `${(f * x).toFixed(1)} ${y.toFixed(1)}`;
  return `M ${p(9, -86)} C ${p(32, -85)} ${p(42.5, -66)} ${p(42, -42)} C ${p(41.5, -14)} ${p(30, 22)} ${p(26, 46 + 5.5 * Math.sqrt(1 - f * f))}`;
}).join(" ");
/** Paper tones, flame-side to edge: orange, gold, red */
const PAPER = [
  ["#fff4c6", "#ffd47c", "#ffa24a", "#f06a32", "#d24a2a"],
  ["#fff8d8", "#ffe596", "#ffc25e", "#f5913c", "#dd6c2c"],
  ["#fff0c0", "#ffc46e", "#ff8c44", "#e8552e", "#c33c26"],
];

/** Gradients shared by every lantern with the same id (Lanterns draws them once for all of its lanterns) */
const LanternDefs: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <radialGradient id={`${id}-halo`}>
      <stop offset="0" stopColor="#ffcf7a" stopOpacity={0.62} />
      <stop offset="0.2" stopColor="#ffa24c" stopOpacity={0.34} />
      <stop offset="0.45" stopColor="#ff8436" stopOpacity={0.12} />
      <stop offset="0.75" stopColor="#ff7a2e" stopOpacity={0.035} />
      <stop offset="1" stopColor="#ff7a2e" stopOpacity={0} />
    </radialGradient>
    {PAPER.map((c, i) => (
      <radialGradient key={i} id={`${id}-paper${i}`} cx="0.5" cy="0.86" r="0.84" fx="0.5" fy="0.94">
        {[0, 0.22, 0.5, 0.8, 1].map((o, j) => <stop key={j} offset={o} stopColor={c[j]} />)}
      </radialGradient>
    ))}
    <radialGradient id={`${id}-inner`}>
      <stop offset="0" stopColor="#fffdf0" stopOpacity={0.95} />
      <stop offset="0.45" stopColor="#ffe9a6" stopOpacity={0.55} />
      <stop offset="1" stopColor="#ffd070" stopOpacity={0} />
    </radialGradient>
    <radialGradient id={`${id}-mouth`} cy="0.4">
      <stop offset="0" stopColor="#fff6d0" />
      <stop offset="0.6" stopColor="#ffbf5e" />
      <stop offset="1" stopColor="#e9772f" />
    </radialGradient>
    <linearGradient id={`${id}-flame`} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="#ffffff" />
      <stop offset="0.5" stopColor="#fff2b0" />
      <stop offset="1" stopColor="#ffab40" />
    </linearGradient>
  </defs>
);

/**
 * A sky lantern: a paper bag with seams, glowing warm from the flame that burns in its open bottom (you see the
 * flame's light through the paper and the flame itself in the hoop); it sways a little as it floats. `tone`
 * picks the paper: 0 orange, 1 gold, 2 red. Lanterns pass `defs={false}` because they draw the shared gradients
 * once.
 */
export const Lantern: React.FC<{
  x: number; y: number; s?: number; T?: number; glow?: number; sway?: number; opacity?: number; id?: string; defs?: boolean; tone?: number;
}> = ({ x, y, s = 1, T = 0, glow = 1, sway = 1, opacity = 1, id = "lantern", defs = true, tone = 0 }) => {
  const ph = x * 0.0137 + s * 7.1;
  const dx = sway * (5 * Math.sin(T * 0.8 + ph) + 2 * Math.sin(T * 1.7 + ph * 1.3));
  const tilt = sway * 4 * Math.sin(T * 0.8 + ph - 0.7);
  const fl = 1 + 0.07 * Math.sin(T * 11 + ph * 3) + 0.05 * Math.sin(T * 17.3 + ph);
  const lean = 1.2 * Math.sin(T * 6.3 + ph * 2);
  const detail = s >= 0.45;
  const top = 46 - 24 * fl;
  return (
    <g transform={`translate(${(x + dx).toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(2)}) scale(${s})`} opacity={opacity}>
      {defs && <LanternDefs id={id} />}
      <circle cx={0} cy={-4} r={150} fill={`url(#${id}-halo)`} opacity={glow * (0.9 + 0.1 * fl)} />
      <ellipse cx={0} cy={58} rx={42} ry={20} fill={`url(#${id}-halo)`} opacity={0.6 * glow} />
      <path d={BODY} fill={`url(#${id}-paper${((tone % 3) + 3) % 3})`} />
      <ellipse cx={0} cy={24} rx={24 * fl} ry={22 * fl} fill={`url(#${id}-inner)`} />
      {detail && <path d={SEAMS} fill="none" stroke="#c9582a" strokeWidth={1.5} opacity={0.4} />}
      {detail && <path d={BODY} fill="none" stroke="#c24a26" strokeWidth={1.4} opacity={0.45} />}
      <ellipse cx={0} cy={46} rx={25} ry={5} fill={`url(#${id}-mouth)`} />
      {detail && (
        <>
          <path d="M -25 46 L 25 46 M 0 41.2 L 0 50.8" stroke="#8a4020" strokeWidth={0.9} opacity={0.5} />
          <ellipse cx={0} cy={46} rx={4.5} ry={2} fill="#8a3a18" opacity={0.75} />
        </>
      )}
      <path d={`M 0 ${top.toFixed(1)} C ${(5 + lean).toFixed(1)} ${(top + 9).toFixed(1)} 7 40 4 44.5 Q 0 48 -4 44.5 C -7 40 ${(-5 + lean).toFixed(1)} ${(top + 9).toFixed(1)} 0 ${top.toFixed(1)} Z`}
        fill={`url(#${id}-flame)`} opacity={0.95} />
      {detail && <path d="M -26 46 A 26 5.5 0 0 0 26 46" fill="none" stroke="#8a3d1a" strokeWidth={2.4} opacity={0.8} />}
      {detail && <path d="M -26 46 A 26 5.5 0 0 1 26 46" fill="none" stroke="#b5552a" strokeWidth={2} opacity={0.65} />}
    </g>
  );
};

/**
 * Many lanterns rising from below the stage from time `from`, n of them, at `speed` px/s (nearer ones bigger,
 * brighter and faster), drifting a little with the wind. Before `from` there are none; they keep coming as long
 * as the scene lasts.
 */
export const Lanterns: React.FC<{ T: number; from?: number; n?: number; speed?: number; seed?: number; id?: string }> = ({
  T, from = 0, n = 24, speed = 60, seed = 5, id = "lanterns",
}) => {
  const r = rng(seed);
  const r2 = rng(seed + 101);
  const items = Array.from({ length: n }, () => ({ x: r() * 1920, depth: 0.3 + r() * 0.7, delay: r() * 9, drift: (r2() - 0.5) * 14, tone: [0, 0, 1, 2][Math.floor(r2() * 4)] }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <g>
      <LanternDefs id={id} />
      {items.map((l, i) => {
        const t = T - from - l.delay;
        if (t < 0) return null;
        const v = speed * (0.5 + l.depth);
        const climb = (t * v) % 1500;
        return (
          <Lantern key={i} x={l.x + (l.drift * climb) / v} y={1180 - climb} s={0.25 + 0.5 * l.depth} T={T} glow={0.45 + 0.55 * l.depth}
            opacity={0.55 + 0.45 * l.depth} id={id} defs={false} tone={l.tone} />
        );
      })}
    </g>
  );
};
