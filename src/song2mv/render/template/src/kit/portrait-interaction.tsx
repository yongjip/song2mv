import React from "react";
import { PortraitBody, PortraitPhone, solveArm } from "./portrait-body";
import type { PortraitArmRig, PortraitPoint } from "./portrait-body";
import { Notebook } from "./styles/poster";
import { shade } from "./color";

export type PortraitInteractionAction = "phone" | "write" | "head-touch";
export type PortraitProfile = {
  /** Body-local head rotation pivot, aligned with the shirt collar. */
  neck: readonly [number, number];
  /** Body-local centre of the screen-right ear at zero head rotation. */
  ear: readonly [number, number];
  /** Screen-right temple at zero head rotation; required only for head-touch. */
  temple?: readonly [number, number];
};
export type PortraitInteractionLook = {
  color?: string;
  legs?: string;
  skin?: string;
  shoes?: string;
  phoneColor?: string;
  bookColor?: string;
};
export type PortraitInteractionInput = {
  action: PortraitInteractionAction;
  time: number;
  progress?: number;
  profile: PortraitProfile;
};
export type PortraitInteractionProps = PortraitInteractionInput & {
  x: number;
  y: number;
  s?: number;
  look?: PortraitInteractionLook;
  /** Return the original portrait, rotated about profile.neck, plus any fixed chest decoration. */
  renderHead: (headAngle: number) => React.ReactNode;
};
type Point = PortraitPoint;
type ResolvedBase = {
  lean: number;
  headAngle: number;
  arms: { left: PortraitArmRig; right: PortraitArmRig };
  foreground: { left: boolean; right: boolean };
};
export type ResolvedInteraction = ResolvedBase &
  (
    | {
        action: "phone";
        phone: { origin: Point; angle: number; ear: Point; grip: Point; wrist: Point };
      }
    | {
        action: "write";
        writing: {
          progress: number;
          lift: number;
          book: { origin: Point; scale: number };
          support: Point;
          tip: Point;
          grip: Point;
          wrist: Point;
          penAngle: number;
          inkPath: string;
        };
      }
    | {
        action: "head-touch";
        headTouch: {
          phase: "rest" | "approach" | "hold";
          approach: number;
          temple: Point;
          contact: Point;
          wrist: Point;
          handAngle: number;
        };
      }
  );

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const finite = (v: number | undefined, fallback = 0) => (Number.isFinite(v) ? (v as number) : fallback);
const finitePoint = (point: unknown): point is readonly [number, number] =>
  Array.isArray(point) && point.length === 2 && [point[0], point[1]].every(Number.isFinite);
const add = (a: readonly number[], b: readonly number[]): Point => [a[0] + b[0], a[1] + b[1]];
const rotate = ([x, y]: readonly number[], degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const p = (point: readonly number[]) => `${point[0]} ${point[1]}`;
const phonePoint = (origin: Point, angle: number, point: Point) => add(origin, rotate(point, angle));
const armAt = (side: -1 | 1, elbow: Point, wrist: Point): PortraitArmRig => {
  const shoulder = solveArm(side, 13).shoulder;
  const sleeveAngle = (Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]) * 180) / Math.PI - 90;
  return { shoulder, elbow, wrist, sleeveAngle, handAngle: sleeveAngle };
};

const writingPoints: Point[] = [
  [48, -76],
  [56, -96],
  [62, -70],
  [69, -78],
  [75, -101],
  [80, -76],
  [88, -81],
  [95, -94],
  [103, -78],
  [111, -82],
  [119, -103],
  [126, -77],
  [135, -84],
  [144, -96],
  [152, -79],
  [160, -88],
  [169, -105],
  [176, -79],
  [186, -87],
].map(([x, y]) => [x * 0.3, -160 + y * 0.3]);
const lengths = writingPoints
  .slice(1)
  .map((point, i) => Math.hypot(point[0] - writingPoints[i][0], point[1] - writingPoints[i][1]));
const totalLength = lengths.reduce((a, b) => a + b, 0);

export function writingPathAt(progress: number, offsetY = 0): { tip: Point; inkPath: string } {
  let remaining = clamp(finite(progress), 0, 1) * totalLength;
  const visible: Point[] = [writingPoints[0]];
  for (let i = 0; i < lengths.length; i++) {
    const a = writingPoints[i],
      b = writingPoints[i + 1];
    if (remaining < lengths[i]) {
      const u = remaining / lengths[i];
      visible.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      break;
    }
    visible.push(b);
    remaining -= lengths[i];
  }
  const shifted = visible.map((point) => add(point, [0, finite(offsetY)]));
  return {
    tip: shifted[shifted.length - 1],
    inkPath: shifted.map((point, i) => `${i === 0 ? "M" : "L"}${p(point)}`).join(" "),
  };
}

/** The geometry PortraitInteraction draws, in body coordinates, for tests and checks */
export function resolveInteraction({ action, time, progress, profile }: PortraitInteractionInput): ResolvedInteraction {
  if (!finitePoint(profile.neck) || !finitePoint(profile.ear))
    throw new RangeError("Portrait profile anchors must be finite");
  if (profile.ear[0] <= profile.neck[0] || profile.ear[1] >= profile.neck[1])
    throw new RangeError("Portrait ear must be above and to the right of its neck");
  if (Math.hypot(profile.neck[0], profile.neck[1] + 235) > 4)
    throw new RangeError("Portrait neck must be within 4 of the body's collar at (0, -235)");
  const t = Math.max(0, finite(time));
  if (action === "head-touch") {
    const temple = profile.temple;
    if (!finitePoint(temple)) {
      throw new RangeError("Head-touch requires a finite two-coordinate temple anchor");
    }
    if (temple[0] <= profile.neck[0] || temple[1] >= profile.ear[1]) {
      throw new RangeError("Head-touch temple must be to the right of the neck and above the ear");
    }
    const q = clamp(t / 0.55, 0, 1),
      approach = q * q * (3 - 2 * q);
    const headAngle = 2.2 * approach,
      lean = 0.45 * approach;
    const rotatedTemple = add(
      profile.neck,
      rotate([temple[0] - profile.neck[0], temple[1] - profile.neck[1]], headAngle),
    );
    const rest = solveArm(1, 13),
      heldAngle = 160 + headAngle;
    const offset = rotate([8.5, 46], heldAngle);
    const heldWrist: Point = [rotatedTemple[0] - offset[0], rotatedTemple[1] - offset[1]];
    const heldElbow: Point = [clamp(heldWrist[0] + 19, 93, 108), heldWrist[1] + 59];
    const targetUpper = Math.hypot(heldElbow[0] - rest.shoulder[0], heldElbow[1] - rest.shoulder[1]);
    const targetLower = Math.hypot(heldWrist[0] - heldElbow[0], heldWrist[1] - heldElbow[1]);
    if (targetUpper < 35 || targetUpper > 80 || targetLower < 35 || targetLower > 80) {
      throw new RangeError("Head-touch temple is out of the arm's reach: fit the portrait to the body");
    }
    const mix = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * approach, a[1] + (b[1] - a[1]) * approach];
    const wrist = mix(rest.wrist, heldWrist);
    wrist[0] += 54 * Math.sin(Math.PI * approach);
    const elbow = mix(rest.elbow, heldElbow);
    const right = armAt(1, elbow, wrist),
      held = armAt(1, heldElbow, heldWrist);
    const wristTurn = ((heldAngle - held.sleeveAngle + 540) % 360) - 180;
    // turned from the forearm, not between absolute angles, which wrap at ±180
    const handAngle = right.sleeveAngle + wristTurn * approach;
    const contact = add(wrist, rotate([8.5, 46], handAngle));
    return {
      action,
      lean,
      headAngle,
      arms: { left: solveArm(-1, 13), right },
      foreground: { left: false, right: true },
      headTouch: {
        phase: t <= 0 ? "rest" : t < 0.55 ? "approach" : "hold",
        approach,
        temple: rotatedTemple,
        contact,
        wrist,
        handAngle,
      },
    };
  }
  if (action === "phone") {
    const lean = 0.65 * Math.sin(t * 0.9),
      headAngle = -1.5 - 1.1 * Math.sin(t * 1.2);
    const ear = add(
      profile.neck,
      rotate([profile.ear[0] - profile.neck[0], profile.ear[1] - profile.neck[1]], headAngle),
    );
    const angle = headAngle;
    const offset = rotate([4, 8], angle);
    const origin: Point = [ear[0] - offset[0], ear[1] - offset[1]];
    const grip = phonePoint(origin, angle, [24, 55]);
    const wrist = phonePoint(origin, angle, [27, 73]);
    const elbow: Point = [clamp(wrist[0] + 6, 86, 103), clamp(wrist[1] + 58, -198, -177)];
    const right = armAt(1, elbow, wrist);
    const upper = Math.hypot(elbow[0] - right.shoulder[0], elbow[1] - right.shoulder[1]);
    const lower = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
    if (upper < 32 || upper > 65 || lower < 35 || lower > 76) {
      throw new RangeError(
        `Phone profile puts the ear out of the arm's reach (upper arm ${upper.toFixed(1)}, forearm ${lower.toFixed(1)}): fit the portrait to the body`,
      );
    }
    return {
      action,
      lean,
      headAngle,
      arms: { left: solveArm(-1, 13), right },
      foreground: { left: false, right: true },
      phone: { origin, angle, ear, grip, wrist },
    };
  }
  const prepare = clamp(t / 0.6, 0, 1);
  const lift = 24 * (1 - prepare * prepare * (3 - 2 * prepare));
  const u = clamp(finite(progress), 0, 1),
    { tip, inkPath } = writingPathAt(u, lift);
  const penAngle = 25,
    grip = add(tip, rotate([0, -13], penAngle));
  const wrist = add(tip, [22, 14]);
  const support: Point = [-69, -116 + lift];
  const elbow: Point = [90 + (tip[0] - 35) * 0.18, -151 + (tip[1] - lift + 185) * 0.08 + lift];
  return {
    action: "write",
    lean: -0.35 * Math.sin(t),
    headAngle: 3.5 + 1.2 * Math.sin(Math.PI * u),
    arms: { left: armAt(-1, [-77, -157 + lift], support), right: armAt(1, elbow, wrist) },
    foreground: { left: true, right: true },
    writing: {
      progress: u,
      lift,
      book: { origin: [0, -160 + lift], scale: 0.3 },
      support,
      tip,
      grip,
      wrist,
      penAngle,
      inkPath,
    },
  };
}

function PhonePalm({ skin }: { skin: string }) {
  return (
    <path
      data-part="phone-palm"
      d="M18 73L36 73L36 61Q36 53 30 51L24 51Q19 53 18 62Z"
      fill={skin}
      stroke={shade(skin, 0.66)}
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  );
}
function PhoneGrip({ skin }: { skin: string }) {
  return (
    <g>
      <path
        data-part="phone-grip"
        d="M24 49Q31 47 34 51L35 57Q35 62 30 63L23 63Q19 62 19 59Q19 56 24 56L28 55L25 54Z"
        fill={skin}
        stroke={shade(skin, 0.66)}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <path d="M29 57L24 58M30 60L25 61" stroke={shade(skin, 0.8)} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

function HeadTouchHand({ skin }: { skin: string }) {
  const edge = { stroke: shade(skin, 0.66), strokeWidth: 1.3, strokeLinejoin: "round" as const };
  return (
    <g fill={skin}>
      <path data-part="head-touch-index" d="M5 22L4.8 40Q4.5 46 8.5 46Q12 46 11.5 41L10 24Z" {...edge} />
      <path data-part="head-touch-middle" d="M-3 23L-2 34L1 41Q2 45 4 44Q7 43 5 39L3 32L3 23Z" {...edge} />
      <path data-part="head-touch-ring" d="M-10 21L-8 30L-4 37Q-3 40 -1 38Q1 36 -1 33L-4 27L-4 21Z" {...edge} />
      <path data-part="head-touch-thumb" d="M9 12Q13 11 15 16L17 23Q18 26 15 27Q13 27 11 23L8 19Z" {...edge} />
      <path data-part="head-touch-palm" d="M-10 0H10L11 13Q12 22 7 28L1 30Q-7 29 -10 21Q-13 11 -10 0Z" {...edge} />
    </g>
  );
}

/**
 * A PortraitBody acting out `action`, its hands, prop and contact points worked out together: "phone" (a call, the
 * phone's back to the camera and its top at the ear), "write" (in a notebook held up in the left hand; the ink follows
 * the pen, `progress` 0–1) or "head-touch" (an open hand at the temple, reached in 0.55 s and held: start it 0.55 s
 * before the word). `time` is seconds since the action started. `profile` gives the head's neck (within 4 of
 * (0, −235)), screen-right ear and, for head-touch, temple (where the hair meets the skin beside the eyebrow) in body
 * coordinates, before lean and `s`; `renderHead(angle)` draws the head turned by `angle` about that neck. A profile out
 * of the arm's reach throws a RangeError: fit the portrait to the body rather than widening the limits.
 */
export function PortraitInteraction({
  action,
  time,
  progress,
  profile,
  x,
  y,
  s = 1,
  look = {},
  renderHead,
}: PortraitInteractionProps) {
  const pose = resolveInteraction({ action, time, progress, profile });
  const skin = look.skin ?? "#eac09f";
  let underObject: React.ReactNode, object: React.ReactNode, overObject: React.ReactNode;
  if (pose.action === "phone") {
    const { origin, angle } = pose.phone,
      transform = `translate(${p(origin)}) rotate(${angle})`;
    underObject = (
      <g transform={transform}>
        <PhonePalm skin={skin} />
      </g>
    );
    object = (
      <g data-part="phone-object" transform={transform}>
        <PortraitPhone color={look.phoneColor} />
      </g>
    );
    overObject = (
      <g transform={transform}>
        <PhoneGrip skin={skin} />
      </g>
    );
  } else if (pose.action === "write") {
    const { book, support, tip, grip, penAngle, inkPath, progress: u } = pose.writing;
    underObject = (
      <g transform={`translate(${p(support)})`}>
        <path
          data-part="support-palm"
          d="M-10 -7H9L10 4Q9 11 0 11Q-10 11 -10 3Z"
          fill={skin}
          stroke={shade(skin, 0.66)}
          strokeWidth={1.3}
        />
      </g>
    );
    object = (
      <g data-part="writing-object">
        <g data-part="notebook">
          <Notebook x={book.origin[0]} y={book.origin[1]} s={book.scale} color={look.bookColor} embeddedPen={false} />
        </g>
        <path
          data-part="writing-ink"
          d={inkPath}
          fill="none"
          stroke="#364c64"
          strokeWidth={1.08}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={u > 0 ? 1 : 0}
        />
      </g>
    );
    overObject = (
      <>
        <g transform={`translate(${p(support)})`}>
          <path
            data-part="support-grip"
            d="M-4 2Q2 5 5 0L9 -9Q10 -13 6 -14Q3 -14 1 -10L-4 -4Z"
            fill={skin}
            stroke={shade(skin, 0.66)}
            strokeWidth={1.2}
          />
        </g>
        <g transform={`translate(${p(tip)})`}>
          <path
            data-part="writing-palm"
            d="M14 14H30L29 8Q28 4 23 0L12 -10Q8 -15 4 -12Q1 -9 6 -5L13 1Q14 4 11 6Q9 9 14 14Z"
            fill={skin}
            stroke={shade(skin, 0.66)}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <g data-part="pen" transform={`rotate(${penAngle})`}>
            <path d="M-1.9 -36H1.9V-6H-1.9Z" fill="#245c88" stroke="#173d5a" strokeWidth={0.7} />
            <path d="M-.7 -34V-9" stroke="#8cc8f0" strokeWidth={0.7} />
            <path data-part="pen-tip" d="M-1.9 -6L0 0L1.9 -6Z" fill="#cba275" />
            <path d="M-.65 -2L0 0L.65 -2Z" fill="#141414" />
            <path d="M-2 -37H2" stroke="#de4933" strokeWidth={3} strokeLinecap="round" />
          </g>
        </g>
        <g transform={`translate(${p(grip)})`}>
          <path
            data-part="writing-grip"
            d="M-3 -4Q1 -7 5 -3L9 1Q12 5 8 7Q6 8 3 5L-2 2Q-5 0 -3 -4Z"
            fill={skin}
            stroke={shade(skin, 0.66)}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </g>
      </>
    );
  } else {
    const { wrist, handAngle } = pose.headTouch;
    overObject = (
      <g data-part="head-touch-hand" transform={`translate(${p(wrist)}) rotate(${handAngle})`}>
        <HeadTouchHand skin={skin} />
      </g>
    );
  }
  return (
    <g data-part="portrait-interaction" data-action={pose.action}>
      <PortraitBody
        x={x}
        y={y}
        s={s}
        color={look.color}
        legs={look.legs}
        skin={skin}
        shoes={look.shoes}
        lean={pose.lean}
        foregroundCollar
        articulation={{
          arms: pose.arms,
          foreground: pose.foreground,
          hideHands: { left: pose.action === "write", right: true },
          overObjectArms: { right: pose.action === "write" },
          underObject,
          object,
          overObject,
        }}
      >
        {renderHead(pose.headAngle)}
      </PortraitBody>
    </g>
  );
}
