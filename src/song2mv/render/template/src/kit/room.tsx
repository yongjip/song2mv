import React from "react";
import { INK, mix } from "./color";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

// ── room ─────────────────────────────────────────────────────
/**
 * An interior at night: a wall, a window whose `view` (anything drawn on the 1920×1080 stage, shown through the
 * window) defaults to a night sky with a moon, curtains that stir, a floor and, optionally, a desk with a lamp.
 * Put a Person in front of it. The window is at win {x, y, w, h}.
 */
export const Room: React.FC<{
  T: number; wall?: string; floorY?: number; win?: { x: number; y: number; w: number; h: number }; view?: React.ReactNode;
  curtains?: boolean; desk?: boolean; lamp?: boolean; curtain?: string; id?: string;
}> = ({ T, wall = "#1a1f45", floorY = 900, win = { x: 260, y: 170, w: 620, h: 520 }, view, curtains = true, desk = true, lamp = true, curtain = "#5b2d6e", id = "room" }) => {
  const frame = mix(wall, "#000000", 0.45);
  const sway = 6 * Math.sin(T * 0.9);
  const lampX = 1500, deskY = 720;
  const bottom = win.y + win.h + 70;
  /** a curtain hanging from the rod, its hem stirred by the sway; folds are separate darker lines */
  const cloth = (x0: number, w: number, dir: number) => {
    const s = dir * sway;
    return `M ${x0} ${win.y - 40} L ${x0 + w} ${win.y - 40} Q ${x0 + w + s * 0.6} ${win.y + win.h * 0.5} ${x0 + w + s * 1.4} ${bottom} L ${x0 + s * 1.4} ${bottom} Q ${x0 + s * 0.6} ${win.y + win.h * 0.5} ${x0} ${win.y - 40} Z`;
  };
  const folds = (x0: number, w: number, dir: number) => [1, 2, 3].map((i) => {
    const x = x0 + (i / 4) * w, s = dir * sway;
    return `M ${x} ${win.y - 36} Q ${x + s * 0.6} ${win.y + win.h * 0.5} ${x + s * 1.4} ${bottom - 4}`;
  });
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-spill`} cx={win.x + win.w / 2} cy={win.y + win.h * 0.6} r={900} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={mix(wall, "#7f8fd8", 0.35)} />
          <stop offset="1" stopColor={wall} />
        </radialGradient>
        <clipPath id={`${id}-window`}><rect x={win.x} y={win.y} width={win.w} height={win.h} /></clipPath>
        <radialGradient id={`${id}-lamp`} cx={lampX - 60} cy={deskY} r={420} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd88a" stopOpacity={0.45} />
          <stop offset="1" stopColor="#ffd88a" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={1920} height={floorY} fill={`url(#${id}-spill)`} />
      {lamp && <rect x={0} y={0} width={1920} height={floorY} fill={`url(#${id}-lamp)`} />}
      {/* the view through the window */}
      <g clipPath={`url(#${id}-window)`}>
        {view ?? (
          <>
            <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="#0d1236" />
            <circle cx={win.x + win.w * 0.7} cy={win.y + win.h * 0.3} r={46} fill="#fff1c2" />
            <circle cx={win.x + win.w * 0.7} cy={win.y + win.h * 0.3} r={120} fill="#fff1c2" opacity={0.12} filter="url(#blur-22)" />
          </>
        )}
        <path d={`M ${win.x + win.w * 0.15} ${win.y} L ${win.x + win.w * 0.4} ${win.y} L ${win.x} ${win.y + win.h * 0.55} L ${win.x} ${win.y + win.h * 0.2} Z`} fill="#ffffff" opacity={0.05} />
      </g>
      {/* frame, cross bars and sill */}
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="none" stroke={frame} strokeWidth={22} />
      <line x1={win.x + win.w / 2} y1={win.y} x2={win.x + win.w / 2} y2={win.y + win.h} stroke={frame} strokeWidth={12} />
      <line x1={win.x} y1={win.y + win.h * 0.45} x2={win.x + win.w} y2={win.y + win.h * 0.45} stroke={frame} strokeWidth={12} />
      <rect x={win.x - 36} y={win.y + win.h + 4} width={win.w + 72} height={20} fill={frame} />
      {curtains && (
        <g>
          {[[win.x - 90, -1], [win.x + win.w - 40, 1]].map(([x0, dir]) => (
            <g key={x0}>
              <path d={cloth(x0, 130, dir)} fill={curtain} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
              {folds(x0, 130, dir).map((d, i) => <path key={i} d={d} stroke={mix(curtain, "#000000", 0.3)} strokeWidth={6} fill="none" strokeLinecap="round" />)}
            </g>
          ))}
          <rect x={win.x - 130} y={win.y - 52} width={win.w + 260} height={14} rx={7} fill={frame} />
        </g>
      )}
      {/* floor */}
      <rect x={0} y={floorY} width={1920} height={1080 - floorY} fill={mix(wall, "#000000", 0.55)} />
      <rect x={0} y={floorY - 10} width={1920} height={10} fill={mix(wall, "#000000", 0.3)} />
      {desk && (
        <g>
          <rect x={1180} y={deskY} width={560} height={26} rx={4} fill="#3a2a3f" stroke={INK} strokeWidth={3} />
          <rect x={1210} y={deskY + 26} width={22} height={floorY - deskY - 26} fill="#2a1f30" />
          <rect x={1690} y={deskY + 26} width={22} height={floorY - deskY - 26} fill="#2a1f30" />
          <rect x={1520} y={deskY + 26} width={190} height={110} fill="#33263a" stroke={INK} strokeWidth={2} />
        </g>
      )}
      {desk && lamp && (
        <g>
          <ellipse cx={lampX - 60} cy={deskY + 2} rx={220} ry={22} fill="#ffd88a" opacity={0.18} />
          <ellipse cx={lampX} cy={deskY - 4} rx={40} ry={8} fill="#2a1f30" stroke={INK} strokeWidth={2} />
          <line x1={lampX} y1={deskY - 8} x2={lampX + 30} y2={deskY - 160} stroke="#2a1f30" strokeWidth={8} strokeLinecap="round" />
          <line x1={lampX + 30} y1={deskY - 160} x2={lampX - 40} y2={deskY - 220} stroke="#2a1f30" strokeWidth={8} strokeLinecap="round" />
          <path d={`M ${lampX - 90} ${deskY - 210} L ${lampX - 10} ${deskY - 250} L ${lampX + 10} ${deskY - 205} L ${lampX - 60} ${deskY - 168} Z`} fill="#f2c26b" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <polygon points={`${lampX - 75},${deskY - 188} ${lampX - 5},${deskY - 222} ${lampX + 120},${deskY} ${lampX - 330},${deskY}`} fill="#ffd88a" opacity={0.1} />
        </g>
      )}
    </g>
  );
};
