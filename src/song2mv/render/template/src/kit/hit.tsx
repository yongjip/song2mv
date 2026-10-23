import React, { useContext } from "react";
import { mix } from "./color";
import { clamp01, outCubic, outExpo, rng } from "./math";
import { DEFAULT_THEME, SongContext } from "./song";

/**
 * A hit at a point: what lands on a kick, a slam, a word or a camera punch. Use inside <Svg>. It is style-neutral:
 * colours, the sparkle shape, the line caps and the glow are props, so a style pack or a song can redraw it (a flat
 * look: `glow={0}`, `cap="butt"`, `shape="diamond"`).
 */

const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
/** mix() that leaves colours it cannot read (rgb(), names) as they are */
const tint = (a: string, b: string, k: number) => (isHex(a) && isHex(b) ? mix(a, b, k) : a);

export type HitKind = "burst" | "sparkle" | "ring";
export type SparkShape = "star" | "diamond" | "dot" | "plus";

/** A sparkle of radius 1 at 0 0, pointing up */
const SPARK: Record<SparkShape, string> = {
  // four points with concave sides (a twinkle)
  star: "M0 -1C0.09 -0.24 0.24 -0.09 1 0C0.24 0.09 0.09 0.24 0 1C-0.09 0.24 -0.24 0.09 -1 0C-0.24 -0.09 -0.09 -0.24 0 -1Z",
  diamond: "M0 -1L0.5 0L0 1L-0.5 0Z",
  dot: "M-0.6 0a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0Z",
  plus: "M-0.16 -1H0.16V-0.16H1V0.16H0.16V1H-0.16V0.16H-1V-0.16H-0.16Z",
};

/** How long each kind lasts (s), and what it is made of when the props leave it open */
const KINDS: Record<HitKind, { life: number; ring: number; rays: number; sparks: number; flash: boolean }> = {
  burst: { life: 0.55, ring: 1, rays: 12, sparks: 5, flash: true },
  sparkle: { life: 1.1, ring: 0, rays: 0, sparks: 7, flash: false },
  ring: { life: 0.75, ring: 3, rays: 0, sparks: 0, flash: true },
};

/**
 * A hit at (x, y) at song time `t` (or at each of several times), `size` px in radius when fully open.
 * - `kind` "burst": a flash, a shock ring and lines thrown out, with a few sparkles: a punch, a slam, a kick.
 *   "sparkle": twinkles appearing one after another around the point: something shining, magic, a glint.
 *   "ring": rings rippling out from a flash: a pulse, a drop, a ping.
 * - `ring`, `rays` and `sparks` override how many rings, lines and sparkles the kind draws (0 leaves them out).
 * - `color` the lines and rings, `accent` every other line and the inner ring, `core` the flash and the sparkles'
 *   hearts. Default: the song theme's glows.
 * - `shape` of the sparkles: "star" (four points), "diamond", "dot", "plus". `cap` of the lines: "round" or "butt".
 * - `glow` 0–1: soft light around the flash and the sparkles; 0 is flat (no gradients, for flat and paper looks).
 * - `life` how long it takes, in s (the kind's default: burst 0.55, sparkle 1.1, ring 0.75); `seed` turns the pattern.
 * - `id` keeps the gradients of two hits apart.
 */
export const Hit: React.FC<{
  T: number; t: number | number[]; x: number; y: number; size?: number; kind?: HitKind;
  ring?: number; rays?: number; sparks?: number; color?: string; accent?: string; core?: string;
  shape?: SparkShape; cap?: "round" | "butt"; glow?: number; life?: number; seed?: number; id?: string;
}> = ({ T, t, x, y, size = 120, kind = "burst", ring, rays, sparks, color, accent, core = "#ffffff", shape = "star", cap = "round", glow = 1, life, seed = 1, id = "hit" }) => {
  const theme = useContext(SongContext)?.theme ?? DEFAULT_THEME;
  const K = KINDS[kind];
  const L = Math.max(0.05, life ?? K.life);
  const main = color ?? theme.kinds.calm.glow;
  const acc = accent ?? theme.stars[1] ?? main;
  const nRing = ring ?? K.ring, nRays = rays ?? K.rays, nSparks = sparks ?? K.sparks;
  const S = size;
  const times = (Array.isArray(t) ? t : [t]).map((v, i) => [v, i] as const).filter(([v]) => T >= v && T < v + L);
  if (!times.length) return null;
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <g>
      {glow > 0 && (
        <defs>
          <radialGradient id={`${gid}-glow`}>
            <stop offset="0" stopColor={tint(core, main, 0.15)} stopOpacity={0.9} />
            <stop offset="0.3" stopColor={main} stopOpacity={0.45} />
            <stop offset="1" stopColor={main} stopOpacity={0} />
          </radialGradient>
        </defs>
      )}
      {times.map(([t0, idx]) => {
        const age = T - t0, u = age / L;
        // every random choice is drawn up front, so a part ending never shifts the parts after it
        const r = rng(seed * 7919 + idx * 104729 + 17);
        const turn = r() * Math.PI * 2;
        const lines = Array.from({ length: nRays }, (_, k) => ({ a: turn + ((k + (r() - 0.5) * 0.6) / nRays) * Math.PI * 2, len: k % 2 ? 0.55 + 0.15 * r() : 0.85 + 0.25 * r() }));
        const stars = Array.from({ length: nSparks }, () => ({ a: r(), d: r(), z: r(), t: r(), l: r(), spin: r() - 0.5 }));
        const out: React.ReactNode[] = [];
        const twinkle = kind === "sparkle";

        // the flash: full on the hit's frame, gone within 0.16 s; its glow lingers a little longer
        if (K.flash) {
          const f = clamp01(age / 0.16);
          const gl = 1 - clamp01(age / (L * 0.5));
          if (glow > 0 && gl > 0) out.push(<circle key="g" cx={x} cy={y} r={n1(S * (0.75 + 0.35 * outCubic(u)))} fill={`url(#${gid}-glow)`} opacity={n2(glow * gl * gl)} />);
          if (f < 1) {
            const R = S * (kind === "ring" ? 0.3 : 0.42) * Math.pow(1 - f, 0.8);
            out.push(<circle key="f0" cx={x} cy={y} r={n1(R * 1.2)} fill={main} />, <circle key="f1" cx={x} cy={y} r={n1(R)} fill={core} />);
          }
        }

        // rings: thin out as they open; extra rings follow later and smaller (a ripple)
        for (let k = 0; k < nRing; k++) {
          const d = 0.015 + k * (kind === "ring" ? 0.12 : 0.07);
          const v = clamp01((age - d) / (L * (kind === "ring" ? 0.85 : 0.75) - d));
          if (v <= 0 || v >= 1) continue;
          // a burst's ring stays inside its lines; a ripple's rings open wide
          const R = S * (0.25 + (kind === "ring" ? 0.9 - 0.14 * k : 0.6) * outCubic(v));
          const w = S * (k ? 0.045 : 0.085) * Math.pow(1 - v, 1.2);
          out.push(<circle key={`r${k}`} cx={x} cy={y} r={n1(R)} fill="none" stroke={k % 2 ? acc : main} strokeWidth={n1(Math.max(0.3, w))} opacity={n2(Math.min(1, (1 - v) * 3))} />);
        }

        // lines thrown out past the ring: the outer end shoots out, the inner end catches up, and the line is gone
        const head = outExpo(clamp01(age / (L * 0.45)));
        const tail = outCubic(clamp01((age - L * 0.12) / (L * 0.6)));
        lines.forEach(({ a, len }, k) => {
          const r0 = S * (0.5 + 0.95 * len * tail), r1 = S * (0.5 + 0.95 * len * head);
          if (r1 - r0 < 0.5) return;
          const c = Math.cos(a), s = Math.sin(a);
          out.push(
            <line key={`l${k}`} x1={n1(x + c * r0)} y1={n1(y + s * r0)} x2={n1(x + c * r1)} y2={n1(y + s * r1)}
              stroke={k % 2 ? acc : main} strokeWidth={n1(S * 0.06 * (k % 2 ? 0.7 : 1) * (1 - 0.6 * tail))} strokeLinecap={cap} />,
          );
        });

        // sparkles: each pops (grows, holds a moment, shrinks) while it drifts out, turning a little. A sparkle hit
        // opens with one big glint in the middle (with long thin flares), then smaller ones come and go around it
        stars.forEach((p, k) => {
          const big = twinkle && k === 0;
          const a = twinkle ? p.a * Math.PI * 2 : turn + ((k + 0.5 + (p.a - 0.5) * 0.5) / nSparks) * Math.PI * 2;
          const d0 = big ? 0 : twinkle ? S * (0.42 + 0.55 * p.d) : S * (0.7 + 0.25 * p.d);
          const d1 = big ? 0 : twinkle ? d0 * 1.1 : S * (1.15 + 0.4 * p.d);
          const start = big ? 0 : twinkle ? 0.1 * L + ((k - 1) / Math.max(1, nSparks - 1)) * L * 0.5 : L * 0.05 * p.t;
          const dur = big ? L * 0.62 : twinkle ? L * (0.32 + 0.14 * p.l) : L * (0.62 + 0.3 * p.l);
          const v = (age - start) / dur;
          if (v <= 0 || v >= 1) return;
          const pop = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 1.1);
          const sz = S * (big ? 0.34 : twinkle ? 0.12 + 0.11 * p.z : 0.11 + 0.08 * p.z) * pop;
          if (sz < 0.4) return;
          const dist = d0 + (d1 - d0) * outCubic(v);
          const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist;
          const spin = (big ? 12 : p.spin * 60) * v;
          const col = k % 3 === 2 ? acc : main;
          out.push(
            <g key={`s${k}`} transform={`translate(${n1(px)} ${n1(py)}) rotate(${n1(spin)})`}>
              {glow > 0 && <circle r={n1(sz * (big ? 2.2 : 1.6))} fill={`url(#${gid}-glow)`} opacity={n2(glow * 0.85)} />}
              {big && (
                <path d={`M${n1(-sz * 3.2)} 0L0 ${n1(-sz * 0.05)}L${n1(sz * 3.2)} 0L0 ${n1(sz * 0.05)}ZM0 ${n1(-sz * 2.4)}L${n1(sz * 0.05)} 0L0 ${n1(sz * 2.4)}L${n1(-sz * 0.05)} 0Z`}
                  fill={core} opacity={0.8} />
              )}
              <path d={SPARK[shape]} transform={`scale(${n2(sz)})`} fill={col} />
              {shape !== "dot" && <path d={SPARK[shape]} transform={`scale(${n2(sz * 0.45)})`} fill={core} />}
            </g>,
          );
        });
        return <g key={idx}>{out}</g>;
      })}
    </g>
  );
};
