import React from "react";
import { mix } from "./color";
import { rng } from "./math";
import type { TimeOfDay } from "./sky";
import { useSong } from "./song";

/**
 * Vehicles for journeys, departures and long distance. Use inside <Svg> on the 1920×1080 stage (they use its blur
 * filters). Seen from the side, facing right (`flip` faces left). `time` is the light they stand in (day, dawn,
 * dusk or night, as for Clouds); left out, it is dusk with `lights` on and day without.
 */

const n1 = (v: number) => String(Math.round(v * 10) / 10);
const pt = (x: number, y: number) => `${n1(x)} ${n1(y)}`;
const hex6 = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
/** the shadow and light tints the people use, so a car and a person shade alike */
const DEEP = "#130d30";
const WARM = "#fff3e2";

// ── car ──────────────────────────────────────────────────────
// A five-door compact hatchback in side view, facing right, ground at y = 0. Units are px at s = 1.
const TYRE = 44;
/** wheel centres as drawn; the car is shifted at render time so the origin is midway between them */
const AXLE = { rear: -166, front: 154 };
const ARCH = 52;
const SILL = -24;
/** an arch of radius r over the wheel at cx, from the sill on the front side to the sill on the back */
const archArc = (cx: number, r: number, move = "M") => {
  const h = Math.sqrt(r * r - (SILL + TYRE) ** 2);
  return `${move} ${pt(cx + h, SILL)} A ${r} ${r} 0 1 0 ${pt(cx - h, SILL)}`;
};

/** The body: bumpers, bonnet, raked windscreen, a roof sloping to a spoiler, a steep hatch, two wheel arches */
const CAR_BODY = [
  `M 246 ${SILL}`, archArc(AXLE.front, ARCH, "L"), archArc(AXLE.rear, ARCH, "L"), `L -236 ${SILL}`,
  "C -249 -24 -256 -32 -258 -46", "C -260 -60 -261 -80 -259 -96", "C -257 -105 -254 -111 -250 -116",
  "L -232 -152 L -238 -156", "C -240 -161 -235 -164 -226 -164", "C -170 -175 -60 -181 8 -172",
  "C 34 -160 78 -134 104 -122", "C 146 -116 206 -108 236 -102", "C 249 -99 256 -93 258 -82",
  "C 261 -66 260 -44 254 -33", `C 251 -27 249 ${SILL} 246 ${SILL} Z`,
].join(" ");
/** the side glass ("daylight opening"): A-pillar to the pointed rear quarter light, the belt line rising to the back */
const CAR_GLASS = "M 88 -119 L 6 -161.5 C 2 -164 -4 -165.5 -10 -165.6 C -60 -167.5 -130 -165.5 -176 -158 C -190 -155.5 -201 -146 -208 -135 L -212 -129 Z";
const B_PILLAR = "M -46 -122 L -59 -122 L -63 -172 L -50 -172 Z";
const Q_BAR = "M -154 -126 L -159 -126 L -163 -172 L -158 -172 Z";
/** the panels: above the shoulder crease the body leans towards the sky (lighter), the lower doors tuck under */
const ZONE_UPPER = "M -270 -108.4 L 270 -91.6 L 270 -230 L -270 -230 Z";
const ZONE_SHEEN = "M -270 -108.4 L 270 -91.6 L 270 -63.6 L -270 -80.4 Z";
const ZONE_LOWER = "M -270 -54 L 270 -50 L 270 30 L -270 30 Z";
const ZONE_SILL = "M -270 -33 L 270 -33 L 270 30 L -270 30 Z";
const CREASE = "M -262 -109.6 L 262 -93.4";
const ROOF_EDGE = "M -234 -158 C -239 -161 -235 -164 -226 -164 C -170 -175 -60 -181 8 -172 C 26 -164 46 -152 62 -143";
const BONNET_EDGE = "M 102 -122 C 146 -116 206 -108 236 -102 C 249 -99 256 -93 258 -82";
const HATCH_EDGE = "M -259 -92 C -257 -105 -254 -111 -250 -116 L -232 -152";
const SEAMS = [
  "M 89 -119 C 92 -92 93 -62 90 -26",
  "M -52 -124 C -53 -92 -54 -58 -54 -26",
  "M -159 -128 C -158 -115 -154 -104 -147 -97",
].join(" ");
const HANDLES = [0, -110].map((dx, i) => {
  const y = -110 - i * 3;
  return `M ${pt(-32 + dx, y)} L ${pt(-15 + dx, y)} C ${pt(-11.5 + dx, y)} ${pt(-11.5 + dx, y + 4.6)} ${pt(-15 + dx, y + 4.6)} L ${pt(-32 + dx, y + 4.6)} C ${pt(-35.5 + dx, y + 4.6)} ${pt(-35.5 + dx, y)} ${pt(-32 + dx, y)} Z`;
}).join(" ");
/** the door mirror: a housing that is fullest at the back and tapers forward, on a short dark foot */
const MIRROR = "M 67 -125.5 C 67 -131 73 -136.5 83 -137 L 98 -137.5 C 103 -137.5 104.5 -133 104 -128.5 C 103.5 -124 100 -122 95 -122 L 75 -122 C 70 -122 67 -123.5 67 -125.5 Z";
const MIRROR_FOOT = "M 83 -123 L 93 -123 L 95 -118.5 L 85 -118.5 Z";
const HEADLIGHT = "M 212 -106 C 228 -105 244 -101 254 -95 C 258 -92 259 -88 258.5 -85 C 248 -87 232 -92 218 -99 C 213 -101 211 -104 212 -106 Z";
const DRL = "M 219 -103 C 232 -102 244 -98.5 252 -93.5";
/** the headlight's dark inner housing along its lower edge, and the projector lens in it */
const LAMP_HOUSING = "M 223 -99.6 C 235 -95.6 246 -91.4 256.5 -88";
const PROJECTOR: [number, number] = [243, -95.2];
const TAILLIGHT = "M -251 -115 C -244 -115 -234 -113 -224 -109 C -222 -105 -224 -102 -229 -101 L -259 -97 Z";
const INTAKE = "M 262 -56 C 250 -55 240 -51 234 -44 C 231 -39 234 -34 240 -34 L 262 -34 Z";
const INTAKE_LIP = "M 261 -57.6 C 250 -56.6 241 -53 235.4 -46.6";
/** the bright trim along the bottom of the side glass */
const BELT_TRIM = "M 88 -119 L -212 -129";
const DIFFUSER = "M -262 -42 L -238 -42 C -233 -42 -231 -39 -231 -35 L -231 -20 L -262 -20 Z";
const REFLECTOR = "M -261 -61 L -250 -61 L -250 -57 L -261 -57 Z";
/** the fuel flap on the rear quarter panel */
const FUEL_FLAP = "M -213 -99 L -199 -99 C -197 -99 -196 -98 -196 -96 L -196 -89 C -196 -87 -197 -86 -199 -86 L -213 -86 C -215 -86 -216 -87 -216 -89 L -216 -96 C -216 -98 -215 -99 -213 -99 Z";
const ANTENNA = "M -178 -169.5 C -173 -177 -166 -180.5 -160 -180.5 C -157 -180.5 -156 -177 -155 -171.5 Z";
/** what shows through the glass: two headrests and the top of the steering wheel */
const HEADRESTS = [
  "M -42 -136 C -43 -148 -38 -153 -30 -153 L -22 -153 C -15 -153 -12 -148 -13 -138 L -14 -122 L -41 -122 Z",
  "M -146 -138 C -147 -147 -143 -151 -136 -151 L -129 -151 C -123 -151 -121 -147 -122 -140 L -123 -126 L -145 -126 Z",
].join(" ");
const WHEEL_TOP = "M 40 -119 C 42 -131 51 -138 61 -136";
const GLARE = "M 52 -176 L 68 -176 L 32 -104 L 16 -104 Z M 74 -176 L 79 -176 L 43 -104 L 38 -104 Z M -98 -176 L -87 -176 L -123 -104 L -134 -104 Z";
/** short bright glints where the paint turns towards the light: front wing, rear quarter, rear door crease */
const GLINTS = [[196, -103.5, 16, -6.5], [-214, -110.5, 11, -6.5], [-120, -105.5, 22, -1.7]] as const;

/** Five twin spokes: each a tapered blade split down the middle, from the hub to the rim */
const SPOKES = (() => {
  const out: string[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const p = (r: number, w: number) => pt(c * r - s * w, s * r + c * w);
    out.push(`M ${p(5.5, -1)} L ${p(5.5, -4.6)} L ${p(29.2, -8.4)} L ${p(29.2, -1.3)} Z M ${p(5.5, 1)} L ${p(29.2, 1.3)} L ${p(29.2, 8.4)} L ${p(5.5, 4.6)} Z`);
  }
  return out.join(" ");
})();
const LUGS = Array.from({ length: 5 }, (_, k) => {
  const a = ((k * 72 + 36) * Math.PI) / 180;
  return [Math.cos(a) * 9.5, Math.sin(a) * 9.5] as const;
});
const CALIPER = "M 8 -17.5 C 12 -21.5 17.5 -22.5 21.5 -20.5 L 19.5 -14 C 16.5 -15 13.5 -14 12 -12 Z";

type CarLook = {
  /** the ambient light mixed into the paint, and how much */
  amb: string; ambK: number;
  /** the colour of the light on top edges (sky, sunset, street lamps) */
  rim: string;
  glass: [string, string]; glare: string; glareO: number; inside: string;
  tyre: string; well: string; metal: [string, string]; disc: string; lens: string; shadow: number;
  /** how strongly the beams and the light pools show (faint by day) */
  beam: number;
};
const CAR_LOOK: Record<TimeOfDay, CarLook> = {
  day: {
    amb: "#ffffff", ambK: 0, rim: WARM, glass: ["#22325a", "#6d8dbd"], glare: "#ffffff", glareO: 0.24, inside: "#18213c",
    tyre: "#272a35", well: "#15161e", metal: ["#eef1f6", "#98a1b4"], disc: "#646a7a", lens: "#eef3f8", shadow: 0.34, beam: 0.3,
  },
  dawn: {
    amb: "#4a3a6e", ambK: 0.22, rim: "#ffd7c2", glass: ["#2a2c55", "#8a6f9c"], glare: "#ffe1d0", glareO: 0.2, inside: "#1d1a38",
    tyre: "#211f2c", well: "#120f1a", metal: ["#e2d6e2", "#857a98"], disc: "#585468", lens: "#efe4ea", shadow: 0.38, beam: 0.85,
  },
  dusk: {
    amb: "#3a2453", ambK: 0.3, rim: "#ffc9a3", glass: ["#201838", "#6e4268"], glare: "#ffb898", glareO: 0.22, inside: "#140d24",
    tyre: "#1d1b27", well: "#100d18", metal: ["#dcc6cf", "#7d6a88"], disc: "#544a62", lens: "#f3e2e2", shadow: 0.42, beam: 0.9,
  },
  night: {
    amb: "#0c1030", ambK: 0.5, rim: "#ffdcae", glass: ["#0c1027", "#29305a"], glare: "#ffd9a8", glareO: 0.14, inside: "#080a19",
    tyre: "#121320", well: "#0a0b14", metal: ["#8a90ad", "#3b4060"], disc: "#3a3e55", lens: "#c9cfe0", shadow: 0.46, beam: 1,
  },
};

/**
 * A car, about 520 px long at s = 1, origin at the middle of the ground line under its wheels. `distance` is how far
 * it has travelled (px at s = 1): the wheels turn by it, so pass the same value you move x by and they won't skid
 * (at scale s, moving x by d on the stage is a distance of d / s).
 * `lights` turns on head- and tail-lights with a beam (night). `bounce` 0–1 adds a little suspension bob.
 * `time` is the light it stands in (see the top of this file).
 */
export const Car: React.FC<{
  T: number; x: number; y: number; s?: number; color?: string; flip?: boolean; lights?: boolean; distance?: number;
  bounce?: number; id?: string; time?: TimeOfDay;
}> = ({ T, x, y, s = 1, color = "#e04a5f", flip = false, lights = false, distance = 0, bounce = 0, id, time }) => {
  const look = time ?? (lights ? "dusk" : "day");
  const L = CAR_LOOK[look];
  const paint = hex6(color, "#e04a5f");
  const uid = id ?? `car-${paint.slice(1)}-${look}`;
  const c = mix(paint, L.amb, L.ambK);
  const P = {
    upper: mix(c, L.rim, 0.17), base: c, lower: mix(c, DEEP, 0.2), sill: mix(c, DEEP, 0.4),
    seam: mix(c, DEEP, 0.5), rim: mix(c, L.rim, 0.62), crease: mix(c, L.rim, 0.5),
  };
  /** dawn, dusk and night: softer highlights */
  const dim = look !== "day";
  const spin = (distance / TYRE) * (180 / Math.PI);
  const w = 2 * Math.PI;
  const bob = bounce * (2.2 * Math.sin(T * w * 1.9) + 1.1 * Math.sin(T * w * 3.1 + 1.3));
  const pitch = bounce * 0.35 * Math.sin(T * w * 1.3 + 0.6);
  const bodyT = `translate(0 ${n1(bob)}) rotate(${pitch.toFixed(3)} 0 -60)`;
  const clip = `url(#${uid}-body)`;
  const trim = "#15151f";
  const wheel = (cx: number) => (
    <g key={cx} transform={`translate(${cx} ${-TYRE})`}>
      <circle r={TYRE} fill={L.tyre} />
      <circle r={TYRE - 6} fill="none" stroke={mix(L.tyre, "#ffffff", 0.07)} strokeWidth={2} />
      <path d="M -37.2 -20.6 A 42.5 42.5 0 0 1 -5.5 -42.1" fill="none" stroke={mix(L.tyre, "#ffffff", 0.16)} strokeWidth={2.2} strokeLinecap="round" />
      <circle r={31} fill={mix(L.tyre, "#000000", 0.4)} />
      <circle r={22} fill={L.disc} />
      <circle r={13} fill={mix(L.disc, "#000000", 0.35)} />
      <path d={CALIPER} fill={mix(L.disc, "#000000", 0.2)} />
      <g transform={`rotate(${n1(spin % 360)})`}>
        <path d={SPOKES} fill={L.metal[0]} />
        {LUGS.map(([lx, ly], i) => <circle key={i} cx={n1(lx)} cy={n1(ly)} r={1.7} fill={L.metal[1]} />)}
      </g>
      <circle r={29.8} fill="none" stroke={L.metal[0]} strokeWidth={3.4} />
      <circle r={31.5} fill={`url(#${uid}-metal)`} />
      <circle r={6.5} fill={L.metal[1]} />
      <circle r={3} cx={-1.1} cy={-1.1} fill={L.metal[0]} opacity={0.8} />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s}) translate(${-(AXLE.rear + AXLE.front) / 2} 0)`}>
      <defs>
        <clipPath id={`${uid}-body`}><path d={CAR_BODY} /></clipPath>
        <clipPath id={`${uid}-glass`}><path d={CAR_GLASS} /></clipPath>
        <clipPath id={`${uid}-mirror`}><path d={MIRROR} /></clipPath>
        <radialGradient id={`${uid}-shadow`}>
          <stop offset="0" stopColor="#05040c" stopOpacity={L.shadow} />
          <stop offset="0.55" stopColor="#05040c" stopOpacity={L.shadow * 0.6} />
          <stop offset="1" stopColor="#05040c" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${uid}-glassfill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.glass[0]} />
          <stop offset="1" stopColor={L.glass[1]} />
        </linearGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.rim} stopOpacity={dim ? 0.26 : 0.38} />
          <stop offset="1" stopColor={P.rim} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${uid}-metal`} x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity={dim ? 0.12 : 0.3} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="0.6" stopColor={DEEP} stopOpacity={0} />
          <stop offset="1" stopColor={DEEP} stopOpacity={0.35} />
        </linearGradient>
        <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6dc" stopOpacity={0.6} />
          <stop offset="0.3" stopColor="#ffeab8" stopOpacity={0.24} />
          <stop offset="1" stopColor="#ffe2a8" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`${uid}-pool`}>
          <stop offset="0" stopColor="#fff1cf" stopOpacity={0.7} />
          <stop offset="0.45" stopColor="#ffe0a3" stopOpacity={0.3} />
          <stop offset="1" stopColor="#ffd890" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}-bloom`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="0.22" stopColor="#fff4d6" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffe6b0" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}-red`}>
          <stop offset="0" stopColor="#ff5a5a" stopOpacity={0.8} />
          <stop offset="0.35" stopColor="#ff2a3c" stopOpacity={0.3} />
          <stop offset="1" stopColor="#ff2a3c" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* on the ground: the shadow, and with the lights on the pools they throw */}
      <ellipse cx={-4} cy={-1} rx={272} ry={14} fill={`url(#${uid}-shadow)`} />
      {[AXLE.rear, AXLE.front].map((cx) => (
        <ellipse key={cx} cx={cx} cy={-1.5} rx={42} ry={5.5} fill="#05040c" opacity={L.shadow * 1.2} />
      ))}
      {lights && (
        <g opacity={L.beam}>
          <ellipse cx={560} cy={-1} rx={300} ry={10} fill={`url(#${uid}-pool)`} />
          <ellipse cx={-300} cy={-1} rx={90} ry={7} fill={`url(#${uid}-red)`} opacity={0.6} />
        </g>
      )}

      {/* behind the wheels: the dark wheel wells, and the beam leaving the headlight */}
      <g transform={bodyT}>
        {[AXLE.rear, AXLE.front].map((cx) => <path key={cx} d={`${archArc(cx, ARCH)} Z`} fill={L.well} />)}
        {lights && (
          <g opacity={L.beam}>
            <path d="M 250 -100 L 900 -160 L 900 12 L 520 4 Z" fill={`url(#${uid}-beam)`} opacity={0.45} filter="url(#blur-14)" />
            <path d="M 252 -97 L 800 -130 L 800 -2 L 560 -2 L 252 -86 Z" fill={`url(#${uid}-beam)`} filter="url(#blur-2)" />
          </g>
        )}
      </g>

      {wheel(AXLE.rear)}
      {wheel(AXLE.front)}

      <g transform={bodyT}>
        <path d={CAR_BODY} fill={P.base} />
        <g clipPath={clip}>
          <path d={ZONE_UPPER} fill={P.upper} />
          <path d={ZONE_SHEEN} fill={`url(#${uid}-sheen)`} />
          <path d={ZONE_LOWER} fill={P.lower} />
          <path d={ZONE_SILL} fill={P.sill} />
          <path d={CREASE} stroke={P.crease} strokeWidth={1.8} fill="none" />
          <path d={ROOF_EDGE} stroke={P.rim} strokeWidth={5} fill="none" />
          <path d={BONNET_EDGE} stroke={P.rim} strokeWidth={4.5} fill="none" />
          <path d={HATCH_EDGE} stroke={P.crease} strokeWidth={4} fill="none" />
          {[AXLE.rear, AXLE.front].map((cx) => (
            <path key={cx} d={archArc(cx, ARCH + 1.5)} stroke={P.seam} strokeWidth={6} fill="none" />
          ))}
          <path d={SEAMS} stroke={P.seam} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <path d={FUEL_FLAP} stroke={P.seam} strokeWidth={1.6} fill="none" opacity={0.7} />
          {GLINTS.map(([gx, gy, rx, a], i) => (
            <ellipse key={i} cx={gx} cy={gy} rx={rx} ry={1.5} fill="#ffffff" opacity={dim ? 0.35 : 0.6} transform={`rotate(${a} ${gx} ${gy})`} />
          ))}
          <path d={INTAKE} fill={trim} />
          <path d={INTAKE_LIP} stroke={P.rim} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
          <path d={DIFFUSER} fill={trim} />
          <path d={REFLECTOR} fill="#b0283c" />
        </g>
        <path d={HANDLES} fill={P.seam} />
        <path d={HANDLES} fill="none" stroke={P.rim} strokeWidth={1} opacity={0.55} transform="translate(0 -1.2)" />
        <path d={ANTENNA} fill={P.lower} />

        {/* the glass, what is behind it, and the pillars */}
        <path d={CAR_GLASS} fill={`url(#${uid}-glassfill)`} />
        <g clipPath={`url(#${uid}-glass)`}>
          <path d={HEADRESTS} fill={L.inside} />
          <path d={WHEEL_TOP} stroke={L.inside} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d={GLARE} fill={L.glare} opacity={L.glareO} />
          <path d={B_PILLAR} fill={trim} />
          <path d={Q_BAR} fill={trim} />
        </g>
        <path d={BELT_TRIM} stroke={mix(L.metal[0], c, 0.35)} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
        <path d={MIRROR_FOOT} fill={trim} />
        <path d={MIRROR} fill={P.base} />
        <path d="M 60 -128.5 L 110 -128.5 L 110 -118 L 60 -118 Z" fill={P.lower} clipPath={`url(#${uid}-mirror)`} />
        <path d="M 73 -134 C 80 -135.6 91 -135.8 99 -135.2" stroke={P.rim} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.85} />

        {/* lamps */}
        <g clipPath={clip}>
          <path d={HEADLIGHT} fill={lights ? "#fffbea" : L.lens} />
          <path d={LAMP_HOUSING} stroke={lights ? "#ffe9b0" : mix(L.lens, DEEP, 0.45)} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <circle cx={PROJECTOR[0]} cy={PROJECTOR[1]} r={2.8} fill={lights ? "#ffffff" : mix(L.lens, DEEP, 0.3)} />
          <path d={DRL} stroke="#ffffff" strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={lights ? 1 : 0.85} />
          <path d={TAILLIGHT} fill={lights ? "#ff4a4f" : "#c02a3c"} />
          <path d="M -255 -105 L -230 -106" stroke={lights ? "#ffd0c8" : "#e8505c"} strokeWidth={2} strokeLinecap="round" />
        </g>
        {lights && (
          <>
            <circle cx={256} cy={-91} r={36} fill={`url(#${uid}-bloom)`} />
            <ellipse cx={258} cy={-91} rx={54} ry={2.2} fill="#ffffff" opacity={0.6} />
            <circle cx={-255} cy={-106} r={30} fill={`url(#${uid}-red)`} />
          </>
        )}
      </g>
    </g>
  );
};

// ── plane ────────────────────────────────────────────────────
// A twin-engined airliner from the side and a little above, facing right, centre at 0 0, px at s = 1.
const HULL = "M -205 -25 L 140 -25 C 178 -25 207 -19 222 -8 C 230 -2 233 5 230 10 C 226 17 212 24 185 25 L -70 25 C -120 25 -175 12 -218 -4 C -226 -7 -231 -9 -233 -11 L -233 -16 C -228 -21 -220 -25 -205 -25 Z";
/** the wing-to-body fairing, a shallow bulge under the wing root */
const FAIRING = "M 78 22 C 60 31 -30 32 -66 23 L -66 20 L 78 20 Z";
const FIN = "M -112 -24 C -140 -25 -165 -37 -172 -50 L -208 -116 C -210 -120 -213 -122 -217 -122 L -235 -122 C -239 -122 -241 -119 -240.5 -115 L -229 -20 Z";
const FIN_LE = "M -112 -24 C -140 -25 -165 -37 -172 -50 L -208 -116";
const RUDDER = "M -207 -22 L -229 -119 L -245 -119 L -232 -18 Z";
/** two accent stripes parallel to the fin's leading edge */
const FIN_STRIPES = "M -167.9 -26 L -179.9 -26 L -242.1 -140 L -230.1 -140 Z M -185.9 -26 L -189.9 -26 L -252.1 -140 L -248.1 -140 Z";
const STAB = "M -164 -2 L -201 35 C -203 38 -206 40 -210 40 L -225 40 C -229 40 -230 37 -228.5 34 L -214 -2 Z";
const WING = "M 64 11 C 62 15 58 19 52 22 L -54 92 C -57 95 -60 96 -64 96 L -83 96 C -87 96 -88 93 -86 90 L -55 43 L -44 17 Z";
const WING_LE = "M 64 11 C 62 15 58 19 52 22 L -54 92 L -64 96 L -60 85 L 44 17 Z";
const WING_FLAPS = "M -44 17 L -55 43 L -86 90 L -73 90 L -44.5 45 L -34 17 Z";
const FLAP_TRACKS = "M -40 31 L -55 33 L -38 36 Z M -58 62 L -73 64 L -56 67 Z";
const FAR_WING = "M 28 -14 L -40 -60 C -43 -63 -46 -64 -50 -64 L -63 -64 C -67 -64 -68 -61 -66.5 -58 L -44 -14 Z";
const FAR_WING_LE = "M 28 -14 L -40 -60 L -50 -64 L -46 -56 L 20 -14 Z";
/** the near engine: fan cowl (fat at the intake, tapering back), the narrower core and its plug, the pylon */
const NACELLE = "M 76 35 C 82 35 85 42 85 51 C 85 60 82 67 76 67 L 30 65.5 C 17 65 9 62.5 6 60 L 6 42 C 9 39.5 17 37 30 36.5 Z";
const LIP = "M 76 35 C 82 35 85 42 85 51 C 85 60 82 67 76 67 C 78.5 61 79.5 56 79.5 51 C 79.5 46 78.5 41 76 35 Z";
const CORE = "M 6 43.5 L -12 46 C -14 47.5 -14 54.5 -12 56 L 6 58.5 Z";
const PLUG = "M -12 47.5 L -25 51 L -12 54.5 Z";
const PYLON = "M 66 36 C 58 31 46 29 32 29 L -4 32 L -1 40 L 22 37.5 Z";
const COCKPIT = "M 179 -10.5 L 182.5 -17.6 L 196 -16.3 C 202 -15 208 -12.5 214 -9 L 215 -7 L 183 -7.6 Z";
const DOORS = [[146, -19, 11, 31], [-176, -19, 11, 26]] as const;
const WINDOWS = Array.from({ length: 28 }, (_, i) => 132 - i * 10.6);
/** where the lights sit: wingtips (navigation and strobe), tail, the red beacons on top and below */
const TIP_NEAR: [number, number] = [-61, 96.5];
const TIP_FAR: [number, number] = [-55, -64.5];

type PlaneLook = {
  /** fuselage tones from the top down; the light is from above by day, from below (a low sun) at dusk */
  hull: [string, string, string, string]; edge: string; fromBelow: boolean;
  wing: [string, string, string]; farWing: string;
  /** window colour and how much the cabin glows through them (0 day, 1 night) */
  win: string; cabin: number; cockpit: string;
  trail: [string, string]; trailO: number; amb: string; ambK: number;
};
const PLANE_LOOK: Record<TimeOfDay, PlaneLook> = {
  day: {
    hull: ["#fbfcfe", "#eaeef5", "#cdd4e3", "#b1bbd0"], edge: "#ffffff", fromBelow: false,
    wing: ["#f4f6fa", "#dbe1eb", "#b6bfd1"], farWing: "#a3adc2", win: "#29344f", cabin: 0, cockpit: "#1d2741",
    trail: ["#ffffff", "#f1f5ff"], trailO: 0.95, amb: "#ffffff", ambK: 0,
  },
  dawn: {
    hull: ["#c9b3cf", "#e3c3c8", "#f6d0bd", "#ffdcc0"], edge: "#fff0dc", fromBelow: true,
    wing: ["#f8d4bf", "#c6a5bd", "#a585a8"], farWing: "#93789f", win: "#4a3a5c", cabin: 0, cockpit: "#2b2340",
    trail: ["#fff0e0", "#f2c8d2"], trailO: 0.9, amb: "#4a3a6e", ambK: 0.18,
  },
  dusk: {
    hull: ["#b38fb6", "#d4a5b6", "#f1bea8", "#ffcfa8"], edge: "#ffe4c6", fromBelow: true,
    wing: ["#f6c3a6", "#b68aa8", "#94709a"], farWing: "#7f6290", win: "#f8d49c", cabin: 0.45, cockpit: "#291e3b",
    trail: ["#ffe2c9", "#f4b2c2"], trailO: 0.9, amb: "#3a2453", ambK: 0.22,
  },
  night: {
    hull: ["#5f6892", "#49517a", "#3b4267", "#3d3b5f"], edge: "#9ca8de", fromBelow: false,
    wing: ["#626b98", "#3f466b", "#31375b"], farWing: "#2b3152", win: "#ffe2a0", cabin: 1, cockpit: "#141932",
    trail: ["#bcc4ea", "#8e97c6"], trailO: 0.55, amb: "#0c1030", ambK: 0.45,
  },
};
/** fixed jitter for the contrail's puffs (size, height, brightness), the same every frame */
const PUFF_JIT = (() => {
  const r = rng(37);
  return Array.from({ length: 160 }, () => [r(), r(), r()] as const);
})();

/**
 * A contrail strand behind an engine at (x0, y0): it drifts to y1 while it spreads from w0 to w1 and wavers a
 * little more the older it is. Drawn as a closed outline (top edge out, bottom edge back).
 */
function strand(x0: number, y0: number, y1: number, len: number, w0: number, w1: number, T: number, ph: number) {
  const N = 32, top: string[] = [], bot: string[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const xx = x0 - u * len;
    const yc = y0 + (y1 - y0) * (1 - (1 - u) * (1 - u)) + 4 * u * u * Math.sin(u * 6 + T * 0.4 + ph);
    const ww = w0 + (w1 - w0) * Math.pow(u, 0.8);
    top.push(pt(xx, yc - ww / 2));
    bot.push(pt(xx, yc + ww / 2));
  }
  return `M ${top.join(" L ")} L ${bot.reverse().join(" L ")} Z`;
}

/**
 * An airliner, about 460 px long at s = 1, origin at its centre. `trail` is the length of the contrail behind it
 * (px, fading out); `lights` blinks the navigation lights and strobes; `tilt` pitches it (degrees, + nose up).
 * `time` is the light it flies in (see the top of this file).
 */
export const Plane: React.FC<{
  T: number; x: number; y: number; s?: number; flip?: boolean; trail?: number; lights?: boolean; tilt?: number; id?: string;
  time?: TimeOfDay;
}> = ({ T, x, y, s = 1, flip = false, trail = 0, lights = false, tilt = 0, id, time }) => {
  const { theme } = useSong();
  const look = time ?? (lights ? "dusk" : "day");
  const L = PLANE_LOOK[look];
  const uid = id ?? `plane-${look}`;
  const amb = (c: string, k = 1) => mix(c, L.amb, L.ambK * k);
  const navy = amb("#22357f", 1.4);
  const accent = amb(hex6(theme.kinds.mid.glow, "#ff3355"), 0.8);
  const [h0, h1, h2, h3] = L.hull;
  // the hull tones run top to bottom in the look's own light; the intake lip catches the lit side's tone
  const lit = L.fromBelow ? h3 : h0;
  // navigation lights: green on the right wing, red on the left; facing left, the near wing is the left one
  const near = flip ? "#ff3b4a" : "#3dff8a";
  const far = flip ? "#3dff8a" : "#ff3b4a";
  const nav = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((T / 1.6) * 2 * Math.PI));
  /** a flash at each offset in every period: on at once, then fading with time constant tau */
  const flashAt = (t: number, period: number, offs: number[], tau: number) => {
    const p = ((t % period) + period) % period;
    return Math.max(...offs.map((o) => (p >= o ? Math.exp(-(p - o) / tau) : 0)));
  };
  const strobe = flashAt(T - 0.28, 1.3, [0, 0.14], 0.05);
  const beacon = flashAt(T - 0.05, 1.05, [0], 0.12);
  const beacon2 = flashAt(T + 0.47, 1.05, [0], 0.12);
  const light = (key: string, [lx, ly]: [number, number], col: string, k: number, r: number) =>
    k > 0.02 && (
      <g key={key}>
        <circle cx={lx} cy={ly} r={r * (0.6 + 0.4 * k)} fill={`url(#${uid}-glow-${col.slice(1)})`} opacity={k} />
        <circle cx={lx} cy={ly} r={2.3} fill={mix(col, "#ffffff", 0.55)} opacity={Math.min(1, 0.4 + k)} />
      </g>
    );
  const glowCols = ["#ff3b4a", "#3dff8a", "#ffffff"];
  // the contrail: a little clear air behind the plugs, then two thin strands that converge on one line, and a
  // band of soft puffs that the air carries back along it, swelling and fading out at `trail`
  const hasTrail = trail > 30;
  const tx0 = -36, tl = Math.max(0, trail - 6);
  const ty = (u: number) => 37 + 5 * u * Math.sin(u * 5 + T * 0.35);
  const puffs: { x: number; y: number; r: number; o: number; c: string }[] = [];
  if (hasTrail) {
    const gap = Math.max(11, tl / 150), flow = 60;
    for (let i = 0; i < Math.floor(tl / gap); i++) {
      const d = (((i * gap + T * flow) % tl) + tl) % tl;
      const u = d / tl;
      const born = Math.min(1, Math.max(0, (u - 0.1) / 0.22));
      if (born <= 0) continue;
      const [ja, jb, jc] = PUFF_JIT[i % PUFF_JIT.length];
      const r = (3.5 + 20 * Math.pow(u, 0.8)) * (0.75 + 0.5 * ja);
      puffs.push({
        x: tx0 - d, y: ty(u) + (jb - 0.5) * r * 0.6, r,
        o: born * born * (3 - 2 * born) * (0.4 + 0.35 * jc), c: mix(L.trail[0], L.trail[1], Math.min(1, u * 1.4)),
      });
    }
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${flip ? tilt : -tilt}) scale(${flip ? -s : s} ${s})`}>
      <defs>
        <clipPath id={`${uid}-hull`}><path d={HULL} /></clipPath>
        <clipPath id={`${uid}-fin`}><path d={FIN} /></clipPath>
        <clipPath id={`${uid}-wing`}><path d={WING} /></clipPath>
        <clipPath id={`${uid}-farwing`}><path d={FAR_WING} /></clipPath>
        <clipPath id={`${uid}-nacelle`}><path d={NACELLE} /></clipPath>
        {/* the thin strands: in a few px after the clear air, then fading as they merge into the puffs */}
        <linearGradient id={`${uid}-trail`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor={L.trail[0]} stopOpacity={0} />
          <stop offset="0.06" stopColor={L.trail[0]} stopOpacity={L.trailO} />
          <stop offset="0.45" stopColor={L.trail[0]} stopOpacity={L.trailO * 0.65} />
          <stop offset="1" stopColor={L.trail[1]} stopOpacity={0} />
        </linearGradient>
        {/* the puffs and haze fade out along the trail (a mask over their whole band, generous so blur isn't cut) */}
        <linearGradient id={`${uid}-fadeg`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity={0.8} />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity={0.3} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${uid}-fade`} x="-0.1" y="-1" width="1.2" height="3" maskContentUnits="objectBoundingBox">
          <rect x={0} y={-1} width={1} height={3} fill={`url(#${uid}-fadeg)`} />
        </mask>
        {glowCols.map((col) => (
          <radialGradient key={col} id={`${uid}-glow-${col.slice(1)}`}>
            <stop offset="0" stopColor={col} stopOpacity={0.9} />
            <stop offset="0.3" stopColor={col} stopOpacity={0.35} />
            <stop offset="1" stopColor={col} stopOpacity={0} />
          </radialGradient>
        ))}
        <linearGradient id={`${uid}-cabin`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd890" stopOpacity={0} />
          <stop offset="0.1" stopColor="#ffd890" stopOpacity={0.5} />
          <stop offset="0.9" stopColor="#ffd890" stopOpacity={0.5} />
          <stop offset="1" stopColor="#ffd890" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* the contrail */}
      {hasTrail && (
        <g>
          <g mask={`url(#${uid}-fade)`}>
            <path d={strand(tx0, 40, 37, tl, 10, 60, T, 0)} fill={L.trail[1]} opacity={0.2 * L.trailO} filter="url(#blur-14)" />
            <g filter="url(#blur-6)">
              {puffs.map((p, i) => <circle key={i} cx={n1(p.x)} cy={n1(p.y)} r={n1(p.r)} fill={p.c} opacity={(p.o * L.trailO).toFixed(3)} />)}
            </g>
          </g>
          <path d={strand(tx0, 14, 37, tl * 0.45, 1.2, 9, T, 1.7)} fill={`url(#${uid}-trail)`} opacity={0.75} filter="url(#blur-2)" />
          <path d={strand(tx0, 51, 37, tl * 0.45, 1.5, 10, T, 0)} fill={`url(#${uid}-trail)`} filter="url(#blur-2)" />
        </g>
      )}

      {/* the far wing, behind the fuselage */}
      <path d={FAR_WING} fill={L.farWing} />
      <path d={FAR_WING_LE} fill={mix(L.farWing, L.wing[0], 0.45)} clipPath={`url(#${uid}-farwing)`} />

      {/* fuselage: tone bands that follow the tail's upsweep, a rim on the lit side, the cheatline, windows */}
      <path d={FAIRING} fill={L.fromBelow ? h3 : h2} />
      <path d={HULL} fill={h1} />
      <g clipPath={`url(#${uid}-hull)`}>
        <path d="M 260 -40 L 260 -9 L -70 -9 C -130 -9.5 -190 -12 -245 -16 L -245 -40 Z" fill={h0} />
        <path d="M 260 9 L -70 9 C -130 8 -190 -2 -245 -11 L -245 40 L 260 40 Z" fill={h2} />
        <path d="M 260 18.5 L -70 18.5 C -130 17 -190 4 -245 -7 L -245 40 L 260 40 Z" fill={h3} />
        {L.fromBelow
          ? <path d="M 260 24 L -70 24 C -120 24 -175 11 -230 -9" stroke={L.edge} strokeWidth={3} fill="none" opacity={0.85} />
          : <path d="M 260 -24 L -245 -24" stroke={L.edge} strokeWidth={3} fill="none" opacity={0.9} />}
        <path d="M 236 3.5 L -70 3.5 C -130 2.5 -185 -4 -240 -11" stroke={accent} strokeWidth={3} fill="none" />
        <path d={COCKPIT} fill={L.cockpit} />
        <path d="M 191.5 -16.8 L 190.5 -7.8 M 203 -14 L 202 -8" stroke={h1} strokeWidth={1.3} />
        <path d="M 184.5 -15.5 L 189 -15.8" stroke="#ffffff" strokeWidth={1.4} opacity={0.55} strokeLinecap="round" />
      </g>
      {DOORS.map(([dx, dy, dw, dh], i) => (
        <rect key={i} x={dx} y={dy} width={dw} height={dh} rx={3} fill="none" stroke={mix(h2, DEEP, 0.15)} strokeWidth={1.3} />
      ))}
      {L.cabin > 0 && <rect x={-160} y={-15} width={300} height={13} fill={`url(#${uid}-cabin)`} opacity={L.cabin * 0.55} filter="url(#blur-2)" />}
      {WINDOWS.map((wx, i) => (
        <rect key={i} x={n1(wx - 2.6)} y={-12.5} width={5.2} height={7.5} rx={2.6} fill={L.win} />
      ))}

      {/* tail: fin with stripes and rudder, the near tailplane */}
      <path d={FIN} fill={navy} />
      <g clipPath={`url(#${uid}-fin)`}>
        <path d={RUDDER} fill={mix(navy, DEEP, 0.25)} />
        <path d={FIN_STRIPES} fill={accent} />
        <path d={FIN_LE} stroke={mix(navy, L.fromBelow ? L.edge : "#ffffff", 0.35)} strokeWidth={4} fill="none" />
      </g>
      <path d={STAB} fill={L.wing[1]} />
      <path d="M -164 -2 L -201 35" stroke={L.wing[0]} strokeWidth={3} fill="none" />
      <path d="M -214 -2 L -228.5 34" stroke={L.wing[2]} strokeWidth={4} fill="none" />

      {/* near wing with its engine */}
      <path d={FLAP_TRACKS} fill={L.wing[2]} />
      <path d={WING} fill={L.wing[1]} />
      <g clipPath={`url(#${uid}-wing)`}>
        <path d={WING_LE} fill={L.wing[0]} />
        <path d={WING_FLAPS} fill={L.wing[2]} />
        <path d="M -50 56 L -62 58 M -66 79 L -77 81" stroke={mix(L.wing[2], DEEP, 0.2)} strokeWidth={1.2} />
      </g>
      <path d={PYLON} fill={mix(L.wing[1], DEEP, 0.12)} />
      <path d={CORE} fill={mix(h2, DEEP, 0.3)} />
      <path d={PLUG} fill={mix(h2, DEEP, 0.55)} />
      <path d={NACELLE} fill={h1} />
      <g clipPath={`url(#${uid}-nacelle)`}>
        <path d="M 90 52 L 90 72 L 0 72 L 0 52 Z" fill={h3} opacity={0.85} />
        <path d="M 90 30 L 90 42 L 0 42 L 0 30 Z" fill={h0} opacity={0.9} />
        <path d="M 9 30 L 9 72" stroke={mix(h2, DEEP, 0.35)} strokeWidth={3} />
      </g>
      <path d={LIP} fill={mix(lit, "#ffffff", 0.45)} />

      {/* lights */}
      {lights && (
        <g>
          {light("nn", TIP_NEAR, near, nav, 18)}
          {light("nf", TIP_FAR, far, nav, 14)}
          {light("sn", [-80, 96], "#ffffff", strobe, 34)}
          {light("sf", [-66, -64], "#ffffff", strobe, 26)}
          {light("st", [-233, -13.5], "#ffffff", 0.5 + 0.2 * nav, 9)}
          {light("bt", [40, -26], "#ff3b4a", beacon, 22)}
          {light("bb", [-96, 24.5], "#ff3b4a", beacon2, 22)}
        </g>
      )}
    </g>
  );
};
