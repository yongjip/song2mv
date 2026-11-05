import React from "react";
import {figurePropPoint,type FigureLimb, type FigurePoint} from "./figure-motion";
import {profilePose, roundProfile, type FigureProfile, type ProfileBodyPose} from "./profile-motion";
import {puppetMotion,type PuppetAction} from "./puppet-motion";
import {puppetPerformance,type PuppetPerformance} from "./puppet-performance";

export type PuppetHeadProps = {profile:FigureProfile;pose:ProfileBodyPose;look:number;blink:number;joy:number;antenna:number};
export type PuppetSegmentProps = {length:number;width:number;part:"upper-arm"|"forearm"|"thigh"|"shin";side:"left"|"right"};
export type PuppetHandProps = {kind:"relaxed"|"phone"|"fret"|"pluck"|"open"|"palm";amount:number;side:"left"|"right"};
export type PuppetParts = {
  Head:React.ComponentType<PuppetHeadProps>;
  Torso:React.ComponentType<{profile:FigureProfile;pose:ProfileBodyPose}>;
  Segment:React.ComponentType<PuppetSegmentProps>;
  Hand:React.ComponentType<PuppetHandProps>;
  Shoe:React.ComponentType<{side:"left"|"right"}>;
  Bass:React.ComponentType;
  Phone:React.ComponentType;
  Back?:React.ComponentType<{profile:FigureProfile}>;
};
const point=([x,y]:FigurePoint)=>`${x} ${y}`;
const angle=(a:FigurePoint,b:FigurePoint)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI-90;

function Bone({a,b,width,part,side,Segment}:{a:FigurePoint;b:FigurePoint;width:number;part:PuppetSegmentProps["part"];side:"left"|"right";Segment:PuppetParts["Segment"]}) {
  return <g transform={`translate(${point(a)}) rotate(${angle(a,b)})`} data-part={`${side}-${part}`}>
    <Segment length={Math.hypot(b[0]-a[0],b[1]-a[1])} width={width} part={part} side={side}/>
  </g>;
}
function Limb({limb,width,side,leg=false,Segment}:{limb:FigureLimb;width:number;side:"left"|"right";leg?:boolean;Segment:PuppetParts["Segment"]}) {
  return <><Bone a={limb.root} b={limb.joint} width={width} part={leg?"thigh":"upper-arm"} side={side} Segment={Segment}/>
    <Bone a={limb.joint} b={limb.end} width={width*.92} part={leg?"shin":"forearm"} side={side} Segment={Segment}/></>;
}

/** Artwork slots carry no timing. All styles consume the same solved pose, prop anchors and depth order. */
export function PuppetFigure({parts,action,profile=roundProfile,x=0,y=0,scale=1,performance={kind:"loop"},showRig=false}:{
  parts:PuppetParts;action:PuppetAction;profile?:FigureProfile;x?:number;y?:number;scale?:number;performance?:PuppetPerformance;showRig?:boolean;
}) {
  const timedAction:PuppetAction=performance.kind==="phrase"?{...action,time:Math.min(action.time,performance.duration)}:action;
  const acting=timedAction.kind==="pose"||timedAction.kind==="dance"?puppetMotion(timedAction,profile):{...puppetPerformance(timedAction,profile,profilePose(timedAction,profile),performance),bodyX:0};
  const {pose}=acting,walking=pose.kind==="walk";
  const {Head,Torso,Segment,Hand,Shoe,Bass,Phone,Back}=parts;
  const hand=(side:"left"|"right")=>{
    const kind=pose.kind==="bass"?(side==="left"?"pluck":"fret"):(pose.kind==="phone"&&side==="right"?"phone":"relaxed");
    const free=pose.kind==="pose"||pose.kind==="dance"?pose.hands[side]:null;
    const rotation=free?free.angle:pose.kind==="bass"?(side==="left"?pose.bass.angle:pose.bass.angle+90):(side==="left"?8:-15);
    return <g transform={`translate(${point(pose.arms[side].end)}) rotate(${rotation})`} data-part={`${side}-hand`}>
      <Hand kind={free?free.kind:kind} amount={free?free.amount:kind==="pluck"?acting.pluck:pose.kind==="phone"?pose.phone.touch:0} side={side}/>
    </g>;
  };
  const arm=(side:"left"|"right")=><Limb limb={pose.arms[side]} width={profile.armWidth} side={side} Segment={Segment}/>;
  const rigLimb=(limb:FigureLimb,key:string)=><g key={key} fill="#e9fff6" stroke="#2a9d91" strokeWidth={1.5}>
    <path d={`M${point(limb.root)}L${point(limb.joint)}L${point(limb.end)}`} fill="none" strokeWidth={2}/>
    {[limb.root,limb.joint,limb.end].map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={3}/>)}
  </g>;
  return <g transform={`translate(${x+pose.travel*scale} ${y}) scale(${scale})`} data-puppet={profile.id} data-action={action.kind}>
    <ellipse cy={3} rx={52} ry={5} fill="#302d2f" opacity={.13}/>
    <g transform={`translate(${acting.bodyX} ${pose.bodyY})`} data-part="body">
      {Back&&<Back profile={profile}/>}
      {walking&&<g data-part="far-arm">{arm("left")}{hand("left")}</g>}
      <Limb limb={pose.legs.left} width={profile.legWidth} side="left" leg Segment={Segment}/>
      <Limb limb={pose.legs.right} width={profile.legWidth} side="right" leg Segment={Segment}/>
      <g transform={`rotate(${acting.torsoAngle} 0 ${profile.hip.y})`} data-part="upper-body">
        <Torso profile={profile} pose={pose}/>
        {pose.kind==="bass"&&<path d={`M${-profile.shoulder.half+5} ${profile.shoulder.y-8}Q-15 ${profile.shoulder.y+40} ${point(figurePropPoint(pose.bass.origin,pose.bass.angle,[20,15]))}`} fill="none" stroke="#332c31" strokeWidth={9} data-part="strap"/>}
        {!walking&&arm("left")}{arm("right")}
        <g transform={`rotate(${pose.headAngle} 0 ${profile.shoulder.y-8}) translate(0 ${profile.head.cy})`} data-part="head">
          <Head profile={profile} pose={pose} look={acting.look} blink={pose.blink} joy={acting.joy} antenna={acting.antenna}/>
        </g>
        {pose.kind==="phone"&&<g transform={`translate(${point(pose.phone.origin)})`} data-part="phone"><Phone/></g>}
        {pose.kind==="bass"&&<g transform={`translate(${point(pose.bass.origin)}) rotate(${pose.bass.angle})`} data-part="bass"><Bass/></g>}
        {!walking&&hand("left")}{hand("right")}
      </g>
    </g>
    {(["left","right"] satisfies ("left"|"right")[]).map(side=><g key={side} transform={`translate(${point(pose.feet[side])})`} data-part={`${side}-shoe`}><Shoe side={side}/></g>)}
    {showRig&&<g data-part="rig-overlay" pointerEvents="none">
      <g transform={`translate(${acting.bodyX} ${pose.bodyY})`}>
        {rigLimb(pose.legs.left,"left-leg")}{rigLimb(pose.legs.right,"right-leg")}
        <g transform={`rotate(${acting.torsoAngle} 0 ${profile.hip.y})`}>{rigLimb(pose.arms.left,"left-arm")}{rigLimb(pose.arms.right,"right-arm")}</g>
      </g>
      {[pose.feet.left,pose.feet.right].map((foot,i)=><circle key={i} cx={foot[0]} cy={foot[1]} r={4} fill={foot[1]===0?"#1b9780":"#e0a047"} stroke="#fff9eb" strokeWidth={1.4}/>)}
    </g>}
  </g>;
}
