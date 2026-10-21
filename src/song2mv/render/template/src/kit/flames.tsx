import React from "react";
import { mix } from "./color";
import { clamp01, rng } from "./math";

/**
 * Fire. Use inside <Svg>. Style-neutral: the three flame colours, the number of tongues, how sharp their tips are,
 * flat or shaded fills and the glow are props, so a style pack or a song can redraw it (a flat cartoon or paper
 * look: `flat` with `glow={0}` and its own colours).
 */

const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const frac = (v: number) => v - Math.floor(v);
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
/** mix() that leaves colours it cannot read (rgb(), names) as they are */
const tint = (a: string, b: string, k: number) => (isHex(a) && isHex(b) ? mix(a, b, k) : a);

/**
 * One tongue of flame standing on (bx, y0): half-width a, height h, its tip moved dx sideways. The bottom is round,
 * the sides curl into the tip (the side the tip leans to bulges less), `sharp` 0–1 from a round tip to a needle.
 */
function tongue(bx: number, y0: number, a: number, h: number, dx: number, sharp: number): string {
  const tx = bx + dx, ty = y0 - h;
  const k = 0.06 + 0.3 * (1 - sharp); // how far the handles at the tip reach sideways, × a
  return (
    `M${n1(bx - a)} ${n1(y0)}` +
    `C${n1(bx - a)} ${n1(y0 - h * 0.42)} ${n1(tx - a * k - dx * 0.25)} ${n1(ty + h * 0.32)} ${n1(tx)} ${n1(ty)}` +
    `C${n1(tx + a * k * 0.6)} ${n1(ty + h * 0.4)} ${n1(bx + a * 1.04)} ${n1(y0 - h * 0.36)} ${n1(bx + a)} ${n1(y0)}` +
    `C${n1(bx + a)} ${n1(y0 + a * 0.72)} ${n1(bx - a)} ${n1(y0 + a * 0.72)} ${n1(bx - a)} ${n1(y0)}Z`
  );
}

/** A wavering number in [-1, 1]: a few sines at flame-like rates, its own for every seed */
function waver(T: number, r: () => number): number {
  const f1 = 1.6 + 0.8 * r(), f2 = 3.7 + 1.4 * r(), f3 = 7.1 + 2 * r();
  const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
  return 0.5 * Math.sin(6.283 * f1 * T + p1) + 0.32 * Math.sin(6.283 * f2 * T + p2) + 0.18 * Math.sin(6.283 * f3 * T + p3);
}

/**
 * A fire standing on (x, y): `w` px wide at its base and `h` tall at its highest tongue (default 1.5 × w).
 * - Tongues of flame in three layers (`colors`: outer, middle, core) waver and sway; licks break off the tips and
 *   rise; embers drift up (`embers`, how many); a glow lights the air and, with `ground`, a pool on the ground.
 * - `tongues`: how many (default from the width; 1 makes a candle flame). `sharp` 0–1: round tips to needles.
 * - `flat`: one colour per layer, no gradients; `glow` 0–1 (0: no light around it). For a flat or paper look pass
 *   flat with glow 0 and the style's colours.
 * - `wind` (−1…1) leans the flames and blows the licks and embers sideways; `strength` 0–1 grows or dies the fire.
 * - `seed` changes the flicker; `id` keeps the gradients of two fires apart.
 */
export const Flames: React.FC<{
  T: number; x: number; y: number; w?: number; h?: number; tongues?: number; sharp?: number; colors?: [string, string, string];
  flat?: boolean; glow?: number; ground?: boolean; embers?: number; wind?: number; strength?: number; seed?: number; id?: string;
}> = ({
  T, x, y, w = 160, h, tongues, sharp = 0.55, colors = ["#ff4a2a", "#ff9f2e", "#ffe48a"], flat = false, glow = 1, ground = true,
  embers, wind = 0, strength = 1, seed = 1, id = "flames",
}) => {
  const k = clamp01(strength);
  if (k <= 0) return null;
  const H = (h ?? w * 1.5) * Math.pow(k, 0.7);
  const W = w * (0.6 + 0.4 * k);
  const n = Math.max(1, Math.round(tongues ?? Math.min(7, Math.max(3, w / 48))));
  const [outer, middle, core] = colors;
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const r = rng(seed * 9973 + 5);
  const flick = waver(T, rng(seed * 31 + 7));

  // tongue layout: spread over the base, the middle ones tallest; each wavers and sways on its own
  const tg = Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1 … 1 across the base
    const env = n === 1 ? 1 : Math.pow(Math.cos(u * Math.PI * 0.45), 1.4);
    const tall = 0.3 + 0.7 * env;
    const rr = rng(seed * 101 + i * 37 + 3);
    const wv = waver(T, rr), sw = waver(T * 0.7, rr);
    return {
      bx: x + u * W * 0.3 + (r() - 0.5) * (W / n) * 0.25,
      a: (W / Math.max(1.6, n * 0.55)) * (0.38 + 0.25 * env) * (n === 1 ? 1.1 : 1),
      h: H * tall * (0.82 + 0.18 * wv) * (0.92 + 0.08 * r()),
      dx: H * tall * (0.09 * sw + 0.32 * wind) + u * W * 0.06,
      lick: { period: 0.42 + 0.3 * r(), phase: r(), side: r() - 0.5 },
    };
  });

  // layers, outside in: the middle and core stand a little higher and are narrower; the core only in the middle
  const LAYERS = [
    { c: outer, hk: 1, ak: 1, lift: 0, keep: 1 },
    { c: middle, hk: 0.68, ak: 0.66, lift: 0.04, keep: 1 },
    { c: core, hk: 0.4, ak: 0.42, lift: 0.07, keep: n === 1 ? 1 : 0.65 },
  ];
  const fill = (j: number) => (flat ? LAYERS[j].c : `url(#${gid}-l${j})`);

  const embersN = embers ?? Math.round(w / 22);
  const sparks = Array.from({ length: embersN }, (_, i) => {
    const rr = rng(seed * 577 + i * 53 + 11);
    const period = 1.3 + 1.1 * rr(), ph = rr(), x0 = (rr() - 0.5) * W * 0.6, rise = H * (1.1 + 0.9 * rr()), sz = 1.6 + 2.2 * rr(), sway = rr() * 6.28;
    const u = frac(T / period + ph);
    const yy = y - H * 0.35 - rise * u;
    const xx = x + x0 * (1 - 0.4 * u) + wind * rise * 0.5 * u + 14 * Math.sin(T * 2.3 + sway) * u;
    const o = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.6 + 0.4 * Math.sin(T * 13 + sway));
    return { xx, yy, sz: sz * (1 - 0.5 * u) * Math.sqrt(W / 160), o };
  });

  return (
    <g>
      <defs>
        {glow > 0 && (
          <radialGradient id={`${gid}-glow`}>
            <stop offset="0" stopColor={tint(middle, core, 0.3)} stopOpacity={0.55} />
            <stop offset="0.35" stopColor={middle} stopOpacity={0.2} />
            <stop offset="1" stopColor={outer} stopOpacity={0} />
          </radialGradient>
        )}
        {!flat && LAYERS.map((L, j) => {
          // shaded: each layer hotter at its base, deeper at its tips
          const base = [tint(outer, middle, 0.55), tint(middle, core, 0.55), tint(core, "#ffffff", 0.55)][j];
          const top = [tint(outer, "#8a1030", 0.25), tint(middle, outer, 0.35), core][j];
          return (
            <linearGradient key={j} id={`${gid}-l${j}`} gradientUnits="userSpaceOnUse" x1={0} y1={n1(y)} x2={0} y2={n1(y - H * L.hk)}>
              <stop offset="0" stopColor={base} />
              <stop offset="0.45" stopColor={L.c} />
              <stop offset="1" stopColor={top} />
            </linearGradient>
          );
        })}
      </defs>
      {glow > 0 && (
        <>
          {ground && <ellipse cx={x} cy={n1(y + W * 0.06)} rx={n1(W * 1.5)} ry={n1(W * 0.22)} fill={`url(#${gid}-glow)`} opacity={n2(glow * (0.85 + 0.15 * flick))} />}
          <circle cx={x} cy={n1(y - H * 0.42)} r={n1(H * 1.25)} fill={`url(#${gid}-glow)`} opacity={n2(glow * (0.8 + 0.2 * flick))} />
        </>
      )}
      {LAYERS.map((L, j) => {
        const y0 = y - H * L.lift;
        const mid = (n - 1) / 2;
        const parts: string[] = [];
        // the body the tongues grow out of, so they read as one fire at the base
        if (n > 1) {
          const rx = W * 0.36 * L.ak, ry = H * 0.1 * L.ak;
          // (clockwise, like the tongues: shapes of one path must turn the same way, or their overlaps cut holes)
          parts.push(`M${n1(x - rx)} ${n1(y0 - ry * 0.2)}a${n1(rx)} ${n1(ry)} 0 1 1 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 1 ${n1(-2 * rx)} 0Z`);
        }
        tg.forEach((t, i) => {
          if (n > 1 && Math.abs(i - mid) > mid * L.keep + 0.01) return;
          const bx = x + (t.bx - x) * (0.55 + 0.45 * L.ak);
          parts.push(tongue(bx, y0, t.a * L.ak, t.h * L.hk, t.dx * L.hk, sharp));
          // a lick breaks off the tip, rises and burns out (outer and middle layers)
          if (j < 2) {
            const u = frac(T / t.lick.period + t.lick.phase);
            const s = Math.pow(1 - u, 1.3) * (j ? 0.32 : 0.4);
            if (u < 0.9 && s > 0.02) {
              const lh = t.h * L.hk, la = t.a * L.ak * s;
              const ly = y0 - lh * (0.78 + 0.5 * u), lx = bx + t.dx * L.hk * (1 + 0.6 * u) + t.lick.side * t.a * 0.8 + wind * lh * 0.3 * u;
              parts.push(tongue(lx, ly, la, la * 3.2, la * 0.6 * Math.sign(t.dx || 1), sharp));
            }
          }
        });
        return <path key={j} d={parts.join("")} fill={fill(j)} />;
      })}
      {sparks.map((p, i) => p.o > 0.02 && (
        <g key={i} opacity={n2(p.o)}>
          {glow > 0 && <circle cx={n1(p.xx)} cy={n1(p.yy)} r={n1(p.sz * 2.6)} fill={middle} opacity={0.25} />}
          <circle cx={n1(p.xx)} cy={n1(p.yy)} r={n1(p.sz)} fill={i % 3 ? core : middle} />
        </g>
      ))}
    </g>
  );
};
