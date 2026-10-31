import React from "react";
import { mix } from "../color";
import { clamp01 } from "../math";
import { useSong } from "../song";

/**
 * A cel-shaded cyberpunk-anime head and bust, drawn in code: `AnimeHead` and `AnimeBust` (head, jacket and collar) in a
 * front or a three-quarter view, facing either way, with eyes, brows and mouth set by `expression`, blinking by
 * itself and talking from `talk`. `Neon` lights a whole frame in two colours, `eyeShot` places a head for an eye
 * close-up, `SpeedLines` and `Split` make a flash cut. A head at `s` = 1 is about 380 px tall, hair top to chin; its
 * origin is the middle of the face, a bust's torso runs 300 px below it.
 */

type P = [number, number];
type E = [number, number, number];

export type Angle = "front" | "three-quarter";
export type Facing = "left" | "right";
export type Eyes = "open" | "closed" | "smile" | "wide";
export type Brows = "neutral" | "angry" | "sad" | "raised";
export type Mouth = "closed" | "smile" | "open" | "shout";
export type Expression = { eyes: Eyes; brows: Brows; mouth: Mouth };

/** Ready-made expressions: `<AnimeHead expression={faces.angry} />` */
export const faces: Record<"calm" | "happy" | "angry" | "sad" | "shock" | "shout", Expression> = {
  calm: { eyes: "open", brows: "neutral", mouth: "closed" },
  happy: { eyes: "smile", brows: "raised", mouth: "smile" },
  angry: { eyes: "open", brows: "angry", mouth: "open" },
  sad: { eyes: "open", brows: "sad", mouth: "closed" },
  shock: { eyes: "wide", brows: "raised", mouth: "open" },
  shout: { eyes: "open", brows: "angry", mouth: "shout" },
};

export type Palette = {
  ink: string;
  skin: string; skinShade: string; skinDeep: string; lip: string;
  eyeWhite: string; eyeShade: string; iris: [string, string, string, string];
  hair: string; hairShade: string; hairLight: string;
  /** rim light on the near side, and the far side's: the hair streak, the collar band and the face's fill light */
  near: string; far: string;
  /** under-eye lines, cheek implant, earpiece */
  led: string;
  jacket: string; jacketShade: string; jacketLight: string; collar: string; trim: string; accent: string;
};

export const palettes: Record<"neon" | "ember", Palette> = {
  neon: {
    ink: "#110c1c",
    skin: "#f4ded8", skinShade: "#b49ac2", skinDeep: "#7a6399", lip: "#5a1f2c",
    eyeWhite: "#eef3ff", eyeShade: "#9fb0e6", iris: ["#2e0f05", "#a6481a", "#ffa63d", "#fff0b0"],
    hair: "#262a6a", hairShade: "#14163c", hairLight: "#5a63cc",
    near: "#86f7ff", far: "#ff4fa8", led: "#29e0ff",
    jacket: "#1a2042", jacketShade: "#0f1329", jacketLight: "#2b3566", collar: "#232b54", trim: "#ffd23f", accent: "#ff6a3d",
  },
  ember: {
    ink: "#1a0d12",
    skin: "#f3d9cf", skinShade: "#c79aa8", skinDeep: "#8a5f78", lip: "#6a2433",
    eyeWhite: "#f6f1f2", eyeShade: "#c9b0c4", iris: ["#06232a", "#0b6b72", "#2fd1c3", "#dffff0"],
    hair: "#3b1c3a", hairShade: "#1f0e22", hairLight: "#8b4a7e",
    near: "#ffc46b", far: "#7a5cff", led: "#ffb02e",
    jacket: "#2a1a2e", jacketShade: "#170d1a", jacketLight: "#46294d", collar: "#35203a", trim: "#2fd1c3", accent: "#ffb02e",
  },
};

export type HeadProps = {
  T: number;
  /** the middle of the face on the stage, and the scale: 1 is a head about 380 px tall */
  x: number; y: number; s?: number;
  /** two heads in one scene need two ids */
  id?: string;
  angle?: Angle;
  /** the way the face looks; `right` mirrors the drawing, rim lights and all */
  facing?: Facing;
  expression?: Partial<Expression>;
  /** 0–1, how far the mouth opens: closed, smile and open mouths move with it; see `mouthAt` */
  talk?: number;
  /** where the eyes look, each −1…1 (right and down are positive on the picture) */
  look?: P;
  /** blink now and then; `seed` moves the blinks */
  blink?: boolean;
  seed?: number;
  palette?: Partial<Palette>;
  /** 0–1, how much the rim lights flicker like neon */
  flicker?: number;
  /** the cheek implant and the earpiece */
  cyber?: boolean;
  /** degrees, clockwise */
  tilt?: number;
};

const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** How open the eyes are at T, 1 open to 0 shut: one blink of 0.17 s at a changing moment in every 3.3 s */
export function blinkOpen(T: number, seed = 1): number {
  const period = 3.3;
  const n = Math.floor(T / period);
  const u = (T - (n * period + 0.5 + 1.7 * hash(n * 7 + seed))) / 0.17;
  return u > 0 && u < 1 ? 1 - Math.sin(Math.PI * u) : 1;
}

/** `talk` for the times a mouth should move: the spans' [start, end] in song time, such as a line's; 0 between them */
export const mouthAt = (T: number, spans: [number, number][], rate = 13) =>
  spans.some(([a, b]) => T >= a && T < b) ? 0.25 + 0.75 * Math.abs(Math.sin(T * rate)) : 0;

const st = (ink: string) => ({ stroke: ink, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });

const strand = (root: P, ctrl: P, tip: P, w: number) => {
  const dx = tip[0] - root[0], dy = tip[1] - root[1], n = Math.hypot(dx, dy) || 1;
  const nx = -dy / n, ny = dx / n;
  const rl: P = [root[0] + (nx * w) / 2, root[1] + (ny * w) / 2], rr: P = [root[0] - (nx * w) / 2, root[1] - (ny * w) / 2];
  const cl: P = [ctrl[0] + nx * w * 0.42, ctrl[1] + ny * w * 0.42], cr: P = [ctrl[0] - nx * w * 0.42, ctrl[1] - ny * w * 0.42];
  return `M ${rl[0]},${rl[1]} Q ${cl[0]},${cl[1]} ${tip[0]},${tip[1]} Q ${cr[0]},${cr[1]} ${rr[0]},${rr[1]} Z`;
};

/** A path through edge points [x, y, bulge]; a bulge above 0 bows to the left of the way it travels */
const qpath = (start: P, pts: E[]) => {
  let d = `M ${start[0]},${start[1]}`;
  let a = start;
  for (const [x, y, k] of pts) {
    const dx = x - a[0], dy = y - a[1], n = Math.hypot(dx, dy) || 1;
    d += ` Q ${((a[0] + x) / 2 + (dy / n) * k).toFixed(1)},${((a[1] + y) / 2 - (dx / n) * k).toFixed(1)} ${x},${y}`;
    a = [x, y];
  }
  return d;
};

const qcont = (start: P, pts: E[]) => qpath(start, pts).replace(/^M [^Q]+/, "");

/** The clumps' left edges: each tip back up to its valley, to shade the underside of a clump */
const undersides = (edge: E[], from: number) =>
  edge.map((p, i) => (i >= from && i % 2 === 1 ? qpath([edge[i - 1][0], edge[i - 1][1]], [p]) : "")).filter(Boolean);

/** One continuous shine band round the crown, widest in the middle, its lower edge in soft scallops */
const shine = (cx: number, cy: number, rx: number, ry: number, t0: number, t1: number, depth = 18) => {
  const N = 40;
  const at = (t: number, r: number): P => [cx + (rx - r) * Math.cos(Math.PI * t), cy + (ry - r * 0.6) * Math.sin(Math.PI * t)];
  const outer: P[] = [], inner: P[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, w = Math.sin(Math.PI * u);
    outer.push(at(t0 + (t1 - t0) * u, -2 * w));
    inner.push(at(t0 + (t1 - t0) * u, depth * (1 - 0.4 * Math.abs(Math.sin(u * Math.PI * 3.3)) ** 3) * w));
  }
  return "M " + [...outer, ...inner.reverse()].map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L ") + " Z";
};

const Eye: React.FC<{
  id: string; cx: number; w: number; k: 1 | -1; c: Palette; kind: Eyes; open: number; look: P;
}> = ({ id, cx, w, k, c, kind, open, look }) => {
  const x = (u: number) => cx + k * u * w;
  const lift = kind === "wide" ? 1.22 : open;
  const yy = (v: number) => 2 + (v - 2) * lift;
  const line = { ...st(c.ink), fill: "none" };
  const under = <path d={`M ${x(-14)},10 C ${x(0)},14 ${x(14)},12 ${x(25)},4`} stroke={c.led} strokeWidth={3} fill="none" strokeLinecap="round" />;
  if (kind === "closed" || kind === "smile" || (kind !== "wide" && open < 0.22)) {
    const d = kind === "smile"
      ? `M ${x(-30)},-4 C ${x(-14)},-24 ${x(14)},-24 ${x(32)},-6 L ${x(40)},-11`
      : `M ${x(-30)},-5 C ${x(-12)},4 ${x(12)},4 ${x(32)},-6 L ${x(40)},-10`;
    return <g><path d={d} {...line} strokeWidth={6} />{under}</g>;
  }
  const white = `M ${x(-27)},${yy(-14)} C ${x(-12)},${yy(-27)} ${x(14)},${yy(-28)} ${x(29)},${yy(-17)} C ${x(26)},3 ${x(-8)},8 ${x(-25)},0 Z`;
  const ir = kind === "wide" ? 0.8 : 1;
  const ix = x(1) + look[0] * 6 * w, iy = look[1] * 4;
  return (
    <g>
      <defs>
        <clipPath id={id}><path d={white} /></clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.iris[0]} /><stop offset="0.4" stopColor={c.iris[1]} />
          <stop offset="0.78" stopColor={c.iris[2]} /><stop offset="1" stopColor={c.iris[3]} />
        </linearGradient>
      </defs>
      <path d={white} fill={c.eyeWhite} />
      <g clipPath={`url(#${id})`}>
        <path d={white} fill={c.eyeShade} transform={`translate(0,${-16 * lift})`} />
        <ellipse cx={ix} cy={-6 + iy} rx={15 * w * ir} ry={19 * ir} fill={`url(#${id}g)`} stroke={mix(c.iris[0], "#000000", 0.5)} strokeWidth={2.2} />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <line key={i} x1={ix + Math.cos(a) * 6 * w * ir} y1={-5 + iy + Math.sin(a) * 7 * ir} x2={ix + Math.cos(a) * 13 * w * ir} y2={-5 + iy + Math.sin(a) * 16 * ir} stroke={c.iris[3]} strokeWidth={0.7} opacity={0.55} />;
        })}
        <ellipse cx={ix - k} cy={-5 + iy} rx={5.5 * w * ir} ry={8.5 * ir} fill={mix(c.iris[0], "#000000", 0.6)} />
        <path d={`M ${ix - 12 * w * ir},${5 + iy} C ${ix - 4 * w * ir},${11 + iy} ${ix + 6 * w * ir},${11 + iy} ${ix + 13 * w * ir},${3 + iy}`} stroke={c.near} strokeWidth={2.2} fill="none" />
        <ellipse cx={ix + 6 * k * w * ir} cy={-15 + iy} rx={4.6 * w * ir} ry={3.6 * ir} fill="#fff" />
        <circle cx={ix - 7 * k * w * ir} cy={2 + iy} r={1.7} fill="#fff" />
      </g>
      <path d={`M ${x(-22)},${yy(-31)} C ${x(-6)},${yy(-39)} ${x(14)},${yy(-39)} ${x(28)},${yy(-31)}`} stroke={c.ink} strokeWidth={1.4} fill="none" opacity={0.55} />
      <path d={`M ${x(-31)},${yy(-15)} C ${x(-16)},${yy(-32)} ${x(12)},${yy(-34)} ${x(31)},${yy(-20)} L ${x(40)},${yy(-25)} M ${x(31)},${yy(-20)} L ${x(38)},${yy(-13)}`} {...line} strokeWidth={7} />
      <path d={`M ${x(-30)},${yy(-15)} L ${x(-36)},${yy(-10)}`} {...line} strokeWidth={4} />
      <path d={`M ${x(6)},4 C ${x(14)},3 ${x(22)},0 ${x(27)},-5`} {...line} strokeWidth={2} />
      {under}
    </g>
  );
};

const BROW = {
  neutral: [0, 0, 1], angry: [9, -5, 0.4], sad: [-15, 8, 0.6], raised: [-12, -12, 1.5],
} as const;

const Brow: React.FC<{ ink: string; inner: P; outer: P; kind: Brows; w: number }> = ({ ink, inner, outer, kind, w }) => {
  const [di, dout, arch] = BROW[kind];
  const I: P = [inner[0], inner[1] + di], O: P = [outer[0], outer[1] + dout];
  const a = 7 * arch;
  return (
    <path
      d={`M ${I[0]},${I[1]} C ${I[0] + (O[0] - I[0]) * 0.33},${I[1] + (O[1] - I[1]) * 0.33 - a} ${I[0] + (O[0] - I[0]) * 0.66},${O[1] + (I[1] - O[1]) * 0.34 - a} ${O[0]},${O[1]}`}
      {...st(ink)} strokeWidth={w} fill="none"
    />
  );
};

const MouthShape: React.FC<{ id: string; c: Palette; cx: number; hw: number; y: number; kind: Mouth; talk: number; brows: Brows }> = ({ id, c, cx, hw, y, kind, talk, brows }) => {
  const m = clamp01(kind === "open" ? 0.35 + 0.65 * talk : kind === "shout" ? 0.7 + 0.3 * talk : talk);
  const lift = kind === "smile" ? 5 : kind === "open" ? 1.5 : 0;
  if (m < 0.08) {
    const sag = kind === "smile" ? 9 : kind === "shout" ? 5 : brows === "sad" ? -5 : 2.5;
    return <path d={`M ${cx - hw},${y - lift} C ${cx - hw * 0.4},${y + sag} ${cx + hw * 0.4},${y + sag} ${cx + hw},${y - lift - 1}`} {...st(c.ink)} strokeWidth={2.4} fill="none" />;
  }
  const wide = kind === "shout" ? 1.12 : 1;
  const L = cx - hw * wide, R = cx + hw * wide;
  const drop = (kind === "shout" ? 22 : 15) * m + (kind === "smile" ? 6 : 0);
  const top = y - 4 - lift * 0.3;
  const d = `M ${L},${y - lift} C ${cx - hw * 0.45},${top} ${cx + hw * 0.45},${top} ${R},${y - lift - 1} C ${cx + hw * 0.5},${y + drop + 4} ${cx - hw * 0.5},${y + drop + 4} ${L},${y - lift} Z`;
  return (
    <g>
      <defs><clipPath id={id}><path d={d} /></clipPath></defs>
      <path d={d} fill={c.lip} />
      {m > 0.55 && <ellipse cx={cx} cy={y + drop * 0.85} rx={hw * 0.5} ry={drop * 0.32} fill={mix(c.lip, c.far, 0.5)} clipPath={`url(#${id})`} />}
      <path d={d} fill="none" {...st(c.ink)} strokeWidth={2.2} />
      <path d={`M ${L + 5},${y - lift + 3} C ${cx - hw * 0.4},${top + 3} ${cx + hw * 0.4},${top + 3} ${R - 5},${y - lift + 2}`} stroke="#fff" strokeWidth={2.2} fill="none" clipPath={`url(#${id})`} />
    </g>
  );
};

type Ctx = {
  id: string; c: Palette; flick: number; sway: number; ex: Expression; talk: number; open: number; look: P;
  cyber: boolean; bust: boolean;
};

type Layers = { defs: React.ReactNode; torso: React.ReactNode; back: React.ReactNode; neck: React.ReactNode; collar: React.ReactNode; face: React.ReactNode; hair: React.ReactNode };

const browOpen = (k: Brows) => (k === "angry" ? 0.86 : k === "sad" ? 0.9 : k === "raised" ? 1.06 : 1);

const Implant: React.FC<{ c: Palette; x: number; y: number; rotate: number; flick: number }> = ({ c, x, y, rotate, flick }) => (
  <g transform={`rotate(${rotate} ${x} ${y})`}>
    <rect x={x - 13} y={y - 5} width={26} height={10} rx={4} fill="#1b1f3a" stroke={c.ink} strokeWidth={1.5} />
    <circle cx={x - 6} cy={y} r={2} fill={c.near} /><circle cx={x + 2} cy={y} r={2} fill={c.near} opacity={flick} />
  </g>
);

const Earpiece: React.FC<{ id: string; c: Palette; x: number; y: number; flick: number }> = ({ id, c, x, y, flick }) => (
  <>
    <circle cx={x + 3} cy={y + 12} r={7} fill={c.led} filter={`url(#${id}-glow)`} opacity={flick} />
    <rect x={x} y={y} width={6} height={22} rx={2} fill={c.led} stroke={c.ink} strokeWidth={1.5} />
  </>
);

/* ------------------------------------------------------------------------------------------------------------ */
/* three-quarter view, the face turned to the picture's left: its near side is on the right */

const TQ_FACE = "M -72,-122 C -82,-96 -86,-70 -80,-52 C -76,-40 -74,-30 -76,-22 C -84,-6 -86,10 -80,26 C -72,62 -52,96 -30,122 C -22,130 -10,132 -2,126 C 30,104 76,72 98,38 C 104,24 106,6 104,-10 C 108,-50 108,-90 100,-118 C 60,-150 -40,-150 -72,-122 Z";
const TQ_FRINGE_START: P = [104, -110];
const TQ_FRINGE_EDGE: E[] = [
  [116, -50, -5], [74, -124, 8],
  [50, -46, 15], [30, -98, -10], [-4, -30, 16], [-10, -54, -3], [-24, -14, 8], [-36, -100, -10],
  [-58, -44, 15], [-72, -100, -8], [-98, -22, 15], [-102, -72, -3], [-118, -8, 8], [-108, -118, -8],
];
const TQ_FRINGE_EDGE_D = qpath(TQ_FRINGE_START, TQ_FRINGE_EDGE);
const TQ_FRINGE = `${TQ_FRINGE_EDGE_D} C -110,-180 -40,-228 30,-230 C 92,-230 142,-200 150,-150 Z`;
const TQ_NOTCHES = [TQ_FRINGE_EDGE[3], TQ_FRINGE_EDGE[7], TQ_FRINGE_EDGE[9]];
const TQ_UNDERSIDES = undersides(TQ_FRINGE_EDGE, 2);
const TQ_DOME = "M -112,-120 C -126,-196 -56,-250 24,-250 C 112,-250 182,-208 192,-140 C 198,-90 162,-48 132,-22 C 118,-48 108,-78 104,-110 L 98,-132 L -100,-132 Z";
const TQ_BACK = `M -104,-150 C -124,-60 -126,40 -116,124 L 60,150 ${qcont([60, 150], [[122, 160, 0], [150, 196, -6], [160, 158, 6], [188, 198, -8], [192, 152, 6], [224, 184, -8], [206, 116, 4]])} C 216,30 214,-80 192,-150 C 170,-236 -80,-240 -104,-150 Z`;
const TQ_FAR_LOCK = "M -100,-112 C -120,-60 -126,20 -120,100 L -112,140 Q -106,112 -100,100 L -94,126 Q -98,40 -88,-40 Q -84,-80 -80,-112 Z";
const TQ_SHINE = [shine(25, -152, 124, 58, 1.15, 1.86)];

const threeQuarter = ({ id, c, flick, sway, ex, talk, open, look, cyber, bust }: Ctx): Layers => {
  const line = st(c.ink);
  return {
    defs: (
      <defs>
        <clipPath id={`${id}-face`}><path d={TQ_FACE} /></clipPath>
        <clipPath id={`${id}-fringe`}><path d={TQ_FRINGE} /></clipPath>
        <clipPath id={`${id}-back`}><path d={TQ_BACK} /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="1" x2="0.6" y2="0.3">
          <stop offset="0" stopColor={c.far} stopOpacity={0.32} /><stop offset="1" stopColor={c.far} stopOpacity={0} />
        </linearGradient>
      </defs>
    ),
    torso: (
      <g>
        <path d="M -372,700 L -366,380 C -356,296 -280,248 -118,210 L -64,186 C 0,206 44,204 88,180 L 150,204 C 262,216 336,244 366,306 C 384,346 388,430 392,700 Z" fill={c.jacket} {...line} strokeWidth={4.5} />
        <path d="M -118,210 C -168,270 -186,350 -190,440 L -190,700 L -372,700 L -366,380 C -356,296 -280,248 -118,210 Z" fill={c.jacketShade} />
        <path d="M 150,204 C 230,230 300,280 330,340 L 300,350 C 270,300 210,256 140,232 Z" fill={c.jacketLight} opacity={0.8} />
        <path d="M -40,250 C -60,320 -70,380 -72,440 L -74,700 M 40,250 C 52,320 60,380 62,440 L 64,700" stroke={c.jacketShade} strokeWidth={3} fill="none" />
        <path d="M -6,240 L -14,700" stroke={c.trim} strokeWidth={4} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <path key={i} d={`M -16,${262 + i * 28} L -2,${262 + i * 28}`} stroke={c.trim} strokeWidth={2} />)}
      </g>
    ),
    back: (
      <g>
        <path d={TQ_BACK} fill={c.hair} {...line} strokeWidth={4.5} />
        <g clipPath={`url(#${id}-back)`}>
          <path d="M 120,-200 C 150,-60 150,60 120,200 L -140,200 L -140,-200 Z" fill={c.hairShade} />
          <path d={strand([170, -70], [200, 40], [190, 200], 22)} fill={c.far} />
          <path d="M 150,-40 Q 166,60 160,150 M 178,-20 Q 196,80 184,170" stroke={c.ink} strokeWidth={1.8} fill="none" />
        </g>
        <path d="M 192,-150 C 214,-80 216,30 206,116" stroke={c.near} strokeWidth={3.5} fill="none" opacity={flick} strokeLinecap="round" />
      </g>
    ),
    neck: (
      <g>
        <path d={`M -26,100 L -24,${bust ? 200 : 180} L 56,${bust ? 200 : 180} L 52,86 Z`} fill={c.skin} {...line} strokeWidth={3.5} />
        <path d="M -26,104 C 0,136 26,132 52,92 L 54,150 C 22,170 -2,170 -24,152 Z" fill={c.skinShade} />
        <path d="M 30,118 C 26,140 22,160 20,190" stroke={c.skinDeep} strokeWidth={2} fill="none" />
        {bust ? <path d="M -6,170 L 34,176 L 40,186 L 0,182 Z" fill={c.led} opacity={0.85} /> : (
          <g>
            <path d="M -25,158 C 0,170 30,170 55,156 L 56,176 C 30,190 0,190 -24,178 Z" fill={c.collar} {...line} strokeWidth={3} />
            <path d="M -18,168 C 4,178 28,176 50,166" stroke={c.led} strokeWidth={3} fill="none" opacity={flick} strokeLinecap="round" />
          </g>
        )}
      </g>
    ),
    collar: (
      <g>
        <path d="M -112,170 C -60,142 84,142 146,160 L 156,238 C 84,214 -60,214 -124,240 Z" fill={c.collar} {...line} strokeWidth={4} />
        <path d="M -100,184 C -50,168 70,168 140,180 L 142,196 C 72,186 -50,186 -100,200 Z" fill={c.far} opacity={0.9} />
        <path d="M -104,214 C -50,200 74,200 148,214" stroke={c.accent} strokeWidth={3} fill="none" />
      </g>
    ),
    face: (
      <g>
        <path d={TQ_FACE} fill={c.skin} {...line} strokeWidth={4} />
        <g clipPath={`url(#${id}-face)`}>
          <path d="M -80,-52 C -76,-40 -74,-30 -76,-22 C -84,-6 -86,10 -80,26 C -72,62 -52,96 -30,122 C -48,92 -60,60 -62,26 C -62,6 -58,-14 -62,-32 Z" fill={c.skinShade} />
          <path d="M -40,26 L -46,44 L -32,46 Z" fill={c.skinShade} />
          <path d={TQ_FRINGE} transform="translate(7,15)" fill={c.skinShade} />
          <path d={TQ_FACE} fill={`url(#${id}-fill)`} />
        </g>
        <path d="M -2,126 C 30,104 76,72 98,38 C 104,24 106,6 104,-10" stroke={c.near} strokeWidth={4} fill="none" opacity={flick} strokeLinecap="round" />
        <path d="M -32,-6 C -34,10 -40,26 -48,40 L -36,45" {...line} strokeWidth={2.4} fill="none" />
        <MouthShape id={`${id}-mouth`} c={c} cx={-21} hw={23} y={83} kind={ex.mouth} talk={talk} brows={ex.brows} />
        <path d="M -30,104 C -20,106 -8,105 0,101" stroke={c.skinDeep} strokeWidth={1.6} fill="none" />
        <Eye id={`${id}-eyeN`} cx={26} w={1} k={1} c={c} kind={ex.eyes} open={open} look={look} />
        <Eye id={`${id}-eyeF`} cx={-52} w={0.62} k={1} c={c} kind={ex.eyes} open={open} look={look} />
        {cyber && <Implant c={c} x={72} y={34} rotate={-14} flick={flick} />}
      </g>
    ),
    hair: (
      <g>
        <path d={TQ_DOME} fill={c.hair} {...line} strokeWidth={4.5} />
        <path d="M 150,-180 Q 168,-110 138,-40 M 124,-170 Q 140,-110 120,-60" stroke={c.ink} strokeWidth={1.8} fill="none" />
        <path d="M 100,-26 C 118,-36 130,-12 122,8 C 118,20 110,24 102,20 Z" fill={c.skin} {...line} strokeWidth={3} />
        <path d="M 106,-14 C 116,-18 120,-4 114,6" stroke={c.skinDeep} strokeWidth={2} fill="none" />
        {cyber && <Earpiece id={id} c={c} x={112} y={22} flick={flick} />}
        <path d={strand([104, -104], [110, -60], [100, -2], 12)} fill={c.hair} {...line} strokeWidth={2.5} />
        <g transform={`rotate(${-sway} -100 -112)`}>
          <path d={TQ_FAR_LOCK} fill={c.hairShade} {...line} strokeWidth={4} />
          <path d="M -104,-80 Q -110,0 -106,104" stroke={c.ink} strokeWidth={1.6} fill="none" />
          <path d="M -118,-40 C -124,20 -122,70 -116,118" stroke={c.far} strokeWidth={3} fill="none" opacity={0.9} strokeLinecap="round" />
        </g>
        <path d={TQ_FRINGE} fill={c.hair} />
        <g clipPath={`url(#${id}-fringe)`}>
          <path d="M -140,-260 L -66,-260 Q -40,-170 -36,-100 L -46,0 L -140,0 Z" fill={c.hairShade} />
          {TQ_UNDERSIDES.map((d, i) => <path key={i} d={d} stroke={c.hairShade} strokeWidth={22} fill="none" />)}
        </g>
        {TQ_NOTCHES.map(([x, y], i) => <path key={i} d={`M ${x},${y} Q ${x + 4},${y - 24} ${x + 16},${y - 46}`} stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" />)}
        <path d={TQ_FRINGE_EDGE_D} {...line} strokeWidth={4} fill="none" />
        {TQ_SHINE.map((d, i) => <path key={i} d={d} fill={c.hairLight} />)}
        <Brow ink={c.ink} inner={[-2, -48]} outer={[58, -56]} kind={ex.brows} w={4.5} />
        <Brow ink={c.ink} inner={[-38, -50]} outer={[-78, -52]} kind={ex.brows} w={4} />
        <path d="M 24,-250 C 112,-250 182,-208 192,-140" stroke={c.near} strokeWidth={3.5} fill="none" opacity={flick * 0.9} strokeLinecap="round" />
      </g>
    ),
  };
};

/* ------------------------------------------------------------------------------------------------------------ */
/* front view: the near side, on the right, has the hair tucked behind an ear */

const FR_FACE = "M -92,-120 C -102,-76 -101,-26 -94,14 C -86,58 -54,104 -20,124 C -8,131 8,131 20,124 C 54,104 86,58 94,14 C 101,-26 102,-76 92,-120 C 52,-150 -52,-150 -92,-120 Z";
const FR_FRINGE_START: P = [102, -108];
const FR_FRINGE_EDGE: E[] = [
  [112, -58, -5], [84, -120, 8],
  [64, -52, 15], [42, -102, -10], [14, -34, 16], [6, -58, -3], [-12, -12, 8], [-32, -102, -10],
  [-58, -48, 15], [-74, -102, -8], [-102, -24, 15], [-106, -78, -3], [-122, -6, 8], [-112, -122, -8],
];
const FR_FRINGE_EDGE_D = qpath(FR_FRINGE_START, FR_FRINGE_EDGE);
const FR_FRINGE = `${FR_FRINGE_EDGE_D} C -118,-190 -50,-236 8,-236 C 78,-236 134,-206 144,-150 Z`;
const FR_NOTCHES = [FR_FRINGE_EDGE[3], FR_FRINGE_EDGE[7], FR_FRINGE_EDGE[9]];
const FR_UNDERSIDES = undersides(FR_FRINGE_EDGE, 2);
const FR_DOME = "M -114,-120 C -130,-198 -60,-252 6,-252 C 82,-252 140,-208 134,-130 C 132,-90 124,-56 118,-30 C 110,-50 104,-80 102,-110 L 94,-132 L -100,-132 Z";
const FR_BACK = `M -118,-146 C -146,-60 -150,50 -138,118 ${qcont([-138, 118], [[-128, 168, 6], [-110, 130, -5], [-88, 180, 6], [-68, 136, -5], [-46, 168, 6], [-30, 140, 0], [30, 140, 0], [44, 174, -6], [64, 132, 5], [92, 188, -6], [112, 140, 5], [130, 158, -6], [138, 118, 0]])} C 150,50 150,-70 134,-130 C 122,-232 -100,-242 -118,-146 Z`;
const FR_FAR_LOCK = "M -104,-112 C -126,-60 -132,20 -126,100 L -118,142 Q -112,112 -106,100 L -100,128 Q -104,40 -94,-40 Q -90,-80 -86,-112 Z";
const FR_SHINE = [shine(-4, -150, 114, 54, 1.12, 1.88)];

const front = ({ id, c, flick, sway, ex, talk, open, look, cyber, bust }: Ctx): Layers => {
  const line = st(c.ink);
  return {
    defs: (
      <defs>
        <clipPath id={`${id}-face`}><path d={FR_FACE} /></clipPath>
        <clipPath id={`${id}-fringe`}><path d={FR_FRINGE} /></clipPath>
        <clipPath id={`${id}-back`}><path d={FR_BACK} /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="1" x2="0.6" y2="0.3">
          <stop offset="0" stopColor={c.far} stopOpacity={0.3} /><stop offset="1" stopColor={c.far} stopOpacity={0} />
        </linearGradient>
      </defs>
    ),
    torso: (
      <g>
        <path d="M -384,700 L -380,340 C -376,276 -330,238 -250,224 C -200,214 -160,212 -126,214 L -40,206 L 40,206 L 126,214 C 160,212 200,214 250,224 C 330,238 376,276 380,340 L 384,700 Z" fill={c.jacket} {...line} strokeWidth={4.5} />
        <path d="M -126,214 C -176,214 -220,218 -250,224 C -330,238 -376,276 -380,340 L -384,700 L -200,700 C -200,520 -196,320 -126,214 Z" fill={c.jacketShade} />
        <path d="M 126,214 C 200,216 300,238 342,296 L 312,306 C 270,264 200,242 118,240 Z" fill={c.jacketLight} opacity={0.8} />
        <path d="M 0,240 L 0,700" stroke={c.trim} strokeWidth={4} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <path key={i} d={`M -12,${266 + i * 28} L 0,${266 + i * 28}`} stroke={c.trim} strokeWidth={2} />)}
        <path d="M -70,260 C -86,330 -92,390 -94,700 M 70,260 C 82,330 88,390 90,700" stroke={c.jacketShade} strokeWidth={3} fill="none" />
      </g>
    ),
    back: (
      <g>
        <path d={FR_BACK} fill={c.hair} {...line} strokeWidth={4.5} />
        <g clipPath={`url(#${id}-back)`}>
          <path d="M -50,-200 L -150,-200 L -150,200 L -50,200 Z" fill={c.hairShade} />
          <path d={strand([128, -40], [142, 50], [134, 190], 20)} fill={c.far} />
          <path d="M 112,-30 Q 124,60 118,150 M -118,-30 Q -128,60 -122,150" stroke={c.ink} strokeWidth={1.8} fill="none" />
        </g>
        <path d="M 134,-130 C 150,-70 150,50 138,118" stroke={c.near} strokeWidth={3.5} fill="none" opacity={flick} strokeLinecap="round" />
      </g>
    ),
    neck: (
      <g>
        <path d={`M -30,96 L -34,${bust ? 212 : 182} L 34,${bust ? 212 : 182} L 30,96 Z`} fill={c.skin} {...line} strokeWidth={3.5} />
        <path d="M -30,100 C -10,130 10,130 30,100 L 32,150 C 10,168 -10,168 -32,150 Z" fill={c.skinShade} />
        {bust ? <path d="M -14,184 L 14,184 L 18,196 L -18,196 Z" fill={c.led} opacity={0.85} /> : (
          <g>
            <path d="M -34,160 C -10,170 10,170 34,160 L 36,182 C 10,192 -10,192 -36,182 Z" fill={c.collar} {...line} strokeWidth={3} />
            <path d="M -26,171 C -8,178 8,178 26,171" stroke={c.led} strokeWidth={3} fill="none" opacity={flick} strokeLinecap="round" />
          </g>
        )}
      </g>
    ),
    collar: (
      <g>
        <path d="M -36,150 C -78,148 -112,162 -126,186 L -134,254 C -100,232 -60,226 -30,240 Z" fill={c.collar} {...line} strokeWidth={4} />
        <path d="M 36,150 C 78,148 112,162 126,186 L 134,254 C 100,232 60,226 30,240 Z" fill={c.collar} {...line} strokeWidth={4} />
        <path d="M -42,170 C -80,166 -110,178 -124,200 L -126,216 C -106,198 -80,188 -40,190 Z" fill={c.far} opacity={0.9} />
        <path d="M 42,170 C 80,166 110,178 124,200 L 126,216 C 106,198 80,188 40,190 Z" fill={c.far} opacity={0.9} />
        <path d="M -128,236 C -96,216 -60,212 -30,222 M 128,236 C 96,216 60,212 30,222" stroke={c.accent} strokeWidth={3} fill="none" />
      </g>
    ),
    face: (
      <g>
        <path d={FR_FACE} fill={c.skin} {...line} strokeWidth={4} />
        <g clipPath={`url(#${id}-face)`}>
          <path d="M -94,-60 C -100,-20 -94,30 -66,88 C -80,50 -86,10 -84,-40 Z" fill={c.skinShade} />
          <path d={FR_FRINGE} transform="translate(7,15)" fill={c.skinShade} />
          <path d={FR_FACE} fill={`url(#${id}-fill)`} />
        </g>
        <path d="M 20,124 C 54,104 86,58 94,14 C 101,-26 102,-76 92,-120" stroke={c.near} strokeWidth={4} fill="none" opacity={flick} strokeLinecap="round" />
        <path d="M 3,30 C 5,38 4,44 -3,47 L 6,48" {...line} strokeWidth={2.2} fill="none" />
        <MouthShape id={`${id}-mouth`} c={c} cx={0} hw={22} y={84} kind={ex.mouth} talk={talk} brows={ex.brows} />
        <path d="M -14,106 C -6,109 6,109 14,106" stroke={c.skinDeep} strokeWidth={1.6} fill="none" />
        <Eye id={`${id}-eyeN`} cx={50} w={1} k={1} c={c} kind={ex.eyes} open={open} look={look} />
        <Eye id={`${id}-eyeF`} cx={-50} w={0.97} k={-1} c={c} kind={ex.eyes} open={open} look={look} />
        {cyber && <Implant c={c} x={76} y={46} rotate={-14} flick={flick} />}
      </g>
    ),
    hair: (
      <g>
        <path d={FR_DOME} fill={c.hair} {...line} strokeWidth={4.5} />
        <path d="M 112,-190 Q 130,-120 112,-56 M 90,-196 Q 106,-130 98,-76 M -112,-190 Q -130,-120 -114,-56" stroke={c.ink} strokeWidth={1.8} fill="none" />
        <path d="M 100,-26 C 118,-36 130,-12 122,8 C 118,20 110,24 102,20 Z" fill={c.skin} {...line} strokeWidth={3} />
        <path d="M 106,-14 C 116,-18 120,-4 114,6" stroke={c.skinDeep} strokeWidth={2} fill="none" />
        {cyber && <Earpiece id={id} c={c} x={112} y={22} flick={flick} />}
        <path d={strand([100, -104], [108, -60], [98, -2], 12)} fill={c.hair} {...line} strokeWidth={2.5} />
        <g transform={`rotate(${-sway} -104 -112)`}>
          <path d={FR_FAR_LOCK} fill={c.hairShade} {...line} strokeWidth={4} />
          <path d="M -108,-80 Q -114,0 -110,104" stroke={c.ink} strokeWidth={1.6} fill="none" />
          <path d="M -122,-40 C -128,20 -126,70 -120,118" stroke={c.far} strokeWidth={3} fill="none" opacity={0.9} strokeLinecap="round" />
        </g>
        <path d={FR_FRINGE} fill={c.hair} />
        <g clipPath={`url(#${id}-fringe)`}>
          <path d="M -150,-260 L -50,-260 Q -34,-170 -30,-100 L -40,0 L -150,0 Z" fill={c.hairShade} />
          {FR_UNDERSIDES.map((d, i) => <path key={i} d={d} stroke={c.hairShade} strokeWidth={22} fill="none" />)}
        </g>
        {FR_NOTCHES.map(([x, y], i) => <path key={i} d={`M ${x},${y} Q ${x + 4},${y - 24} ${x + 16},${y - 46}`} stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" />)}
        <path d={FR_FRINGE_EDGE_D} {...line} strokeWidth={4} fill="none" />
        {FR_SHINE.map((d, i) => <path key={i} d={d} fill={c.hairLight} />)}
        <Brow ink={c.ink} inner={[14, -52]} outer={[84, -60]} kind={ex.brows} w={4.5} />
        <Brow ink={c.ink} inner={[-14, -52]} outer={[-84, -60]} kind={ex.brows} w={4.5} />
        <path d="M 6,-252 C 82,-252 140,-208 134,-130" stroke={c.near} strokeWidth={3.5} fill="none" opacity={flick * 0.9} strokeLinecap="round" />
      </g>
    ),
  };
};

const Rig: React.FC<HeadProps & { bust: boolean }> = ({
  T, x, y, s = 1, id = "anime", angle = "three-quarter", facing = "left", expression, talk = 0, look = [0, 0],
  blink = true, seed = 1, palette, flicker = 1, cyber = true, tilt = 0, bust,
}) => {
  const c = { ...palettes.neon, ...palette };
  const ex = { ...faces.calm, ...expression };
  const flip = facing === "right";
  const base = 0.78 + 0.22 * Math.abs(Math.sin(T * 17) * Math.sin(T * 5.3));
  const ctx: Ctx = {
    id, c, ex, talk: clamp01(talk), cyber, bust,
    flick: 1 - flicker * (1 - base), sway: Math.sin(T * 2.1) * 1.4,
    open: (blink ? blinkOpen(T, seed) : 1) * browOpen(ex.brows),
    look: [flip ? -look[0] : look[0], look[1]],
  };
  const L = (angle === "front" ? front : threeQuarter)(ctx);
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${flip ? -s : s} ${s})`}>
      <defs>
        <filter id={`${id}-glow`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      {L.defs}
      {bust && L.torso}
      {L.back}
      {L.neck}
      {bust && L.collar}
      {L.face}
      {L.hair}
    </g>
  );
};

/** A head and neck, ending in a choker, for a corner of the frame or a body of your own */
export const AnimeHead: React.FC<HeadProps> = (p) => <Rig {...p} bust={false} />;

/** The head with shoulders and a high-collar jacket, which run 300 px below the face at `s` = 1 */
export const AnimeBust: React.FC<HeadProps> = (p) => <Rig {...p} bust />;

/* ------------------------------------------------------------------------------------------------------------ */

/** Where an eye is, from the face's middle at `s` = 1, mirrored for a head facing right */
export function animeEye(angle: Angle = "three-quarter", facing: Facing = "left", which: "near" | "far" = "near"): P {
  const [ex, ey]: P = angle === "front" ? [which === "near" ? 51 : -51, -8] : [which === "near" ? 27 : -52, -8];
  return [facing === "right" ? -ex : ex, ey];
}

/**
 * Head props that put an eye at `at` on the stage, magnified `zoom` times: `<AnimeHead {...eyeShot([960, 540], 6)} />`
 * for an extreme close-up; add the rest of the head's props beside it.
 */
export function eyeShot(at: P, zoom: number, angle: Angle = "three-quarter", facing: Facing = "left", which: "near" | "far" = "near") {
  const [ex, ey] = animeEye(angle, facing, which);
  return { x: at[0] - ex * zoom, y: at[1] - ey * zoom, s: zoom, angle, facing };
}

/**
 * Lights a whole frame from two sides, over everything drawn before it: `colors[0]` from the top corner on the `from`
 * side, `colors[1]` from the bottom corner on the other, a dark vignette round the edge. `beat` (0–1) makes the
 * lights kick on the song's beat.
 */
export const Neon: React.FC<{
  id: string; T?: number; w?: number; h?: number; colors?: [string, string]; from?: Facing; strength?: number; vignette?: number; beat?: number;
}> = ({ id, T = 0, w = 1920, h = 1080, colors = [palettes.neon.led, palettes.neon.far], from = "right", strength = 1, vignette = 0.7, beat = 0 }) => {
  const { grid } = useSong();
  const k = strength * (1 + beat * grid.pulse(T));
  const [a, b] = from === "right" ? [0.85, 0.05] : [0.15, 0.95];
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-a`} cx={a} cy="0.05" r="0.95"><stop offset="0" stopColor={colors[0]} stopOpacity={0.34 * k} /><stop offset="1" stopColor={colors[0]} stopOpacity={0} /></radialGradient>
        <radialGradient id={`${id}-b`} cx={b} cy="1" r="0.8"><stop offset="0" stopColor={colors[1]} stopOpacity={0.22 * k} /><stop offset="1" stopColor={colors[1]} stopOpacity={0} /></radialGradient>
        <radialGradient id={`${id}-v`} cx="0.5" cy="0.45" r="0.78"><stop offset="0.55" stopColor="#000" stopOpacity={0} /><stop offset="1" stopColor="#000" stopOpacity={vignette} /></radialGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-a)`} style={{ mixBlendMode: "screen" }} />
      <rect width={w} height={h} fill={`url(#${id}-b)`} style={{ mixBlendMode: "screen" }} />
      <rect width={w} height={h} fill={`url(#${id}-v)`} />
    </g>
  );
};

/** Lines rushing out from (`x`, `y`), starting `inner` px away: behind a close-up */
export const SpeedLines: React.FC<{ x?: number; y?: number; inner?: number; outer?: number; n?: number; color?: string; opacity?: number }> = ({
  x = 960, y = 540, inner = 420, outer = 1400, n = 48, color = "#e8fbff", opacity = 0.55,
}) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.04, r0 = inner + ((i * 37) % 60);
      return <line key={i} x1={x + Math.cos(a) * r0} y1={y + Math.sin(a) * r0} x2={x + Math.cos(a) * outer} y2={y + Math.sin(a) * outer} stroke={color} strokeWidth={2 + (i % 3)} opacity={opacity} />;
    })}
  </g>
);

/**
 * A cut that jolts: for `over` seconds from `at`, red and cyan copies of what it holds slide apart by `amount` px and
 * close up. Pair it with the kit's `Flash` at the same time for the white frame.
 */
export const Split: React.FC<{ id: string; T: number; at: number; amount?: number; over?: number; children: React.ReactNode }> = ({
  id, T, at, amount = 30, over = 0.17, children,
}) => {
  const u = (T - at) / over;
  if (u < 0 || u >= 1) return <g>{children}</g>;
  const dx = amount * (1 - u);
  return (
    <g>
      <defs>
        <filter id={`${id}-red`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 0.2 0 0 0  0 0 0.3 0 0  0 0 0 1 0" /></filter>
        <filter id={`${id}-cyan`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.2 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" /></filter>
      </defs>
      <g opacity={0.6} filter={`url(#${id}-red)`} transform={`translate(${-dx} 0)`}>{children}</g>
      <g opacity={0.6} filter={`url(#${id}-cyan)`} transform={`translate(${dx} 0)`}>{children}</g>
      {children}
    </g>
  );
};
