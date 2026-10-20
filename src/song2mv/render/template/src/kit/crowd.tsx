import React from "react";
import { shade } from "./color";
import { rng } from "./math";
import { useSong } from "./song";

/** Crowds and far-away people, front-facing. Use inside <Svg> on the 1920×1080 stage. */

/**
 * A small front-facing figure for crowds and far-away people: head, shoulders, two arms. `arms` 0 = down,
 * 1 = straight up; `light` puts a phone light or lighter in the raised hand. Origin at the feet; ~200 px at s = 1.
 */
export const MiniPerson: React.FC<{
  x: number; y: number; s?: number; color?: string; rim?: string; arms?: number; side?: number; light?: string; bob?: number;
}> = ({ x, y, s = 1, color = "#0c1030", rim, arms = 0, side = 1, light, bob = 0 }) => {
  const up = arms;
  const hand = (dir: number): [number, number] => [dir * (40 + 6 * up), -112 - 92 * up];
  const handDown = (dir: number): [number, number] => [dir * 44, -48];
  const [lx, ly] = up > 0 ? hand(-1) : handDown(-1);
  const [rx, ry] = up > 0 ? hand(1) : handDown(1);
  const hold = side > 0 ? [rx, ry] : [lx, ly];
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s})`}>
      <line x1={-26} y1={-118} x2={lx} y2={ly} stroke={color} strokeWidth={15} strokeLinecap="round" />
      <line x1={26} y1={-118} x2={rx} y2={ry} stroke={color} strokeWidth={15} strokeLinecap="round" />
      <path d="M -34 0 Q -40 -70 -32 -112 Q -26 -128 0 -130 Q 26 -128 32 -112 Q 40 -70 34 0 Z" fill={color} />
      <circle cx={0} cy={-158} r={22} fill={color} />
      {rim && <path d="M -18 -172 Q 0 -186 18 -172" stroke={rim} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.8} />}
      {rim && <path d="M -30 -112 Q -24 -124 -6 -128" stroke={rim} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.6} />}
      {light && (
        <g transform={`translate(${hold[0]} ${hold[1] - 10})`}>
          <circle r={26} fill={light} opacity={0.25} filter="url(#blur-10)" />
          <circle r={6} fill="#fff" />
        </g>
      )}
    </g>
  );
};

export type CrowdMode = "idle" | "handsUp" | "jump" | "lights";

/**
 * An audience from behind, three rows from far to near, filling the lower stage. Moves with the beat:
 * `handsUp` bounces raised arms, `jump` hops, `lights` sways phone lights (ballads), `idle` sways a little.
 * `unison` 0–1 lines everyone up on the beat. `cones` adds turning stage lights in the theme's star colours.
 */
export const Crowd: React.FC<{ T: number; mode?: CrowdMode; unison?: number; cones?: boolean; color?: string; seed?: number }> = ({
  T, mode = "handsUp", unison = 0, cones = true, color, seed = 40,
}) => {
  const { grid, theme } = useSong();
  const lights = theme.stars.slice(1).concat(theme.kinds.hot.glow);
  const body = color ?? shade(theme.bg, 1.06);
  const rows = [
    { y: 730, s: 0.6, n: 19 }, { y: 845, s: 0.8, n: 14 }, { y: 985, s: 1.04, n: 10 },
  ].map((row, ri) => {
    const r = rng(seed + ri);
    return { ...row, people: Array.from({ length: row.n }, (_, i) => ({ x: ((i + 0.5) / row.n) * 1920 + (r() - 0.5) * 60, side: r() < 0.5 ? -1 : 1, lag: r() * 0.12, arms: 0.7 + r() * 0.3, size: 0.92 + r() * 0.16, c: lights[Math.floor(r() * lights.length)] })) };
  });
  const id = `crowd-${seed}`;
  return (
    <g>
      <defs>
        {lights.map((c, i) => (
          <linearGradient key={i} id={`${id}-cone${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c} stopOpacity={0.5} />
            <stop offset="1" stopColor={c} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {cones && lights.map((_, i) => {
        const x = ((i + 0.5) / lights.length) * 1920, ang = 18 * Math.sin(T * 1.3 + i * 2.1);
        return (
          <g key={i} transform={`rotate(${ang} ${x} -40)`} opacity={0.55 + 0.35 * grid.pulse(T)}>
            <polygon points={`${x},-40 ${x - 230},1080 ${x + 230},1080`} fill={`url(#${id}-cone${i})`} />
          </g>
        );
      })}
      {rows.map((row, ri) => (
        <g key={ri} opacity={0.75 + 0.1 * ri}>
          {row.people.map((p, i) => {
            const lag = p.lag * (1 - unison);
            const hop = mode === "jump" ? -46 * row.s * grid.pulse(T - lag, 0.22) : 0;
            const bob = mode === "idle" || mode === "lights" ? -4 * row.s * Math.sin(T * 1.6 + i) : -10 * row.s * grid.pulse(T - lag, 0.2) + hop;
            const arms = mode === "handsUp" || mode === "jump" ? p.arms : mode === "lights" ? 0.55 : 0;
            const sway = mode === "lights" ? 10 * Math.sin(T * 1.2 + i * 0.7) : 0;
            return (
              <g key={i} transform={`rotate(${sway * 0.3} ${p.x} ${row.y})`}>
                <MiniPerson x={p.x} y={row.y + 80 * row.s} s={row.s * p.size} color={body} rim={p.c} arms={arms} side={p.side} bob={bob} light={mode === "lights" ? "#fff6d8" : undefined} />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
};
