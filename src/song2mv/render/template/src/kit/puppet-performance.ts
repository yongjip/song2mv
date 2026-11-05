import {inOut} from "./math";
import {solveFigureLimb,type FigureAction} from "./figure-motion";
import {profileLegLength,type FigureProfile,type ProfilePose} from "./profile-motion";

type Key=readonly [number,number];
function keyAt(t:number,keys:readonly Key[]) {
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const [a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*inOut((t-a)/(b-a));
  }
  return keys[keys.length-1][1];
}
export type PuppetPerformance = {kind:"loop"} | {kind:"phrase";duration:number} | {kind:"none"};

export function puppetPerformance(action:FigureAction,profile:FigureProfile,base:ProfilePose,mode:PuppetPerformance={kind:"loop"}) {
  if(mode.kind==="phrase"&&(!Number.isFinite(mode.duration)||mode.duration<=0))throw new RangeError("Puppet phrase duration must be finite and positive");
  const neutral={pose:base,torsoAngle:0,pluck:base.kind==="bass"?base.bass.pluck:0,joy:.35,look:base.gaze[0]/6,antenna:0};
  if(mode.kind==="none"||action.kind!=="bass"||base.kind!=="bass")return neutral;
  const period=60/(action.bpm??112),t=action.time;
  const anticipation=keyAt(t,[[0,0],[.18,-2.5],[.48,1],[.72,0]]);
  // A fast attack followed by a longer release, with a finite final settling pose.
  const phase=((t-.5)/period%1+1)%1;
  const attack=t<.5?0:Math.exp(-phase*7)*Math.min(1,phase/.06);
  const release=mode.kind==="phrase"?Math.min(.5,mode.duration/2):.5;
  const settle=mode.kind==="phrase"?1-inOut((t-mode.duration+release)/release):1;
  const drop=(1.8+attack*2.8)*settle;
  const length=profileLegLength(profile);
  const pose:ProfilePose={...base,bodyY:base.bodyY+drop,
    headAngle:(base.headAngle+attack*3.5+anticipation)*settle,
    legs:{left:solveFigureLimb(base.legs.left.root,[base.feet.left[0],base.feet.left[1]-12-base.bodyY-drop],length,length,-1),
      right:solveFigureLimb(base.legs.right.root,[base.feet.right[0],base.feet.right[1]-12-base.bodyY-drop],length,length,-1)}};
  return {pose,torsoAngle:(anticipation+Math.sin(t*Math.PI/period)*2+attack*1.5)*settle,
    pluck:attack*settle,joy:.35+.5*attack*settle,
    look:keyAt(t,[[0,.1],[1.5,.3],[2.2,.85],[3.1,.8],[3.6,.1],[4.5,.25],[5,0]]),
    antenna:Math.sin(t*Math.PI/period-.5)*.5*settle};
}
