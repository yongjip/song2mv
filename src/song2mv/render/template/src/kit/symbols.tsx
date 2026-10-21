import React from "react";
import { mix, shade } from "./color";
import { clamp01, outBack } from "./math";
import { useSong } from "./song";

/**
 * Symbols songs lean on: time and love. Use inside <Svg> on the 1920×1080 stage (they use its blur filters); each is
 * drawn around its centre, lit from the upper left like the rest of the kit.
 */

const f1 = (v: number) => v.toFixed(1);
const HEX = /^#[0-9a-f]{6}$/i;
/** mix/shade only read #rrggbb: any other colour (rgb(), a name) is used as it is */
const toward = (c: string, to: string, k: number) => (HEX.test(c) ? mix(c, to, k) : c);
const deep = (c: string, k: number) => (HEX.test(c) ? shade(c, k) : c);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
type Pt = [number, number];
/** the point at angle a (degrees clockwise from 12 o'clock), distance d from the centre */
const pol = (a: number, d: number): Pt => [d * Math.sin((a * Math.PI) / 180), -d * Math.cos((a * Math.PI) / 180)];
const poly = (p: Pt[]) => `M ${p.map(([a, b]) => `${f1(a)} ${f1(b)}`).join(" L ")} Z`;
/** the light comes from the upper left: this unit vector points towards it */
const LIGHT: Pt = [-0.6, -0.8];

// ── clock ────────────────────────────────────────────────────

const NAVY = "#1c2148";
const HAND_RED = "#ff3355";
const BRASS = { base: "#dba548", light: "#ffe7a6", dark: "#99641c" };

/** how much the left facet of a hand at angle a faces the light (−1…1) */
const facet = (a: number) => {
  const t = (a * Math.PI) / 180;
  return -LIGHT[0] * Math.cos(t) - LIGHT[1] * Math.sin(t);
};

/**
 * A dauphine hand at angle a: length L, half-width w, its root hidden under the centre cap. Two facets split along
 * its spine, toned by how they face the light as the hand turns; a soft shadow falls `lift` px below it on the dial.
 */
const Hand: React.FC<{ L: number; w: number; root: number; color: string; a: number; lift: number; uid: string }> = ({
  L, w, root, color, a, lift, uid,
}) => {
  const s = Math.min(L * 0.2, w * 2.2); // the widest point, a little out from the pivot
  const outline = poly([[0, -L], [w, -s], [w * 0.5, root], [-w * 0.5, root], [-w, -s]]);
  const leftFacet = poly([[0, -L], [-w, -s], [-w * 0.5, root], [0, root]]);
  const lit = facet(a);
  const lightC = mix(color, "#a9b3ff", 0.36), darkC = shade(color, 0.6);
  const cl = mix(darkC, lightC, 0.5 + 0.5 * lit), cr = mix(darkC, lightC, 0.5 - 0.5 * lit);
  return (
    <g>
      <path d={outline} transform={`translate(${f1(lift * 0.5)} ${f1(lift)}) rotate(${f1(a)})`} fill="#1a0f2a" opacity={0.3} filter={`url(#${uid}-hs)`} />
      <g transform={`rotate(${f1(a)})`}>
        <path d={outline} fill={cr} stroke={cr} strokeWidth={0.8} strokeLinejoin="round" />
        <path d={leftFacet} fill={cl} />
      </g>
    </g>
  );
};

/**
 * A bell of the alarm clock, mounted on its post at angle a: a brass dome lit from the upper left (whichever way
 * it leans), the dark mouth of the bell along its rim and a knob on top. Drawn with its base at the origin.
 */
const Bell: React.FC<{ r: number; a: number; uid: string; side: number }> = ({ r, a, uid, side }) => {
  const bw = r * 0.46, bh = r * 0.44;
  // a dome whose sides flare a little into the rim, like a real bell
  const dome = `M ${f1(-bw)} 0 C ${f1(-bw * 0.94)} ${f1(-bh * 0.16)} ${f1(-bw * 0.86)} ${f1(-bh * 0.4)} ${f1(-bw * 0.8)} ${f1(-bh * 0.6)} `
    + `C ${f1(-bw * 0.7)} ${f1(-bh * 0.92)} ${f1(-bw * 0.36)} ${f1(-bh)} 0 ${f1(-bh)} C ${f1(bw * 0.36)} ${f1(-bh)} ${f1(bw * 0.7)} ${f1(-bh * 0.92)} ${f1(bw * 0.8)} ${f1(-bh * 0.6)} `
    + `C ${f1(bw * 0.86)} ${f1(-bh * 0.4)} ${f1(bw * 0.94)} ${f1(-bh * 0.16)} ${f1(bw)} 0 Z`;
  // the light in the bell's own (rotated) frame, and its direction as an angle from the bell's top
  const t = (-a * Math.PI) / 180;
  const lx = LIGHT[0] * Math.cos(t) - LIGHT[1] * Math.sin(t), ly = LIGHT[0] * Math.sin(t) + LIGHT[1] * Math.cos(t);
  const th = (Math.atan2(lx, -ly) * 180) / Math.PI;
  // a curved highlight streak on the dome, centred where it faces the light
  const ex = bw * 0.66, ey = bh * 0.72;
  const at = (phi: number): Pt => [ex * Math.sin((phi * Math.PI) / 180), -r * 0.04 - ey * Math.cos((phi * Math.PI) / 180)];
  const p0 = at(Math.max(-74, th - 24)), p1 = at(Math.min(74, th + 24));
  const rimY = r * 0.05;
  return (
    <g>
      <path d={poly([[-r * 0.028, r * 0.2], [-r * 0.028, -r * 0.05], [r * 0.028, -r * 0.05], [r * 0.028, r * 0.2]])} fill={BRASS.dark} />
      <path d={dome} fill={`url(#${uid}-bell${side})`} />
      {/* the shadow side of the dome, a tone darker */}
      <path d={dome} fill={BRASS.dark} opacity={0.42} mask={`url(#${uid}-bellshade${side})`} />
      <path d={`M ${f1(p0[0])} ${f1(p0[1])} A ${f1(ex)} ${f1(ey)} 0 0 1 ${f1(p1[0])} ${f1(p1[1])}`} fill="none" stroke="#fff6d6" strokeWidth={r * 0.045} strokeLinecap="round" opacity={0.8} />
      {/* the rim: a sliver of the bell's dark inside and its front edge */}
      <ellipse cx={0} cy={0} rx={bw} ry={rimY} fill={shade(BRASS.dark, 0.62)} />
      <path d={`M ${f1(-bw)} 0 A ${f1(bw)} ${f1(rimY)} 0 0 0 ${f1(bw)} 0`} fill="none" stroke={BRASS.base} strokeWidth={r * 0.03} />
      <path d={`M ${f1(-bw * 0.7)} ${f1(rimY * 0.72)} A ${f1(bw)} ${f1(rimY)} 0 0 0 ${f1(bw * 0.2)} ${f1(rimY * 0.98)}`} fill="none" stroke={BRASS.light} strokeWidth={r * 0.014} strokeLinecap="round" opacity={0.8} />
      {/* the knob that holds the bell */}
      <path d={poly([[-r * 0.02, -bh + r * 0.02], [-r * 0.02, -bh - r * 0.06], [r * 0.02, -bh - r * 0.06], [r * 0.02, -bh + r * 0.02]])} fill={BRASS.dark} />
      <circle cx={0} cy={-bh - r * 0.08} r={r * 0.056} fill={`url(#${uid}-bell${side})`} />
    </g>
  );
};

/**
 * A clock. `time` is minutes after 12:00 shown at song time `from`; `spin` advances it by that many clock minutes
 * per second of song (time flying by), 0 for a still clock. `ticks`: the second hand jumps every second, on every
 * beat of the song, or isn't drawn. `look`: a wall clock or an alarm clock (bells, legs). r is the face's radius.
 * `color` is the case (default: brass for the wall clock, teal for the alarm clock). `ring` 0–1 rings the alarm
 * clock: the hammer rattles between the bells and the clock shakes on its legs (there is no text on the dial).
 * The face: a cream dial with hour indices and a minute track, faceted hands that cast soft shadows, a red second
 * hand that springs into place on each tick, a centre cap and a glass glare, in a rim with depth. Fast `spin`
 * smears the minute hand a little, like motion blur.
 */
export const Clock: React.FC<{
  T: number; x: number; y: number; r?: number; time?: number; spin?: number; from?: number;
  ticks?: "second" | "beat" | "none"; look?: "wall" | "alarm"; color?: string; id?: string; ring?: number;
}> = ({ T, x, y, r = 160, time = 10 * 60 + 10, spin = 0, from = 0, ticks = "second", look = "wall", color, id, ring = 0 }) => {
  const { grid } = useSong();
  const uid = id ?? `clock-${Math.round(x)}-${Math.round(y)}-${Math.round(r)}`;
  const alarm = look === "alarm";
  const caseC = color ?? (alarm ? "#1f9e98" : BRASS.base);

  // ── time → hand angles (degrees clockwise from 12). The hour hand follows the minutes, so it never disagrees.
  const minutes = time + spin * (T - from);
  const hourA = (((minutes / 720) * 360) % 360 + 360) % 360;
  const minA = (((minutes / 60) * 360) % 360 + 360) % 360;
  let secA: number | null = null;
  if (ticks !== "none") {
    const s0 = (((time % 1) + 1) % 1) * 60;
    let pos: number, since: number;
    if (ticks === "beat") {
      const b = grid.beatPos(T);
      pos = Math.floor(s0) + Math.floor(b) - Math.floor(grid.beatPos(from));
      since = (b - Math.floor(b)) * grid.beat;
    } else {
      const sec = s0 + (T - from);
      pos = Math.floor(sec);
      since = sec - pos;
    }
    // each tick springs into place in 90 ms with a small overshoot, like a quartz movement
    secA = (pos - 1 + outBack(since / 0.09)) * 6;
  }
  /** how far the minute hand turns in a frame (degrees), for its motion smear */
  const smear = Math.min(40, Math.abs(spin) * 6 / 30);

  // ── ringing: the hammer flies between the bells, the clock rattles on its legs
  const rg = alarm ? clamp01(ring) : 0;
  const hammer = rg * 18 * Math.sin(T * 2 * Math.PI * 14);
  const rattle = rg * 2.4 * Math.sin(T * 2 * Math.PI * 9 + 1.3);
  const hop = rg * Math.max(0, Math.sin(T * 2 * Math.PI * 11)) * r * 0.03;

  const R = r * (alarm ? 1.2 : 1.17); // outer edge of the case
  const lip = r * (alarm ? 1.07 : 1.075);
  const blurS = Math.max(0.8, r * 0.012);
  /** the stage's blur filter closest to a softness of k·r */
  const blur = (k: number) => `url(#blur-${[2, 6, 10, 14, 22].reduce((b, v) => (Math.abs(v - k * r) < Math.abs(b - k * r) ? v : b))})`;
  const footY = r * 1.32, footX = r * 0.84;
  const bellA = 32, bellD = r * 1.27;

  const minuteTicks: string[] = [], hourTicks: string[] = [], quarterTicks: string[] = [];
  for (let i = 0; i < 60; i++) {
    const a = i * 6;
    if (i % 5 === 0) {
      const [x0, y0] = pol(a, r * (i % 15 === 0 ? 0.7 : 0.74)), [x1, y1] = pol(a, r * 0.88);
      (i % 15 === 0 ? quarterTicks : hourTicks).push(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
    } else {
      const [x0, y0] = pol(a, r * 0.845), [x1, y1] = pol(a, r * 0.885);
      minuteTicks.push(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
    }
  }
  // the second hand: a needle with a short tail that widens into a round counterweight
  const needle = `M ${f1(-r * 0.007)} ${f1(-r * 0.9)} L ${f1(r * 0.007)} ${f1(-r * 0.9)} L ${f1(r * 0.011)} ${f1(r * 0.05)} L ${f1(r * 0.024)} ${f1(r * 0.16)} A ${f1(r * 0.024)} ${f1(r * 0.024)} 0 0 1 ${f1(-r * 0.024)} ${f1(r * 0.16)} L ${f1(-r * 0.011)} ${f1(r * 0.05)} Z`;

  const smearFan = () => {
    if (smear < 2.5) return null;
    const dir = spin > 0 ? -1 : 1;
    const steps = 5;
    return (
      <g>
        {Array.from({ length: steps }, (_, i) => {
          const a0 = minA + dir * smear * (i / steps), a1 = minA + dir * smear * ((i + 1) / steps);
          return <path key={i} d={poly([[0, 0], pol(a0, r * 0.74), pol(a1, r * 0.74)])} fill={NAVY} opacity={0.1 * (1 - i / steps)} />;
        })}
      </g>
    );
  };

  const dial = (
    <g>
      {/* the face, recessed behind the lip: shadowed on the upper left where the rim blocks the light */}
      <circle r={r} fill={`url(#${uid}-face)`} />
      <circle r={r} fill={`url(#${uid}-recess)`} />
      <path d={minuteTicks.join(" ")} stroke={NAVY} strokeWidth={r * 0.012} strokeLinecap="round" opacity={0.5} />
      <path d={hourTicks.join(" ")} stroke={NAVY} strokeWidth={r * 0.036} strokeLinecap="round" />
      <path d={quarterTicks.join(" ")} stroke={NAVY} strokeWidth={r * 0.058} strokeLinecap="round" />
      {smearFan()}
      {/* hands: hour, minute, second — each a little higher above the dial, so its shadow falls further */}
      <Hand L={r * 0.52} w={r * 0.066} root={r * 0.05} color={NAVY} a={hourA} lift={r * 0.024} uid={uid} />
      <Hand L={r * 0.8} w={r * 0.05} root={r * 0.05} color={NAVY} a={minA} lift={r * 0.034} uid={uid} />
      <circle r={r * 0.072} fill={`url(#${uid}-cap)`} />
      {secA !== null && (
        <g>
          <path d={needle} transform={`translate(${f1(r * 0.024)} ${f1(r * 0.046)}) rotate(${f1(secA)})`} fill="#1a0f2a" opacity={0.22} filter={`url(#${uid}-hs)`} />
          <path d={needle} transform={`rotate(${f1(secA)})`} fill={HAND_RED} />
          <circle r={r * 0.042} fill={HAND_RED} />
        </g>
      )}
      <circle cx={-r * 0.012} cy={-r * 0.014} r={r * 0.014} fill="#ffffff" opacity={0.75} />
      {/* glass: a soft sheen over the upper left, cut by a diagonal, and a thin reflection on the lower right */}
      <g clipPath={`url(#${uid}-glass)`}>
        <path d={`M ${f1(-r)} ${f1(r * 0.22)} C ${f1(-r * 0.4)} ${f1(-r * 0.02)} ${f1(-r * 0.02)} ${f1(-r * 0.4)} ${f1(r * 0.22)} ${f1(-r)} L ${f1(-r)} ${f1(-r)} Z`} fill={`url(#${uid}-sheen)`} />
        <path d={`M ${f1(-r)} ${f1(r * 0.42)} C ${f1(-r * 0.28)} ${f1(r * 0.12)} ${f1(r * 0.12)} ${f1(-r * 0.28)} ${f1(r * 0.42)} ${f1(-r)} L ${f1(r * 0.5)} ${f1(-r)} C ${f1(r * 0.18)} ${f1(-r * 0.22)} ${f1(-r * 0.22)} ${f1(r * 0.18)} ${f1(-r)} ${f1(r * 0.5)} Z`} fill="#ffffff" opacity={0.12} />
        <path d={`M ${f1(pol(100, r * 0.95)[0])} ${f1(pol(100, r * 0.95)[1])} A ${f1(r * 0.95)} ${f1(r * 0.95)} 0 0 1 ${f1(pol(170, r * 0.95)[0])} ${f1(pol(170, r * 0.95)[1])}`} fill="none" stroke="#ffffff" strokeWidth={r * 0.018} strokeLinecap="round" opacity={0.4} />
      </g>
    </g>
  );

  const caseRing = (
    <g>
      <circle r={R} fill={`url(#${uid}-case)`} />
      {/* the case's shadow side, one tone down, and a thin rim of light on the lit edge */}
      <circle r={R} fill={deep(caseC, 0.72)} opacity={0.55} mask={`url(#${uid}-caseshade)`} />
      <circle r={R - r * 0.014} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={r * 0.028} />
      <circle r={lip} fill={`url(#${uid}-lip)`} />
    </g>
  );

  return (
    <g transform={`translate(${f1(x)} ${f1(y - hop)}) rotate(${f1(rattle)} 0 ${f1(alarm ? footY : 0)})`}>
      <defs>
        <filter id={`${uid}-hs`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={blurS} /></filter>
        <linearGradient id={`${uid}-case`} x1="0.2" y1="0.05" x2="0.8" y2="0.95">
          <stop offset="0" stopColor={toward(caseC, "#fff6e0", 0.5)} />
          <stop offset="0.3" stopColor={toward(caseC, "#fff6e0", 0.12)} />
          <stop offset="0.62" stopColor={deep(caseC, 0.8)} />
          <stop offset="0.86" stopColor={caseC} />
          <stop offset="1" stopColor={toward(caseC, "#fff6e0", 0.16)} />
        </linearGradient>
        <mask id={`${uid}-caseshade`}>
          <circle r={R} fill="#fff" />
          <circle cx={-r * 0.1} cy={-r * 0.13} r={R} fill="#000" />
        </mask>
        <linearGradient id={`${uid}-lip`} x1="0.2" y1="0.05" x2="0.8" y2="0.95">
          <stop offset="0" stopColor={deep(caseC, 0.58)} />
          <stop offset="0.55" stopColor={deep(caseC, 0.9)} />
          <stop offset="1" stopColor={toward(caseC, "#fff6e0", 0.38)} />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0.15" y1="0" x2="0.7" y2="0.8">
          <stop offset="0" stopColor="#fffbea" stopOpacity={0.9} />
          <stop offset="0.5" stopColor="#fffbea" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`${uid}-face`} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.7" stopColor="#f6eedf" />
          <stop offset="1" stopColor="#e6d9c2" />
        </radialGradient>
        <radialGradient id={`${uid}-recess`} cx="0.55" cy="0.57" r="0.56">
          <stop offset="0.8" stopColor="#3b2a14" stopOpacity={0} />
          <stop offset="1" stopColor="#3b2a14" stopOpacity={0.38} />
        </radialGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0.62" y2="0.62">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.4} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0.06} />
        </linearGradient>
        <radialGradient id={`${uid}-cap`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor={mix(NAVY, "#a9b3ff", 0.45)} />
          <stop offset="1" stopColor={NAVY} />
        </radialGradient>
        {[-1, 1].map((sd) => (
          <React.Fragment key={sd}>
            <linearGradient id={`${uid}-bell${sd}`} x1="0.1" y1="0" x2="0.9" y2="1" gradientTransform={`rotate(${-sd * bellA} 0.5 0.5)`}>
              <stop offset="0" stopColor={BRASS.light} />
              <stop offset="0.4" stopColor={BRASS.base} />
              <stop offset="1" stopColor={BRASS.dark} />
            </linearGradient>
            <mask id={`${uid}-bellshade${sd}`}>
              <rect x={-r} y={-r} width={2 * r} height={2 * r} fill="#fff" />
              {(() => {
                const t = (-sd * bellA * Math.PI) / 180;
                const lx = LIGHT[0] * Math.cos(t) - LIGHT[1] * Math.sin(t), ly = LIGHT[0] * Math.sin(t) + LIGHT[1] * Math.cos(t);
                return <ellipse cx={lx * r * 0.14} cy={-r * 0.1 + ly * r * 0.14} rx={r * 0.5} ry={r * 0.5} fill="#000" />;
              })()}
            </mask>
          </React.Fragment>
        ))}
        <linearGradient id={`${uid}-metal`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={BRASS.light} />
          <stop offset="0.45" stopColor={BRASS.base} />
          <stop offset="1" stopColor={BRASS.dark} />
        </linearGradient>
        <clipPath id={`${uid}-glass`}><circle r={r} /></clipPath>
      </defs>

      {alarm ? (
        <g>
          {/* contact shadow under the feet */}
          <ellipse cx={0} cy={footY + r * 0.07 + hop} rx={r * 1.12} ry={r * 0.075} fill="#0a0618" opacity={0.32} filter={blur(0.05)} />
          {/* legs: splayed, curving out to round feet */}
          {[-1, 1].map((sd) => (
            <g key={sd}>
              <path d={`M ${f1(sd * r * 0.5)} ${f1(r * 0.9)} Q ${f1(sd * r * 0.72)} ${f1(r * 1.06)} ${f1(sd * footX)} ${f1(footY - r * 0.02)}`} fill="none"
                stroke={sd < 0 ? BRASS.base : BRASS.dark} strokeWidth={r * 0.085} strokeLinecap="round" />
              <ellipse cx={sd * footX} cy={footY} rx={r * 0.105} ry={r * 0.08} fill={`url(#${uid}-metal)`} />
            </g>
          ))}
          {/* the hammer between the bells (ghosts of it when it rattles), then the bells on their posts */}
          {rg > 0 && [-1, 1].map((sd) => (
            <g key={sd} transform={`translate(0 ${f1(-R + r * 0.02)}) rotate(${sd * 18 * rg})`} opacity={0.3}>
              <circle cy={-r * 0.2} r={r * 0.07} fill={BRASS.base} />
            </g>
          ))}
          <g transform={`translate(0 ${f1(-R + r * 0.02)}) rotate(${f1(hammer)})`}>
            <path d={poly([[-r * 0.022, r * 0.02], [-r * 0.016, -r * 0.2], [r * 0.016, -r * 0.2], [r * 0.022, r * 0.02]])} fill={BRASS.dark} />
            <circle cy={-r * 0.2} r={r * 0.07} fill={`url(#${uid}-metal)`} />
          </g>
          {[-1, 1].map((sd) => {
            const [cx, cy] = pol(sd * bellA, bellD);
            return (
              <g key={sd} transform={`translate(${f1(cx)} ${f1(cy)}) rotate(${sd * bellA})`}>
                <Bell r={r} a={sd * bellA} uid={uid} side={sd} />
              </g>
            );
          })}
          {/* ringing: short sound arcs off the bells */}
          {rg > 0 && [-1, 1].map((sd) => {
            const [cx, cy] = pol(sd * bellA, bellD + r * 0.2);
            const fl = 0.55 + 0.45 * Math.sin(T * 2 * Math.PI * 6 + sd);
            return (
              <g key={`s${sd}`} transform={`translate(${f1(cx)} ${f1(cy)})`} opacity={rg * fl} fill="none" stroke="#fff6e0" strokeWidth={r * 0.03} strokeLinecap="round">
                {[0.62, 0.8].map((k, i) => {
                  const [ax, ay] = pol(sd * (bellA - 26), r * k), [bx, by] = pol(sd * (bellA + 26), r * k);
                  return <path key={i} d={`M ${f1(ax)} ${f1(ay)} A ${f1(r * k)} ${f1(r * k)} 0 0 ${sd > 0 ? 1 : 0} ${f1(bx)} ${f1(by)}`} />;
                })}
              </g>
            );
          })}
          {caseRing}
          {dial}
        </g>
      ) : (
        <g>
          <circle cx={r * 0.05} cy={r * 0.1} r={R} fill="#0a0618" opacity={0.3} filter={blur(0.075)} />
          {caseRing}
          {dial}
        </g>
      )}
    </g>
  );
};

// ── heart ────────────────────────────────────────────────────

/** Right half of the outline, from the cleft down to the tip: [c1, c2, end] per cubic segment; the left is its mirror */
const CLEFT: Pt = [0, -64];
const HEART_R: [Pt, Pt, Pt][] = [
  [[6, -86], [30, -102], [62, -102]],
  [[98, -102], [122, -72], [121, -34]],
  [[120, 8], [96, 38], [62, 68]],
  [[40, 87], [12, 100], [0, 112]],
];
const HEART = (() => {
  const p = (q: Pt, sx = 1) => `${f1(q[0] * sx)} ${f1(q[1])}`;
  let d = `M ${p(CLEFT)}`;
  for (const [a, b, c] of HEART_R) d += ` C ${p(a)} ${p(b)} ${p(c)}`;
  for (let i = HEART_R.length - 1; i >= 0; i--) {
    const [a, b] = HEART_R[i];
    const prev = i > 0 ? HEART_R[i - 1][2] : CLEFT;
    d += ` C ${p(b, -1)} ${p(a, -1)} ${p(prev, -1)}`;
  }
  return d + " Z";
})();
/** The heart with its cleft filled in: what the tone masks subtract, so a shifted copy's notch leaves no wedge */
const HEART_FULL = `${HEART} M -44 -103 L 44 -103 L 0 -60 Z`;
/** The curved highlight on the left lobe: a crescent inset from the lobe's edge, tapering at both ends */
const GLINT = (() => {
  const cx = -60, cy = -38, rho = 44, n = 18;
  const outer: Pt[] = [], inner: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, phi = ((196 - 118 * u) * Math.PI) / 180, w = 13 * Math.pow(Math.sin(Math.PI * u), 0.8);
    outer.push([cx + (rho + w / 2) * Math.cos(phi), cy - (rho + w / 2) * Math.sin(phi)]);
    inner.push([cx + (rho - w / 2) * Math.cos(phi), cy - (rho - w / 2) * Math.sin(phi)]);
  }
  return poly([...outer, ...inner.reverse()]);
})();
/** The crack, cleft to tip, in uneven zig-zags like broken glass */
const CRACK: Pt[] = [[0, -64], [-13, -42], [6, -27], [-9, -4], [13, 18], [-5, 44], [9, 66], [0, 86], [0, 112]];
/** Side cracks that run off the main one into each half */
const BRANCHES: Pt[][] = [
  [[6, -27], [22, -36], [30, -52]],
  [[-9, -4], [-27, 2], [-40, -9]],
  [[9, 66], [24, 72]],
];
const line = (p: Pt[]) => `M ${p.map(([a, b]) => `${a} ${b}`).join(" L ")}`;
/** The broken face along the crack on one side (−1 left, 1 right): w px deep in the middle, nothing at the ends */
const edgeFace = (side: number, w: number) =>
  poly([...CRACK, ...CRACK.map(([a, b], i): Pt => [a + side * w * Math.pow(Math.sin((Math.PI * i) / (CRACK.length - 1)), 0.7), b]).reverse()]);

/** lub-dub: a strong contraction on the beat and a softer one a little later; peaks at 1 */
function heartbeat(T: number, grid: ReturnType<typeof useSong>["grid"]): number {
  const env = (t: number) => (t < -0.04 ? 0 : t < 0 ? smooth((t + 0.04) / 0.04) : Math.exp(-t / 0.065));
  const dub = Math.min(0.24, Math.max(0.12, grid.beat * 0.36));
  const n = Math.floor(grid.beatPos(T));
  let h = 0;
  for (const k of [n - 1, n, n + 1]) {
    const tk = grid.beatTime(k);
    const amp = ((k % 4) + 4) % 4 === grid.downbeat_mod4 ? 1 : 0.8;
    h += amp * (env(T - tk) + 0.55 * env(T - tk - dub));
  }
  return h;
}

/**
 * A heart. `beat` 0–1 makes it pulse on the song's beat; `crack` 0–1 breaks it: a jagged crack opens down the
 * middle and the two halves drift apart and tilt (1 = fully broken). `glow` adds a soft halo. ~240 px wide at s = 1.
 * Glossy and full: a lit upper-left lobe, a shadow tone along the lower right with soft reflected light in it, a
 * curved highlight. The pulse is a heartbeat (lub-dub) on each beat of the grid, stronger on the bar's first beat,
 * and the halo swells with it. Cracking: up to 0.3 the crack runs down from the cleft to the tip and side cracks
 * branch off; after that the halves part, tilting outwards and showing their broken faces (the left one in shadow,
 * the right one catching the light).
 */
export const Heart: React.FC<{
  T: number; x: number; y: number; s?: number; color?: string; beat?: number; crack?: number; glow?: number; id?: string;
}> = ({ T, x, y, s = 1, color = "#ff3355", beat = 0, crack = 0, glow = 0, id }) => {
  const { grid } = useSong();
  const uid = id ?? `heart-${Math.round(x)}-${Math.round(y)}`;
  const c = clamp01(crack);
  const draw = clamp01(c / 0.3); // how far the crack has run, cleft to tip
  const part = smooth((c - 0.3) / 0.7); // how far the halves have parted, once the crack has reached the tip
  const h = beat > 0 ? heartbeat(T, grid) : 0;
  const pump = 1 + 0.1 * clamp01(beat) * h * (1 - part);
  const lightC = toward(color, "#ffe4ec", 0.55);
  const shadowC = deep(color, 0.66);
  const crackC = deep(color, 0.42);
  const edgeLit = toward(color, "#ffd6e0", 0.4);
  const halo = clamp01(glow) * (0.5 + 0.5 * Math.min(1, h)) * (1 - 0.7 * part);

  const body = (
    <g mask={`url(#${uid}-shape)`}>
      <path d={HEART} fill={`url(#${uid}-fill)`} />
      {/* the shadow side: one tone down along the lower right, lifted by soft light reflected into it from below */}
      <path d={HEART} fill={shadowC} mask={`url(#${uid}-shadow)`} />
      <g mask={`url(#${uid}-shadow)`}>
        <path d={HEART} fill="none" stroke={toward(color, "#ff9cbc", 0.25)} strokeWidth={16} opacity={0.4} filter="url(#blur-6)" />
      </g>
      {/* rim light on the upper left */}
      <path d={HEART} fill={`url(#${uid}-rimfade)`} mask={`url(#${uid}-rim)`} />
      {/* gloss: a broad soft sheen and a curved highlight on the left lobe, a small one on the right */}
      <ellipse cx={-50} cy={-56} rx={54} ry={34} transform="rotate(-38 -50 -56)" fill="#ffffff" opacity={0.2} filter="url(#blur-10)" />
      <path d={GLINT} fill="#ffffff" opacity={0.85} />
      <ellipse cx={64} cy={-80} rx={15} ry={7.5} transform="rotate(24 64 -80)" fill="#ffffff" opacity={0.4} />
    </g>
  );

  /** the crack as drawn so far, with its side cracks */
  const crackLines = (
    <g fill="none" stroke={crackC} strokeLinejoin="round">
      <path d={line(CRACK)} strokeWidth={4} pathLength={1} strokeDasharray={`${draw} 1`} opacity={1 - smooth(part / 0.3)} />
      {BRANCHES.map((b, i) => {
        const k = clamp01((c - 0.12 - i * 0.04) / 0.16);
        return k > 0 ? <path key={i} d={line(b)} strokeWidth={2} strokeLinecap="round" pathLength={1} strokeDasharray={`${k} 1`} opacity={0.8} /> : null;
      })}
    </g>
  );

  /** one half (side −1 left, 1 right) with its broken edge, parted from the other */
  const half = (side: number) => {
    const rot = side * 15 * part, dx = side * 30 * part, dy = 8 * part + 2 * part * Math.sin(T * 1.6 + side);
    return (
      <g key={side} transform={`translate(${f1(dx)} ${f1(dy)}) rotate(${f1(rot)} ${side * 10} 104)`}>
        <g mask={`url(#${uid}-half${side})`}>
          {body}
          {/* the broken face: in shadow on the left half, catching the light on the right one */}
          <path d={edgeFace(side, 9 * part)} fill={side < 0 ? crackC : edgeLit} mask={`url(#${uid}-shape)`} />
          {crackLines}
        </g>
      </g>
    );
  };

  return (
    <g transform={`translate(${f1(x)} ${f1(y)}) scale(${(s * pump).toFixed(4)})`}>
      <defs>
        <radialGradient id={`${uid}-fill`} cx="0.3" cy="0.24" r="0.9">
          <stop offset="0" stopColor={toward(color, "#ffd0dc", 0.4)} />
          <stop offset="0.5" stopColor={color} />
          <stop offset="1" stopColor={deep(color, 0.84)} />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0.3" stopColor={color} stopOpacity={0.55} />
          <stop offset="0.55" stopColor={color} stopOpacity={0.2} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
        {/* the rim light fades out before it reaches the shadow side */}
        <linearGradient id={`${uid}-rimfade`} x1={-110} y1={-40} x2={70} y2={-60} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={lightC} stopOpacity={0.7} />
          <stop offset="0.6" stopColor={lightC} stopOpacity={0.45} />
          <stop offset="1" stopColor={lightC} stopOpacity={0} />
        </linearGradient>
        <mask id={`${uid}-shape`}><path d={HEART} fill="#fff" /></mask>
        {/* tone steps: the heart minus a copy of itself shifted towards the light (shadow) or away from it (rim) */}
        {([["shadow", 30, 16], ["rim", -3, -4]] as [string, number, number][]).map(([n, ox, oy]) => (
          <mask key={n} id={`${uid}-${n}`}>
            <path d={HEART} fill="#fff" />
            <path d={HEART_FULL} fill="#000" transform={`translate(${-ox} ${-oy})`} />
          </mask>
        ))}
        <mask id={`${uid}-half-1`}>
          <path d={poly([[0, -300], ...CRACK, [0, 300], [-300, 300], [-300, -300]])} fill="#fff" />
        </mask>
        <mask id={`${uid}-half1`}>
          <path d={poly([[0, -300], ...CRACK, [0, 300], [300, 300], [300, -300]])} fill="#fff" />
        </mask>
      </defs>
      {halo > 0.001 && <circle r={250} fill={`url(#${uid}-halo)`} opacity={halo} />}
      {part > 0 ? (
        <g>
          {half(-1)}
          {half(1)}
        </g>
      ) : (
        <g>
          {body}
          {c > 0 && <g mask={`url(#${uid}-shape)`}>{crackLines}</g>}
        </g>
      )}
    </g>
  );
};
