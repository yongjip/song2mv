export type PortraitAction = "idle" | "walk" | "run" | "phone" | "hold" | "wave" | "point";
export type PortraitFoot = { x: number; lift: number };
export type PortraitPose = {
  lean: number;
  headAngle: number;
  armL: number;
  armR: number;
  /** Opposed vertical wrist travel in local pixels; elbows travel half as far. */
  armSwing: number;
  feet: { left: PortraitFoot; right: PortraitFoot };
  /** Horizontal travel in body-local pixels since this action began. */
  travel: number;
};
export type PortraitMotionOptions = {
  /** Local pixels per second. Apply the body's scale once at placement time. */
  speed?: number;
  /** Total front-to-back movement of a stance foot, in local pixels. */
  stride?: number;
  footLift?: number;
  /** Walking phase offset, in cycles. Does not affect travel. */
  phase?: number;
  /** 0 disables performance accents, 1 uses the restrained default. */
  energy?: number;
};

type Key = readonly [seconds: number, value: number];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const mod1 = (x: number) => ((x % 1) + 1) % 1;
const finite = (x: number | undefined, fallback: number) => (Number.isFinite(x) ? (x as number) : fallback);

function keys(t: number, points: readonly Key[]) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [end, b] = points[i],
      [start, a] = points[i - 1];
    if (t <= end) return a + (b - a) * smooth(clamp((t - start) / (end - start), 0, 1));
  }
  return points[points.length - 1][1];
}

function footAt(phase: number, stance: number, stride: number, lift: number): PortraitFoot {
  const p = mod1(phase);
  if (p < stance) return { x: stride * (0.5 - p / stance), lift: 0 };
  const swing = (p - stance) / (1 - stance);
  return { x: stride * (-0.5 + smooth(swing)), lift: Math.sin(Math.PI * swing) * lift };
}

/**
 * A PortraitBody's pose `time` seconds into `action`, as props to spread on it: feet, lean, arm angles and swing, plus
 * `headAngle` for the head (turn it about the neck) and `travel`. A walk or run plants each foot while the body moves
 * on by `s * travel`, so move the body's x by that; the other actions keep both feet down and settle into their pose
 * instead of repeating it. Pass the matching `gesture` ("phone", "hold", "point") to the body yourself.
 */
export function portraitMotion(
  time: number,
  action: PortraitAction = "idle",
  options: PortraitMotionOptions = {},
): PortraitPose {
  const t = Math.max(0, finite(time, 0));
  const energy = clamp(finite(options.energy, 1), 0, 1.5);
  const pose: PortraitPose = {
    lean: 0,
    headAngle: 0,
    armL: 12,
    armR: 16,
    armSwing: 0,
    feet: { left: { x: 0, lift: 0 }, right: { x: 0, lift: 0 } },
    travel: 0,
  };
  if (action === "walk" || action === "run") {
    const running = action === "run";
    pose.armL = pose.armR = 13;
    const speed = Math.max(0, finite(options.speed, running ? 54 : 24));
    if (speed === 0) return pose;
    const stance = running ? 0.54 : 0.64;
    const stride = clamp(finite(options.stride, running ? 42 : 28), 8, 64);
    const lift = clamp(finite(options.footLift, running ? 17 : 9), 0, 28);
    const period = stride / (speed * stance);
    const phase = t / period + finite(options.phase, 0);
    const swing = Math.sin(2 * Math.PI * phase);
    pose.feet = { left: footAt(phase, stance, stride, lift), right: footAt(phase + 0.5, stance, stride, lift) };
    pose.travel = speed * t;
    pose.lean = (running ? 6 : 1.5) + 1.1 * swing * energy;
    pose.headAngle = -0.3 * pose.lean;
    pose.armSwing = (running ? 9 : 5) * swing * energy;
    return pose;
  }
  if (action === "phone") {
    pose.lean =
      keys(t, [
        [0, 0],
        [0.12, -1.3],
        [0.42, 2.2],
        [0.72, 0.7],
      ]) * energy;
    pose.headAngle =
      keys(t, [
        [0, 0],
        [0.13, 1],
        [0.42, -4],
        [0.78, -2.3],
      ]) * energy;
    pose.armL = keys(t, [
      [0, 12],
      [0.4, 17],
      [0.78, 13],
    ]);
    pose.armR = 150;
  } else if (action === "hold") {
    pose.lean =
      keys(t, [
        [0, 0],
        [0.25, -1],
        [0.65, 0.4],
        [1.05, 0],
      ]) * energy;
    pose.headAngle =
      keys(t, [
        [0, -1],
        [0.45, 3.5],
        [0.9, 2.2],
      ]) * energy;
    pose.armL = pose.armR = 45;
  } else if (action === "wave") {
    pose.lean =
      keys(t, [
        [0, 0],
        [0.16, -1.5],
        [0.42, 1.6],
        [1.0, 0.5],
        [1.3, 0],
      ]) * energy;
    pose.headAngle =
      keys(t, [
        [0, 0],
        [0.4, -3],
        [1.1, -1.5],
        [1.45, 0],
      ]) * energy;
    pose.armR = keys(t, [
      [0, 16],
      [0.16, 8],
      [0.42, 150],
      [0.57, 137],
      [0.72, 157],
      [0.9, 143],
      [1.13, 150],
      [1.38, 16],
    ]);
  } else if (action === "point") {
    pose.lean =
      keys(t, [
        [0, 0],
        [0.13, -2],
        [0.38, 3.4],
        [0.68, 1.8],
      ]) * energy;
    pose.headAngle =
      keys(t, [
        [0, 0],
        [0.35, -2.7],
        [0.7, -1.5],
      ]) * energy;
    pose.armR = 90;
  } else {
    pose.lean = 0.45 * Math.sin((t * Math.PI) / 3) * energy;
    pose.headAngle = -0.35 * pose.lean;
  }
  return pose;
}
