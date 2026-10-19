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
