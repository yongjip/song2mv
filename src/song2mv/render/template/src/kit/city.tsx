import React from "react";
import { mix } from "./color";
import { rng } from "./math";
import { useSong } from "./song";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

// ── city ─────────────────────────────────────────────────────
type Building = { x: number; w: number; h: number; step: number; roof: number; seed: number; awake: number };
/** A row of buildings; `gap` is the widest space between two. Each building is more or less awake (lit windows) */
function skyline(seed: number, minH: number, maxH: number, minW: number, maxW: number, gap: number): Building[] {
  const r = rng(seed);
  const out: Building[] = [];
  for (let x = -60; x < 1980;) {
    const w = minW + r() * (maxW - minW);
    out.push({ x, w, h: minH + Math.pow(r(), 1.6) * (maxH - minH), step: r() < 0.35 ? 0.12 + r() * 0.2 : 0, roof: Math.floor(r() * 4), seed: Math.floor(r() * 1e6), awake: 0.25 + r() * 1.3 });
    x += w + r() * gap - 4;
  }
  return out;
}
const LAYERS = [
  { depth: 0.35, b: skyline(301, 90, 330, 50, 120, 10), win: 7, lit: 0.2 },
  { depth: 0.65, b: skyline(302, 120, 420, 70, 150, 40), win: 9, lit: 0.24 },
  { depth: 1, b: skyline(303, 150, 470, 100, 200, 140), win: 12, lit: 0.26 },
];

/**
 * A city skyline standing on y (default the bottom edge): three layers of buildings with lit windows that slowly
 * switch on and off, antennas blinking, a glow behind it. `day` draws it in daylight.
 */
export const City: React.FC<{ T: number; y?: number; day?: boolean; shift?: number; glow?: string; sky?: string; scale?: number; id?: string }> = ({
  T, y = 1080, day = false, shift = 0, glow, sky, scale = 1, id = "city",
}) => {
  const { theme } = useSong();
  const haze = glow ?? theme.kinds.mid.glow;
  const skyC = sky ?? (day ? "#9fc4ea" : "#1c2560");
  const bodies = day ? ["#8ea6c9", "#6f86ab", "#4f6488"] : [mix(skyC, theme.bg, 0.35), mix(skyC, theme.bg, 0.62), mix(skyC, theme.bg, 0.86)];
  return (
    <g transform={`translate(0 ${y}) scale(${scale}) translate(0 ${-1080})`}>
      <defs>
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={haze} stopOpacity={0} />
          <stop offset="1" stopColor={haze} stopOpacity={day ? 0.12 : 0.34} />
        </linearGradient>
      </defs>
      <rect x={0} y={1080 - 520} width={1920} height={520} fill={`url(#${id}-haze)`} />
      {LAYERS.map((layer, li) => {
        const off = -(((shift * layer.depth) % 1920) + 1920) % 1920;
        return [0, 1920].map((copy) => (
          <g key={`${li}-${copy}`} transform={`translate(${off + copy} 0)`}>
            {layer.b.map((b, bi) => {
              const top = 1080 - b.h;
              const r = rng(b.seed);
              const cols = Math.max(2, Math.floor(b.w / (layer.win * 2.6))), rows = Math.max(3, Math.floor(b.h / (layer.win * 2.4)));
              const gx = (b.w - 2 * layer.win) / cols, gy = (b.h - 3 * layer.win) / rows;
              return (
                <g key={bi}>
                  {b.step > 0 && <rect x={b.x + b.w * 0.2} y={top - b.h * b.step} width={b.w * 0.6} height={b.h * b.step + 1} fill={bodies[li]} />}
                  <rect x={b.x} y={top} width={b.w} height={b.h} fill={bodies[li]} />
                  {b.roof === 1 && (
                    <>
                      <line x1={b.x + b.w / 2} y1={top - b.h * b.step} x2={b.x + b.w / 2} y2={top - b.h * b.step - 40 * layer.depth} stroke={bodies[li]} strokeWidth={3} />
                      {!day && <circle cx={b.x + b.w / 2} cy={top - b.h * b.step - 40 * layer.depth} r={3 + layer.depth * 2} fill="#ff4d5e" opacity={Math.sin(T * 3 + bi) > 0.3 ? 1 : 0.15} />}
                    </>
                  )}
                  {b.roof === 2 && <rect x={b.x + b.w * 0.6} y={top - 18 * layer.depth} width={b.w * 0.22} height={18 * layer.depth} fill={bodies[li]} />}
                  {Array.from({ length: cols * rows }, (_, k) => {
                    const h1 = r(), h2 = r(), h3 = r();
                    // a few windows switch every few seconds, out of step with each other
                    const flip = h3 < 0.25 && Math.floor(T / (3 + h2 * 5) + h2 * 10) % 3 === 0;
                    const on = (h1 < layer.lit * b.awake) !== flip;
                    if (!on && day) return null;
                    const c = day ? "#d8efff" : h2 < 0.8 ? "#ffd88a" : "#bfe3ff";
                    return (
                      <rect key={k} x={b.x + layer.win + (k % cols) * gx} y={top + 2 * layer.win + Math.floor(k / cols) * gy}
                        width={Math.max(2, gx * 0.45)} height={Math.max(2, gy * 0.42)}
                        fill={on ? c : mix(bodies[li], "#000000", 0.25)} opacity={day ? 0.35 : on ? 0.55 + 0.4 * layer.depth : 0.6} />
                    );
                  })}
                </g>
              );
            })}
          </g>
        ));
      })}
    </g>
  );
};
