import React from "react";
import { mix, shade } from "./color";
import { inOut, outCubic, rng } from "./math";
import { useSong } from "./song";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

const f1 = (v: number) => v.toFixed(1);

// ── hills ────────────────────────────────────────────────────
/** Ridges, trees and the town repeat every P pixels of land, so a scene can pan (`shift`) for as long as it likes */
const P = 3840;

/** A smooth ridge profile (0–1) through random knots, periodic over P */
function profile(seed: number, knots: number) {
  const r = rng(seed);
  const v = Array.from({ length: knots }, () => r());
  return (x: number) => {
    const u = ((((x / P) * knots) % knots) + knots) % knots;
    const i = Math.floor(u), f = u - i;
    const p0 = v[(i + knots - 1) % knots], p1 = v[i], p2 = v[(i + 1) % knots], p3 = v[(i + 2) % knots];
    return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
  };
}

/** Four ridges from far to near: how fast each pans, where it sits above y and how tall its hills are */
const RIDGES = [
  { par: 0.15, base: -150, amp: 120, a: profile(901, 9), b: profile(902, 26) },
  { par: 0.3, base: -102, amp: 96, a: profile(911, 11), b: profile(912, 29) },
  { par: 0.55, base: -55, amp: 74, a: profile(921, 8), b: profile(922, 23) },
  { par: 1, base: 4, amp: 56, a: profile(931, 5), b: profile(932, 17) },
];
const ridgeAt = (k: number, y: number, wx: number) => {
  const L = RIDGES[k];
  return y + L.base - L.amp * (0.72 * L.a(wx) + 0.28 * L.b(wx));
};

type Tree = { x: number; h: number; w: number; kind: number };
/** Groves on the middle ridge (small trees) and the near ridge (bigger ones) */
const GROVES: Record<2 | 3, Tree[]> = (() => {
  const r = rng(941);
  const grove = (n: number, s: number) => {
    const out: Tree[] = [];
    for (let g = 0; g < n; g++) {
      let x = r() * P;
      const count = 3 + Math.floor(r() * 8);
      for (let k = 0; k < count; k++) {
        out.push({ x, h: (13 + r() * 15) * s * (k === 0 || k === count - 1 ? 0.7 : 1), w: (7 + r() * 4) * s, kind: r() < 0.62 ? 0 : 1 });
        x += (5 + r() * 9) * s;
      }
    }
    return out;
  };
  return { 2: grove(9, 1), 3: grove(6, 2.1) };
})();

/** Tufts of grass along the near ridge's crest: a few blades each, leaning a little */
const TUFTS = (() => {
  const r = rng(977);
  return Array.from({ length: 70 }, () => ({ x: r() * P, n: 3 + Math.floor(r() * 4), h: 7 + r() * 10, lean: (r() - 0.5) * 0.8, s: r() * 100 }));
})();

type House = { x: number; w: number; h: number; roof: number; win: { dx: number; dy: number; warm: boolean; ph: number }[] };
/** Two small towns on the middle ridge: low houses at the edges, taller blocks and a spire or two in the middle */
const TOWN: House[] = (() => {
  const r = rng(131);
  const out: House[] = [];
  for (const c of [700, 2650]) {
    const n = 22 + Math.floor(r() * 8);
    let x = c - 260;
    for (let k = 0; k < n; k++) {
      const mid = 1 - Math.abs((k + 0.5) / n - 0.5) * 2;
      const w = 10 + r() * 16;
      const h = 10 + (8 + r() * 42) * (0.35 + 0.65 * mid);
      const roof = r() < 0.12 * mid ? 2 : r() < 0.55 ? 1 : 0;
      const win = [];
      for (let wy = 5; wy < h - 4; wy += 7) for (let wx = 3; wx < w - 4; wx += 6) if (r() < 0.32) win.push({ dx: wx, dy: wy, warm: r() < 0.82, ph: r() * 6.28 });
      out.push({ x, w, h, roof, win });
      x += w * (0.55 + r() * 0.5);
    }
  }
  return out;
})();

const wrap = (x: number) => ((x % P) + P) % P;
/** Stage x of a land point at world x on a layer that pans by `pan` px: one copy, or null when off stage */
const onStage = (wx: number, pan: number, margin = 80) => {
  const sx = wrap(wx - pan + margin) - margin;
  return sx < 1920 + margin ? sx : null;
};

/**
 * Rolling land on y: four ridges that get darker and crisper towards you, haze settling in the valleys between
 * them, a lit rim along each crest, groves of trees (`trees`) and (optional) small towns' lights on the middle
 * ridge. `glow` is the light near the horizon (sunset, a town); `color` the near land, `far` the far land.
 */
export const Ground: React.FC<{
  T?: number; y?: number; town?: boolean; shift?: number; glow?: string; color?: string; far?: string; id?: string; trees?: boolean;
}> = ({ T = 0, y = 900, town = true, shift = 0, glow, color, far, id = "ground", trees = true }) => {
  const { theme } = useSong();
  const g = glow ?? theme.kinds.mid.glow;
  const near = color ?? mix(theme.bg, "#1c2560", 0.25);
  const farC = far ?? mix(theme.bg, "#1c2560", 0.6);
  // crest colour and valley (mist) colour per ridge, far to near: far ridges paler and closer to the air,
  // mist settling at the foot of each one, the near land darkest; the warm glow only tints the mist
  // the air between you and far land scatters blue: far ridges lean towards it, the mist in the valleys too,
  // with a little of the horizon's glow
  const AIR = "#6a78c0";
  const mist = mix(mix(farC, AIR, 0.3), g, 0.12);
  const tops = [mix(farC, AIR, 0.18), farC, mix(farC, near, 0.5), near];
  const lows = [mix(tops[0], mist, 0.75), mix(tops[1], mist, 0.55), mix(tops[2], mist, 0.32), mix(near, theme.bg, 0.3)];
  const lift = shade(farC, 1.45);
  const xs = Array.from({ length: 165 }, (_, i) => -20 + i * 12);
  const crest = (k: number) => xs.map((x) => [x, ridgeAt(k, y, x + shift * RIDGES[k].par)] as const);
  const crests = RIDGES.map((_, k) => crest(k));
  const line = (pts: readonly (readonly [number, number])[]) => pts.map(([x, v]) => `${x} ${f1(v)}`).join(" L ");
  const hi = (k: number) => Math.min(...crests[k].map((p) => p[1]));

  const treesOn = (k: 2 | 3) => {
    const pan = shift * RIDGES[k].par;
    return GROVES[k].map((t, i) => {
      const sx = onStage(t.x, pan);
      if (sx === null) return null;
      const gy = ridgeAt(k, y, sx + pan) + 3;
      if (t.kind === 0) {
        return <path key={i} d={`M ${f1(sx - t.w / 2)} ${f1(gy)} Q ${f1(sx - t.w * 0.16)} ${f1(gy - t.h * 0.42)} ${f1(sx)} ${f1(gy - t.h)} Q ${f1(sx + t.w * 0.16)} ${f1(gy - t.h * 0.42)} ${f1(sx + t.w / 2)} ${f1(gy)} Z`} />;
      }
      return (
        <g key={i}>
          <rect x={sx - t.w * 0.07} y={gy - t.h * 0.4} width={t.w * 0.14} height={t.h * 0.4 + 2} />
          <ellipse cx={sx} cy={gy - t.h * 0.6} rx={t.w * 0.6} ry={t.h * 0.4} />
          <ellipse cx={sx - t.w * 0.25} cy={gy - t.h * 0.48} rx={t.w * 0.38} ry={t.h * 0.27} />
        </g>
      );
    });
  };

  const tuftPan = shift * RIDGES[3].par;
  const tufts = TUFTS.map((t, i) => {
    const sx = onStage(t.x, tuftPan, 30);
    if (sx === null) return null;
    const gy = ridgeAt(3, y, sx + tuftPan) + 2;
    const d = Array.from({ length: t.n }, (_, j) => {
      const bx = sx + (j - (t.n - 1) / 2) * 3.2, h = t.h * (0.6 + 0.4 * Math.sin(j * 2.3 + t.s) ** 2), lean = t.lean + (j - (t.n - 1) / 2) * 0.22;
      return `M ${f1(bx - 1.6)} ${f1(gy)} Q ${f1(bx + lean * h * 0.3)} ${f1(gy - h * 0.6)} ${f1(bx + lean * h)} ${f1(gy - h)} Q ${f1(bx + lean * h * 0.3 + 0.8)} ${f1(gy - h * 0.5)} ${f1(bx + 1.6)} ${f1(gy)} Z`;
    }).join(" ");
    return <path key={i} d={d} />;
  });
  const townPan = shift * RIDGES[2].par;
  const townC = mix(tops[1], tops[2], 0.45);
  return (
    <g>
      <defs>
        {RIDGES.map((_, k) => (
          <linearGradient key={k} id={`${id}-r${k}`} x1="0" y1={hi(k)} x2="0" y2={y + RIDGES[k].base + 40} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={tops[k]} />
            <stop offset="1" stopColor={lows[k]} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={g} stopOpacity={0} />
          <stop offset="1" stopColor={g} stopOpacity={0.28} />
        </linearGradient>
        <radialGradient id={`${id}-townglow`}>
          <stop offset="0" stopColor={mix(g, "#ffe2a8", 0.3)} stopOpacity={0.5} />
          <stop offset="0.45" stopColor={g} stopOpacity={0.16} />
          <stop offset="1" stopColor={g} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* light on the horizon behind the land */}
      <rect x={0} y={hi(0) - 120} width={1920} height={y - hi(0) + 60} fill={`url(#${id}-haze)`} />
      {RIDGES.map((_, k) => (
        <g key={k}>
          {k === 2 && town && (
            <g>
              {[700, 2650].map((c, i) => {
                const sx = onStage(c, townPan, 400);
                return sx === null ? null : <ellipse key={i} cx={sx} cy={ridgeAt(2, y, c) - 10} rx={420} ry={120} fill={`url(#${id}-townglow)`} />;
              })}
              {TOWN.map((b, i) => {
                const sx = onStage(b.x, townPan);
                if (sx === null) return null;
                const gy = ridgeAt(2, y, sx + townPan) + 14;
                const top = gy - b.h - 14;
                const roof = b.roof === 1
                  ? `M ${f1(sx - 1)} ${f1(top)} L ${f1(sx + b.w / 2)} ${f1(top - b.w * 0.45)} L ${f1(sx + b.w + 1)} ${f1(top)} Z`
                  : b.roof === 2 ? `M ${f1(sx + b.w / 2 - 2)} ${f1(top)} L ${f1(sx + b.w / 2)} ${f1(top - b.h * 0.9)} L ${f1(sx + b.w / 2 + 2)} ${f1(top)} Z` : "";
                return (
                  <g key={i}>
                    <rect x={f1(sx)} y={f1(top)} width={f1(b.w)} height={f1(gy - top)} fill={townC} />
                    {roof && <path d={roof} fill={townC} />}
                    {b.win.map((w, j) => (
                      <rect key={j} x={f1(sx + w.dx)} y={f1(top + w.dy)} width={2.6} height={3.4} fill={w.warm ? "#ffd88a" : "#bfe3ff"}
                        opacity={0.55 + 0.4 * Math.sin(T * (w.warm ? 1.3 : 2.1) + w.ph) * (j % 3 === 0 ? 1 : 0.25)} />
                    ))}
                  </g>
                );
              })}
            </g>
          )}
          <path d={`M -20 1100 L ${line(crests[k])} L 1960 1100 Z`} fill={`url(#${id}-r${k})`} />
          <path d={`M ${line(crests[k])}`} fill="none" stroke={mix(lift, g, 0.35)} strokeWidth={1.6} opacity={[0.2, 0.16, 0.13, 0.12][k]} strokeLinejoin="round" />
          {trees && (k === 2 || k === 3) && <g fill={tops[k]}>{treesOn(k)}</g>}
          {k === 3 && <g fill={tops[3]}>{tufts}</g>}
        </g>
      ))}
    </g>
  );
};

// ── sea ──────────────────────────────────────────────────────
/** A thin horizontal shape with pointed ends: a glint, l long and t thick, its belly flatter than its back */
const streak = (x: number, y: number, l: number, t: number) =>
  `M ${f1(x - l / 2)} ${f1(y)} Q ${f1(x)} ${f1(y - t)} ${f1(x + l / 2)} ${f1(y)} Q ${f1(x)} ${f1(y + t * 0.55)} ${f1(x - l / 2)} ${f1(y)} Z`;
/** A wave crest: a thin arch with pointed ends, l long, t high */
const crest = (x: number, y: number, l: number, t: number) =>
  `M ${f1(x - l / 2)} ${f1(y)} Q ${f1(x)} ${f1(y - 2 * t)} ${f1(x + l / 2)} ${f1(y)} Q ${f1(x)} ${f1(y - 0.7 * t)} ${f1(x - l / 2)} ${f1(y)} Z`;

/**
 * Water from the horizon down: rows of wave crests that crowd and shrink towards the horizon, a soft horizon,
 * a glittering path under the light (sun or moon at light.x; `light.w` is its width at the horizon) that is solid
 * far away and breaks into separate ripples near you and, with `beach`, wet and dry sand where foam washes in and
 * out (`shore` is the waterline's y).
 */
export const Sea: React.FC<{
  T: number; horizon?: number; color?: string; deep?: string; light?: { x: number; color: string; w?: number }; beach?: boolean; sand?: string;
  seed?: number; id?: string; shore?: number;
}> = ({ T, horizon = 640, color = "#2a3f8a", deep = "#070b24", light, beach = false, sand = "#d9b98a", seed = 51, id = "sea", shore }) => {
  const S = shore ?? Math.round(horizon + 0.705 * (1080 - horizon));
  const end = beach ? S + 6 : 1080;
  const D = end - horizon;
  const sky = light?.color ?? mix(color, "#ffffff", 0.55);
  const hz = mix(color, sky, 0.4);
  const r = rng(seed);

  // wave crests on perspective rows (p: 0 at the horizon, 1 at the near edge)
  const rows = Array.from({ length: 26 }, (_, i) => {
    const t = (i + 0.8) / 26, p = t * t;
    return {
      y: horizon + 2 + p * (D - 8), p,
      items: Array.from({ length: Math.round(6 + 8 * (1 - p)) }, () => ({ x0: r() * 2240, len: 0.55 + r() * 0.9, ph: r() * 6.28, v: 0.6 + r() * 0.8 })),
    };
  });
  // broad swells: soft wavy bands, lighter and darker by turns, wider and further apart towards you
  const swells = Array.from({ length: 8 }, (_, k) => {
    const p = Math.pow((k + 0.6) / 8, 1.7);
    const y = horizon + 4 + p * (D - 10), th = 3 + 30 * p, amp = 0.8 + 6 * p, f = 0.004 + 0.012 * (1 - p), ph = r() * 6.28;
    const xs = Array.from({ length: 51 }, (_, i) => -40 + i * 40);
    const edge = (off: number, sgn: number) => xs.map((x) => `${x} ${f1(y + sgn * th / 2 + amp * Math.sin(x * f + ph + off + T * 0.35))}`);
    const top = edge(0, -1), bot = edge(1.3, 1).reverse();
    return { d: `M ${top.join(" L ")} L ${bot.join(" L ")} Z`, light: k % 2 === 0, p };
  });
  // the glitter path: rows of glints, long and overlapping at the horizon, short and scattered near you
  const lw = light?.w ?? 230;
  const glints = Array.from({ length: 58 }, (_, i) => {
    const t = (i + 0.5) / 58, p = Math.pow(t, 1.6);
    const half = lw * 0.5 + 230 * p;
    const m = 1 + Math.floor(p * 7 + r() * 1.4);
    const cover = 1 - 0.7 * p;
    return {
      y: horizon + 1 + p * (D - 8) + (r() - 0.5) * 3 * p, p, half, off: (r() - 0.5) * 0.25,
      items: Array.from({ length: m }, () => ({ u: (r() + r() + r()) / 1.5 - 1, len: ((0.55 + r() * 0.9) * 2 * half * cover) / m, ph: r() * 6.28, f: 0.7 + r() * 1.3 })),
    };
  });

  const crestC = mix(color, sky, 0.55), troughC = mix(deep, "#000000", 0.2);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1={horizon} x2="0" y2={1080} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={hz} />
          <stop offset="0.05" stopColor={mix(color, hz, 0.4)} />
          <stop offset="0.3" stopColor={color} />
          <stop offset="0.72" stopColor={mix(color, deep, 0.7)} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <linearGradient id={`${id}-horizon`} x1="0" y1={horizon - 2} x2="0" y2={horizon + 12} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={mix(hz, sky, 0.5)} stopOpacity={0} />
          <stop offset="0.2" stopColor={mix(hz, sky, 0.5)} stopOpacity={0.3} />
          <stop offset="1" stopColor={mix(hz, sky, 0.5)} stopOpacity={0} />
        </linearGradient>
        {beach && (
          <linearGradient id={`${id}-shallow`} x1="0" y1={S - 70} x2="0" y2={S} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={mix(color, sand, 0.4)} stopOpacity={0} />
            <stop offset="1" stopColor={mix(color, sand, 0.4)} stopOpacity={0.4} />
          </linearGradient>
        )}
        {light && (
          <>
            <radialGradient id={`${id}-path`}>
              <stop offset="0" stopColor={light.color} stopOpacity={0.45} />
              <stop offset="0.35" stopColor={light.color} stopOpacity={0.16} />
              <stop offset="1" stopColor={light.color} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${id}-core`}>
              <stop offset="0" stopColor={mix(light.color, "#ffffff", 0.55)} stopOpacity={0.85} />
              <stop offset="0.4" stopColor={light.color} stopOpacity={0.45} />
              <stop offset="1" stopColor={light.color} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${id}-spot`}>
              <stop offset="0" stopColor={mix(light.color, "#ffffff", 0.7)} stopOpacity={1} />
              <stop offset="0.45" stopColor={light.color} stopOpacity={0.55} />
              <stop offset="1" stopColor={light.color} stopOpacity={0} />
            </radialGradient>
            <clipPath id={`${id}-below`}><rect x={-10} y={horizon} width={1940} height={1080 - horizon + 10} /></clipPath>
          </>
        )}
      </defs>
      <rect x={0} y={horizon} width={1920} height={1080 - horizon} fill={`url(#${id}-water)`} />
      {beach && <rect x={0} y={S - 70} width={1920} height={76} fill={`url(#${id}-shallow)`} />}
      {swells.map((b, k) => <path key={`s${k}`} d={b.d} fill={b.light ? crestC : troughC} opacity={b.light ? 0.07 + 0.04 * b.p : 0.08 + 0.05 * b.p} />)}

      {rows.map((row, k) => row.items.map((w, i) => {
        const l = (8 + 150 * row.p) * w.len, t = 0.6 + 3.2 * row.p;
        const x = ((((w.x0 + T * (5 + 16 * row.p) * w.v) % 2240) + 2240) % 2240) - 160;
        const o = (0.22 + 0.4 * row.p) * (0.7 + 0.3 * Math.sin(T * 0.9 + w.ph));
        return (
          <g key={`w${k}-${i}`}>
            {row.p > 0.2 && <path d={streak(x, row.y + t * 0.5, l * 1.15, t * 1.4)} fill={crestC} opacity={0.1 * row.p} />}
            {row.p > 0.2 && <path d={streak(x + l * 0.05, row.y + t * 1.8, l * 0.9, t * 0.9)} fill={troughC} opacity={0.12 * row.p} />}
            <path d={crest(x, row.y, l, t)} fill={crestC} opacity={o} />
          </g>
        );
      }))}

      <rect x={0} y={horizon - 2} width={1920} height={14} fill={`url(#${id}-horizon)`} />

      {light && (
        <g clipPath={`url(#${id}-below)`}>
          <ellipse cx={light.x} cy={horizon} rx={lw * 1.35} ry={D * 1.05} fill={`url(#${id}-path)`} />
          <ellipse cx={light.x} cy={horizon} rx={lw * 0.62} ry={D * 0.5} fill={`url(#${id}-core)`} />
          {glints.map((row, k) => row.items.map((g, i) => {
            const u = g.u + row.off + 0.07 * Math.sin(T * g.f + g.ph);
            const flick = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(T * g.f * 1.9 + g.ph * 2));
            const o = Math.max(0, 1 - 0.65 * u * u) * (1 - 0.3 * row.p) * flick;
            const c = mix(light.color, "#fff8e4", 0.6 * (1 - Math.abs(u)) * (1 - row.p * 0.5));
            return <path key={`g${k}-${i}`} d={streak(light.x + row.half * u, row.y, g.len, 1.4 + 3.4 * row.p)} fill={c} opacity={o} />;
          }))}
          <ellipse cx={light.x} cy={horizon} rx={lw * 3.4} ry={4} fill={`url(#${id}-spot)`} opacity={0.6} />
          <ellipse cx={light.x} cy={horizon} rx={lw * 1.1} ry={9} fill={`url(#${id}-spot)`} />
        </g>
      )}

      {beach && <Beach T={T} S={S} sand={sand} sky={sky} water={color} deep={deep} light={light} lw={lw} id={id} />}
    </g>
  );
};

/** The sand under a sea: wet near the water (a mirror for the sky), dry above, foam running up and back */
const Beach: React.FC<{
  T: number; S: number; sand: string; sky: string; water: string; deep: string; light?: { x: number; color: string }; lw: number; id: string;
}> = ({ T, S, sand, sky, water, deep, light, lw, id }) => {
  const xs = Array.from({ length: 101 }, (_, i) => -40 + i * 20);
  // the swash: runs up fast, slides back slowly, every 7 s
  const ph = ((T / 7) % 1 + 1) % 1;
  const run = ph < 0.3 ? outCubic(ph / 0.3) : 1 - inOut((ph - 0.3) / 0.7);
  const washY = (x: number) => S + 2 + 22 * run + 4 * Math.sin(x * 0.0062 + 0.9 + T * 0.21) + 2.5 * Math.sin(x * 0.019 + 2.3 - T * 0.4);
  const dryY = (x: number) => S + 40 + 4 * Math.sin(x * 0.0041 + 1.3) + 2 * Math.sin(x * 0.0133 + 0.4);
  const wetY = (x: number) => S - 2 + 1.5 * Math.sin(x * 0.01 + 0.5);
  /** the lacy top of the foam band: lumpy, never the same twice along the shore */
  const laceTop = (x: number) => washY(x) - 4 - 3.2 * (0.5 + 0.5 * Math.sin(x * 0.047 + 1.1)) - 2.4 * (0.5 + 0.5 * Math.sin(x * 0.113 + T * 0.6));
  const line = (f: (x: number) => number) => xs.map((x) => `${x} ${f1(f(x))}`).join(" L ");
  const lineBack = (f: (x: number) => number) => [...xs].reverse().map((x) => `${x} ${f1(f(x))}`).join(" L ");

  const wet = mix(shade(sand, 0.55), water, 0.32);
  const foam = mix("#ffffff", sky, 0.14);
  const sheet = mix(water, sky, 0.32);
  const r = rng(77);
  const lace = Array.from({ length: 150 }, () => ({ x: r() * 2000 - 40, s: 1.2 + r() * 3.2, dy: r(), hole: r() < 0.4 }));
  const patches = Array.from({ length: 14 }, () => ({ x: r() * 1960 - 20, dy: 0.25 + r() * 0.5, w: 30 + r() * 70, n: 4 + Math.floor(r() * 5), s: r() * 100 }));
  const specks = Array.from({ length: 190 }, () => ({ x: r() * 1920, v: r(), s: r(), dark: r() < 0.55 }));
  const ripples = Array.from({ length: 12 }, () => ({ x: r() * 1920, v: r(), l: 60 + r() * 120 }));
  const gloss = Array.from({ length: 16 }, () => ({ x: r() * 1920, v: r(), l: 40 + r() * 110 }));
  const strands = Array.from({ length: 26 }, (_, i) => ({ x: (i + r()) * 78 - 20, l: 18 + r() * 60 }));
  const breaker: { x: number; l: number; t: number; o: number }[] = [];
  for (let x = -30; x < 1960;) {
    const l = 24 + r() * 90;
    breaker.push({ x: x + l / 2, l, t: r() * 1.2, o: 0.6 + 0.4 * r() });
    x += l + 6 + r() * 34;
  }
  // the breaker: a line of foam riding in towards the shore before the swash
  const q = ph > 0.55 ? (ph - 0.55) / 0.45 : -1;
  const by = (x: number) => S - 44 + 40 * q + 3 * Math.sin(x * 0.008 + 1.7);

  return (
    <g>
      <defs>
        <linearGradient id={`${id}-wet`} x1="0" y1={S} x2="0" y2={S + 44} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={mix(wet, sky, 0.55)} />
          <stop offset="0.5" stopColor={mix(wet, sky, 0.3)} />
          <stop offset="1" stopColor={mix(wet, sand, 0.4)} />
        </linearGradient>
        <linearGradient id={`${id}-dry`} x1="0" y1={S + 34} x2="0" y2={1080} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={mix(sand, wet, 0.3)} />
          <stop offset="0.07" stopColor={mix(sand, sky, 0.16)} />
          <stop offset="1" stopColor={mix(shade(sand, 0.84), water, 0.24)} />
        </linearGradient>
        <linearGradient id={`${id}-sheet`} x1="0" y1={S - 16} x2="0" y2={S + 26} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={sheet} stopOpacity={0} />
          <stop offset="0.3" stopColor={sheet} stopOpacity={0.85} />
          <stop offset="1" stopColor={sheet} stopOpacity={0.4} />
        </linearGradient>
        {light && (
          <radialGradient id={`${id}-sheen`}>
            <stop offset="0" stopColor={mix(light.color, "#ffffff", 0.3)} stopOpacity={0.6} />
            <stop offset="1" stopColor={light.color} stopOpacity={0} />
          </radialGradient>
        )}
      </defs>
      {/* wet sand with the sky's light on it, then the dry sand over it */}
      <path d={`M ${line(wetY)} L 1960 1090 L -40 1090 Z`} fill={`url(#${id}-wet)`} />
      {light && <ellipse cx={light.x} cy={S + 18} rx={lw * 1.1} ry={30} fill={`url(#${id}-sheen)`} />}
      {gloss.map((p, i) => <path key={`gl${i}`} d={streak(p.x, S + 12 + p.v * 24, p.l, 1.3)} fill={mix(sky, "#ffffff", 0.3)} opacity={0.22} />)}
      <path d={`M ${line(dryY)} L 1960 1090 L -40 1090 Z`} fill={`url(#${id}-dry)`} />
      {ripples.map((p, i) => {
        const y = S + 64 + p.v * (1080 - S - 70), k = (y - S) / (1080 - S);
        return <path key={`r${i}`} d={streak(p.x, y, p.l * (0.6 + k), 1.4 + 2 * k)} fill={shade(sand, 0.84)} opacity={0.35} />;
      })}
      {specks.map((p, i) => {
        const y = S + 46 + p.v * (1080 - S - 48), k = (y - S) / (1080 - S);
        return <circle key={`s${i}`} cx={p.x} cy={y} r={(0.6 + 1.5 * p.s) * (0.5 + k)} fill={p.dark ? shade(sand, 0.74) : mix(sand, "#ffffff", 0.5)} opacity={0.4} />;
      })}

      {/* foam left on the sand by the last wave, fading as the water slides back */}
      <g fill={foam} opacity={0.3 * (1 - run * 0.5)}>
        {strands.map((f, i) => <path key={`f${i}`} d={streak(f.x, washY(f.x) + 8 + 6 * (1 - run) + 3 * Math.sin(f.x * 0.009), f.l, 1.6)} />)}
      </g>
      {/* the swash: a thin sheet of water over the wet sand, laced with foam at its edge */}
      <path d={`M -40 ${S - 16} L 1960 ${S - 16} L ${lineBack(washY)} Z`} fill={`url(#${id}-sheet)`} />
      {patches.map((p, i) => {
        const y0 = S - 4 + (washY(p.x) - S) * p.dy;
        return (
          <g key={`p${i}`} fill={foam} opacity={0.45}>
            {Array.from({ length: p.n }, (_, j) => {
              const u = j / (p.n - 1) - 0.5;
              return <ellipse key={j} cx={p.x + u * p.w} cy={y0 + 2 * Math.sin(j * 2.1 + p.s)} rx={3 + 4 * (0.5 + 0.5 * Math.sin(j * 1.7 + p.s))} ry={1.4} />;
            })}
          </g>
        );
      })}
      <path d={`M ${line(laceTop)} L ${lineBack(washY)} Z`} fill={foam} opacity={0.95} />
      {lace.map((b, i) => {
        const y = laceTop(b.x) + (washY(b.x) - laceTop(b.x)) * 0.5 - b.dy * 9;
        return b.hole
          ? <ellipse key={`l${i}`} cx={b.x} cy={y + 4} rx={b.s * 1.1} ry={b.s * 0.42} fill={sheet} opacity={0.75} />
          : <ellipse key={`l${i}`} cx={b.x} cy={y} rx={b.s * 1.5} ry={b.s * 0.65} fill={foam} opacity={0.9 - b.dy * 0.55} />;
      })}
      <path d={`M ${line((x) => washY(x) + 1.2)}`} fill="none" stroke={mix(wet, "#000000", 0.15)} strokeWidth={1.2} opacity={0.35} />
      {q >= 0 && (
        <g opacity={Math.sin(Math.PI * q) * 0.85}>
          <path d={`M ${line((x) => by(x) + 4)}`} fill="none" stroke={mix(deep, water, 0.4)} strokeWidth={5} opacity={0.4} />
          <g fill={foam}>{breaker.map((b, i) => <path key={`b${i}`} d={crest(b.x, by(b.x), b.l, 1.4 + b.t)} opacity={b.o} />)}</g>
        </g>
      )}
    </g>
  );
};
