import React from "react";
import { shade } from "./color";

export type PortraitPoint = [number, number];
type V = PortraitPoint;
export type PortraitArmRig = { shoulder: V; elbow: V; wrist: V; handAngle: number; sleeveAngle: number };
/** How PortraitInteraction poses a PortraitBody: arms, which arms are in front, and the held object around them */
export type PortraitBodyArticulation = {
  arms: { left: PortraitArmRig; right: PortraitArmRig };
  foreground: { left: boolean; right: boolean };
  hideHands: { left: boolean; right: boolean };
  overObjectArms?: { left?: boolean; right?: boolean };
  underObject?: React.ReactNode;
  object?: React.ReactNode;
  overObject?: React.ReactNode;
};
export type BodyGesture = "angles" | "phone" | "point" | "smoke" | "hold";
export type HandShape = "relaxed" | "grip" | "point" | "pinch";
export type FootPlacement = { x: number; lift: number };
export type PortraitBodyProps = {
  x: number;
  y: number;
  s?: number;
  color?: string;
  legs?: string;
  skin?: string;
  shoes?: string;
  armL?: number;
  armR?: number;
  armSwing?: number;
  step?: number;
  feet?: { left: FootPlacement; right: FootPlacement };
  lean?: number;
  gesture?: BodyGesture;
  handL?: HandShape;
  handR?: HandShape;
  children?: React.ReactNode;
  frontProp?: React.ReactNode;
  /** set by PortraitInteraction */
  articulation?: PortraitBodyArticulation;
  foregroundCollar?: boolean;
};

const rad = (a: number) => (a * Math.PI) / 180;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V, n: number): V => [a[0] * n, a[1] * n];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const unit = (a: V): V => mul(a, 1 / (Math.hypot(...a) || 1));
const normal = (a: V): V => [-a[1], a[0]];
const turn = ([x, y]: V, a: number): V => [
  x * Math.cos(rad(a)) - y * Math.sin(rad(a)),
  x * Math.sin(rad(a)) + y * Math.cos(rad(a)),
];
const p = (v: V) => `${v[0].toFixed(3)} ${v[1].toFixed(3)}`;

/**
 * A PortraitBody's arm in body coordinates: shoulder, elbow, wrist, the sleeve's angle along the forearm and the
 * hand's (a phone is held upright). `angle` in degrees, 0 down, 90 out, 180 up; `armSwing` lifts one wrist and lowers
 * the other, for a walk.
 */
export function solveArm(side: -1 | 1, angle: number, gesture: BodyGesture = "angles", armSwing = 0) {
  const shoulder: V = [side * 52, -205];
  const a = Math.max(-20, Math.min(180, angle));
  const upper = rad(16 + 0.6 * a),
    lower = rad(Math.max(0, Math.min(180, 1.12 * (a - 12))));
  let elbow: V = [shoulder[0] + side * Math.sin(upper) * 52, shoulder[1] + Math.cos(upper) * 52];
  let wrist: V = [elbow[0] + side * Math.sin(lower) * 48, elbow[1] + Math.cos(lower) * 48];
  if (gesture === "angles") {
    elbow[1] += side * armSwing * 0.5;
    wrist[1] += side * armSwing;
  }
  if (gesture === "hold") {
    elbow = [side * 75, -159];
    wrist = [side * 72, -116];
  }
  if (side === 1) {
    if (gesture === "phone") {
      elbow = [92, -188];
      wrist = [80, -246];
    }
    if (gesture === "point") {
      elbow = [91, -196];
      wrist = [137, -203];
    }
    if (gesture === "smoke") {
      elbow = [94, -182];
      wrist = [106, -239];
    }
  }
  const sleeveAngle = (Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]) * 180) / Math.PI - 90;
  const handAngle = gesture === "phone" && side === 1 ? 180 : sleeveAngle;
  return { shoulder, elbow, wrist, handAngle, sleeveAngle };
}

function world(point: V, { x, y, s = 1, lean = 0 }: Pick<PortraitBodyProps, "x" | "y" | "s" | "lean">): V {
  return add([x, y], mul(add(turn(add(point, [0, 100]), lean), [0, -100]), s));
}

/** Where the cigarette of a PortraitBody with gesture "smoke" ends, in the body's parent: pass the body's props */
export function portraitPropTip(props: PortraitBodyProps): V {
  const arm = solveArm(1, props.armR ?? 15, props.gesture, props.armSwing);
  return world(add(arm.wrist, turn([29 * 0.82, 14 * 0.82], arm.handAngle)), props);
}

function limb(a: V, b: V, c: V, widths: [number, number, number]) {
  const n1 = normal(unit(sub(b, a))),
    n2 = normal(unit(sub(c, b)));
  const corner = unit(add(n1, n2));
  const cornerScale = 1 / Math.max(0.25, corner[0] * n1[0] + corner[1] * n1[1]);
  const edge = (side: number) => ({
    a: add(a, mul(n1, widths[0] * side)),
    bIn: add(b, mul(n1, widths[1] * side)),
    bOut: add(b, mul(n2, widths[1] * side)),
    bend: add(b, mul(corner, widths[1] * side * cornerScale)),
    c: add(c, mul(n2, widths[2] * side)),
  });
  const l = edge(1),
    r = edge(-1);
  return `M${p(l.a)} L${p(l.bIn)} Q${p(l.bend)} ${p(l.bOut)} L${p(l.c)} L${p(r.c)} L${p(r.bOut)} Q${p(r.bend)} ${p(r.bIn)} L${p(r.a)} A${widths[0]} ${widths[0]} 0 0 0 ${p(l.a)} Z`;
}

/** The back of a phone; its screen faces the character's ear. */
export function PortraitPhone({ color = "#293340" }: { color?: string }) {
  return (
    <g>
      <rect data-part="phone" width={27} height={63} rx={5} fill={color} stroke="#161d26" strokeWidth={1.3} />
      <path d="M23 2Q26 3 26 6V57Q26 61 23 61Z" fill="#141c26" />
      <rect x={3.5} y={5} width={9} height={19} rx={4} fill="#131b25" />
      <circle cx={8} cy={10} r={2.4} fill="#75838e" />
      <circle cx={8} cy={18} r={2.4} fill="#75838e" />
      <circle cx={8} cy={10} r={1.2} fill="#1c2937" />
      <circle cx={8} cy={18} r={1.2} fill="#1c2937" />
      <path d="M24.8 27V36" stroke="#9ca6ad" strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );
}

/** A PortraitBody's hand, the wrist at (0, 0) and the fingers down (+y); `prop` puts a phone or a cigarette in it */
export function PortraitHand({ shape, skin, prop }: { shape: HandShape; skin: string; prop?: "phone" | "smoke" }) {
  const ink = shade(skin, 0.66),
    crease = shade(skin, 0.87);
  const edge = { stroke: ink, strokeWidth: 1.7, strokeLinejoin: "round" as const };
  return (
    <g>
      {prop === "phone" && (
        <g transform="rotate(-7 2 13) translate(-7 -30)">
          <PortraitPhone />
        </g>
      )}
      {prop === "smoke" && (
        <g>
          <path d="M5 14H29" stroke="#f8f1dc" strokeWidth={4} strokeLinecap="round" />
          <path d="M5 14H11" stroke="#bd9165" strokeWidth={4} />
          <circle cx={29} cy={14} r={2.1} fill="#d8613d" />
        </g>
      )}
      {shape === "point" ? (
        <>
          <path
            d="M-10 -4H9L12 6L10 13L7 36Q7 42 2 42Q-3 42 -3 36L-4 20Q-10 25 -16 20Q-21 16 -18 9L-15 5L-10 8Z"
            fill={skin}
            {...edge}
          />
          <path d="M-14 12Q-9 13 -5 17" fill="none" stroke={crease} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : shape === "grip" ? (
        <>
          <path d="M-10 -4H8L10 5L6 14L3 24Q-5 29 -12 24Q-18 21 -17 12L-15 5L-10 7Z" fill={skin} {...edge} />
          <path
            d="M-2 9L10 5Q16 4 17 8Q18 12 12 14L1 18Q-4 18 -5 14Z"
            fill={shade(skin, 1.07)}
            stroke={ink}
            strokeWidth={1.5}
          />
          <path d="M-11 17L-6 18M-10 22L-5 23" fill="none" stroke={crease} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : shape === "pinch" ? (
        <>
          <path
            d="M-10 -4H9L12 6L19 10Q23 12 20 16Q19 18 15 16L10 14L8 23Q1 29 -6 24L-12 16L-17 10Q-20 5 -16 3Q-12 2 -9 8Z"
            fill={skin}
            {...edge}
          />
          <path d="M-4 16L3 21" fill="none" stroke={crease} strokeWidth={2.3} strokeLinecap="round" />
        </>
      ) : (
        <>
          <path
            d="M-10 -4H9L13 7L14 18Q14 28 5 29H-4Q-12 28 -13 21L-19 12Q-22 7 -18 4Q-14 1 -9 9Z"
            fill={skin}
            {...edge}
          />
          <path d="M2 20V25M8 19V24" fill="none" stroke={crease} strokeWidth={2.1} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/**
 * A body seen from the front, for a head of your own: `children`, such as a portrait cut out with PortraitCutout,
 * centred about 315 above the feet. Use inside <Svg>. The feet are at (x, y), the hip 100 and the collar 235 above
 * them, times `s`. `armL`, `armR`: degrees, 0 down, 90 out, 180 up; `armSwing` for a walk. `feet` places each foot
 * (`x`, `lift`) and `step` −1…1 lifts one; `lean` turns the upper body about the hip (degrees). `gesture` "phone",
 * "point" or "smoke" poses the right arm, "hold" brings both hands to the lower corners of `frontProp`, a held object in
 * body coordinates (poster.Notebook at (0, −160), s 0.3). `handL`, `handR` override the hand shapes; `color` (the
 * shirt), `legs`, `skin` and `shoes` take "#rrggbb", shaded from there. portraitMotion gives these props for walking
 * and gestures; for a call, writing or a hand at the head, use PortraitInteraction.
 */
export function PortraitBody({
  x,
  y,
  s = 1,
  color = "#1c2b43",
  legs = "#252733",
  skin = "#eac09f",
  shoes = "#20232b",
  armL = 15,
  armR = 15,
  armSwing = 0,
  step = 0,
  feet,
  lean = 0,
  gesture = "angles",
  handL,
  handR,
  children,
  frontProp,
  articulation,
  foregroundCollar = false,
}: PortraitBodyProps) {
  const left = articulation?.arms.left ?? solveArm(-1, armL, gesture === "hold" ? gesture : "angles", armSwing);
  const right = articulation?.arms.right ?? solveArm(1, armR, gesture, armSwing);
  const raisedL = articulation?.foreground.left ?? (armL > 105 || gesture === "hold");
  const raisedR = articulation?.foreground.right ?? (armR > 105 || gesture !== "angles");
  const dark = shade(color, 0.82),
    light = shade(color, 1.08),
    ink = shade(color, 0.64);
  const sleevePath = (a: V, b: V, wa: number, wb: number, openStart = false) => {
    const n = normal(unit(sub(b, a)));
    const a1 = add(a, mul(n, wa)),
      a2 = add(a, mul(n, -wa));
    const b1 = add(b, mul(n, wb)),
      b2 = add(b, mul(n, -wb));
    const edge = `M${p(a1)} L${p(b1)} A${wb} ${wb} 0 0 0 ${p(b2)} L${p(a2)}`;
    return openStart ? edge : edge + ` A${wa} ${wa} 0 0 0 ${p(a1)} Z`;
  };
  const wholeSleeve = (rig: PortraitArmRig, side: -1 | 1) => {
    const segments = [sleevePath(rig.shoulder, rig.elbow, 16, 14), sleevePath(rig.elbow, rig.wrist, 14, 10)];
    // both outlines before both fills, so the elbow shows no seam
    return (
      <g>
        {segments.map((d, i) => (
          <path key={`edge-${i}`} d={d} fill={color} stroke={ink} strokeWidth={3.6} strokeLinejoin="round" />
        ))}
        {segments.map((d, i) => (
          <path
            key={`fill-${i}`}
            data-part={`arm-${i === 0 ? "upper" : "lower"}-${side === 1 ? "right" : "left"}${i === 1 && (side === 1 ? raisedR : raisedL) ? "-back" : ""}`}
            d={d}
            fill={color}
          />
        ))}
      </g>
    );
  };
  const arm = (side: -1 | 1, part: "upper" | "lower" | "thumb") => {
    const rig = side === 1 ? right : left;
    const customHand = side === -1 ? articulation?.hideHands.left : articulation?.hideHands.right;
    const holding = !articulation && gesture === "hold",
      phoning = !articulation && side === 1 && gesture === "phone";
    if (part === "upper") return wholeSleeve(rig, side);
    if (part === "thumb")
      return (
        <g transform={`translate(${p(rig.wrist)}) scale(${side * 0.75} .75)`}>
          <path
            data-part="hold-thumb"
            d="M0 3Q-5 4 -8 0L-12 -7Q-14 -12 -9 -14Q-6 -15 -3 -12L4 -6Q7 -1 3 2Z"
            fill={skin}
            stroke={shade(skin, 0.66)}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </g>
      );
    const shape =
      side === -1
        ? (handL ?? (holding ? "grip" : "relaxed"))
        : (handR ??
          (phoning || holding ? "grip" : gesture === "point" ? "point" : gesture === "smoke" ? "pinch" : "relaxed"));
    return (
      <g>
        {(side === -1 ? raisedL : raisedR) && (
          <g>
            <path
              data-part={`arm-lower-${side === 1 ? "right" : "left"}`}
              d={sleevePath(rig.elbow, rig.wrist, 14, 10)}
              fill={color}
            />
            <path d={sleevePath(rig.elbow, rig.wrist, 14, 10, true)} fill="none" stroke={ink} strokeWidth={1.8} />
          </g>
        )}
        {phoning && (
          <g transform={`translate(${rig.wrist[0] - 29} ${rig.wrist[1] - 66})`}>
            <PortraitPhone />
          </g>
        )}
        {!customHand &&
          (holding ? (
            <g transform={`translate(${p(rig.wrist)})`}>
              <path
                d="M-10 -7H9L10 4Q10 12 1 12H-2Q-10 11 -10 3Z"
                fill={skin}
                stroke={shade(skin, 0.66)}
                strokeWidth={1.4}
              />
              <path d="M-4 5V9M2 5V9" fill="none" stroke={shade(skin, 0.87)} strokeWidth={1.5} strokeLinecap="round" />
            </g>
          ) : (
            <g transform={`translate(${p(rig.wrist)}) rotate(${rig.handAngle}) scale(.82)`}>
              <g transform={`scale(${side} 1)`}>
                <PortraitHand
                  shape={shape}
                  skin={skin}
                  prop={side === 1 && gesture === "smoke" ? "smoke" : undefined}
                />
              </g>
            </g>
          ))}
        <g transform={`translate(${p(rig.wrist)}) rotate(${rig.sleeveAngle})`}>
          <path
            data-part="cuff"
            data-side={side === 1 ? "right" : "left"}
            d="M-10 -8H10L10 2H-10Z"
            fill={light}
            stroke={ink}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </g>
      </g>
    );
  };
  const leg = (side: -1 | 1) => {
    const placement = side === -1 ? feet?.left : feet?.right;
    const lift = placement?.lift ?? Math.max(0, -side * step) * 15;
    const hip: V = [side * 24, -95];
    const ankle: V = [side * 29 + (placement?.x ?? step * 6), -12 - lift];
    const knee: V = [(hip[0] + ankle[0]) / 2 + (placement ? 0 : step * 3), -52 - lift * 0.45];
    const fill = side === -1 ? shade(legs, 0.9) : legs;
    return (
      <g>
        <path
          d={limb(hip, knee, ankle, [21, 19, 16])}
          fill={fill}
          stroke={shade(legs, 0.65)}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <g transform={`translate(${p(ankle)}) scale(${side} 1)`}>
          <path
            d="M-17 -6H13L17 1Q31 1 33 8L32 12H-19Q-22 5 -17 -6Z"
            fill={shoes}
            stroke={shade(shoes, 0.65)}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          <path d="M-20 8Q3 11 32 8L32 12H-19Z" fill="#e4dbc7" />
          <path d="M-8 -3H9L16 2H-9Z" fill={shade(shoes, 1.2)} />
        </g>
      </g>
    );
  };
  const collar = () => (
    <g data-part="collar">
      <path d="M-19 -235L0 -218L-12 -200L-34 -223Z" fill={light} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
      <path
        d="M19 -235L0 -218L12 -200L34 -223Z"
        fill={shade(color, 1.07)}
        stroke={ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {leg(-1)}
      {leg(1)}
      <g transform={`rotate(${lean} 0 -100)`}>
        {arm(-1, "upper")}
        {arm(1, "upper")}
        <path
          d="M-21 -234Q-34 -224 -49 -218Q-64 -212 -64 -192L-56 -161Q-51 -147 -55 -120L-57 -105Q-58 -85 -40 -83H40Q58 -85 57 -105L55 -120Q51 -147 56 -161L64 -192Q64 -212 49 -218Q34 -224 21 -234Z"
          fill={color}
          stroke={ink}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d="M-48 -216Q-56 -203 -49 -183L-43 -159Q-39 -140 -45 -113Q-48 -96 -36 -86H-41Q-56 -88 -54 -104L-52 -124Q-48 -148 -53 -162L-61 -193Q-61 -208 -48 -216Z"
          fill={dark}
        />
        <path d="M-17 -235L0 -214L17 -235L14 -246H-14Z" fill={skin} />
        {collar()}
        <path d="M0 -216V-96" stroke={dark} strokeWidth={3} />
        {[-180, -149, -118].map((cy) => (
          <circle key={cy} cx={3} cy={cy} r={2.5} fill={shade(color, 1.32)} />
        ))}
        <path d="M-43 -93Q0 -88 43 -93" fill="none" stroke={dark} strokeWidth={2.5} strokeLinecap="round" />
        {!raisedL && arm(-1, "lower")}
        {!raisedR && arm(1, "lower")}
        {children}
        {foregroundCollar && collar()}
        {raisedL && !articulation?.overObjectArms?.left && arm(-1, "lower")}
        {raisedR && !articulation?.overObjectArms?.right && arm(1, "lower")}
        {articulation?.underObject}
        {articulation?.object}
        {raisedL && articulation?.overObjectArms?.left && arm(-1, "lower")}
        {raisedR && articulation?.overObjectArms?.right && arm(1, "lower")}
        {articulation?.overObject}
        {frontProp}
        {!articulation && gesture === "hold" && (
          <>
            {arm(-1, "thumb")}
            {arm(1, "thumb")}
          </>
        )}
      </g>
    </g>
  );
}
