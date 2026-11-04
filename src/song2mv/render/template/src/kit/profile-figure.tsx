import React from "react";
import {shade} from "./color";
import {FigureBass, FigureHand, minimalFigure, type FigureLook} from "./figure";
import {figurePropPoint, type FigureAction, type FigureLimb, type FigurePoint} from "./figure-motion";
import {profilePose, roundProfile, type FigureProfile, type ProfilePose} from "./profile-motion";

const p=([x,y]:FigurePoint)=>`${x} ${y}`;
function softLimb({root,joint,end}:FigureLimb) {
  const before:FigurePoint=[joint[0]+(root[0]-joint[0])*.2,joint[1]+(root[1]-joint[1])*.2];
  const after:FigurePoint=[joint[0]+(end[0]-joint[0])*.2,joint[1]+(end[1]-joint[1])*.2];
  return `M${p(root)}L${p(before)}Q${p(joint)} ${p(after)}L${p(end)}`;
}
function SoftLimb({limb,color,width,ink,part}:{limb:FigureLimb;color:string;width:number;ink:string;part:string}) {
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round" data-part={part}>
    <path d={softLimb(limb)} stroke={ink} strokeWidth={width+4}/>
    <path d={softLimb(limb)} stroke={color} strokeWidth={width}/>
  </g>;
}
export type ProfileHeadProps={profile:FigureProfile;pose:ProfilePose;look:FigureLook};
function SimpleHead({profile,pose,look}:ProfileHeadProps) {
  const {rx,ry,cy}=profile.head, turn=pose.headTurn;
  const faceX=rx*.27*turn;
  return <g data-part="head">
    <ellipse cy={cy} rx={rx} ry={ry} fill={look.skin} stroke={look.ink} strokeWidth={2.5}/>
    <ellipse cx={-rx*(.96-.21*turn)} cy={cy+8} rx={6} ry={9} fill={look.skin} stroke={look.ink} strokeWidth={2}/>
    {[-1,1].map(side=><g key={side} transform={`translate(${faceX+side*rx*(.31-.08*turn)} ${cy-1})`}>
      <ellipse cx={pose.gaze[0]*.35} cy={pose.gaze[1]*.45} rx={side===-1?4.5-1.2*turn:4.5} ry={6*pose.blink} fill={look.ink}/>
      <path d="M-6 -12Q0 -15 6 -12" fill="none" stroke={look.ink} strokeWidth={2} strokeLinecap="round"/>
    </g>)}
    {turn>0 && <path opacity={turn} d={`M${rx*.66} ${cy+4}q12 4 0 8`} fill="none" stroke={look.ink} strokeWidth={2} strokeLinecap="round"/>}
    <path d={`M${faceX-7} ${cy+ry*.42}q8 ${pose.kind==="bass"?9:5} 16 -1`} fill="none" stroke={look.ink} strokeWidth={2.5} strokeLinecap="round"/>
    <ellipse cx={faceX+rx*.45} cy={cy+ry*.27} rx={7} ry={3.5} fill="#df9e8a" opacity={.42}/>
  </g>;
}

/** The selected proportions, visual skin and deterministic action are independent inputs. */
export function ProfileFigure({action,profile=roundProfile,look=minimalFigure,x=0,y=0,scale=1,renderHead=SimpleHead}:{
  action:FigureAction;profile?:FigureProfile;look?:FigureLook;x?:number;y?:number;scale?:number;
  renderHead?:(props:ProfileHeadProps)=>React.ReactNode;
}) {
  const pose=profilePose(action,profile), walking=pose.facing==="three-quarter";
  const width=profile.torsoWidth*(walking?.74:1), shoulderY=profile.shoulder.y, hipY=profile.hip.y;
  const shoulderHalf=profile.shoulder.half*(walking?.62:1);
  const arm=(side:"left"|"right",far=false)=><SoftLimb part={`${side}-arm`} limb={pose.arms[side]} color={far?shade(look.shirt,.88):look.shirt} ink={look.ink} width={profile.armWidth}/>;
  return <g transform={`translate(${x+pose.travel*scale} ${y}) scale(${scale})`} data-profile={profile.id} data-action={action.kind}>
    <ellipse cy={2} rx={48} ry={5} fill="#273f42" opacity={.12}/>
    <g transform={`translate(0 ${pose.bodyY})`} data-part="body">
      {walking && <>{arm("left",true)}<g data-part="far-hand"><FigureHand at={pose.arms.left.end} look={look} turn={10}/></g></>}
      <SoftLimb part="left-leg" limb={pose.legs.left} color={shade(look.trousers,.85)} ink={look.ink} width={profile.legWidth}/>
      <SoftLimb part="right-leg" limb={pose.legs.right} color={look.trousers} ink={look.ink} width={profile.legWidth}/>
      <path data-part="torso" d={`M${-shoulderHalf} ${shoulderY-7}Q0 ${shoulderY-16} ${shoulderHalf} ${shoulderY-7}Q${width+7} ${shoulderY+18} ${width} ${hipY-5}Q0 ${hipY+12} ${-width} ${hipY-5}Q${-width-7} ${shoulderY+18} ${-shoulderHalf} ${shoulderY-7}Z`} fill={look.shirt} stroke={look.ink} strokeWidth={2.5}/>
      <path d={`M-10 ${profile.head.cy+profile.head.ry-4}H10V${shoulderY-4}Q0 ${shoulderY+3} -10 ${shoulderY-4}Z`} fill={look.skin} stroke={look.ink} strokeWidth={2}/>
      {pose.kind==="bass" && <path d={`M${-shoulderHalf+5} ${shoulderY-6}Q-8 ${shoulderY+32} ${p(figurePropPoint(pose.bass.origin,pose.bass.angle,[20,15]))}`} stroke={look.ink} strokeWidth={9} fill="none"/>}
      {!walking && arm("left")}
      {arm("right")}
      <g transform={`rotate(${pose.headAngle} 0 ${shoulderY-8})`}>{renderHead({profile,pose,look})}</g>
      {pose.kind==="phone" && <g transform={`translate(${p(pose.phone.origin)})`} data-part="phone">
        <rect x={-17} y={-28} width={34} height={56} rx={6} fill="#303a42" stroke={look.ink} strokeWidth={3}/>
        <rect x={-12} y={-21} width={24} height={40} rx={2} fill="#d2eee4"/>
        <path d="M-8 9L-3 3L1 6L8 -6" fill="none" stroke="#388c83" strokeWidth={2}/>
        <path d="M-5 -24H5" stroke="#869b9f" strokeWidth={2}/>
      </g>}
      {pose.kind==="bass" && <g transform={`translate(${p(pose.bass.origin)}) rotate(${pose.bass.angle})`}><FigureBass look={look}/></g>}
      {!walking && <FigureHand at={pose.arms.left.end} look={look} turn={pose.kind==="bass"?-24:10}/>}
      <FigureHand at={pose.arms.right.end} look={look} turn={pose.kind==="bass"?65:-20}/>
      {pose.kind==="phone" && <path d={`M${pose.phone.grip[0]-8} ${pose.phone.grip[1]-4}l-8 ${-5-pose.phone.touch*9}`} stroke={look.skin} strokeWidth={5} strokeLinecap="round"/>}
      {pose.kind==="bass" && <path d={`M${pose.bass.stringContact[0]+2} ${pose.bass.stringContact[1]-3}l7 ${4+pose.bass.pluck*3}`} stroke={look.skin} strokeWidth={4} strokeLinecap="round"/>}
    </g>
    {[pose.feet.left,pose.feet.right].map((foot,i)=><g key={i} transform={`translate(${p(foot)})`} fill={look.shoes} stroke={look.ink} strokeWidth={2.5} data-part={i===0?"left-shoe":"right-shoe"}>
      <path d="M-9 -10Q-5 -14 4 -11L17 -7Q22 -6 22 -1H-10Z"/>
      <path d="M-8 -2H20" stroke="#e7e9de" strokeWidth={2}/>
    </g>)}
  </g>;
}
