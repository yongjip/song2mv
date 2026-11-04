import React from "react";
import { figurePose, type FigureAction, type FigureLimb, type FigurePoint } from "./figure-motion";

export type FigureLook = {
  kind: "minimal" | "donghak-ant";
  skin: string;
  shirt: string;
  vest: string;
  trousers: string;
  shoes: string;
  ink: string;
  instrument: string;
};
export const minimalFigure: FigureLook = {
  kind: "minimal", skin: "#f5d5b6", shirt: "#377d7b", vest: "#377d7b", trousers: "#304953",
  shoes: "#263940", ink: "#25383c", instrument: "#459b97",
};
export const donghakAntFigure: FigureLook = {
  kind: "donghak-ant", skin: "#393637", shirt: "#f6e4c5", vest: "#885663", trousers: "#eddbba",
  shoes: "#c8a470", ink: "#29282c", instrument: "#459b97",
};
const point = ([x, y]: FigurePoint) => `${x} ${y}`;
const limbPath = ({root, joint, end}: FigureLimb) => `M${point(root)}L${point(joint)}L${point(end)}`;

function Limb({pose, color, ink, width, part}: {pose: FigureLimb; color: string; ink: string; width: number; part: string}) {
  return <g data-part={part} strokeLinecap="round" strokeLinejoin="round" fill="none">
    <path d={limbPath(pose)} stroke={ink} strokeWidth={width + 6}/>
    <path d={limbPath(pose)} stroke={color} strokeWidth={width}/>
  </g>;
}
export function FigureHand({at, look, turn = 0}: {at: FigurePoint; look: FigureLook; turn?: number}) {
  return <g transform={`translate(${point(at)}) rotate(${turn})`} fill={look.skin} stroke={look.ink} strokeWidth={2.5} strokeLinejoin="round">
    <path d="M-8 7Q-13 -1 -9 -9Q-6 -14 -3 -8L0 -11Q4 -13 6 -7L10 -7Q14 -5 11 1L8 10Q1 14 -8 7Z"/>
    <path d="M-8 -1Q-2 -6 2 0M1 -6L6 -3" fill="none" strokeWidth={1.6}/>
  </g>;
}
export function FigureBass({look}: {look: FigureLook}) {
  return <g data-part="bass" stroke={look.ink} strokeWidth={3} strokeLinejoin="round">
    <path d="M28 -11H133V11H28Z" fill="#795842"/>
    <path d="M130 -12Q151 -22 159 -13L157 7Q148 17 133 10Z" fill={look.instrument}/>
    <path d="M-21 -35Q-47 -42 -50 -14Q-62 10 -39 33Q-14 47 12 32Q28 23 26 8Q20 -1 29 -12L39 -28Q25 -35 17 -20Q3 -11 -2 -26Q-6 -37 -21 -35Z" fill={look.instrument}/>
    <path d="M-21 -25Q-39 -27 -39 -8Q-47 10 -27 24Q-8 31 10 20L16 8L9 -6L17 -15Q2 -8 -4 -19Z" fill="#f6e7ca" strokeWidth={2}/>
    <path d="M-30 -11H-24V12H-30ZM-7 -12H0V12H-7Z" fill={look.ink}/>
    {[43,55,66,76,85,93,100,107,113,119,125].map(x => <path key={x} d={`M${x} -9V9`} stroke="#ddc3a0" strokeWidth={1.5}/>)}
    {[-4.5,-1.5,1.5,4.5].map(y => <path key={y} d={`M-29 ${y}H145`} stroke="#fff6df" strokeWidth={1.1}/>)}
    {[135,142,149,156].map((x,i) => <g key={x}><path d={`M${x} -10V${-20-i%2*3}`} strokeWidth={2}/><ellipse cx={x} cy={-22-i%2*3} rx={3} ry={3} fill="#e5d6bb" strokeWidth={1.5}/></g>)}
    <circle cx={3} cy={23} r={3} fill="#d7bb82"/>
    <circle cx={-9} cy={27} r={3} fill="#d7bb82"/>
  </g>;
}

/** A compact two-arm/two-leg rig. Add x travel here exactly once; keep skin changes separate from action state. */
export function Figure({action, look = minimalFigure, x = 0, y = 0, scale = 1}: {
  action: FigureAction; look?: FigureLook; x?: number; y?: number; scale?: number;
}) {
  const pose = figurePose(action), ant = look.kind === "donghak-ant";
  return <g transform={`translate(${x + pose.travel * scale} ${y}) scale(${scale})`} data-figure={look.kind} data-action={action.kind}>
    <ellipse cx={0} cy={3} rx={70} ry={5} fill="#343639" opacity={0.12}/>
    {ant && <g fill={look.skin} stroke={look.ink} strokeWidth={3}><ellipse cx={-38} cy={-112} rx={36} ry={43}/><path d="M-57 -142Q-42 -111 -60 -90M-44 -150Q-25 -117 -43 -76" fill="none" stroke="#575052"/></g>}
    <Limb pose={pose.leftLeg} color={look.trousers} ink={look.ink} width={25} part="left-leg"/>
    <Limb pose={pose.rightLeg} color={look.trousers} ink={look.ink} width={25} part="right-leg"/>
    {[pose.feet.left,pose.feet.right].map((foot,i) => <g key={i} transform={`translate(${point(foot)})`} fill={look.shoes} stroke={look.ink} strokeWidth={3}>
      <path d="M-12 -8Q-10 -14 1 -12L15 -7Q22 -6 22 0H-13Z"/>
      {ant && <path d="M-5 -10L-4 -1M3 -9L5 -1M11 -7L14 -1" fill="none" strokeWidth={1.5}/>}</g>)}
    <path d="M-40 -181Q0 -194 40 -181L47 -91Q0 -72 -47 -91Z" fill={look.shirt} stroke={look.ink} strokeWidth={3}/>
    {ant && <g stroke={look.ink} strokeWidth={2.5}>
      <path d="M-40 -181L-14 -187L7 -150L-7 -84L-47 -91ZM40 -181L15 -187L-7 -150L12 -84L47 -91Z" fill={look.vest}/>
      <path d="M-15 -183L12 -157L-3 -147L-28 -178" fill={look.shirt}/>
      <path d="M-3 -146Q-29 -161 -24 -139L-3 -140Q20 -154 19 -134L-3 -140L2 -108" fill={look.shirt}/>
    </g>}
    {pose.kind === "bass" && <path d={`M-29 -181Q-17 -156 ${pose.bass.origin[0]+20} ${pose.bass.origin[1]+22}`} fill="none" stroke={look.ink} strokeWidth={12} data-part="bass-strap"/>}
    <Limb pose={pose.leftArm} color={look.shirt} ink={look.ink} width={22} part="left-arm"/>
    <Limb pose={pose.rightArm} color={look.shirt} ink={look.ink} width={22} part="right-arm"/>
    <g transform={`translate(0 ${pose.headY}) rotate(${pose.headAngle} 0 -190)`} data-part="head">
      <path d="M-14 -207H14V-179H-14Z" fill={look.skin} stroke={look.ink} strokeWidth={3}/>
      {ant && <g fill="none" stroke={look.ink} strokeWidth={7} strokeLinecap="round"><path d="M-27 -300Q-30 -344 -54 -349L-65 -337"/><path d="M26 -300Q34 -345 52 -350L65 -339"/></g>}
      {ant && <path d="M-63 -264Q-80 -231 -66 -205L-45 -202L48 -203Q80 -213 64 -266Z" fill="#29282c" stroke={look.ink} strokeWidth={3}/>}
      <ellipse cy={-251} rx={64} ry={59} fill={look.skin} stroke={look.ink} strokeWidth={3}/>
      {ant && <>
        <path d="M-62 -268Q-42 -319 14 -306Q54 -301 62 -267Q31 -291 21 -277Q-5 -283 -13 -293Q-30 -268 -62 -268Z" fill="#29282c"/>
        <path d="M-62 -282Q0 -311 62 -282L61 -265Q0 -291 -61 -265Z" fill="#fff4df" stroke={look.ink} strokeWidth={2.5}/>
        <path d="M-62 -278Q-86 -293 -85 -276L-69 -268L-84 -252L-65 -255L-60 -267" fill="#fff4df" stroke={look.ink} strokeWidth={2}/>
        <text x={0} y={-280} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={13} fontWeight={900} fill={look.ink}>{"\ub3d9\ud559\uac1c\ubbf8"}</text>
      </>}
      {[-23,23].map(side => <g key={side}>
        <ellipse cx={side} cy={-249} rx={ant?17:12} ry={ant?19:14} fill="#fff8e9"/>
        <ellipse cx={side+pose.gaze[0]} cy={-248+pose.gaze[1]} rx={5} ry={7} fill={look.ink}/>
        <path d={`M${side-12} -272Q${side} -279 ${side+10} -273`} fill="none" stroke={look.ink} strokeWidth={3} strokeLinecap="round"/>
      </g>)}
      <path d={pose.kind === "bass" ? "M-12 -223Q0 -215 12 -223Q8 -205 0 -207Q-8 -207 -12 -223Z" : "M-10 -220Q0 -211 10 -220"} fill={pose.kind === "bass" ? "#df8d78":"none"} stroke={look.ink} strokeWidth={3} strokeLinecap="round"/>
      {ant && <g stroke="#d7937e" strokeWidth={2.5}><path d="M-44 -228L-47 -222M-38 -227L-41 -221M38 -228L35 -222M44 -227L41 -221"/></g>}
    </g>
    {pose.kind === "phone" && <g transform={`translate(${point(pose.phone.origin)})`} data-part="phone">
      <rect x={-17} y={-28} width={34} height={56} rx={6} fill="#303a42" stroke={look.ink} strokeWidth={3}/>
      <rect x={-12} y={-21} width={24} height={40} rx={2} fill="#d2eee4"/>
      <path d="M-8 9L-3 3L1 6L8 -6" fill="none" stroke="#388c83" strokeWidth={2}/>
      <path d="M-5 -24H5" stroke="#869b9f" strokeWidth={2}/>
    </g>}
    {pose.kind === "bass" && <g transform={`translate(${point(pose.bass.origin)}) rotate(${pose.bass.angle})`}><FigureBass look={look}/></g>}
    <FigureHand at={pose.leftArm.end} look={look} turn={pose.kind === "bass" ? -24:10}/>
    <FigureHand at={pose.rightArm.end} look={look} turn={pose.kind === "bass" ? 65:-20}/>
    {pose.kind === "phone" && <path d={`M${pose.phone.grip[0]-8} ${pose.phone.grip[1]-4}l-8 ${-5-pose.phone.thumb*9}`} stroke={look.skin} strokeWidth={5} strokeLinecap="round" data-part="phone-thumb"/>}
    {pose.kind === "bass" && <path d={`M${pose.bass.stringContact[0]+2} ${pose.bass.stringContact[1]-3}l7 ${4+pose.bass.pluck*3}`} stroke={look.skin} strokeWidth={4} strokeLinecap="round" data-part="plucking-finger"/>}
  </g>;
}
