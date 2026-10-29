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
 * the way to it, the limb straight; one nearer than `upper − lower` leaves `end` past it, the limb folded. `reach`
 * is the target's distance over the limb's length (over 1: out of reach, an arm locked straight like a strap) and
 * `bend` the angle at the joint in degrees (180 straight; under about 80 the limb folds into a V).
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
  return { joint, end, reach: d / (upper + lower), bend: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI };
}
