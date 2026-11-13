import React, { createContext, useContext } from "react";

/**
 * Experimental. A figure's skeleton in 3D, seen through a camera, with each part drawn by a drawing picked for the way
 * it faces the camera: cut-out animation's drawing substitution on a shared skeleton. The skeleton owns where every
 * joint is, how big each part is (its distance sets its scale, `k` px per metre) and which way it faces; the drawings
 * own the look. Use it where perspective matters: a camera above or below, a figure coming toward the camera, a lift,
 * a three-quarter walk with a backpack. `VIEWS.md` beside `src/` says how, and what it cannot do. No dependency.
 *
 * World units are metres, y up, the ground at y = 0. A figure at yaw 0 faces +z. Exported from the kit as `skeleton`.
 */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** `a` turned toward `b` by `angle` (radians); `a` and `b` unit and perpendicular */
const turn = (a: V3, b: V3, angle: number): V3 => add(mul(a, Math.cos(angle)), mul(b, Math.sin(angle)));

/** A camera on the 1920 × 1080 stage: where it is, what it looks at, its vertical field of view in degrees */
export type Camera = { eye: V3; at: V3; fov: number; w?: number; h?: number };
/** A point on the stage: x, y in px, its distance in front of the camera in metres, and `k`, px per metre there */
export type J = { x: number; y: number; depth: number; k: number };

function camBasis(c: Camera) {
  const f = norm(sub(c.at, c.eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const h = c.h ?? 1080, w = c.w ?? 1920;
  return { f, r, u, w, h, focal: h / 2 / Math.tan((c.fov * Math.PI) / 360) };
}

export function project(p: V3, c: Camera): J {
  const b = camBasis(c), d = sub(p, c.eye), z = Math.max(1e-3, dot(d, b.f));
  return { x: b.w / 2 + (b.focal * dot(d, b.r)) / z, y: b.h / 2 - (b.focal * dot(d, b.u)) / z, depth: z, k: b.focal / z };
}
/** The unit vector from `p` to the camera */
export const toCamera = (p: V3, c: Camera) => norm(sub(c.eye, p));

/** A body's sizes in metres */
export type Build = {
  head: number; neck: number; chest: number; shoulderHalf: number; shoulderDrop: number; hipHalf: number;
  upperArm: number; forearm: number; hand: number; thigh: number; shin: number; ankle: number; foot: number;
  /** half widths of the limbs at shoulder, elbow, wrist / hip, knee, ankle */
  armR: [number, number, number]; legR: [number, number, number];
  /** half width and half depth of the chest, of the hips */
  chestR: [number, number]; hipR: [number, number];
};

export type Foot3 = { at: V3; yaw?: number; pitch?: number };
/**
 * A pose. `at` is the ground point under the pelvis; `lift` raises the whole body (a child picked up), `crouch`
 * lowers the pelvis with the feet where they are. Angles are radians: `lean` forward, `twist` the chest's yaw over the
 * hips, `bend` sideways to the figure's right, `headPitch` up. Hands and feet are world targets the limbs reach for
 * with their own lengths (a target out of reach leaves the hand short, never a longer arm); `elbows` and `knees` are
 * points the joints bend toward; `palms` a direction each palm faces.
 */
export type Pose3 = {
  at: V3; yaw?: number; lift?: number; crouch?: number; lean?: number; twist?: number; bend?: number;
  headYaw?: number; headPitch?: number; headRoll?: number;
  hands: { l: V3; r: V3 }; elbows?: { l?: V3; r?: V3 }; palms?: { l?: V3; r?: V3 };
  feet: { l: Foot3; r: Foot3 }; knees?: { l?: V3; r?: V3 };
};

/** Right, up, forward of a part (unit vectors; right is the figure's own right) and its origin */
export type Frame3 = { o: V3; r: V3; u: V3; f: V3 };

function frameOf(o: V3, yaw: number, lean = 0, bend = 0): Frame3 {
  let f: V3 = [Math.sin(yaw), 0, Math.cos(yaw)], u: V3 = [0, 1, 0];
  let r = cross(f, u);
  [u, f] = [turn(u, f, lean), turn(f, mul(u, -1), lean)];
  [u, r] = [turn(u, r, bend), turn(r, mul(u, -1), bend)];
  return { o, r, u, f };
}

/** Two bones from `a` toward `t`, `l1` and `l2` long, the joint bent toward `pole`. Out of reach, the end stops short. */
export function twoBone(a: V3, t: V3, pole: V3, l1: number, l2: number) {
  const dv = sub(t, a), dist = len(dv);
  const axis = dist > 1e-6 ? mul(dv, 1 / dist) : ([0, -1, 0] as V3);
  const d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  let side = sub(pole, a);
  side = sub(side, mul(axis, dot(side, axis)));
  if (len(side) < 1e-6) side = cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  side = norm(side);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return { joint: add(add(a, mul(axis, x)), mul(side, h)), end: add(a, mul(axis, d)), short: Math.max(0, dist - l1 - l2) };
}

/**
 * Which way a part faces on screen. `a` is the angle of its forward vector from the camera, measured around the
 * camera's up: 0 faces the camera, 90 faces screen right, -90 screen left, ±180 away. `p` is how far it points above
 * the camera's line of sight (90: straight up past it). From these, a view name for a drawing.
 */
export type Facing = { a: number; p: number };
export function facing(fr: Frame3, c: Camera, fwd: V3 = fr.f): Facing {
  const b = camBasis(c), toCam = toCamera(fr.o, c);
  const camRight = norm(cross(mul(toCam, -1), b.u)), camUp = cross(camRight, mul(toCam, -1));
  const fx = dot(fwd, camRight), fz = dot(fwd, toCam), fy = dot(fwd, camUp);
  return { a: (Math.atan2(fx, fz) * 180) / Math.PI, p: (Math.atan2(fy, Math.hypot(fx, fz)) * 180) / Math.PI };
}
export type YawView = "front" | "q-right" | "right" | "bq-right" | "back" | "bq-left" | "left" | "q-left";
export function yawView(a: number): YawView {
  const s = Math.abs(a), side = a >= 0 ? "right" : "left";
  if (s < 22.5) return "front";
  if (s < 67.5) return `q-${side}` as YawView;
  if (s < 112.5) return side as YawView;
  if (s < 157.5) return `bq-${side}` as YawView;
  return "back";
}
export type PitchView = "up" | "level" | "down";
export const pitchView = (p: number): PitchView => (p > 20 ? "up" : p < -20 ? "down" : "level");

export type HandView = "palm" | "back" | "edge" | "tips" | "wrist";
export type FootView = "top" | "sole" | "toe" | "heel" | "right" | "left";

export type Side = "l" | "r";
/** A hand at the end of a forearm (`joint` to `end`): `u` points back up the arm (fingers along -u), `f` is the palm's normal */
export function handFrame(joint: V3, end: V3, palm: V3, fallback: V3, handLength: number): Frame3 {
  const d = norm(sub(end, joint));
  let n0 = sub(palm, mul(d, dot(palm, d)));
  if (len(n0) < 1e-4) n0 = fallback;
  const n = norm(n0);
  return { o: add(end, mul(d, handLength * 0.45)), u: mul(d, -1), f: n, r: cross(n, mul(d, -1)) };
}
export function handViewOf(h: Frame3, c: Camera): HandView {
  const toCam = toCamera(h.o, c);
  const palm = dot(h.f, toCam), tips = dot(mul(h.u, -1), toCam);
  if (tips > 0.75) return "tips";
  if (tips < -0.75) return "wrist";
  return palm > 0.45 ? "palm" : palm < -0.45 ? "back" : "edge";
}
/** How long a bone a-z of length l looks on the stage, over its length seen side-on at its middle's depth */
export function seenRatio(a: V3, z: V3, l: number, c: Camera) {
  const A = project(a, c), Z = project(z, c), mid = project(lerp3(a, z, 0.5), c);
  return Math.hypot(Z.x - A.x, Z.y - A.y) / (l * mid.k);
}
/**
 * An arm that hangs on no figure (the hands of whoever holds the camera): two bones from `shoulder` to `target`,
 * seen like a figure's arm, with the same hand frame and view rule. `fingers` bends the wrist: the way the fingers
 * point when the hand does not carry on the forearm's line (a hand that grips turns at the wrist).
 */
export function freeArm(b: Build, shoulder: V3, target: V3, pole: V3, palm: V3, c: Camera, fingers?: V3) {
  const ik = twoBone(shoulder, target, pole, b.upperArm, b.forearm);
  const hand = handFrame(fingers ? sub(ik.end, norm(fingers)) : ik.joint, ik.end, palm, [0, 1, 0], b.hand);
  const P = (v: V3) => project(v, c);
  return {
    world: { shoulder, elbow: ik.joint, wrist: ik.end, hand, short: ik.short },
    shoulder: P(shoulder), elbow: P(ik.joint), wrist: P(ik.end), hand: P(hand.o),
    upperRatio: seenRatio(shoulder, ik.joint, b.upperArm, c), foreRatio: seenRatio(ik.joint, ik.end, b.forearm, c),
    handView: handViewOf(hand, c), fingers: P(add(hand.o, mul(hand.u, -b.hand))), short: ik.short,
  };
}

/** The skeleton of one pose, in the world and on the stage, with the view each part's drawing should take */
export type Seen = ReturnType<typeof pose3>;

export function pose3(b: Build, p: Pose3, c: Camera) {
  const yaw = p.yaw ?? 0;
  const legLen = b.thigh + b.shin + b.ankle;
  const pelvisY = p.at[1] + legLen * 0.985 - (p.crouch ?? 0) + (p.lift ?? 0);
  const pelvis = frameOf([p.at[0], pelvisY, p.at[2]], yaw, (p.lean ?? 0) * 0.25, (p.bend ?? 0) * 0.3);
  const chest = frameOf(pelvis.o, yaw + (p.twist ?? 0), p.lean ?? 0, p.bend ?? 0);
  const neckBase = add(pelvis.o, mul(chest.u, b.chest));
  const chestMid = add(pelvis.o, mul(chest.u, b.chest * 0.55));
  const head0: Frame3 = { ...chest, o: neckBase };
  // head: yaw about the chest's up, then pitch (up) about its right, then roll
  const hy = p.headYaw ?? 0, hp = p.headPitch ?? 0, hr = p.headRoll ?? 0;
  let hf = turn(head0.f, mul(head0.r, -1), hy), hrv = turn(head0.r, head0.f, hy), hu = head0.u;
  [hf, hu] = [turn(hf, hu, hp), turn(hu, mul(hf, -1), hp)];
  [hu, hrv] = [turn(hu, hrv, hr), turn(hrv, mul(hu, -1), hr)];
  const headC = add(add(neckBase, mul(chest.u, b.neck)), mul(hu, b.head * 0.5));
  const head: Frame3 = { o: headC, r: hrv, u: hu, f: hf };

  const sideOf = (s: Side) => (s === "r" ? 1 : -1);
  const shoulder = (s: Side) => add(add(neckBase, mul(chest.r, sideOf(s) * b.shoulderHalf)), mul(chest.u, -b.shoulderDrop));
  const hip = (s: Side) => add(pelvis.o, mul(pelvis.r, sideOf(s) * b.hipHalf));

  const arm = (s: Side) => {
    const sh = shoulder(s);
    const pole = p.elbows?.[s] ?? add(add(add(sh, mul(chest.r, sideOf(s) * 0.5)), mul(chest.u, -0.6)), mul(chest.f, -0.4));
    const ik = twoBone(sh, p.hands[s], pole, b.upperArm, b.forearm);
    const hand = handFrame(ik.joint, ik.end, p.palms?.[s] ?? mul(chest.r, -sideOf(s)), chest.f, b.hand);
    return { shoulder: sh, elbow: ik.joint, wrist: ik.end, short: ik.short, hand, fingers: mul(hand.u, -1) };
  };
  const foot = (s: Side) => {
    const f = p.feet[s];
    const fr0 = frameOf(f.at, f.yaw ?? yaw);
    const pitch = f.pitch ?? 0; // + heel up
    const fwd = turn(fr0.f, mul(fr0.u, -1), pitch), up = turn(fr0.u, fr0.f, pitch);
    // a pitched foot turns about its toe (heel up) or its heel (toes up): turning about its middle put the toe of
    // a planted foot below the ground and left the ankle too far back for the leg to reach at push-off
    const e = pitch >= 0 ? 0.5 : -0.5;
    const o = add(add(f.at, mul(fr0.f, e * b.foot)), mul(fwd, -e * b.foot));
    const fr: Frame3 = { o, r: fr0.r, u: up, f: fwd };
    const ankle = add(add(o, mul(up, b.ankle)), mul(fwd, -b.foot * 0.22));
    return { frame: fr, ankle, toe: add(o, mul(fwd, b.foot * 0.5)), heel: add(o, mul(fwd, -b.foot * 0.5)) };
  };
  const leg = (s: Side) => {
    const h = hip(s), ft = foot(s);
    const pole = p.knees?.[s] ?? add(add(h, mul(pelvis.f, 1)), mul(pelvis.r, sideOf(s) * 0.12));
    const ik = twoBone(h, ft.ankle, pole, b.thigh, b.shin);
    return { hip: h, knee: ik.joint, ankle: ik.end, short: ik.short, foot: ft };
  };

  const arms = { l: arm("l"), r: arm("r") }, legs = { l: leg("l"), r: leg("r") };
  const P = (v: V3) => project(v, c);
  const ratio = (a: V3, z: V3, l: number) => seenRatio(a, z, l, c);
  const handView = (s: Side): HandView => handViewOf(arms[s].hand, c);
  const footView = (s: Side): FootView => {
    const fr = legs[s].foot.frame, toCam = toCamera(fr.o, c);
    const up = dot(fr.u, toCam), fw = dot(fr.f, toCam), rt = dot(fr.r, toCam);
    if (up < -0.25) return "sole";
    if (up > 0.8) return "top";
    // toe or heel only within 35 degrees of the camera, measured around the foot's own up: `fw > 0.55` called a
    // foot of a three-quarter walk (40 degrees off) a toe view, and a front drawing there points the foot at the camera
    const around = (Math.atan2(Math.abs(rt), fw) * 180) / Math.PI;
    if (around < 35) return "toe";
    if (around > 145) return "heel";
    return facing(fr, c).a >= 0 ? "right" : "left";
  };

  const headFacing = facing(head, c), chestFacing = facing({ ...chest, o: chestMid }, c), pelvisFacing = facing(pelvis, c);
  return {
    build: b, camera: c, pose: p,
    world: { pelvis, chest, chestMid, neckBase, head, arms, legs },
    // on the stage
    head: { at: P(headC), top: P(add(headC, mul(hu, b.head * 0.5))), facing: headFacing, view: yawView(headFacing.a), pitch: pitchView(headFacing.p) },
    neck: P(neckBase), chestMid: P(chestMid), pelvis: P(pelvis.o),
    torso: { facing: chestFacing, view: yawView(chestFacing.a), hips: yawView(pelvisFacing.a), up: P(add(chestMid, chest.u)), right: P(add(chestMid, chest.r)) },
    arm: (s: Side) => ({
      shoulder: P(arms[s].shoulder), elbow: P(arms[s].elbow), wrist: P(arms[s].wrist), hand: P(arms[s].hand.o),
      upperRatio: ratio(arms[s].shoulder, arms[s].elbow, b.upperArm), foreRatio: ratio(arms[s].elbow, arms[s].wrist, b.forearm),
      handView: handView(s), fingers: P(add(arms[s].hand.o, mul(arms[s].hand.u, -b.hand))), short: arms[s].short,
    }),
    leg: (s: Side) => ({
      hip: P(legs[s].hip), knee: P(legs[s].knee), ankle: P(legs[s].ankle), short: legs[s].short,
      foot: P(legs[s].foot.frame.o), toe: P(legs[s].foot.toe), heel: P(legs[s].foot.heel),
      thighRatio: ratio(legs[s].hip, legs[s].knee, b.thigh), shinRatio: ratio(legs[s].knee, legs[s].ankle, b.shin),
      footView: footView(s), footFacing: facing(legs[s].foot.frame, c),
    }),
    /** stage point of any world point, e.g. a point on the chest: `at(add(world.chestMid, mul(world.chest.f, 0.1)))` */
    at: P,
  };
}

/* ---------- drawing helpers ---------- */

/** The angle (degrees) that turns a drawing made hanging down along +y so that it runs from `a` to `b` */
export const along = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(-(b.x - a.x), b.y - a.y) * 180) / Math.PI;
export const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
/** Place a drawing made in metres-times-`unit` units, origin at its pivot, at `j`, turned `deg`, at that depth's scale */
export const place = (j: J, deg = 0, unit = 0.01, sx = 1, sy = 1) =>
  `translate(${j.x.toFixed(2)} ${j.y.toFixed(2)}) rotate(${deg.toFixed(2)}) scale(${(j.k * unit * sx).toFixed(4)} ${(j.k * unit * sy).toFixed(4)})`;

const f2 = (n: number) => n.toFixed(2);
/** A tapered capsule from a to b with radii ra, rb (px) */
export function capsule(a: { x: number; y: number }, b: { x: number; y: number }, ra: number, rb: number) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < Math.abs(ra - rb) + 0.5) {
    const big = ra >= rb ? a : b, r = Math.max(ra, rb);
    return `M${f2(big.x - r)} ${f2(big.y)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r)} 0Z`;
  }
  const ux = dx / d, uy = dy / d, s = (ra - rb) / d, c = Math.sqrt(Math.max(0, 1 - s * s));
  // tangent points of the two circles
  const nx = ux * s - uy * c, ny = uy * s + ux * c, mx = ux * s + uy * c, my = uy * s - ux * c;
  const a1 = [a.x + nx * ra, a.y + ny * ra], b1 = [b.x + nx * rb, b.y + ny * rb], b2 = [b.x + mx * rb, b.y + my * rb], a2 = [a.x + mx * ra, a.y + my * ra];
  return `M${f2(a1[0])} ${f2(a1[1])}L${f2(b1[0])} ${f2(b1[1])}A${f2(rb)} ${f2(rb)} 0 ${ra > rb ? 0 : 1} 0 ${f2(b2[0])} ${f2(b2[1])}L${f2(a2[0])} ${f2(a2[1])}A${f2(ra)} ${f2(ra)} 0 ${ra > rb ? 1 : 0} 0 ${f2(a1[0])} ${f2(a1[1])}Z`;
}

/* ---------- one outline: ink first, then paint ---------- */

type Pass = "ink" | "paint";
const PassCtx = createContext<{ pass: Pass; ink: string; w: number }>({ pass: "paint", ink: "#2b2326", w: 0 });
/**
 * Draws its children twice: every shape's outline first (thick, in ink), then every shape's fill. Parts that overlap
 * then share one outer outline, as a sleeve and a torso do in a drawing made in one piece: no outline is left where
 * the sleeve meets the chest. Shapes use `<Fill>`; lines and marks inside use `<Detail>` (paint pass only).
 */
export const OneOutline: React.FC<{ ink?: string; width: number; children: React.ReactNode }> = ({ ink = "#2b2326", width, children }) => (
  <>
    <PassCtx.Provider value={{ pass: "ink", ink, w: width }}><g>{children}</g></PassCtx.Provider>
    <PassCtx.Provider value={{ pass: "paint", ink, w: width }}><g>{children}</g></PassCtx.Provider>
  </>
);
export const usePass = () => useContext(PassCtx);
export const Fill: React.FC<React.SVGProps<SVGPathElement> & { d: string; fill: string }> = ({ d, fill, ...rest }) => {
  const { pass, ink, w } = usePass();
  return pass === "ink"
    ? <path d={d} fill={ink} stroke={ink} strokeWidth={w * 2} strokeLinejoin="round" {...rest} />
    : <path d={d} fill={fill} {...rest} />;
};
export const Detail: React.FC<{ children: React.ReactNode }> = ({ children }) => (usePass().pass === "paint" ? <>{children}</> : null);

/* ---------- motion helpers ---------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
/** Eased keyframes: value at time t from [[t0, v0], [t1, v1], ...] */
export function keys(t: number, k: [number, number][]) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
}
export const keys3 = (t: number, k: [number, V3][]): V3 => [0, 1, 2].map((i) => keys(t, k.map(([a, v]) => [a, v[i]]))) as V3;

/**
 * Feet from a list of footfalls: `phase(t)` counts steps (the left foot lands on even numbers, the right on odd),
 * `spot(k)` is the point on the path where step k lands, `stance(k)` the share of that foot's two-step cycle it stays
 * planted (1: it never leaves again), `flat(k)` keeps a planted foot flat (the last steps of a stop). `gait()` ties
 * the phase to the distance, so a figure that stops is left with a foot in the air; here the cadence can run on
 * while the steps shorten, and the last two footfalls land side by side.
 */
export function strides(t: number, o: { phase: (t: number) => number; spot: (k: number) => V3; stance: (k: number) => number; flat?: (k: number) => boolean; dir: V3; halfWidth: number; lift: number; run?: boolean }) {
  const dir = norm(o.dir), side: V3 = norm(cross(dir, [0, 1, 0]));
  const yaw = Math.atan2(dir[0], dir[2]), phase = o.phase(t);
  const foot = (s: Side): Foot3 & { phase: "plant" | "swing" } => {
    const off = s === "l" ? 0 : 1, sgn = s === "r" ? 1 : -1;
    const q = (phase - off) / 2, n = Math.floor(q), u = q - n, k = 2 * n + off;
    const spot = (j: number) => add(o.spot(j), mul(side, sgn * o.halfWidth));
    const st = o.stance(k);
    if (u < st) {
      const roll = u / st;
      const pitch = o.flat?.(k) ? 0 : o.run ? keys(roll, [[0, 0], [0.55, 0], [1, 0.75]]) : keys(roll, [[0, -0.05], [0.25, 0], [0.7, 0], [1, 0.45]]);
      return { at: spot(k), yaw, pitch, phase: "plant" };
    }
    const w = (u - st) / (1 - st);
    const at = lerp3(spot(k), spot(k + 2), smooth(w));
    const up = o.lift * Math.sin(Math.PI * Math.min(1, w * 1.1)) ** (o.run ? 1 : 2);
    const back = o.run ? Math.max(0, Math.sin(Math.PI * Math.min(1, w * 1.6))) : 0;
    at[1] += up + back * o.lift * 0.6;
    const pitch = o.run ? keys(w, [[0, 0.75], [0.35, 1.25], [0.75, 0.1], [1, o.flat?.(k + 2) ? 0 : -0.05]]) : keys(w, [[0, 0.45], [0.4, 0.1], [1, -0.2]]);
    return { at, yaw, pitch, phase: "swing" };
  };
  return { l: foot("l"), r: foot("r"), phase, yaw, side, dir };
}

/**
 * Feet of a walk or run along a straight path: `dist(t)` is the distance travelled (metres) at time t, `step` the
 * distance per step. Each foot is planted at its step's spot while the body passes over it and swings to the next
 * spot through the air, heel first lifting (pitch +) and landing toes up (pitch -) for a walk. `run` lifts the
 * pushed-off foot high behind the body. Returns both feet, the step count (`phase`, for arm swing and bob) and the
 * point under the pelvis. A figure that stops this way is left with a foot in the air: end a walk with `strides()`.
 */
export function gait(t: number, o: { from: V3; dir: V3; dist: (t: number) => number; step: number; stance: number; halfWidth: number; lift: number; run?: boolean }) {
  const dir = norm(o.dir);
  const feet = strides(t, {
    phase: (t) => o.dist(t) / o.step, spot: (k) => add(o.from, mul(dir, (k + 0.5) * o.step)), stance: () => o.stance,
    dir, halfWidth: o.halfWidth, lift: o.lift, run: o.run,
  });
  return { ...feet, centre: add(o.from, mul(dir, o.dist(t))) };
}

/* ---------- bodies drawn through 3D rings ---------- */

export type P2 = { x: number; y: number };
/** The convex hull of stage points */
export function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const turnOf = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P2[] = [], upper: P2[] = [];
  for (const q of p) { while (lower.length >= 2 && turnOf(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && turnOf(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
export const polyD = (pts: P2[], close = true) => (pts.length ? "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L") + (close ? "Z" : "") : "");
/** A ring around a part's up axis: its height above the frame's origin, half width, half depth, how far forward it sits */
export type Ring = [h: number, a: number, b: number, zc?: number];
export function ringPoints(fr: Frame3, [h, a, b, zc = 0]: Ring, n = 24): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    out.push(add(add(add(fr.o, mul(fr.u, h)), mul(fr.r, a * Math.cos(th))), mul(fr.f, zc + b * Math.sin(th))));
  }
  return out;
}
/**
 * A round body, hips or pack as the outline of rings stacked on its frame (`world.chest`, `world.pelvis`): one shape
 * for every view, so it never swaps drawings as it turns. Marks on it (a star, a neckline, a hem) are points on the
 * rings, projected the same way. It suits a toddler's round body; an adult's torso in three-quarter view read as
 * facing front, with each arm's round end as a cap on the chest: draw such a torso per view, sleeve tops included.
 */
export const hullOf = (fr: Frame3, rings: Ring[], c: Camera, n = 24): P2[] => hull(rings.flatMap((r) => ringPoints(fr, r, n)).map((v) => project(v, c)));
/** The stretch of a ring whose surface faces the camera, as stage points in order: a neckline, a hem, a belt */
export function frontArc(fr: Frame3, ring: Ring, c: Camera, n = 36, margin = 0.05): P2[] {
  const [, a, b] = ring, pts = ringPoints(fr, ring, n);
  const seen = pts.map((p, i) => {
    const th = (2 * Math.PI * i) / n;
    return dot(norm(add(mul(fr.r, Math.cos(th) / a), mul(fr.f, Math.sin(th) / b))), toCamera(p, c)) > margin;
  });
  if (seen.every(Boolean)) return pts.map((p) => project(p, c));
  let start = -1;
  for (let i = 0; i < n; i++) if (seen[i] && !seen[(i + n - 1) % n]) { start = i; break; }
  if (start < 0) return [];
  const out: P2[] = [];
  for (let i = start; seen[i % n] && i < start + n; i++) out.push(project(pts[i % n], c));
  return out;
}

/* ---------- a view that holds ---------- */

/**
 * The value `at(t)` steadied: it changes only after the new value has held for `hold` frames in a row, counted from
 * `from` (the shot's start) at `fps`. A view picked by the angle flickers where the angle sits on a bin's border;
 * this keeps the swap to one frame. It is still a pure function of `t`, the same in a segment render and a full one.
 */
export function steady<T>(t: number, from: number, fps: number, at: (t: number) => T, hold = 3): T {
  const last = Math.floor((t - from) * fps + 1e-6);
  let kept = at(from), next = kept, run = 0;
  for (let i = 1; i <= last; i++) {
    const v = at(from + i / fps);
    if (v === kept) { run = 0; continue; }
    if (v === next) run++; else { next = v; run = 1; }
    if (run >= hold) { kept = v; run = 0; }
  }
  return kept;
}
