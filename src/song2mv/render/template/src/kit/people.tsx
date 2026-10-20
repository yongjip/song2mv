import React from "react";
import { INK, shade } from "./color";

/**
 * People. Use inside <Svg> on the 1920×1080 stage.
 *
 * `Person` is a side-view rig facing right (`flip` faces left), 4.5 heads tall: about 300 px at s = 1, origin at the
 * middle of the soles. Stiffness comes from symmetry, a spine parallel to the frame edge, weight on no leg and parts
 * that all move together, so every pose has contrapposto (weight on the back leg, hips and shoulders tilted against
 * each other), a line of action from hip to head, arms that differ, follow-through on loose parts (hood strings,
 * hair, skirt), and a slow idle weight shift so a standing person never freezes.
 * `walk` and `run` take `phase` (one stride pair per 1.0): move x by STRIDE (or RUN_STRIDE) × s per phase unit and
 * the feet won't slide. Outlines are a thin ink line; far limbs get one shade.
 */

export const STRIDE = 114; // px per walk cycle at s = 1
export const RUN_STRIDE = 190;

export type Pose =
  | "stand" | "walk" | "run" | "sit" | "kneel" | "armsUp" | "lookUp" | "phone" | "sing" | "point" | "hold" | "reach"
  | "wave" | "balance";
export type Outfit = "hoodie" | "suit" | "dress";
export type Hair = "short" | "long" | "ponytail";
export const SKINS = { light: "#f0c3a0", medium: "#d9a07a", tan: "#b97c55", deep: "#7a4b32" } as const;

type Angles = {
  sL: number; eL: number; sR: number; eR: number; hL: number; kL: number; hR: number; kR: number;
  lean: number; head: number; dy: number; fL: number; fR: number; hipX: number; pelvis: number; shoulders: number;
  pocket: boolean;
};
// Degrees. Hanging limbs are 0; raising a limb forward (+x) is +. Elbows and knees are relative to the upper part.
// pelvis/shoulders tilt the front side down (+). The base pose is contrapposto: weight on the back (left) leg, the
// front leg loose, the body leaning back a little and the head forward.
const BASE: Angles = { sL: -16, eL: 58, sR: -20, eR: 75, hL: -3, kL: 2, hR: 11, kR: 16, lean: -3, head: 7, dy: 0, fL: 0, fR: 12, hipX: -5, pelvis: 4, shoulders: -3, pocket: true };
const POSES: Record<Exclude<Pose, "walk" | "run">, Partial<Angles>> = {
  stand: {},
  sit: { hL: 92, kL: -92, hR: 88, kR: -90, sL: 30, eL: 40, sR: 38, eR: 48, dy: 58, lean: 6, head: 4, hipX: 0, pelvis: 0, shoulders: 0, pocket: false, fR: 0 },
  kneel: { hL: 0, kL: -88, hR: 92, kR: -90, dy: 58, lean: 10, sL: 20, eL: 30, sR: 30, eR: 40, pocket: false, hipX: 0, pelvis: 0, shoulders: 0, fR: 0 },
  armsUp: { sL: 158, eL: -14, sR: 170, eR: -4, lean: -9, head: -12, hR: 14, kR: 10, pocket: false, shoulders: -5 },
  lookUp: { lean: -10, head: -28, hR: 8, kR: 10, sL: -14, eL: 20, shoulders: -6 },
  phone: { sL: 30, eL: -120, sR: 44, eR: -124, head: 20, lean: 5, pocket: false, hR: 6, kR: 12 },
  sing: { sR: 64, eR: -58, sL: -14, eL: 22, head: -18, lean: -7, hR: 16, kR: 8, pocket: false, shoulders: -5 },
  point: { sR: 92, eR: 0, sL: -14, eL: 20, head: -2, lean: 7, hR: 16, kR: 6, pocket: false },
  hold: { sL: 40, eL: -60, sR: 48, eR: -70, head: 12, lean: 2, pocket: false },
  reach: { sR: 74, eR: -36, sL: -12, eL: 16, head: -5, lean: -2, pocket: false },
  wave: { sR: 150, eR: -30, sL: -14, eL: 18, head: -4, lean: -4, hR: 12, kR: 10, pocket: false, shoulders: -4 },
  balance: { hL: 38, kL: 34, hR: -34, kR: 30, lean: 14, head: -6, sL: 96, eL: -20, sR: -70, eR: -10, dy: 10, pocket: false, hipX: 0, pelvis: 0, shoulders: 0, fR: 0 },
};
// Lengths for a 300 px figure: head 66 · neck 12 · torso 100 · legs 122
const L = { ua: 52, fa: 48, th: 60, sh: 56 };

const rad = (d: number) => (d * Math.PI) / 180;
const fk = (x: number, y: number, len: number, a: number): [number, number] => [x + len * Math.sin(rad(a)), y + len * Math.cos(rad(a))];
const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(rad(a)) - y * Math.sin(rad(a)), x * Math.sin(rad(a)) + y * Math.cos(rad(a))];


/**
 * Walk: contact (0) → down → passing (0.25) → up → contact (0.5) …. Run: longer strides, a knee that folds right
 * back while the leg swings forward, forearms bent forward, the body highest when the legs are spread (flight).
 * Each arm swings against the leg on its own side.
 */
function cycle(run: boolean, phase: number): Angles {
  const p = phase * Math.PI * 2;
  const w = Math.sin(p);
  const arm = run ? 40 : 26;
  const common = { ...BASE, sL: -arm * w, sR: arm * w, fL: -16 * w, fR: 16 * w, hipX: 0, pelvis: 3 * w, shoulders: -3 * w, pocket: false };
  if (run) {
    // a leg swings forward while cos(θ) > 0: that is when its knee folds back (negative = heel towards the seat)
    const leg = (th: number): [number, number] => [40 * Math.sin(th), -(12 + 100 * Math.pow(Math.max(0, Math.cos(th)), 1.3))];
    const [hL, kL] = leg(p), [hR, kR] = leg(p + Math.PI);
    return { ...common, hL, kL, hR, kR, eL: 95, eR: 95, lean: 16, head: -6, dy: -16 * Math.abs(w) + 4 };
  }
  const swingL = Math.max(0, -Math.cos(p)), swingR = Math.max(0, Math.cos(p));
  const kL = 8 + 55 * swingL * Math.max(0, Math.sin(p + Math.PI / 2 + 0.6));
  const kR = 8 + 55 * swingR * Math.max(0, Math.sin(p - Math.PI / 2 + 0.6));
  return { ...common, hL: 28 * w, kL, hR: -28 * w, kR, eL: 28 + 18 * Math.abs(w), eR: 28 + 18 * Math.abs(w), lean: 8, head: 3, dy: -9 * Math.abs(Math.cos(p)) + 3 };
}

function angles(pose: Pose, phase: number, T: number): Angles {
  if (pose === "walk" || pose === "run") return cycle(pose === "run", phase);
  const a = { ...BASE, ...POSES[pose] };
  if (pose === "wave") a.eR = -40 + 32 * Math.sin(T * 8);
  return a;
}

/** Hip, shoulders and neck. Poses that stand still get a very slow weight shift and breathing */
function body(a: Angles, pose: Pose, T: number) {
  const idle = pose === "walk" || pose === "run" ? 0 : 1;
  const lean = a.lean + 1.4 * idle * Math.sin(T * 0.6);
  const hipX = a.hipX + 2 * idle * Math.sin(T * 0.6 + 1);
  const breathe = 1.2 * Math.sin(T * 1.8);
  const hip: [number, number] = [hipX, -122 + a.dy];
  const [sx, sy] = rot(0, -102 + breathe, lean);
  const shoulder: [number, number] = [hip[0] + sx, hip[1] + sy];
  const [nx, ny] = rot(8, -114 + breathe, lean);
  const neckTop: [number, number] = [hip[0] + nx, hip[1] + ny];
  return { lean, hip, shoulder, neckTop };
}

/** Where the front hand is, in the person's own coordinates × s — to hang a prop on it (mirror x when flipped) */
export function personHand(pose: Pose, s = 1, phase = 0, T = 0): [number, number] {
  const a = angles(pose, phase, T);
  const b = body(a, pose, T);
  const shR: [number, number] = [b.shoulder[0] + 12, b.shoulder[1] - a.shoulders];
  const [ex, ey] = fk(shR[0], shR[1], L.ua, a.sR);
  const [hx, hy] = fk(ex, ey, L.fa, a.sR + a.eR);
  return [hx * s, (hy + 12) * s];
}

/** A tapering limb between two joints, with an ink outline; `shade` darkens far limbs */
const Limb: React.FC<{ from: [number, number]; to: [number, number]; w1: number; w2: number; color: string; shade?: number; hi?: string }> = ({ from, to, w1, w2, color, shade: dark = 0, hi }) => {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const poly = `${from[0] + (nx * w1) / 2},${from[1] + (ny * w1) / 2} ${to[0] + (nx * w2) / 2},${to[1] + (ny * w2) / 2} ${to[0] - (nx * w2) / 2},${to[1] - (ny * w2) / 2} ${from[0] - (nx * w1) / 2},${from[1] - (ny * w1) / 2}`;
  const shape = (fill: string, extra?: React.SVGProps<SVGGElement>) => (
    <g fill={fill} {...extra}>
      <polygon points={poly} /><circle cx={from[0]} cy={from[1]} r={w1 / 2} /><circle cx={to[0]} cy={to[1]} r={w2 / 2} />
    </g>
  );
  return (
    <g>
      {shape(INK, { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" })}
      {shape(color)}
      {hi && <line x1={from[0] + nx * w1 * 0.28} y1={from[1] + ny * w1 * 0.28} x2={to[0] + nx * w2 * 0.28} y2={to[1] + ny * w2 * 0.28} stroke={hi} strokeWidth={Math.min(w1, w2) * 0.28} strokeLinecap="round" opacity={0.7} />}
      {dark > 0 && shape("#000", { opacity: dark })}
    </g>
  );
};

const SHOE_PATH = "M -14 -14 Q -18 2 -12 10 L 34 10 Q 44 8 42 0 Q 36 -8 20 -10 Q 4 -12 -4 -18 Z";
const FLAT_PATH = "M -12 -6 Q -14 4 -8 8 L 32 8 Q 40 6 38 0 Q 30 -6 14 -6 Z";
const Shoe: React.FC<{ at: [number, number]; ang: number; color: string; sole: string; flat?: boolean; lace?: string; shade?: number }> = ({ at, ang, color, sole, flat, lace, shade: dark = 0 }) => {
  const d = flat ? FLAT_PATH : SHOE_PATH;
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${ang})`}>
      <path d={d} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d={d} fill={color} />
      {!flat && <path d="M -13 4 L 36 4 Q 44 6 42 2 L 42 0 Q 44 8 34 10 L -12 10 Q -16 8 -13 4 Z" fill={sole} />}
      {lace && <path d="M 2 -12 Q 10 -4 24 -6" stroke={lace} strokeWidth={3} fill="none" />}
      {dark > 0 && <path d={d} fill="#000" opacity={dark} />}
    </g>
  );
};

const Hand: React.FC<{ at: [number, number]; ang: number; skin: string; shade?: number }> = ({ at, ang, skin, shade: dark = 0 }) => (
  <g transform={`translate(${at[0]} ${at[1]}) rotate(${ang})`}>
    <ellipse cx={0} cy={10} rx={11} ry={14} fill={INK} stroke={INK} strokeWidth={3} />
    <circle cx={9} cy={4} r={5} fill={INK} stroke={INK} strokeWidth={3} />
    <ellipse cx={0} cy={10} rx={11} ry={14} fill={skin} />
    <circle cx={9} cy={4} r={5} fill={skin} />
    {dark > 0 && <ellipse cx={0} cy={10} rx={11} ry={14} fill="#000" opacity={dark} />}
  </g>
);

// Head, in its own coordinates (centre of the skull, facing right)
const HAIR_SHORT = "M -40 -18 Q -46 -44 -14 -50 Q 20 -54 34 -34 L 34 -14 Q 10 -30 -14 -24 Q -34 -18 -36 10 L -42 4 Z";
const FACE = "M -34 -22 Q -40 20 -14 34 Q 10 42 28 26 L 34 12 L 40 8 L 36 2 L 38 -6 L 34 -18 Q 12 -46 -14 -42 Q -36 -38 -34 -22 Z";
const FRINGE = "M -8 -46 Q 18 -50 36 -30 Q 38 -22 30 -20 Q 24 -32 10 -32 Q 22 -24 16 -16 Q 10 -30 -6 -28 Z";
/** Long hair falls behind the neck; `sw` swings its ends */
const hairLong = (sw: number) =>
  `M -40 -18 Q -48 -48 -14 -52 Q 22 -56 36 -34 L 34 -14 Q 12 -30 -12 -26 Q -28 -20 -30 14 Q ${-30 + sw * 0.4} 52 ${-20 + sw} 84 Q ${-36 + sw} 90 ${-50 + sw * 0.8} 70 Q -56 30 -40 -18 Z`;
/** A ponytail from its tie, hanging down (+y) and a little back; the caller turns it against the head's tilt */
const PONYTAIL = "M 4 -6 Q -18 -6 -26 24 Q -32 56 -16 78 Q -12 52 -6 30 Q 0 10 10 4 Z";

export type Look = {
  outfit: Outfit; hair: Hair; skin: string;
  top: string; pants: string; shoes: string; hairColor: string; accent: string;
};
const LOOKS: Record<Outfit, Omit<Look, "outfit" | "hair" | "skin" | "hairColor" | "accent">> = {
  hoodie: { top: "#3b4fb0", pants: "#1f2a6b", shoes: "#f2f4ff" },
  suit: { top: "#1b2252", pants: "#121737", shoes: "#0d1130" },
  dress: { top: "#c8364f", pants: "#2a1b30", shoes: "#2a1b30" },
};

/**
 * A person. `look` sets outfit (hoodie, suit, dress), hair (short, long, ponytail), skin and colours; anything left
 * out comes from the outfit's defaults. `prop` is drawn in the person's own coordinates, after everything else
 * (personHand gives the front hand's position).
 */
export const Person: React.FC<{
  x: number; y: number; s?: number; pose?: Pose; phase?: number; flip?: boolean; opacity?: number; T?: number;
  look?: Partial<Look>; prop?: React.ReactNode; shadow?: boolean; tie?: boolean;
}> = ({ x, y, s = 1, pose = "stand", phase = 0, flip = false, opacity = 1, T = 0, look = {}, prop, shadow = true, tie = true }) => {
  const outfit = look.outfit ?? "hoodie";
  const base = LOOKS[outfit];
  const top = look.top ?? base.top, pants = look.pants ?? base.pants, shoes = look.shoes ?? base.shoes;
  const skin = look.skin ?? SKINS.light, skinDark = shade(skin, 0.88);
  const hairColor = look.hairColor ?? "#3a2a24";
  const hair = look.hair ?? (outfit === "dress" ? "long" : "short");
  const accent = look.accent ?? "#3fe6ff";
  const topDark = shade(top, 0.74), topHi = shade(top, 1.22);
  const suit = outfit === "suit", dress = outfit === "dress";

  const a = angles(pose, phase, T);
  const { lean, hip, shoulder, neckTop } = body(a, pose, T);
  const moving = pose === "walk" || pose === "run";
  const hipL: [number, number] = [hip[0] - 7, hip[1] - a.pelvis], hipR: [number, number] = [hip[0] + 7, hip[1] + a.pelvis];
  const shL: [number, number] = [shoulder[0] - 12, shoulder[1] + a.shoulders], shR: [number, number] = [shoulder[0] + 12, shoulder[1] - a.shoulders];
  const kneeL = fk(hipL[0], hipL[1], L.th, a.hL), ankL = fk(kneeL[0], kneeL[1], L.sh, a.hL + a.kL);
  const kneeR = fk(hipR[0], hipR[1], L.th, a.hR), ankR = fk(kneeR[0], kneeR[1], L.sh, a.hR + a.kR);
  const elL = fk(shL[0], shL[1], L.ua, a.sL), wrL = fk(elL[0], elL[1], L.fa, a.sL + a.eL);
  const elR = fk(shR[0], shR[1], L.ua, a.sR), wrR = fk(elR[0], elR[1], L.fa, a.sR + a.eR);
  const headAng = lean + a.head;
  const [hdx, hdy] = rot(2, -38, headAng);
  const hc: [number, number] = [neckTop[0] + hdx, neckTop[1] + hdy];
  // follow-through: strings, hair and hem lag behind the body, more while moving
  const swing = (moving ? 9 : 3) * Math.sin(T * 2.4 - 0.6) + (moving ? -6 : 0);
  const legColor = dress ? skinDark : pants;
  const torsoH = 102;
  const footL = -(a.hL + a.kL) * 0.35 + a.fL, footR = -(a.hR + a.kR) * 0.35 + a.fR;
  const sole = suit ? "#2a2f55" : shade(shoes, 0.82);

  // skirt: from the waist to a hem spanning both knees, flaring a little, hem lagging behind the walk
  const kx = [kneeL[0], kneeR[0]];
  const hemY = Math.max(kneeL[1], kneeR[1]) - 4 + a.dy * 0.1;
  const skirt = `M ${hip[0] - 30} ${hip[1] - 8} Q ${Math.min(...kx) - 26 + swing * 0.4} ${hemY - 30} ${Math.min(...kx) - 22 + swing} ${hemY} L ${Math.max(...kx) + 26 + swing} ${hemY} Q ${Math.max(...kx) + 24} ${hemY - 30} ${hip[0] + 32} ${hip[1] - 8} Z`;

  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={opacity}>
      {shadow && <ellipse cx={10} cy={4} rx={72} ry={11} fill="#000" opacity={0.45} />}
      {/* far (left) arm and leg */}
      <Limb from={shL} to={elL} w1={24} w2={19} color={top} shade={0.3} />
      <Limb from={elL} to={wrL} w1={19} w2={15} color={top} shade={0.3} />
      <Hand at={wrL} ang={-(a.sL + a.eL)} skin={skinDark} shade={0.25} />
      <Limb from={hipL} to={kneeL} w1={dress ? 22 : 32} w2={dress ? 17 : 25} color={legColor} shade={0.3} />
      <Limb from={kneeL} to={ankL} w1={dress ? 17 : 25} w2={dress ? 13 : 18} color={legColor} shade={0.3} />
      <Shoe at={ankL} ang={footL} color={shoes} sole={sole} flat={dress} lace={outfit === "hoodie" ? top : undefined} shade={0.3} />
      {dress && (
        <>
          <Limb from={hipR} to={kneeR} w1={22} w2={17} color={skin} />
          <Limb from={kneeR} to={ankR} w1={17} w2={13} color={skin} />
          <Shoe at={ankR} ang={footR} color={shoes} sole={sole} flat />
          <path d={skirt} fill={top} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d={`M ${hip[0] + 6} ${hip[1] - 4} Q ${hip[0] + 10 + swing * 0.3} ${hemY - 30} ${hip[0] + 12 + swing * 0.8} ${hemY - 4}`} stroke={topDark} strokeWidth={4} fill="none" opacity={0.7} />
        </>
      )}
      {/* torso, turned at the hip by the lean */}
      <g transform={`translate(${hip[0]} ${hip[1]}) rotate(${lean})`}>
        {outfit === "hoodie" && (
          <path d={`M -14 ${-torsoH + 2} Q ${-46 + swing * 0.6} ${-torsoH + 6} ${-40 + swing} ${-torsoH + 30} Q ${-36 + swing * 1.2} ${-torsoH + 46} ${-22 + swing * 0.6} ${-torsoH + 36} Q -10 ${-torsoH + 22} 4 ${-torsoH + 10} Z`} fill={topDark} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        )}
        <path d={`M -36 ${-torsoH + 4} Q -44 ${-torsoH + 60} -32 ${dress ? -6 : 8} L 34 ${dress ? -6 : 8} Q 46 ${-torsoH + 60} 38 ${-torsoH + 2} Q 2 ${-torsoH - 10} -36 ${-torsoH + 4} Z`} fill={top} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d={`M 14 ${-torsoH + 12} Q 30 ${-torsoH + 60} 22 -4`} stroke={topHi} strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.8} />
        {suit && (
          <>
            <path d={`M -8 ${-torsoH} L 4 ${-torsoH + 78} L 16 ${-torsoH} Z`} fill="#eef1ff" />
            <path d={`M -36 ${-torsoH + 4} L -2 ${-torsoH + 86} L -10 ${-torsoH + 4} Z M 38 ${-torsoH + 2} L 10 ${-torsoH + 86} L 18 ${-torsoH + 2} Z`} fill={topDark} />
            {tie && <path d={`M 1 ${-torsoH + 10} L 4 ${-torsoH + 76} L 7 ${-torsoH + 10} Z`} fill={accent} />}
            <rect x={-34} y={-12} width={68} height={6} fill={topDark} />
          </>
        )}
        {outfit === "hoodie" && (
          <>
            <path d={`M -8 ${-torsoH - 2} Q 4 ${-torsoH + 20} 18 ${-torsoH}`} stroke={topDark} strokeWidth={5} fill="none" strokeLinecap="round" />
            <line x1={0} y1={-torsoH + 12} x2={-2 + swing * 0.6} y2={-torsoH + 46} stroke={shoes} strokeWidth={3} strokeLinecap="round" />
            <line x1={8} y1={-torsoH + 12} x2={10 + swing * 0.6} y2={-torsoH + 42} stroke={shoes} strokeWidth={3} strokeLinecap="round" />
            <path d="M -24 -36 Q 0 -28 26 -36 L 26 -4 L -24 -4 Z" fill={topDark} opacity={0.75} />
            <rect x={-32} y={2} width={66} height={6} fill={topDark} />
          </>
        )}
        {dress && <path d={`M -30 -14 Q 2 -8 34 -14`} stroke={topDark} strokeWidth={6} fill="none" strokeLinecap="round" />}
      </g>
      {/* near (right) leg */}
      {!dress && <Limb from={hipR} to={kneeR} w1={32} w2={25} color={pants} hi={suit ? undefined : shade(pants, 1.25)} />}
      {!dress && <Limb from={kneeR} to={ankR} w1={25} w2={18} color={pants} hi={suit ? undefined : shade(pants, 1.25)} />}
      {!dress && <Shoe at={ankR} ang={footR} color={shoes} sole={sole} lace={outfit === "hoodie" ? top : undefined} />}
      {/* neck and head */}
      <line x1={neckTop[0]} y1={neckTop[1] + 6} x2={shoulder[0] + 2} y2={shoulder[1] + 8} stroke={INK} strokeWidth={24} strokeLinecap="round" />
      <line x1={neckTop[0]} y1={neckTop[1] + 6} x2={shoulder[0] + 2} y2={shoulder[1] + 8} stroke={skinDark} strokeWidth={18} strokeLinecap="round" />
      <g transform={`translate(${hc[0]} ${hc[1]}) rotate(${headAng})`}>
        {hair === "long" && <path d={hairLong(swing)} fill={hairColor} stroke={INK} strokeWidth={3} strokeLinejoin="round" />}
        {hair === "ponytail" && (
          <g transform={`translate(-30 -30) rotate(${-headAng * 0.85 + swing * 1.5})`}>
            <path d={PONYTAIL} fill={hairColor} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
            <circle cx={2} cy={-2} r={6} fill={accent} stroke={INK} strokeWidth={2} />
          </g>
        )}
        <path d={HAIR_SHORT} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d={FACE} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d={FACE} fill={skin} />
        <path d="M -20 30 Q 6 40 26 24 L 20 20 Q 4 30 -16 24 Z" fill={skinDark} opacity={0.6} />
        <ellipse cx={-22} cy={2} rx={6.5} ry={8.5} fill={skinDark} stroke={shade(skin, 0.68)} strokeWidth={1.5} />
        <path d="M -24 -3 Q -19 1 -23 7" stroke={shade(skin, 0.68)} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <ellipse cx={20} cy={-6} rx={4} ry={6} fill="#141a3a" />
        <circle cx={21.5} cy={-8} r={1.4} fill="#fff" />
        <path d="M 12 -18 Q 22 -24 30 -18" stroke={hairColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d={HAIR_SHORT} fill={hairColor} />
        <path d={FRINGE} fill={hairColor} stroke={INK} strokeWidth={2} strokeLinejoin="round" transform={`translate(${swing * 0.3} 0)`} />
        <path d="M -30 -36 Q -10 -46 14 -42" stroke={shade(hairColor, 1.35)} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9} />
      </g>
      {/* near (right) arm */}
      <Limb from={shR} to={elR} w1={24} w2={19} color={top} hi={topHi} />
      <Limb from={elR} to={wrR} w1={19} w2={15} color={top} hi={topHi} />
      {outfit === "hoodie" && <circle cx={wrR[0]} cy={wrR[1]} r={9} fill={topDark} />}
      <Hand at={wrR} ang={-(a.sR + a.eR)} skin={skin} />
      {/* a hand in the hoodie pocket: the pocket's front is drawn over it */}
      {a.pocket && outfit === "hoodie" && (
        <g transform={`translate(${hip[0]} ${hip[1]}) rotate(${lean})`}>
          <path d="M -2 -34 Q 14 -28 30 -36 Q 36 -22 34 -4 L -2 -4 Z" fill={top} />
          <path d="M -2 -34 Q 14 -28 30 -36 Q 36 -22 34 -4 L -2 -4 Z" fill={topDark} opacity={0.75} />
          <path d="M -2 -34 Q 14 -28 30 -36" stroke={INK} strokeWidth={2} fill="none" />
        </g>
      )}
      {pose === "phone" && (
        <g transform={`translate(${wrR[0] + 10} ${wrR[1] + 2}) rotate(-24)`}>
          <rect x={-16} y={-30} width={32} height={58} rx={5} fill="#0f1430" stroke={accent} strokeWidth={2} />
          <rect x={-12} y={-24} width={24} height={46} rx={2} fill={accent} opacity={0.8} />
        </g>
      )}
      {prop}
    </g>
  );
};
