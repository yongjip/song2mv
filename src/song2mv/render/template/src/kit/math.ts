// Easing and small helpers. All take plain numbers so scenes stay pure functions of the song time.

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const outCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const inCubic = (x: number) => Math.pow(clamp01(x), 3);
export const outExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));
export const outBack = (x: number) => {
  const t = clamp01(x) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};
export const inOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** 0 before a, 1 after b, linear in between */
export const span = (T: number, a: number, b: number) => clamp01((T - a) / (b - a));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

/** Deterministic random numbers (mulberry32) — the same seed draws the same scene every frame */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A two-bone arm or leg from `root` (shoulder, hip) to `target` (hand, foot), `upper` and `lower` long. Of the two
 * ways its joint (elbow, knee) can bend, it takes the one nearer the direction `toward`: down by default, where a
 * hanging arm's elbow goes; down and out from the body's side for an arm that also reaches up (`[-1, 1]` on the
 * picture's left); the way a figure faces for a knee. Where the target lies almost along `toward` from the root, the
 * joint slides through the straight line instead of jumping to the other side. A target out of reach stops `end` on
 * the way to it, the limb straight: the bones keep their lengths, never stretch. One nearer than `upper − lower`
 * leaves `end` past it, the limb folded. `reach` is the target's distance over the limb's length (over 1: out of
 * reach, an arm locked straight like a strap), `short` how far `end` stops short of the target, in the drawing's
 * units (0 within reach), and `bend` the angle at the joint in degrees (180 straight; under about 80 the limb folds
 * into a V).
 */
export function limb(root: [number, number], target: [number, number], upper: number, lower: number, toward: [number, number] = [0, 1]) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  const n = Math.hypot(toward[0], toward[1]) || 1;
  const d = Math.hypot(dx, dy);
  const [ux, uy] = d > 1e-9 ? [dx / d, dy / d] : [toward[1] / n, -toward[0] / n];
  const r = Math.min(Math.max(d, Math.abs(upper - lower) + 1e-6), upper + lower);
  const a = (upper * upper - lower * lower + r * r) / (2 * r);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  const side = Math.max(-1, Math.min(1, (-uy * toward[0] + ux * toward[1]) / n / 0.2));
  const joint: [number, number] = [root[0] + ux * a - side * uy * h, root[1] + uy * a + side * ux * h];
  const end: [number, number] = [root[0] + ux * r, root[1] + uy * r];
  const cos = (upper * upper + lower * lower - r * r) / (2 * upper * lower);
  return { joint, end, reach: d / (upper + lower), short: Math.max(0, d - upper - lower),
    bend: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI };
}

/** Where a figure stands on the stage: its origin at x, y, drawn at scale s, mirrored when flip */
export type Place = { x: number; y: number; s: number; flip?: boolean };
/** A point of a figure's own drawing (scale 1, unmirrored) on the stage */
export const toStage = (p: [number, number], at: Place): [number, number] => [at.x + (at.flip ? -p[0] : p[0]) * at.s, at.y + p[1] * at.s];
/** A stage point in a figure's own drawing: what a piece does with a hand target a scene passes in */
export const toLocal = (p: [number, number], at: Place): [number, number] => [(at.flip ? at.x - p[0] : p[0] - at.x) / at.s, (p[1] - at.y) / at.s];

export type ArmFault = "out of reach" | "folded into a V, elbow up" | "squashed short" | "hand on its own head"
  | "folded across the chest" | "laid across the body";
/**
 * A figure's torso for `arm()`, as an ellipse in its own drawing: centre `c`, half-width `rx`, half-height `ry`.
 * `front` is the way a figure seen from the side or three-quarter faces in its drawing (1 right, -1 left); without it,
 * a figure facing the viewer, the front half is the side of the centre line away from the arm's shoulder.
 */
export type ArmBody = { c: [number, number]; rx: number; ry: number; front?: 1 | -1 };
const armSaid = new Set<string>();

/**
 * An arm from `shoulder` to the hand's `target` in a figure's own drawing, drawn as `limb` draws it (the same
 * `toward`) and checked. This is how to pose a hand by where it must be: the target can be a point of another
 * figure (its shoulder, its back, a hand to hold), brought into this one's drawing with `toLocal(toStage(p, other),
 * me)`, and the bones keep the lengths given, so pass the rig's own lengths, never lengths scaled up until the hand
 * arrives. `faults` lists what a viewer would see wrong: with `holds` (the hand meets something at the target:
 * another hand, a prop, a back it hugs), a target beyond the arm's length, out of reach (the hand stops `short` of it,
 * the arm straight like a strap; a hanging or outstretched arm is straight anyway); a joint under 75° with the elbow the arm's
 * highest point, above the shoulder (a hand at the mouth with the elbow up); a bone drawn under 90 % of its length,
 * where `limb` slides the elbow onto the line to a hand almost along `toward` or against it; with `head` (the skull's
 * centre and radius, hair above the ears included, for an arm drawn in front of it), the hand within 1.1 radii of its
 * centre; with `body` (the torso, for an arm drawn in front of it), folded across the chest, a joint under 100° with the
 * hand on the body and the elbow inside it or less than half an upper arm under the shoulder (a mic grip, a phone or a
 * rope held against the chest), and laid across the body, more than 36 % of the arm's length over the torso's front
 * half (40 px of a 111 px arm: a forearm over the belly). With `who` (the piece's id and which arm) or `T` (the song time), each fault is logged the first time an arm
 * shows it, as `arm: WHO: FAULT at T s` (`arm: WHO: out of reach by N px at T s`, N in the drawing's units), and `song2mv render --json` lists a video's under `warnings`; without either,
 * as when a piece works out where a hand is for a scene, nothing is logged.
 */
export function arm(shoulder: [number, number], target: [number, number], upper: number, lower: number,
  toward: [number, number] = [0, 1], o: { holds?: boolean; head?: { c: [number, number]; r: number }; body?: ArmBody; who?: string; T?: number } = {}) {
  const l = limb(shoulder, target, upper, lower, toward);
  const bone = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const faults: ArmFault[] = [];
  if (o.holds && l.reach > 1) faults.push("out of reach");
  if (l.bend < 75 && l.joint[1] < Math.min(shoulder[1] - 0.15 * upper, l.end[1])) faults.push("folded into a V, elbow up");
  if (bone(shoulder, l.joint) < 0.9 * upper || bone(l.joint, l.end) < 0.9 * lower) faults.push("squashed short");
  if (o.head && bone(l.end, o.head.c) < 1.1 * o.head.r) faults.push("hand on its own head");
  if (o.body) faults.push(...bodyFaults(shoulder, l, upper, lower, o.body));
  const who = o.who ?? "unnamed";
  for (const f of o.who === undefined && o.T === undefined ? [] : faults) {
    if (armSaid.has(`${who}: ${f}`)) continue;
    armSaid.add(`${who}: ${f}`);
    const by = f === "out of reach" ? ` by ${Math.round(l.short)} px` : "";
    console.warn(`arm: ${who}: ${f}${by}${o.T === undefined ? "" : ` at ${o.T.toFixed(2)} s`}`);
  }
  return { ...l, faults };
}

function bodyFaults(shoulder: [number, number], l: ReturnType<typeof limb>, upper: number, lower: number, b: ArmBody): ArmFault[] {
  const depth = (p: [number, number]) => Math.hypot((p[0] - b.c[0]) / b.rx, (p[1] - b.c[1]) / b.ry);
  const faults: ArmFault[] = [];
  if (l.bend < 100 && depth(l.end) < 1 && (depth(l.joint) < 1 || l.joint[1] - shoulder[1] < 0.5 * upper)) {
    faults.push("folded across the chest");
  }
  const front = b.front ?? (shoulder[0] < b.c[0] ? 1 : -1);
  let over = 0;
  for (const [a, e] of [[shoulder, l.joint], [l.joint, l.end]]) {
    const n = Math.max(1, Math.ceil(Math.hypot(e[0] - a[0], e[1] - a[1]) / 2));
    for (let i = 0; i < n; i++) {
      const p: [number, number] = [lerp(a[0], e[0], (i + 0.5) / n), lerp(a[1], e[1], (i + 0.5) / n)];
      if ((p[0] - b.c[0]) * front > 0 && depth(p) < 1) over += Math.hypot(e[0] - a[0], e[1] - a[1]) / n;
    }
  }
  if (depth(l.end) < 1.1 && over > 0.36 * (upper + lower)) faults.push("laid across the body");
  return faults;
}
