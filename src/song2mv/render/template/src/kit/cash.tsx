import React from "react";
import { mix, shade } from "./color";
import { rng } from "./math";

/**
 * Money raining down. Use inside <Svg>. Style-neutral: the notes' colours and size are props, and the notes carry no
 * currency, letters or numbers, only a border, a medallion and a seal, so any style pack or song can recolour them.
 */

const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
const tone = (c: string, k: number) => (isHex(c) ? shade(c, k) : c);
/** A repeatable number in [0, 1) for a few integers: a note's new place on each fall */
const hash = (a: number, b = 0, c = 0) =>
  rng((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0)();

/** A banknote's face, centred, w × h; `ink` draws its border, medallion and seal; the back is plainer */
function Note({ w, h, face, ink, back }: { w: number; h: number; face: string; ink: string; back: boolean }) {
  const r = Math.min(w, h) * 0.06;
  if (back) {
    return (
      <>
        <rect x={n1(-w / 2)} y={n1(-h / 2)} width={n1(w)} height={n1(h)} rx={n1(r)} fill={face} />
        <rect x={n1(-w / 2 + h * 0.1)} y={n1(-h * 0.4)} width={n1(w - h * 0.2)} height={n1(h * 0.8)} rx={n1(r)} fill="none" stroke={ink} strokeWidth={n1(h * 0.03)} opacity={0.6} />
        <ellipse cx={0} cy={0} rx={n1(h * 0.34)} ry={n1(h * 0.28)} fill="none" stroke={ink} strokeWidth={n1(h * 0.05)} opacity={0.7} />
      </>
    );
  }
  return (
    <>
      <rect x={n1(-w / 2)} y={n1(-h / 2)} width={n1(w)} height={n1(h)} rx={n1(r)} fill={face} />
      <rect x={n1(-w / 2 + h * 0.08)} y={n1(-h * 0.42)} width={n1(w - h * 0.16)} height={n1(h * 0.84)} rx={n1(r)} fill="none" stroke={ink} strokeWidth={n1(h * 0.035)} />
      {/* the medallion, right of centre */}
      <ellipse cx={n1(w * 0.18)} cy={0} rx={n1(h * 0.24)} ry={n1(h * 0.3)} fill={mix(face, "#ffffff", 0.35)} stroke={ink} strokeWidth={n1(h * 0.04)} />
      <ellipse cx={n1(w * 0.18)} cy={n1(h * 0.04)} rx={n1(h * 0.1)} ry={n1(h * 0.13)} fill={ink} opacity={0.55} />
      {/* a seal and two bars (no letters) on the left */}
      <circle cx={n1(-w * 0.28)} cy={n1(-h * 0.08)} r={n1(h * 0.14)} fill="none" stroke={ink} strokeWidth={n1(h * 0.04)} />
      <rect x={n1(-w * 0.38)} y={n1(h * 0.16)} width={n1(w * 0.28)} height={n1(h * 0.06)} rx={n1(h * 0.03)} fill={ink} opacity={0.7} />
      <rect x={n1(-w * 0.38)} y={n1(h * 0.27)} width={n1(w * 0.18)} height={n1(h * 0.05)} rx={n1(h * 0.025)} fill={ink} opacity={0.5} />
    </>
  );
}

/**
 * Banknotes falling from time `from`: each tumbles as it falls (it flips over, narrowing to its edge and showing its
 * plainer back, and swings side to side like a falling leaf), nearer ones bigger and faster. At `from` the first ones
 * drop in from above, then they keep coming. `n` how many are in the air; `size` a note's width at its nearest (px);
 * `colors`: [face, ink] (default a green note); `wind` drifts them sideways (px/s); `seed` picks the notes.
 */
export const Cash: React.FC<{
  T: number; from?: number; n?: number; size?: number; colors?: [string, string]; wind?: number; seed?: number;
}> = ({ T, from = 0, n = 40, size = 150, colors = ["#8cc98a", "#2f6b45"], wind = 10, seed = 5 }) => {
  const t0 = T - from;
  if (t0 < 0) return null;
  const [face, ink] = colors;
  const TOP = -120, BOTTOM = 1200;
  const r = rng(seed);
  const notes = Array.from({ length: n }, (_, i) => {
    const z = r();
    const v = (120 + 90 * r()) * (0.6 + 0.6 * z);
    return {
      i, z, x0: r(), v, delay: r() * ((BOTTOM - TOP) / v), sway: (30 + 60 * r()) * (0.6 + 0.6 * z), freq: 0.3 + 0.3 * r(), ph: r() * 6.283,
      flip: (0.6 + 0.9 * r()) * (r() < 0.5 ? -1 : 1), flip0: r() * 6.283, tilt: 18 + 22 * r(), turn: r() * 360,
    };
  }).sort((a, b) => a.z - b.z);
  return (
    <g>
      {notes.map((p) => {
        const t = t0 - p.delay;
        if (t < 0) return null;
        const P = (BOTTOM - TOP) / p.v;
        const cyc = Math.floor(t / P), tt = t - cyc * P;
        const w = size * (0.45 + 0.55 * p.z), h = w * 0.46;
        const wv = 6.283 * p.freq;
        const x = -80 + (cyc === 0 ? p.x0 : hash(p.i, cyc, seed)) * 2080 + p.sway * Math.sin(wv * tt + p.ph) + wind * tt;
        const y = TOP + p.v * tt;
        // a falling leaf: it tips into each swing, and it flips over end to end as it tumbles
        const rot = p.turn + p.tilt * Math.cos(wv * tt + p.ph) + cyc * 47;
        const k = Math.cos(p.flip * 6.283 * tt * 0.5 + p.flip0);
        const back = k < 0;
        const lit = 0.7 + 0.3 * Math.abs(k);
        return (
          <g key={p.i} transform={`translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)}) scale(1 ${n2(Math.max(0.04, Math.abs(k)))})`} opacity={p.z < 0.25 ? 0.75 : 1}>
            <Note w={w} h={h} face={tone(back ? tone(face, 0.86) : face, lit)} ink={tone(ink, lit)} back={back} />
          </g>
        );
      })}
    </g>
  );
};
