import React from "react";
import { rng } from "./math";

/**
 * Objects that carry a song's images. Use inside <Svg> (they use its blur filters). Each is drawn around its own
 * origin, so place it with x/y and size it with s; motion comes from T and stays a pure function of it.
 */

/** A sky lantern: warm paper glowing from a flame that flickers; it sways a little as it floats */
export const Lantern: React.FC<{ x: number; y: number; s?: number; T?: number; glow?: number; sway?: number; opacity?: number }> = ({
  x, y, s = 1, T = 0, glow = 1, sway = 1, opacity = 1,
}) => {
  const dx = 6 * sway * Math.sin(T * 1.1 + x * 0.01), tilt = 3 * sway * Math.sin(T * 0.9 + y * 0.013);
  const fl = 0.85 + 0.15 * Math.sin(T * 13 + x);
  return (
    <g transform={`translate(${x + dx} ${y}) rotate(${tilt}) scale(${s})`} opacity={opacity}>
      <defs>
        <linearGradient id="lantern-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a3c" stopOpacity={0.55} />
          <stop offset="0.6" stopColor="#ffd36b" stopOpacity={0.15} />
          <stop offset="1" stopColor="#fff3c4" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={0} rx={90} ry={110} fill="#ff9a3c" opacity={0.22 * glow} filter="url(#blur-22)" />
      <path d="M -34 -70 Q -40 -10 -30 40 L 30 40 Q 40 -10 34 -70 Q 0 -84 -34 -70 Z" fill="#ffb36b" opacity={0.95} />
      <path d="M -34 -70 Q -40 -10 -30 40 L 30 40 Q 40 -10 34 -70 Q 0 -84 -34 -70 Z" fill="url(#lantern-paper)" />
      <path d="M -12 -74 Q -14 -10 -10 40 M 12 -74 Q 14 -10 10 40" stroke="#ff9a3c" strokeWidth={2} fill="none" opacity={0.5} />
      <path d="M -30 40 L -24 50 L 24 50 L 30 40 Z" fill="#8a4a1e" />
      <ellipse cx={0} cy={44} rx={9 * fl} ry={14 * fl} fill="#fff1c2" opacity={0.95} />
      <ellipse cx={0} cy={38} rx={5 * fl} ry={9 * fl} fill="#fff" />
    </g>
  );
};

/**
 * Many lanterns rising from below the stage from time `from`, n of them, at `speed` px/s (nearer ones bigger,
 * brighter and faster). Before `from` there are none; they keep coming as long as the scene lasts.
 */
export const Lanterns: React.FC<{ T: number; from?: number; n?: number; speed?: number; seed?: number }> = ({ T, from = 0, n = 24, speed = 60, seed = 5 }) => {
  const r = rng(seed);
  const items = Array.from({ length: n }, () => ({ x: r() * 1920, depth: 0.3 + r() * 0.7, delay: r() * 9 }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <g>
      {items.map((l, i) => {
        const t = T - from - l.delay;
        if (t < 0) return null;
        const y = 1180 - ((t * speed * (0.5 + l.depth)) % 1500);
        return <Lantern key={i} x={l.x} y={y} s={0.25 + 0.5 * l.depth} T={T} glow={0.5 + 0.5 * l.depth} opacity={0.5 + 0.5 * l.depth} />;
      })}
    </g>
  );
};
