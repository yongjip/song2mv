import React, { useId } from "react";
import { mix } from "./color";

/**
 * People. Use inside <Svg> on the 1920×1080 stage.
 *
 * `Person` is a side-view figure facing right (`flip` faces left), drawn as flat vector shapes in the Humaaans
 * manner: about 6 heads tall, 300 px at s = 1, origin at the middle of the soles. There are no outlines; parts
 * separate by tone. The key light is up and in front, so the side of each part away from it is one tone darker and
 * the far arm and leg are a step darker again. Faces have no features on purpose (a cheek blush only): hair, clothes
 * and pose carry the person. Each limb is one bending shape (a crease inside the bend, rounded over the joint).
 * Standing feet are planted (the legs are solved to fixed foot positions), so the slow idle weight shift moves the
 * hips, not the feet. Every pose has a line of action and arms that differ; loose parts (long hair, ponytail, hood
 * strings, hem) follow through.
 * `walk` and `run` take `phase` (one stride pair per 1.0): move x by STRIDE (or RUN_STRIDE) × s per phase unit and
 * the foot on the ground stays put.
 * `lie` lies on the back, head to the left (`flip`: to the right), the upper body a little raised as on a pillow, one
 * hand on the chest and the near knee a little bent. Its origin is under the hips, on what the person lies on: put it
 * on a mattress (a Bed in room.tsx draws one, with a blanket over the sleeper), a sofa or the floor.
 */

export const STRIDE = 176; // px per walk cycle at s = 1
export const RUN_STRIDE = 250;

export type Pose =
  | "stand" | "walk" | "run" | "sit" | "kneel" | "armsUp" | "lookUp" | "phone" | "sing" | "point" | "hold" | "reach"
  | "wave" | "balance" | "lie";
export type Outfit = "hoodie" | "suit" | "dress";
export type Hair = "short" | "long" | "ponytail";
export const SKINS = { light: "#f0c3a0", medium: "#d9a07a", tan: "#b97c55", deep: "#7a4b32" } as const;

// ---------------------------------------------------------------- vectors (x right, y down; 0° points down, + forward)

type V = [number, number];
/** a point of a smooth outline; a third value marks a corner */
type K = V | [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const lerpV = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const perp = (u: V): V => [-u[1], u[0]];
const cross = (a: V, b: V) => a[0] * b[1] - a[1] * b[0];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const dir = (a: number): V => [Math.sin(rad(a)), Math.cos(rad(a))];
const angleOf = (v: V) => (Math.atan2(v[0], v[1]) * 180) / Math.PI;
/** a point turned like SVG rotate(a): + is clockwise on screen */
const rot = (v: V, a: number): V => {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a));
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};
const fk = (p: V, l: number, a: number): V => add(p, mul(dir(a), l));
const num = (v: number) => String(Math.round(v * 10) / 10);
const pt = (p: readonly number[]) => `${num(p[0])} ${num(p[1])}`;

// ---------------------------------------------------------------- shape builders

/** A smooth path through the points (Catmull-Rom); points with a third value are corners */
function smooth(pts: readonly K[], closed = true): string {
  const n = pts.length, t = 1 / 6;
  const at = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = p1.length > 2 ? p1 : [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = p2.length > 2 ? p2 : [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Points moved into another frame (origin o, turned by a) */
const place = (pts: readonly K[], o: V, a: number): K[] =>
  pts.map((p) => {
    const q = add(o, rot([p[0], p[1]], a));
    return p.length > 2 ? [q[0], q[1], 1] : q;
  });

type Seg = { k: "L"; to: V } | { k: "Q"; c: V; to: V } | { k: "A"; r: number; sw: number; to: V };
type Edge = { from: V; segs: Seg[] };
type W3 = [number, number, number];

function crossing(a0: V, a1: V, b0: V, b1: V): V | null {
  const r = sub(a1, a0), s = sub(b1, b0), den = cross(r, s);
  if (Math.abs(den) < 1e-6) return null;
  return add(a0, mul(r, cross(sub(b0, a0), s) / den));
}

/**
 * One side of a two-segment limb p0 → p1 → p2 at signed offsets o along each segment's left normal (+ is the back
 * of a hanging limb). g bows each segment's side outwards along that normal. Inside a bend the side creases; outside
 * it rounds over the joint.
 */
function edge(p: readonly [V, V, V], o: W3, g: [number, number] = [0, 0]): Edge {
  const u1 = unit(sub(p[1], p[0])), u2 = unit(sub(p[2], p[1]));
  const m1 = perp(u1), m2 = perp(u2);
  const a0 = add(p[0], mul(m1, o[0])), a1 = add(p[1], mul(m1, o[1]));
  const b1 = add(p[1], mul(m2, o[1])), b2 = add(p[2], mul(m2, o[2]));
  const cr = cross(u1, u2);
  const bow = (from: V, to: V, m: V, k: number): Seg => (k === 0 ? { k: "L", to } : { k: "Q", c: add(lerpV(from, to, 0.5), mul(m, 2 * k)), to });
  if (Math.abs(cr) < 0.03 && dot(u1, u2) > 0) {
    const mid = lerpV(a1, b1, 0.5);
    return { from: a0, segs: [bow(a0, mid, m1, g[0]), bow(mid, b2, m2, g[1])] };
  }
  if (o[1] * cr > 0) {
    const l1 = Math.hypot(...sub(p[1], p[0])), l2 = Math.hypot(...sub(p[2], p[1]));
    let x = crossing(a0, a1, b1, b2) ?? lerpV(a1, b1, 0.5);
    if (Math.hypot(...sub(x, p[1])) > 0.8 * Math.min(l1, l2)) x = lerpV(a1, b1, 0.5);
    return { from: a0, segs: [bow(a0, x, m1, g[0]), bow(x, b2, m2, g[1])] };
  }
  return { from: a0, segs: [bow(a0, a1, m1, g[0]), { k: "A", r: Math.abs(o[1]), sw: cr > 0 ? 1 : 0, to: b1 }, bow(b1, b2, m2, g[1])] };
}

function reverse(e: Edge): Edge {
  const pts = [e.from, ...e.segs.map((s) => s.to)];
  const segs: Seg[] = [];
  for (let i = e.segs.length - 1; i >= 0; i--) {
    const s = e.segs[i], to = pts[i];
    segs.push(s.k === "L" ? { k: "L", to } : s.k === "Q" ? { k: "Q", c: s.c, to } : { k: "A", r: s.r, sw: 1 - s.sw, to });
  }
  return { from: pts[pts.length - 1], segs };
}

const segD = (s: Seg) =>
  s.k === "L" ? `L${pt(s.to)}` : s.k === "Q" ? `Q${pt(s.c)} ${pt(s.to)}` : `A${num(s.r)} ${num(s.r)} 0 0 ${s.sw} ${pt(s.to)}`;

/** Closed outline between two sides of a limb (A on the + normal, B on the −); caps round over an end */
function limbD(p: readonly [V, V, V], A: W3, B: W3, o: { gA?: [number, number]; gB?: [number, number]; cap0?: boolean; cap2?: boolean } = {}) {
  const ea = edge(p, A, o.gA), eb = reverse(edge(p, B, o.gB));
  const arc = (r: number, to: V) => `A${num(r)} ${num(r)} 0 0 0 ${pt(to)}`;
  let d = `M${pt(ea.from)}${ea.segs.map(segD).join("")}`;
  d += o.cap2 && A[2] * B[2] < 0 ? arc((A[2] - B[2]) / 2, eb.from) : `L${pt(eb.from)}`;
  d += eb.segs.map(segD).join("");
  if (o.cap0 && A[0] * B[0] < 0) d += arc((A[0] - B[0]) / 2, ea.from);
  return `${d}Z`;
}

/** A tapering tube along a centre line (ponytail, strings); the last point is the tip */
function tube(c: V[], w: number[]): string {
  const L: K[] = [], R: K[] = [];
  c.forEach((p, i) => {
    const n = perp(unit(sub(c[Math.min(c.length - 1, i + 1)], c[Math.max(0, i - 1)])));
    L.push(add(p, mul(n, w[i] / 2)));
    R.push(add(p, mul(n, -w[i] / 2)));
  });
  const tip = c[c.length - 1];
  return smooth([...L.slice(0, -1), [tip[0], tip[1], 1], ...R.slice(0, -1).reverse()]);
}

// ---------------------------------------------------------------- tones

/** The key light comes from up front; the side of a part facing away from it takes the shadow tone */
const LIGHT = unit([0.85, -0.53]);
const shadeOf = (c: string, k = 0.3) => mix(c, "#130d30", k);
const lightOf = (c: string, k = 0.18) => mix(c, "#fff3e2", k);
const skinShadeOf = (c: string, k = 0.2) => mix(c, "#5b2238", k);

// ---------------------------------------------------------------- the rig

// Lengths for a 300 px figure: head 50 · neck 14 · torso (hip joint → shoulder) 76 · leg 140 + ankle 12
const LEN = { th: 72, sh: 68, ua: 54, fa: 46 };
const SHOULDER: V = [-1, -76]; // torso coordinates: origin at the hip joint, before the lean
const NECK: V = [2, -80];
const NECK_LEN = 14;
const NECK_HEAD: V = [-6, 14]; // where the neck enters the head, head coordinates (skull centre at 0 0)
const HEEL: V = [-9, 12], BALL: V = [21, 12]; // ground contacts in shoe coordinates (ankle at 0 0)
const POCKET: V = [10, -22]; // hoodie pocket, torso coordinates

type HandKind = "relax" | "fist" | "open" | "point";
type ArmSpec = { s: number; e: number; hand?: HandKind; at?: V; knee?: V };
type LegSpec = { at: V; f: number } | { h: number; k: number; f: number };
type Spec = {
  lean: number; head: number; hip: V; armL: ArmSpec; armR: ArmSpec; legL: LegSpec; legR: LegSpec;
  pocket?: boolean; still?: boolean;
};

// Arms: world angles (0 hangs down, + swings forward), elbow relative to the upper arm, or `at` = wrist target in
// torso coordinates. Legs: `at` = ankle on the ground plane (planted, solved), or hip/knee angles for poses off the
// feet. Base stance: weight on the back (far) leg, the front leg loose with its heel a little up.
const FEET = { legL: { at: [-6, -12] as V, f: 0 }, legR: { at: [15, -16] as V, f: 9 } };
const POSES: Record<Exclude<Pose, "walk" | "run">, Spec> = {
  stand: { lean: -2, head: 5, hip: [-3, -151.2], armL: { s: -10, e: 70, at: POCKET }, armR: { s: -2, e: 14 }, ...FEET, pocket: true },
  sit: { lean: 5, head: 4, hip: [-14, -82], armL: { s: 14, e: 44 }, armR: { s: 22, e: 50 }, legL: { h: 86, k: -84, f: 0 }, legR: { h: 80, k: -76, f: -3 }, still: true },
  kneel: { lean: 14, head: 4, hip: [-8, -80], armL: { s: 22, e: 30, knee: [-10, -10] }, armR: { s: 30, e: 40, knee: [-2, -12] }, legL: { h: 4, k: -112, f: 100 }, legR: { h: 88, k: -88, f: 0 }, still: true },
  armsUp: { lean: -6, head: -14, hip: [-2, -149.6], armL: { s: 146, e: 20, hand: "open" }, armR: { s: 108, e: 58, hand: "open" }, legL: { at: [-9, -12], f: 0 }, legR: { at: [17, -17], f: 12 } },
  lookUp: { lean: -7, head: -24, hip: [-4, -151.2], armL: { s: -10, e: 70, at: POCKET }, armR: { s: -2, e: 10 }, ...FEET, pocket: true },
  phone: { lean: 3, head: 20, hip: [-2, -151.2], armL: { s: 8, e: -90, at: [30, -46] }, armR: { s: 12, e: -100, at: [34, -50], hand: "fist" }, ...FEET },
  sing: { lean: -6, head: -16, hip: [-3, -149.6], armL: { s: 58, e: 4, hand: "open" }, armR: { s: 52, e: -118, at: [36, -94], hand: "fist" }, legL: { at: [-10, -12], f: 0 }, legR: { at: [21, -13], f: 4 } },
  point: { lean: 5, head: -2, hip: [-2, -149.6], armL: { s: 4, e: 4 }, armR: { s: 86, e: 2, hand: "point" }, legL: { at: [-10, -12], f: 0 }, legR: { at: [20, -12], f: 0 } },
  hold: { lean: 2, head: 10, hip: [-3, -151.2], armL: { s: 10, e: -60, at: [36, -34] }, armR: { s: 14, e: -66, at: [40, -36], hand: "fist" }, ...FEET },
  reach: { lean: -3, head: -10, hip: [-2, -149.6], armL: { s: 4, e: 4 }, armR: { s: 100, e: -14, hand: "open" }, legL: { at: [-9, -12], f: 0 }, legR: { at: [16, -18], f: 14 } },
  wave: { lean: -3, head: -4, hip: [-3, -151.2], armL: { s: 4, e: 4 }, armR: { s: 112, e: 58, hand: "open" }, ...FEET },
  balance: { lean: 12, head: -8, hip: [0, -149.6], armL: { s: 96, e: -16, hand: "open" }, armR: { s: -74, e: -8, hand: "open" }, legL: { at: [2, -12], f: 0 }, legR: { h: -42, k: -32, f: 64 } },
  // drawn standing and then laid down (LIE): forward here is up there, the back of the body lies on the surface
  lie: { lean: 12, head: -9, hip: [0, -150], armL: { s: -14, e: 6 }, armR: { s: -18, e: -100, at: [22, -54] }, legL: { h: -4, k: 0, f: 24 }, legR: { h: 6, k: -22, f: 20 }, still: true },
};

/**
 * The lying pose is solved standing and then laid on its back: turned −90° (the head goes left, forward goes up) and
 * moved so the hips sit at the origin with the back of the body on y = 0 (sunk in a little, as into a mattress)
 */
const LIE = "translate(150 -22) rotate(-90)";
const lieAt = (p: V): V => [p[1] + 150, -p[0] - 22];

/**
 * Walk and run as keyframed foot paths, the legs solved to them. A planted foot rocks on its heel, lies flat, then
 * rolls onto the ball; while it is down it moves back at exactly the body's speed (v per cycle), so it never slides.
 * keys: [t, progress from toe-off to the next heel strike, lift px, foot angle].
 */
type Gait = { v: number; stance: number; F: number; on: number; off: number; keys: number[][]; hip: (p: number) => number; lean: number; arm: number; elbow: number };
const WALK: Gait = {
  v: STRIDE, stance: 0.6, F: 48, on: -14, off: 30,
  keys: [[0, 0, 0, 30], [0.25, 0.1, 13, 42], [0.55, 0.55, 14, 4], [0.82, 1.03, 5, -12], [1, 1, 0, -14]],
  hip: (p) => -146.6 - 3.9 * Math.cos(4 * Math.PI * (p - 0.3)), lean: 4, arm: 30, elbow: 10,
};
const RUN: Gait = {
  v: RUN_STRIDE, stance: 0.32, F: 26, on: -6, off: 50,
  keys: [[0, 0, 0, 50], [0.25, 0.05, 40, 76], [0.5, 0.45, 56, 40], [0.8, 1.08, 18, 0], [1, 1, 0, -6]],
  hip: (p) => -146 + 4 * Math.cos(4 * Math.PI * (p - 0.16)), lean: 13, arm: 42, elbow: 70,
};

function keyed(keys: number[][], t: number): number[] {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = Math.max(0, Math.min(1, (t - k1[0]) / (k2[0] - k1[0] || 1)));
  return k1.slice(1).map((_, j) => {
    const a = k0[j + 1], b = k1[j + 1], c = k2[j + 1], d = k3[j + 1];
    return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  });
}

/** Ankle of a foot whose heel touches the ground at x = hx, rolled by f (− on the heel, + onto the ball) */
function planted(hx: number, f: number): V {
  if (f <= 0) return add([hx, 0], rot(mul(HEEL, -1), f));
  return add([hx + BALL[0] - HEEL[0], 0], rot(mul(BALL, -1), f));
}

function gaitFoot(g: Gait, phase: number): { at: V; f: number } {
  const q = ((phase % 1) + 1) % 1;
  const heel = (u: number) => g.F - g.v * g.stance * u;
  if (q < g.stance) {
    const u = q / g.stance;
    const f = u < 0.12 ? g.on * Math.pow(1 - u / 0.12, 2) : u < 0.55 ? 0 : g.off * Math.pow((u - 0.55) / 0.45, 1.6);
    return { at: planted(heel(u), f), f };
  }
  const [k, lift, f] = keyed(g.keys, (q - g.stance) / (1 - g.stance));
  return { at: add(lerpV(planted(heel(1), g.off), planted(heel(0), g.on), k), [0, -lift]), f };
}

/** Two-bone IK from root to target; bend +1 puts the middle joint forward (knees), −1 back (elbows) */
function ik(root: V, target: V, l1: number, l2: number, bend: number): [V, V] {
  const d0 = sub(target, root);
  const d = Math.max(Math.abs(l1 - l2) + 1, Math.min(l1 + l2 - 0.05, Math.hypot(d0[0], d0[1])));
  const a = (Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))) * 180) / Math.PI;
  const base = angleOf(d0);
  return [fk(root, l1, base + bend * a), fk(root, d, base)];
}

type LegOut = { hip: V; knee: V; ank: V; f: number };
type ArmOut = { sh: V; el: V; wr: V; ang: number; kind: HandKind };
type Rig = {
  hip: V; lean: number; headAng: number; breath: number; pocket: boolean;
  legs: [LegOut, LegOut]; arms: [ArmOut, ArmOut]; neckBase: V; neckTop: V; hc: V;
  /** follow-through for loose parts, px (+ trails behind) */
  drift: number;
};

function solve(pose: Pose, phase: number, T: number, outfit: Outfit): Rig {
  const gait = pose === "walk" ? WALK : pose === "run" ? RUN : null;
  const key = pose === "walk" || pose === "run" ? "stand" : pose;
  const breath = 0.9 * Math.sin(T * 1.7);
  let hip: V, lean: number, head: number, drift: number, pocket = false;
  let legL: LegSpec, legR: LegSpec, armL: ArmSpec, armR: ArmSpec;
  if (gait) {
    const run = gait === RUN, p = phase;
    hip = [0, gait.hip(p)];
    lean = gait.lean + (run ? 1.5 : 1) * Math.cos(4 * Math.PI * (p - 0.1));
    head = -lean * 0.7 + (run ? -2 : 3);
    const fl = gaitFoot(gait, p), fr = gaitFoot(gait, p - 0.5);
    legL = { at: fl.at, f: fl.f };
    legR = { at: fr.at, f: fr.f };
    const w = Math.cos(2 * Math.PI * (p - 0.04));
    if (run) {
      // the elbow closes as the arm drives forward and opens on the back swing
      armR = { s: lean - 6 + gait.arm * w, e: gait.elbow + 30 * w, hand: "fist" };
      armL = { s: lean - 6 - gait.arm * w, e: gait.elbow - 30 * w, hand: "fist" };
    } else {
      armR = { s: gait.arm * w - 3, e: gait.elbow + 22 * Math.max(0, w) };
      armL = { s: -gait.arm * w - 3, e: gait.elbow + 22 * Math.max(0, -w) };
    }
    drift = (run ? 12 : 6) + (run ? 4 : 2.5) * Math.sin(4 * Math.PI * p - 1);
  } else {
    const sp = POSES[key];
    const idle = sp.still ? 0 : 1;
    hip = [sp.hip[0] + idle * 2.2 * Math.sin(T * 0.55), sp.hip[1] + idle * 0.4 * Math.sin(T * 1.1)];
    lean = sp.lean + 1.2 * Math.sin(T * 0.55 + 1.2);
    head = sp.head + 1.6 * Math.sin(T * 0.45 + 2);
    legL = sp.legL;
    legR = sp.legR;
    const sway = 1.6 * Math.sin(T * 0.55 + 2.2);
    armL = { ...sp.armL, s: sp.armL.s + sway, e: sp.armL.e + 1.5 * Math.sin(T * 1.7 + 0.5) };
    armR = { ...sp.armR, s: sp.armR.s - sway * 0.8, e: sp.armR.e + 1.5 * Math.sin(T * 1.7 + 1.5) };
    if (pose === "wave") armR.e = 58 + 22 * Math.sin(T * 8);
    pocket = !!sp.pocket && outfit === "hoodie";
    if (pocket) armR = { ...armR, s: -12 + (armR.s - sp.armR.s) };
    drift = 2.2 * Math.sin(T * 0.55 - 0.7);
  }
  const body = (p: V): V => add(hip, rot(p, lean));
  const leg = (h: V, sp: LegSpec): LegOut => {
    if ("at" in sp) {
      const [knee, ank] = ik(h, sp.at, LEN.th, LEN.sh, 1);
      return { hip: h, knee, ank, f: sp.f };
    }
    const knee = fk(h, LEN.th, sp.h);
    return { hip: h, knee, ank: fk(knee, LEN.sh, sp.h + sp.k), f: sp.f };
  };
  // a wrist target: the upper arm keeps its angle and the forearm points at the target, foreshortened when the
  // target is near (the forearm turns towards the viewer); out of reach, the arm is solved to it instead
  const arm = (sh: V, sp: ArmSpec, target?: V): ArmOut => {
    let el = fk(sh, LEN.ua, sp.s);
    if (target) {
      const d = Math.hypot(...sub(target, el));
      if (d > LEN.fa) [el] = ik(sh, target, LEN.ua, LEN.fa, -1);
      const a = angleOf(sub(target, el));
      return { sh, el, wr: fk(el, Math.max(LEN.fa * 0.5, Math.min(LEN.fa, Math.hypot(...sub(target, el)))), a), ang: a, kind: sp.hand ?? "relax" };
    }
    return { sh, el, wr: fk(el, LEN.fa, sp.s + sp.e), ang: sp.s + sp.e, kind: sp.hand ?? "relax" };
  };
  const shL = body([SHOULDER[0] - 3, SHOULDER[1] - 1 - breath]), shR = body([SHOULDER[0] + 2, SHOULDER[1] - breath]);
  // only the hoodie has a pocket: elsewhere the far arm hangs where the near thigh hides its hand
  if (!pocket && armL.at === POCKET) armL = { ...armL, at: undefined, s: armL.s + 14, e: 4 };
  const nearTarget = pocket ? body(POCKET) : armR.at ? body(armR.at) : undefined;
  const neckBase = body([NECK[0], NECK[1] - breath]);
  const neckTop = fk(neckBase, NECK_LEN, 180 - (lean + 0.4 * head + 12));
  const headAng = lean + head;
  const legs: [LegOut, LegOut] = [leg(add(hip, [-1.5, 0]), legL), leg(add(hip, [1.5, 0]), legR)];
  const onKnee = (sp: ArmSpec) => (sp.knee ? add(legs[1].knee, sp.knee) : undefined);
  return {
    hip, lean, headAng, breath, pocket, drift, legs,
    arms: [arm(shL, armL, armL.at ? body(armL.at) : onKnee(armL)), arm(shR, armR, nearTarget ?? onKnee(armR))],
    neckBase, neckTop, hc: sub(neckTop, rot(NECK_HEAD, headAng)),
  };
}

/**
 * Where the front hand is, in the person's own coordinates × s — to hang a prop on it (mirror x when flipped). The
 * outfit only matters for `stand` and `lookUp`, where a hoodie puts its hands in the pocket.
 */
export function personHand(pose: Pose, s = 1, phase = 0, T = 0, outfit: Outfit = "hoodie"): [number, number] {
  const a = solve(pose, phase, T, outfit).arms[1];
  const q = add(a.wr, rot([0, 9], -a.ang));
  const p = pose === "lie" ? lieAt(q) : q;
  return [p[0] * s, p[1] * s];
}

// ---------------------------------------------------------------- parts (shapes face right)

// head coordinates: skull centre at 0 0, chin at about +21, crown at −27.5. No face on purpose: the profile line
// (brow, a long smooth face, a small chin and a clear jaw) and the hair carry it.
const HEAD: K[] = [[-2, -27.5], [9, -25.5], [16.5, -19.5], [20.2, -11], [21.6, -4], [21.4, 3], [20.6, 9.5], [19.6, 14.5], [17.4, 19], [13, 21.2], [6, 20.6], [-0.5, 17.6], [-5.5, 12.5], [-13, 12], [-21.5, 5], [-25.5, -7], [-21.5, -20], [-12, -26.5]];
const EAR: K[] = [[-9.6, -3.6], [-4.6, -4.8], [-2.4, 0], [-3.2, 5.4], [-6.6, 7.6], [-9.8, 3.6]];
const CHEEK: K[] = [[9.5, 6.5], [14.5, 4.6], [17.8, 7.6], [15.6, 11.4], [10.6, 11]];
const HAIR: Record<Hair, { cap: K[]; hi: K[]; ear: boolean }> = {
  // a short side-swept cut: volume on top, a temple notch, a short sideburn in front of the ear, tapered nape
  short: {
    cap: [[15.2, -17.5], [19.4, -21.2], [20.2, -26], [16.5, -31.2], [7, -34.4], [-7, -34], [-19.5, -28.5], [-26.5, -16], [-27.2, -2], [-23.5, 7.5], [-17, 12.4, 1], [-12.6, 4.6], [-10.6, -3.4], [-6, -6.8], [-1.6, -6.4], [-0.6, 0.6], [1.4, 3.4, 1], [2.6, -4.2], [6.4, -10], [11, -14.6]],
    hi: [[-15, -29.6], [-2, -33.2], [12.5, -29.8], [4, -30.8], [-6.4, -30.6]],
    ear: true,
  },
  // long: a side part, the hair falls over the ear and frames the face
  long: {
    cap: [[15.4, -17], [20, -22.4], [16, -30.8], [3, -34.2], [-12, -32.8], [-23, -25.4], [-28.6, -11], [-28.6, 5], [-23, 15.5], [-12, 21], [-3.4, 19.6], [1.2, 12], [2.6, 2], [5.6, -7], [10.4, -13.6]],
    hi: [[-15, -28.2], [-2, -32.6], [11, -28.8], [3, -30.2], [-6, -29.8]],
    ear: false,
  },
  // pulled back tight to a tie at the back of the crown
  ponytail: {
    cap: [[15.6, -16.6], [19, -22], [13.5, -28.8], [1, -31.8], [-11, -30.5], [-21, -24], [-25.5, -12], [-24.5, 0.5], [-19.5, 9], [-14, 10.5, 1], [-11.5, 3], [-9.6, -4], [-4.6, -6.6], [0.4, -6.4], [1.6, -1], [3.6, -5.6], [7.4, -10.8], [11.6, -14.6]],
    hi: [[-13, -27], [-1, -30.4], [10.5, -26.8], [2, -28.4], [-6.5, -28]],
    ear: true,
  },
};
const PONY_TIE: V = [-21, -21];

// hands: wrist at 0 0, pointing down (+y) along the forearm, thumb forward
const HANDS: Record<HandKind, K[]> = {
  relax: [[-4.3, -1], [-5.3, 5.5], [-5, 10.8], [-3.4, 15.4], [-0.6, 18.8], [2.2, 17.8], [3.3, 13.8], [4.4, 13.9], [6, 12.6], [6.4, 8.6], [5.6, 4.6], [4.3, 1]],
  fist: [[-4.6, -1], [-5.6, 5], [-5.2, 10.5], [-2, 13.2], [3.2, 12.6], [5.8, 9], [6.4, 4], [4.6, 0]],
  open: [[-4.2, -1], [-5, 6], [-4.8, 14], [-3.4, 21], [-0.6, 23.5], [2, 21.8], [3.2, 14], [4, 9.5], [8.6, 6.6], [9.4, 4.8], [7.6, 3.6], [4.4, 1.6]],
  point: [[-4.6, -1], [-5.6, 5], [-5, 10], [-3.2, 12.4], [-2.6, 22], [-0.8, 24], [1.2, 22.6], [1.6, 13.2], [4.4, 11.6], [6, 8], [6.4, 3.4], [4.6, 0]],
};

// shoes: ankle at 0 0, sole at y = 12, toe forward
const SNEAKER: K[] = [[-10, -4.5], [-2, -6], [6, -8.5], [10.5, -5], [18, -1], [26, 2], [31, 5.5], [32.4, 9.5], [30.5, 12.5, 1], [-11.5, 12.5, 1], [-13.2, 7], [-12.8, 0]];
const SNEAKER_SOLE: K[] = [[-13.4, 7.6, 1], [32.6, 7.6, 1], [32.4, 10], [30.5, 12.5, 1], [-11.5, 12.5, 1], [-13.4, 10]];
const OXFORD: K[] = [[-9.5, -2], [2, -3.5], [10, -1.5], [20, 2.5], [30, 5.5], [35, 8.5], [35, 11], [33, 12, 1], [-10, 12, 1], [-11.5, 6], [-11, 0]];
const OXFORD_HEEL: K[] = [[-11.6, 8.5], [-3, 8.5, 1], [-3, 12, 1], [-10, 12, 1]];
const FOOT: K[] = [[-7, -3], [4, -2], [14, 2], [26, 5], [32, 8], [32, 11], [30, 12, 1], [-9, 12, 1], [-10, 5]];
const FLAT: K[] = [[-10.5, 3], [-4, 6], [6, 7], [14, 5.5], [22, 4], [30, 5.5], [33.5, 9], [32.5, 12, 1], [-9.5, 12, 1], [-11, 8]];

// garments, torso coordinates (origin at the hip joint, before the lean); b = breath
const TORSO: Record<Outfit, (b: number) => K[]> = {
  hoodie: (b) => [[-6, -86 - b], [-19, -81 - b], [-24.5, -66], [-24, -38], [-24, 3], [-22, 11, 1], [20, 11, 1], [23, 3], [24, -22], [25.5, -50], [20.5, -73 - b], [11, -84 - b, 1]],
  suit: (b) => [[-6, -86 - b], [-19, -80 - b], [-23.5, -64], [-20.5, -40], [-21.5, -18], [-24, 4], [-24, 16, 1], [-4, 13.5], [21, 9, 1], [20.5, -10], [19, -30], [24, -54], [20, -75 - b], [11, -84 - b, 1]],
  dress: (b) => [[-5, -83 - b], [-18, -77 - b], [-21, -60], [-16, -38], [-16, -26, 1], [18, -26, 1], [18, -38], [24, -54], [19, -70 - b], [13, -76 - b], [7, -78 - b, 1]],
};
const POCKET_PANEL: K[] = [[6, -40, 1], [17, -40.5], [32, -40], [32, 3, 1], [9, 3, 1], [4, -14], [3.6, -28]];
const POCKET_LIP: K[] = [[6, -40, 1], [3.6, -28], [4, -14], [9, 3, 1], [7, 3, 1], [1.6, -14], [1.4, -28]];

export type Look = {
  outfit: Outfit; hair: Hair; skin: string;
  top: string; pants: string; shoes: string; hairColor: string; accent: string;
};
const LOOKS: Record<Outfit, Omit<Look, "outfit" | "hair" | "skin" | "hairColor" | "accent">> = {
  hoodie: { top: "#3b4fb0", pants: "#1f2a6b", shoes: "#f2f4ff" },
  suit: { top: "#1b2252", pants: "#121737", shoes: "#0d1130" },
  dress: { top: "#c8364f", pants: "#2a1b30", shoes: "#2a1b30" },
};

// limb widths at root, middle joint, end
const ARM_W: Record<Outfit, W3> = { hoodie: [23, 17.5, 15.5], suit: [21, 16.5, 14], dress: [14.5, 11.5, 9] };
const LEG_W: Record<Outfit, W3> = { hoodie: [30, 21, 16], suit: [28, 21, 18], dress: [23, 15, 10.5] };

/** A limb as one shape; `band` paints the side away from the light one tone darker */
function Limb({ p, w, fill, band, rim, bows }: { p: [V, V, V]; w: W3; fill: string; band?: string; rim?: string; bows?: { back?: [number, number]; front?: [number, number] } }) {
  const bb = bows?.back ?? [0, 0], bf = bows?.front ?? [0, 0];
  const A: W3 = [w[0] / 2, w[1] / 2, w[2] / 2], B: W3 = [-w[0] / 2, -w[1] / 2, -w[2] / 2];
  const main = limbD(p, A, B, { gA: bb, gB: [-bf[0], -bf[1]], cap0: true });
  if (!band) return <path d={main} fill={fill} />;
  const side = dot(perp(unit(sub(p[1], p[0]))), LIGHT) < 0 ? 1 : -1;
  const k = 0.44;
  const outer: W3 = [side * A[0], side * A[1], side * A[2]];
  const inner: W3 = [side * A[0], side * w[1] * (0.5 - k), side * w[2] * (0.5 - k)];
  const g: [number, number] = side > 0 ? bb : [-bf[0], -bf[1]];
  const gl: [number, number] = side > 0 ? [-bf[0], -bf[1]] : bb;
  const lo: W3 = [-side * A[0], -side * A[1], -side * A[2]], li: W3 = [-side * A[0], -side * (A[1] - 1.7), -side * (A[2] - 1.5)];
  const r0: W3 = [lo[0], li[1], li[2]];
  return (
    <>
      <path d={main} fill={fill} />
      <path d={limbD(p, outer, inner, { gA: g, gB: [g[0] * 0.5, g[1] * 0.5] })} fill={band} />
      {rim && <path d={limbD(p, lo, r0, { gA: gl, gB: gl })} fill={rim} />}
    </>
  );
}

/**
 * A person. `look` sets outfit (hoodie, suit, dress), hair (short, long, ponytail), skin and colours; anything left
 * out comes from the outfit's defaults. `prop` is drawn in the person's own coordinates, after everything else
 * (personHand gives the front hand's position). `id` prefixes the clip paths (one is made up when left out).
 */
export const Person: React.FC<{
  x: number; y: number; s?: number; pose?: Pose; phase?: number; flip?: boolean; opacity?: number; T?: number;
  look?: Partial<Look>; prop?: React.ReactNode; shadow?: boolean; tie?: boolean; id?: string;
}> = ({ x, y, s = 1, pose = "stand", phase = 0, flip = false, opacity = 1, T = 0, look = {}, prop, shadow = true, tie = true, id }) => {
  const auto = useId();
  const uid = (id ?? `person${auto}`).replace(/[^a-zA-Z0-9_-]/g, "");
  const outfit = look.outfit ?? "hoodie";
  const base = LOOKS[outfit];
  const top = look.top ?? base.top, pants = look.pants ?? base.pants, shoes = look.shoes ?? base.shoes;
  const skin = look.skin ?? SKINS.light;
  const hairColor = look.hairColor ?? "#3a2a24";
  const hair = look.hair ?? (outfit === "dress" ? "long" : "short");
  const accent = look.accent ?? "#3fe6ff";
  const dress = outfit === "dress", suit = outfit === "suit", hoodie = outfit === "hoodie";
  const r = solve(pose, phase, T, outfit);
  const b = r.breath, dr = r.drift;

  const topS = shadeOf(top, 0.22), topF = shadeOf(top, 0.42);
  const skinS = skinShadeOf(skin, 0.16), skinF = skinShadeOf(skin, 0.34);
  const legC = dress ? skin : pants, legF = dress ? skinF : shadeOf(pants, 0.42);
  const armC = dress ? skin : top, armS = dress ? skinS : topS, armF = dress ? skinF : topF;
  const hairHi = lightOf(hairColor, 0.2);
  const [legFar, legNear] = r.legs, [armFar, armNear] = r.arms;
  const torsoTf = `translate(${pt(r.hip)}) rotate(${num(r.lean)})`;
  const atHead = (p: V): V => add(r.hc, rot(p, r.headAng));
  const toBody = (p: V): V => add(r.hip, rot(p, r.lean));
  const legBows = dress ? { back: [0, 2.5] as [number, number], front: [1, 0.5] as [number, number] } : { back: [0, 1.5] as [number, number], front: [1.5, 0] as [number, number] };
  const torsoD = smooth(TORSO[outfit](b));
  const clip = `url(#${uid}-torso)`;

  const shoe = (l: LegOut, far: boolean) => {
    const tf = `translate(${pt(l.ank)}) rotate(${num(l.f)})`;
    const dk = (c: string) => (far ? shadeOf(c, 0.4) : c);
    if (dress)
      return (
        <g transform={tf}>
          <path d={smooth(FOOT)} fill={far ? skinF : skin} />
          <path d={smooth(FLAT)} fill={dk(shoes)} />
        </g>
      );
    if (suit)
      return (
        <g transform={tf}>
          <path d={smooth(OXFORD)} fill={dk(shoes)} />
          <path d={smooth(OXFORD_HEEL)} fill={dk(shadeOf(shoes, 0.5))} />
          <path d="M-10.5 10.6L33.6 10.6" stroke={dk(lightOf(shoes, 0.16))} strokeWidth={1.4} />
          {!far && <path d="M23 3.6Q30 5.4 33.4 8.6" stroke={lightOf(shoes, 0.35)} strokeWidth={1.6} strokeLinecap="round" fill="none" />}
        </g>
      );
    return (
      <g transform={tf}>
        <path d={smooth(SNEAKER)} fill={dk(shoes)} />
        <path d={smooth(SNEAKER_SOLE)} fill={dk(shadeOf(shoes, 0.16))} />
        <path d="M-4 3.4Q7 3 15 -0.6" stroke={dk(top)} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      </g>
    );
  };

  const hand = (a: ArmOut, far: boolean) => <path d={smooth(place(HANDS[a.kind], a.wr, -a.ang))} fill={far ? skinF : skin} />;

  const leg = (l: LegOut, far: boolean) => (
    <>
      <Limb p={[l.hip, l.knee, l.ank]} w={LEG_W[outfit]} fill={far ? legF : legC} bows={legBows} />
      {shoe(l, far)}
    </>
  );

  const arm = (a: ArmOut, far: boolean) => {
    const w = ARM_W[outfit];
    const sleeveEnd = lerpV(a.sh, a.el, 0.5);
    return (
      <>
        {!far && (
          <g clipPath={`url(#${uid}-torsoP)`}>
            <path d={limbD([lerpV(a.sh, a.el, 0.45), a.el, a.wr], [w[1] / 2, w[1] / 2, w[2] / 2], [-w[1] / 2, -w[1] / 2, -w[2] / 2])} transform="translate(-3.5 2.5)" fill={shadeOf(top, 0.28)} />
          </g>
        )}
        <Limb p={[a.sh, a.el, a.wr]} w={w} fill={far ? armF : armC} band={far ? undefined : armS} rim={far ? undefined : dress ? lightOf(skin, 0.16) : lightOf(top, 0.1)} bows={{ back: [0.5, 0], front: [0.5, 0] }} />
        {dress && (
          <>
            <path d={limbD([a.sh, lerpV(a.sh, sleeveEnd, 0.5), sleeveEnd], [11.5, 12.5, 10], [-11.5, -12.5, -10], { cap0: true })} fill={far ? topF : top} />
            <path d={limbD([lerpV(a.sh, sleeveEnd, 0.84), lerpV(a.sh, sleeveEnd, 0.92), sleeveEnd], [10.4, 10.2, 10], [-10.4, -10.2, -10])} fill={far ? shadeOf(topF, 0.2) : shadeOf(top, 0.24)} />
          </>
        )}
        {hoodie && <path d={limbD([lerpV(a.el, a.wr, 0.84), lerpV(a.el, a.wr, 0.92), a.wr], [8.4, 8.4, 8.4], [-8.4, -8.4, -8.4])} fill={far ? shadeOf(topF, 0.15) : topS} />}
        {suit && <path d={limbD([lerpV(a.el, a.wr, 0.9), lerpV(a.el, a.wr, 0.95), add(a.wr, mul(dir(a.ang), 2))], [6.6, 6.6, 6.6], [-6.6, -6.6, -6.6])} fill={far ? "#a9adc4" : "#eef0fa"} />}
      </>
    );
  };

  // dress skirt: from the waist over both thighs to a hem just above the knees, trailing a little
  let skirt: React.ReactNode = null;
  if (dress) {
    const W = LEG_W.dress[0];
    const th = [legFar, legNear].map((l) => ({ l, u: unit(sub(l.knee, l.hip)) }));
    const hemAt = (t: { l: LegOut; u: V }, side: number) => add(lerpV(t.l.hip, t.l.knee, 0.86), mul(perp(t.u), side * (W / 2 + 6)));
    const [back, front] = [...th].sort((p, q) => p.l.knee[0] - q.l.knee[0]);
    const hb = add(hemAt(back, 1), [dr * 0.8, 0]), hf = add(hemAt(front, -1), [dr * 0.5, 0]);
    const out = unit(add(back.u, front.u));
    const spread = Math.hypot(...sub(hb, hf));
    const mid = add(lerpV(hb, hf, 0.5), add(mul(out, Math.max(1.5, 5 - spread * 0.04)), [dr * 0.4, 0]));
    const wB = toBody([-16, -28]), wF = toBody([18, -28]);
    // sitting: the seat of the skirt tucks under the thigh instead of hanging behind the hip
    const sitK = Math.max(0, Math.min(1, (angleOf(back.u) - 25) / 45));
    const seat = lerpV(toBody([-23, -4]), add(lerpV(back.l.hip, back.l.knee, -0.1), mul(perp(back.u), W / 2 + 6)), sitK);
    // and the front lies along the top of a raised thigh
    const sitF = Math.max(0, Math.min(1, (angleOf(front.u) - 25) / 45));
    const lap = lerpV(toBody([22, -6]), add(lerpV(front.l.hip, front.l.knee, 0.22), mul(perp(front.u), -(W / 2 + 5))), sitF);
    const pts: K[] = [[wB[0], wB[1], 1], seat, [hb[0], hb[1], 1], mid, [hf[0], hf[1], 1], lap, [wF[0], wF[1], 1]];
    const hem = (t: number) => (t < 0.5 ? lerpV(hb, mid, t * 2) : lerpV(mid, hf, t * 2 - 1));
    const fold = (w0: number, t0: number, t1: number): K[] => {
      const a = lerpV(wB, wF, w0), p = hem(t0), q = hem(t1);
      return [a, [p[0], p[1], 1], [q[0], q[1], 1]];
    };
    const skirtD = smooth(pts);
    skirt = (
      <>
        <clipPath id={`${uid}-skirt`}>
          <path d={skirtD} />
        </clipPath>
        <path d={skirtD} fill={top} />
        <g clipPath={`url(#${uid}-skirt)`}>
          <path d={smooth([pts[0], pts[1], pts[2], hem(0.24), lerpV(wB, wF, 0.25)])} fill={topS} />
          <path d={smooth(fold(0.42, 0.36, 0.46))} fill={shadeOf(top, 0.16)} />
          <path d={smooth(fold(0.7, 0.66, 0.74))} fill={shadeOf(top, 0.12)} />
        </g>
      </>
    );
  }

  const lying = pose === "lie";
  // long hair: below the head it hangs straight down whatever the head does, and the ends trail; lying, it spreads
  // behind the head over what the head rests on (towards −x here, before the pose is laid down)
  let hairBack: React.ReactNode = null;
  if (hair === "long" && lying) {
    const a1 = atHead([-18, -25]), a4 = atHead([-2, 19]);
    const at = (u: number, v: number): V => [r.hc[0] + u, r.hc[1] + v];
    hairBack = (
      <>
        <path d={smooth([a1, at(-34, -27), at(-44, -6), at(-43, 18), at(-34, 42), [at(-18, 54)[0], at(-18, 54)[1], 1], at(-8, 40), a4])} fill={hairColor} />
        <path d={tube([at(-30, -14), at(-37, 6), at(-33, 30), at(-22, 44)], [2.6, 3.6, 3, 0])} fill={hairHi} opacity={0.5} />
      </>
    );
  } else if (hair === "long") {
    const a1 = atHead([-18, -25]), a2 = atHead([-29, -4]), a3 = atHead([-22, 13]), a4 = atHead([-2, 19]);
    const end = r.neckBase[1] + 50;
    const bx = Math.min(a2[0], a3[0]) - 1, fx = Math.max(a4[0] + 2, bx + 24);
    const y = (k: number) => lerp(Math.min(a2[1], a4[1]), end, k);
    const pts: K[] = [a1, a2, [bx - 3 + dr * 0.25, y(0.35)], [bx - 2.5 + dr * 0.7, end - 12], [bx + 1 + dr, end, 1], [bx + 8 + dr * 0.95, end - 6], [bx + 15 + dr * 0.9, end + 3, 1], [fx + dr * 0.75, end - 8], [fx + 1.5 + dr * 0.5, y(0.55)], [fx + 0.5 + dr * 0.2, y(0.2)], a4];
    hairBack = (
      <>
        <path d={smooth(pts)} fill={hairColor} />
        <path d={tube([lerpV(a2, a4, 0.4), [bx + 7 + dr * 0.35, y(0.45)], [bx + 9 + dr * 0.8, end - 9]], [3.6, 3, 0])} fill={hairHi} opacity={0.5} />
      </>
    );
  }
  let pony: React.ReactNode = null;
  if (hair === "ponytail") {
    const tie = atHead(PONY_TIE);
    const c: V[] = lying
      ? [tie, add(tie, [-9, 4]), add(tie, [-17, 13]), add(tie, [-21, 26]), add(tie, [-20, 40])]
      : [tie, add(tie, [-8 + dr * 0.2, 5]), add(tie, [-13 + dr * 0.5, 20]), add(tie, [-12 + dr * 0.8, 36]), add(tie, [-7 + dr, 50])];
    pony = (
      <>
        <path d={tube(c, [8, 12, 12, 7, 0])} fill={hairColor} />
        <path d={tube([add(c[1], [1.5, 1]), add(c[2], [2, 0]), add(c[3], [1.5, 0]), add(c[4], [0.5, -5])], [2.6, 3.2, 2.2, 0])} fill={hairHi} opacity={0.7} />
        <ellipse cx={tie[0]} cy={tie[1]} rx={4.2} ry={5.2} transform={`rotate(${num(r.headAng + 30)} ${pt(tie)})`} fill={accent} />
      </>
    );
  }

  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={opacity}>
      <defs>
        <clipPath id={`${uid}-torso`}>
          <path d={torsoD} />
        </clipPath>
        <clipPath id={`${uid}-torsoP`}>
          <path d={torsoD} transform={torsoTf} />
        </clipPath>
      </defs>
      {shadow && !lying && (
        <>
          <ellipse cx={6} cy={2} rx={60} ry={9} fill="#000" opacity={0.2} />
          <ellipse cx={6} cy={2} rx={38} ry={5.5} fill="#000" opacity={0.22} />
        </>
      )}
      <g transform={lying ? LIE : undefined}>
        {/* far arm and leg, a tone darker */}
        {!r.pocket && arm(armFar, true)}
        {!r.pocket && hand(armFar, true)}
        {leg(legFar, true)}
        {leg(legNear, false)}
        {skirt}
        {/* the hood lies on the upper back, behind the neck */}
        {hoodie && (
          <g transform={torsoTf}>
            <path d={smooth([[6, -82 - b], [-2, -89.5 - b], [-13, -93 - b], [-23.5, -90 - b], [-28.5, -81 - b], [-28, -70], [-25.5, -60], [-17, -70], [-8, -78 - b]])} fill={shadeOf(top, 0.1)} />
            <path d={smooth([[2, -85 - b], [-6, -90.5 - b], [-17, -91.5 - b], [-24.5, -86.5 - b], [-15, -87.5 - b], [-5, -86 - b]])} fill={shadeOf(top, 0.45)} />
          </g>
        )}
        {dress && <path d={smooth(place([[0, -86 - b], [9, -84 - b], [15, -75 - b], [6, -70 - b], [-1, -76 - b]], r.hip, r.lean))} fill={skin} />}
        <path d={limbD([r.neckBase, lerpV(r.neckBase, r.neckTop, 0.5), r.neckTop], [6.8, 6.5, 6.5], [-6.8, -6.5, -6.5], { cap2: true })} fill={skinS} />
        {/* the garment, its shading clipped to it */}
        <g transform={torsoTf}>
          <path d={torsoD} fill={top} />
          <g clipPath={clip}>
            <path d={smooth([[-36, -104], [-17, -88], [-15, -50], [-13, -12], [-12, 26], [-36, 26]])} fill={topS} />
            {hoodie && (
              <>
                <path d={smooth(POCKET_LIP)} fill={shadeOf(top, 0.3)} />
                <path d={smooth(POCKET_PANEL)} fill={lightOf(top, 0.05)} />
                <rect x={-30} y={2.5} width={60} height={14} fill={shadeOf(top, 0.16)} />
              </>
            )}
            {suit && (
              <>
                <path d={smooth([[9, -86 - b], [21, -75 - b], [25, -54], [19.5, -30, 1], [14.5, -34], [15, -56], [11, -76 - b]])} fill={lightOf(top, 0.12)} />
                <path d={smooth([[2, -9, 1], [17, -10.5, 1], [17.2, -7.5, 1], [2, -6, 1]])} fill={topS} />
              </>
            )}
            {dress && <rect x={-30} y={-38.5} width={60} height={10.5} fill={shadeOf(top, 0.35)} />}
          </g>
          {hoodie && (
            <>
              <path d={smooth([[-3, -84 - b], [5, -80 - b], [13, -83 - b], [11, -87 - b], [3, -86.5 - b]])} fill={topS} />
              <path d={tube([[12, -81 - b], [12.6 + dr * 0.15, -71 - b], [13 + dr * 0.35, -62 - b]], [2.4, 2.4, 2.2])} fill={lightOf(top, 0.6)} />
            </>
          )}
          {suit && (
            <>
              {tie ? (
                <path d={smooth([[11, -85 - b], [15.5, -85 - b], [19, -76 - b], [24.5, -56], [22.5, -53, 1], [17, -74 - b]])} fill={accent} />
              ) : (
                <path d={smooth([[12, -85 - b], [17.5, -80 - b], [22, -64], [21.5, -56, 1], [19.5, -57], [16.5, -72 - b]])} fill="#eef0fa" />
              )}
              <path d={smooth([[3, -88 - b], [8, -93.5 - b], [14.5, -89.5 - b], [13, -84.5 - b], [6.5, -84 - b]])} fill="#eef0fa" />
              <path d={smooth([[11, -87 - b], [18, -82 - b, 1], [13.5, -80.5 - b]])} fill="#dfe3f2" />
            </>
          )}
        </g>
        {hairBack}
        {pony}
        {/* head */}
        <g transform={`translate(${pt(r.hc)}) rotate(${num(r.headAng)})`}>
          <path d={smooth(HEAD)} fill={skin} />
          <path d={smooth(CHEEK)} fill={mix(skin, "#ff6f7d", 0.24)} />
          {HAIR[hair].ear && <path d={smooth(EAR)} fill={skinS} />}
          <path d={smooth(HAIR[hair].cap)} fill={hairColor} />
          <path d={smooth(HAIR[hair].hi)} fill={hairHi} />
        </g>
        {/* near arm, in front of everything */}
        {arm(armNear, false)}
        {pose === "phone" && (
          <g transform={`translate(${pt(add(armNear.wr, rot([2, 9], -armNear.ang)))}) rotate(${num(-armNear.ang - 60)})`}>
            <rect x={-4} y={-16} width={8} height={32} rx={2.5} fill="#11142e" />
            <rect x={1.5} y={-14} width={2.5} height={28} rx={1} fill={accent} />
          </g>
        )}
        {r.pocket ? (
          <g transform={torsoTf} clipPath={clip}>
            <path d={smooth(POCKET_LIP)} fill={shadeOf(top, 0.3)} />
            <path d={smooth(POCKET_PANEL)} fill={lightOf(top, 0.05)} />
            <rect x={-30} y={2.5} width={60} height={14} fill={shadeOf(top, 0.16)} />
          </g>
        ) : (
          hand(armNear, false)
        )}
      </g>
      {prop}
    </g>
  );
};
