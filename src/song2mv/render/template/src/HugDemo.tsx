import React from "react";
import { Place, SKINS, ShowFaults, arm, limbMarks, toLocal, toStage } from "./kit";

/**
 * A hug posed by where the hands must be, for the kit gallery: an adult kneels, a small child hugs them. Each hand's
 * target is a point of the other figure (`ANCHORS`), brought into the hand's own figure with `toLocal(toStage(…))`,
 * and `arm()` places the elbow and hand with the rig's own bone lengths. The figures carry the marks `bodyFaults`
 * measures (`data-figure`, `data-part`, `limbMarks`, `data-touch`), and `ShowFaults` writes what it finds.
 * Both figures are drawn facing right in their own drawing at s = 1 (the adult about 300 px tall standing, the child
 * about 155), origin on the ground under the hips; the child is placed flipped, facing the adult.
 */

type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const turn = ([x, y]: P, a: number): P => [x * Math.cos(rad(a)) - y * Math.sin(rad(a)), x * Math.sin(rad(a)) + y * Math.cos(rad(a))];
const plus = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const pts = (ps: P[]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

const ADULT_ARM = { upper: 52, lower: 48 }, CHILD_ARM = { upper: 27, lower: 25 };
const LEAN = 20, TORSO = 88;
type Kneel = "sit" | "up";
/** Where the adult's hips and legs are: sitting back on the heels, or kneeling up */
const LEGS: Record<Kneel, { hip: P; knee: P; ankle: P; toe: P }> = {
  sit: { hip: [-22, -44], knee: [48, -12], ankle: [-22, -9], toe: [-46, -4] },
  up: { hip: [-12, -86], knee: [4, -12], ankle: [-68, -9], toe: [-92, -4] },
};
/** A point of the adult's torso, given along it from the hip (up) and across it (front +), in the adult's drawing */
const onTorso = (k: Kneel, up: number, across: number) => plus(LEGS[k].hip, turn([across, -up], LEAN));
const ANCHORS = {
  /** the upper back, under the shoulder blades */
  back: (k: Kneel) => onTorso(k, TORSO - 20, -21),
  /** the back of the neck, where hands meet in a hug round the neck */
  nape: (k: Kneel) => onTorso(k, TORSO + 8, -6),
};
const SHOULDER = (k: Kneel) => onTorso(k, TORSO - 6, 2);
const CHILD = { hip: [0, -60] as P, shoulder: [5, -104] as P, head: [13, -129] as P, back: [-14, -80] as P };

/** A mitten with a thumb, its palm's centre on the wrist `at`, pointing away from the elbow `from` */
const Mitten: React.FC<{ at: P; from: P; color: string; edge: string; r: number }> = ({ at, from, color, edge, r }) => {
  const a = (Math.atan2(at[1] - from[1], at[0] - from[0]) * 180) / Math.PI;
  return (
    <g transform={`translate(${at[0].toFixed(1)} ${at[1].toFixed(1)}) rotate(${a.toFixed(1)})`}>
      <ellipse cx={r * 0.1} cy={0} rx={r * 1.1} ry={r * 0.9} fill={color} stroke={edge} strokeWidth={1} />
      <ellipse cx={-r * 0.05} cy={-r * 0.8} rx={r * 0.55} ry={r * 0.35} transform={`rotate(-30 ${-r * 0.05} ${-r * 0.8})`} fill={color} stroke={edge} strokeWidth={1} />
    </g>
  );
};

/** The pair, the adult at `at`; `target` is the adult's point the child's hand goes to, `armScale` what a rig did to make it arrive */
const Hug: React.FC<{ at: Place; kneel: Kneel; target: keyof typeof ANCHORS; armScale?: number; label: string }> = ({ at, kneel, target, armScale = 1, label }) => {
  const L = LEGS[kneel];
  // the child's chest pressed to the adult's: its front 15 px ahead of its spine, the adult's 22 px
  const chestY = -84;
  const up = Math.max(8, (L.hip[1] - chestY) / Math.cos(rad(LEAN)));
  const front = onTorso(kneel, up, 22)[0] + (chestY - onTorso(kneel, up, 22)[1]) * Math.tan(rad(LEAN));
  const child: Place = { x: at.x + (front + 14) * at.s, y: at.y, s: at.s, flip: true };
  const wrap = (p: P, from: Place, to: Place) => toLocal(toStage(p, from), to);

  const reach = arm(CHILD.shoulder, wrap(ANCHORS[target](kneel), at, child), CHILD_ARM.upper * armScale, CHILD_ARM.lower * armScale,
    [0, 1], { holds: true });
  const hold = arm(SHOULDER(kneel), wrap(CHILD.back, child, at), ADULT_ARM.upper, ADULT_ARM.lower, [0, 1], { holds: true });
  const g = (p: Place) => `translate(${p.x} ${p.y}) scale(${p.flip ? -p.s : p.s} ${p.s})`;
  const torso = `translate(${L.hip[0]} ${L.hip[1]}) rotate(${LEAN})`;
  const neck = onTorso(kneel, TORSO + 6, 4), head = onTorso(kneel, TORSO + 30, 12);
  const sweater = "#4d6fa8", sweaterDark = "#3e5c8f", pants = "#3a3f58", skin = SKINS.medium, hair = "#3a2a24";
  const dress = "#e8706a", sleeve = "#d65a55", kidSkin = SKINS.light, kidHair = "#6b4a2f";
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {/* the adult, behind the child */}
      <g transform={g(at)} data-figure="adult">
        <g transform={torso} data-part="torso"><rect x={-21} y={-TORSO - 8} width={43} height={TORSO + 16} rx={20} fill={sweater} /></g>
        {/* the anchors the child's hand may go to, unpainted: what its data-touch names */}
        {(Object.keys(ANCHORS) as (keyof typeof ANCHORS)[]).map((a) => (
          <circle key={a} data-part={a} cx={ANCHORS[a](kneel)[0]} cy={ANCHORS[a](kneel)[1]} r={4} fill="none" />
        ))}
        <polyline points={pts([neck, plus(neck, [6, -14])])} stroke={skin} strokeWidth={15} strokeLinecap="round" />
      </g>
      {/* the child, standing between the adult's knees */}
      <g transform={g(child)} data-figure="child">
        <polyline points={pts([CHILD.hip, [3, -30], [0, -6]])} fill="none" stroke={kidSkin} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts([[0, -6], [10, -4]])} stroke="#d94f6a" strokeWidth={10} strokeLinecap="round" />
      </g>
      <g transform={g(at)} data-figure="adult">
        <polyline points={pts([L.hip, L.knee, L.ankle])} fill="none" stroke={pants} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts([L.ankle, L.toe])} fill="none" stroke="#2a2a2a" strokeWidth={12} strokeLinecap="round" />
      </g>
      <g transform={g(child)} data-figure="child">
        <g transform="translate(0 -60) rotate(8)" data-part="torso" data-touch="adult: torso">
          <path d="M-13 -44 Q-17 -20 -19 6 Q0 12 19 6 Q16 -22 13 -44 Q0 -50 -13 -44 Z" fill={dress} />
        </g>
      </g>
      {/* the adult's near arm round the child's back, behind the child's head */}
      <g transform={g(at)} data-figure="adult">
        <polyline {...limbMarks("near-arm", [SHOULDER(kneel), hold.joint, hold.end], [ADULT_ARM.upper, ADULT_ARM.lower])}
          points={pts([SHOULDER(kneel), hold.joint, hold.end])} fill="none" stroke={sweaterDark} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
        <g data-part="near-hand" data-touch="child: torso"><Mitten at={hold.end} from={hold.joint} color={skin} edge="#a8724f" r={8} /></g>
      </g>
      <g transform={g(child)} data-figure="child">
        <g data-part="head" data-face="child" transform={`translate(${CHILD.head[0]} ${CHILD.head[1]}) rotate(10)`}>
          <circle r={19} fill={kidSkin} />
          <path d="M-19 -2 Q-21 -22 0 -22 Q16 -22 19 -8 Q8 -14 -2 -12 Q-8 -6 -19 -2 Z" fill={kidHair} />
          <circle cx={-14} cy={-14} r={7} fill={kidHair} />
          <path d="M9 0 Q12 3 15 0" fill="none" stroke="#3a2a24" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={9} cy={7} r={3.4} fill="#f29a8f" opacity={0.7} />
        </g>
      </g>
      <g transform={g(at)} data-figure="adult">
        <g data-part="head" data-face="adult" transform={`translate(${head[0].toFixed(1)} ${head[1].toFixed(1)}) rotate(${LEAN + 6})`}>
          <circle r={22} fill={skin} />
          <path d="M-22 4 Q-25 -24 2 -24 Q20 -24 22 -10 Q10 -16 0 -12 Q-6 -2 -14 6 Z" fill={hair} />
          <path d="M10 -1 Q13.5 2.5 17 -1" fill="none" stroke="#2a1d17" strokeWidth={1.8} strokeLinecap="round" />
          <circle cx={11} cy={7} r={3.6} fill="#c9705f" opacity={0.5} />
        </g>
      </g>
      {/* the child's near arm over the adult's shoulder, in front of all */}
      <g transform={g(child)} data-figure="child">
        <polyline {...limbMarks("near-arm", [CHILD.shoulder, reach.joint, reach.end], [CHILD_ARM.upper, CHILD_ARM.lower])}
          points={pts([CHILD.shoulder, reach.joint, reach.end])} fill="none" stroke={sleeve} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        <g data-part="near-hand" data-touch={`adult: ${target}`}><Mitten at={reach.end} from={reach.joint} color={kidSkin} edge="#c98f73" r={6} /></g>
      </g>
      <text x={at.x} y={at.y + 70} textAnchor="middle" fill="#2b2d3a" fontSize={30} fontWeight={700}>{label}</text>
      <text x={at.x} y={at.y + 110} textAnchor="middle" fill={reach.faults.length ? "#c62f22" : "#23803a"} fontSize={26} fontWeight={600}>
        {`child's arm(): ${reach.faults.length ? `${reach.faults.join(", ")} by ${Math.round(reach.short)} px` : "no faults"}`}
      </text>
    </svg>
  );
};

const Backdrop: React.FC<{ title: string; lines: string[] }> = ({ title, lines }) => (
  <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
    <rect width={1920} height={1080} fill="#f3e9da" />
    <rect y={820} width={1920} height={260} fill="#d8c3a5" />
    <rect width={1920} height={150} fill="#2b2d3a" />
    <text x={60} y={68} fill="#fff" fontSize={40} fontWeight={700}>{title}</text>
    {lines.map((l, i) => <text key={i} x={60} y={110 + i * 30} fill="#cfd3e6" fontSize={24}>{l}</text>)}
  </svg>
);

/** In reach: the adult sits back on the heels, the child's hand rests on the upper back, both bodies pressed together */
export const HugInReach: React.FC = () => (
  <>
    <Backdrop title="Reach by target: a hug posed by where the hands go"
      lines={["arm(shoulder, toLocal(toStage(anchor, adult), child), upper, lower) — the rig's own bone lengths, never scaled",
        "data-figure, data-part, limbMarks() and data-touch: the render measures the contacts and the limbs as drawn"]} />
    <ShowFaults style={{ left: 60 }}>
      <Hug at={{ x: 900, y: 820, s: 3.4 }} kneel="sit" target="back" label="sitting back on the heels: the hand reaches round to the back" />
    </ShowFaults>
  </>
);

/** Out of reach: the adult kneels up, the back is too far; honest bones stop short, a scaled arm is caught as stretched */
export const HugOutOfReach: React.FC = () => (
  <>
    <Backdrop title="Out of reach: the fault is printed, not drawn"
      lines={["left: kneeling up, the rig's bones stop short of the nape, and arm() and the contact check say by how much",
        "right: the same arm scaled 1.5 times to arrive, as a rig's armScale did — the limb check reports the stretch"]} />
    <div style={{ position: "absolute", left: 0, top: 0, width: 960, height: 1080, overflow: "hidden" }}>
      <ShowFaults style={{ left: 40, fontSize: 22 }}>
        <Hug at={{ x: 470, y: 820, s: 2.6 }} kneel="up" target="nape" label="the rig's own arm" />
      </ShowFaults>
    </div>
    <div style={{ position: "absolute", left: 960, top: 0, width: 960, height: 1080, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -960, top: 0, width: 1920, height: 1080 }}>
        <ShowFaults style={{ left: 1000, fontSize: 22 }}>
          <Hug at={{ x: 1430, y: 820, s: 2.6 }} kneel="up" target="nape" armScale={1.5} label="the arm scaled 1.5 ×" />
        </ShowFaults>
      </div>
    </div>
  </>
);
