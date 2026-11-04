import { portraitMotion } from "./portrait-motion";
import { inOut, lerp } from "./math";

export type FigurePoint = readonly [number, number];
export type FigureAction =
  | { kind: "walk"; time: number; speed?: number }
  | { kind: "phone"; time: number }
  | { kind: "bass"; time: number; bpm?: number };
export type FigureLimb = { root: FigurePoint; joint: FigurePoint; end: FigurePoint };
type FigureBodyPose = {
  travel: number;
  headAngle: number;
  headY: number;
  gaze: FigurePoint;
  leftArm: FigureLimb;
  rightArm: FigureLimb;
  feet: {left: FigurePoint; right: FigurePoint};
  leftLeg: FigureLimb;
  rightLeg: FigureLimb;
};
export type FigurePose = FigureBodyPose & (
  | { kind: "walk" }
  | { kind: "phone"; phone: { origin: FigurePoint; grip: FigurePoint; thumb: number } }
  | { kind: "bass"; bass: { origin: FigurePoint; angle: number; fret: number; pluck: number; neckGrip: FigurePoint; stringContact: FigurePoint } }
);

export function figurePropPoint(origin: FigurePoint, angle: number, point: FigurePoint): FigurePoint {
  const a = angle * Math.PI / 180;
  return [origin[0] + point[0] * Math.cos(a) - point[1] * Math.sin(a),
    origin[1] + point[0] * Math.sin(a) + point[1] * Math.cos(a)];
}

export function solveFigureLimb(root: FigurePoint, end: FigurePoint, upper: number, lower: number, side: -1 | 1): FigureLimb {
  const dx = end[0] - root[0], dy = end[1] - root[1], distance = Math.hypot(dx, dy);
  if (distance <= Math.abs(upper - lower) || distance >= upper + lower) {
    throw new RangeError("Figure target is outside its calibrated limb reach");
  }
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(upper * upper - along * along);
  return { root, end, joint: [root[0] + dx / distance * along - side * dy / distance * height,
    root[1] + dy / distance * along + side * dx / distance * height] };
}
const mixPoint = (a: FigurePoint, b: FigurePoint, u: number): FigurePoint => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];

/** Local origin is ground between the feet. time is elapsed action time, independent of render order. */
export function figurePose(action: FigureAction): FigurePose {
  if (!Number.isFinite(action.time) || action.time < 0) throw new RangeError("Figure time must be finite and non-negative");
  const t = action.time;
  let leftFoot: FigurePoint = [-23, 0], rightFoot: FigurePoint = [23, 0];
  let leftHand: FigurePoint = [-66, -86], rightHand: FigurePoint = [66, -86];
  let travel = 0, headAngle = 0, headY = 0;
  let gaze: FigurePoint = [0, 0];
  let prop: Pick<Extract<FigurePose, {kind: "phone"}>, "kind" | "phone"> |
    Pick<Extract<FigurePose, {kind: "bass"}>, "kind" | "bass"> | {kind: "walk"};
  switch (action.kind) {
    case "walk": {
      const speed = action.speed ?? 32;
      if (!Number.isFinite(speed) || speed < 0) throw new RangeError("Figure speed must be finite and non-negative");
      const motion = portraitMotion(t, "walk", {speed, stride: 34, footLift: 14});
      travel = motion.travel;
      leftFoot = [-23 + motion.feet.left.x, -motion.feet.left.lift];
      rightFoot = [23 + motion.feet.right.x, -motion.feet.right.lift];
      leftHand = [-66 + motion.armSwing * 2, -86];
      rightHand = [66 - motion.armSwing * 2, -86];
      headAngle = motion.armSwing * 0.35;
      gaze = [4, 0];
      prop = {kind: "walk"};
      break;
    }
    case "phone": {
      const raised = inOut((t - 0.25) / 0.95) * (1 - inOut((t - 4.4) / 1.1));
      rightHand = mixPoint([67, -86], [88, -178], raised);
      const origin: FigurePoint = [rightHand[0] - 16, rightHand[1] - 18];
      headAngle = 7 * raised;
      gaze = [6 * raised, 6 * raised];
      prop = {kind: "phone", phone: {origin, grip: rightHand, thumb: inOut((t - 2.1) / 0.3) * (1 - inOut((t - 2.65) / 0.3))}};
      break;
    }
    case "bass": {
      const bpm = action.bpm ?? 112;
      if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 240) throw new RangeError("Figure bass bpm must be within (0, 240]");
      const beats = t * bpm / 60;
      const fret = 119 + 10 * inOut((beats % 8 - 2) / 0.6) - 10 * inOut((beats % 8 - 6) / 0.6);
      const pluck = Math.sin(beats * Math.PI * 4);
      const origin: FigurePoint = [-7, -112 + Math.sin(beats * Math.PI) * 2];
      const angle = -24 + Math.sin(beats * Math.PI) * 1.5;
      rightHand = figurePropPoint(origin, angle, [fret, 0]);
      leftHand = figurePropPoint(origin, angle, [-9, 0]);
      headY = Math.sin(beats * Math.PI * 2) * 2;
      headAngle = Math.sin(beats * Math.PI) * 3;
      gaze = [3, 2];
      prop = {kind: "bass", bass: {origin, angle, fret, pluck, neckGrip: rightHand, stringContact: leftHand}};
      break;
    }
  }
  return {travel, headAngle, headY, gaze, feet: {left: leftFoot, right: rightFoot},
    leftArm: solveFigureLimb([-42, -168], leftHand, 48, 48, 1),
    rightArm: solveFigureLimb([42, -168], rightHand, 48, 48, action.kind === "walk" ? -1 : 1),
    leftLeg: solveFigureLimb([-22, -82], [leftFoot[0], leftFoot[1] - 12], 37, 37, -1),
    rightLeg: solveFigureLimb([22, -82], [rightFoot[0], rightFoot[1] - 12], 37, 37, -1), ...prop};
}
