import {inOut,lerp} from "./math";
import {solveFigureLimb,type FigureAction,type FigurePoint} from "./figure-motion";
import {profileLegLength,type FigureProfile,type ProfileBodyPose,type ProfilePose} from "./profile-motion";

export type JointExercise="arm-raise"|"hands-together"|"squat"|"balance"|"weight-shift";
export type PuppetDance="bounce"|"step-touch"|"funk";
export const puppetCycleBeats=(style:PuppetDance)=>style==="step-touch"?8:4;
export type PuppetAction=FigureAction |
  {kind:"pose";exercise:JointExercise;time:number;duration?:number} |
  {kind:"dance";style:PuppetDance;time:number;bpm?:number;cycles?:number};
export type FreeHand={kind:"open"|"palm"|"relaxed";angle:number;amount:number};
export type FreePuppetPose=ProfileBodyPose & {
  kind:"pose"|"dance";
  bodyX:number;
  hands:{left:FreeHand;right:FreeHand};
  contacts:{leftFoot:boolean;rightFoot:boolean;palms:boolean};
};
export type PuppetPose=ProfilePose|FreePuppetPose;
type Key=readonly [number,number];
function keyAt(t:number,keys:readonly Key[]) {
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const [a,x]=keys[i-1],[b,y]=keys[i];return lerp(x,y,inOut((t-a)/(b-a)));
  }
  return keys[keys.length-1][1];
}
const mixPoint=(a:FigurePoint,b:FigurePoint,u:number):FigurePoint=>[lerp(a[0],b[0],u),lerp(a[1],b[1],u)];
const liftAt=(p:number,start:number,end:number,height:number)=>p<=start||p>=end?0:height*Math.sin(Math.PI*(p-start)/(end-start))**2;
const positive=(x:number,message:string)=>{if(!Number.isFinite(x)||x<=0)throw new RangeError(message);return x;};

/** Free actions keep feet in world space; the hips move first and solved limbs follow without changing length. */
export function puppetMotion(action:Exclude<PuppetAction,FigureAction>,profile:FigureProfile) {
  if(!Number.isFinite(action.time)||action.time<0)throw new RangeError("Motion time must be finite and non-negative");
  const {shoulder,hip}=profile,span=-hip.y-12,unit=span/96,stance=hip.half+8*unit;
  let bodyX=0,bodyY=0,torsoAngle=0,headAngle=0,look=0,joy=.35,amount=0,motionClock=action.time;
  let feet:{left:FigurePoint;right:FigurePoint}={left:[-stance,0],right:[stance,0]};
  const reach=profile.armLength*1.86;
  const rest=(side:-1|1):FigurePoint=>[side*(shoulder.half+13),shoulder.y+reach];
  let left=rest(-1),right=rest(1),palms=false;
  let hands:{left:FreeHand;right:FreeHand}={left:{kind:"relaxed",angle:8,amount:0},right:{kind:"relaxed",angle:-8,amount:0}};
  if(action.kind==="pose") {
    const duration=positive(action.duration??4,"Exercise duration must be finite and positive");
    motionClock=Math.min(action.time,duration);
    const p=motionClock/duration;
    amount=keyAt(p,[[0,0],[.12,0],[.35,1],[.62,1],[.88,0],[1,0]]);
    switch(action.exercise){
      case "arm-raise":{
        const a=.14+amount*2.25;
        left=[-shoulder.half-reach*Math.sin(a),shoulder.y+reach*Math.cos(a)];
        right=[shoulder.half+reach*Math.sin(a),shoulder.y+reach*Math.cos(a)];
        hands={left:{kind:"open",angle:-amount*15,amount},right:{kind:"open",angle:amount*15,amount}};
        headAngle=-amount*2;joy=.35+amount*.2;break;
      }
      case "hands-together":{
        left=mixPoint(left,[-8,shoulder.y+62*unit],amount);
        right=mixPoint(right,[8,shoulder.y+62*unit],amount);
        hands={left:{kind:"palm",angle:0,amount},right:{kind:"palm",angle:0,amount}};
        palms=amount===1;break;
      }
      case "squat":bodyY=24*unit*amount;torsoAngle=-amount*2.5;headAngle=amount*2;break;
      case "balance":{
        const transfer=keyAt(p,[[0,0],[.08,0],[.23,1],[.76,1],[.92,0],[1,0]]);
        const lifted=keyAt(p,[[0,0],[.25,0],[.38,1],[.58,1],[.74,0],[1,0]]);
        bodyX=-(stance-4*unit)*transfer;
        feet.right=[stance+8*unit*lifted,-22*unit*lifted];
        torsoAngle=-2.5*transfer;headAngle=2*transfer;
        left=[left[0]-12*lifted,left[1]-10*lifted];right=[right[0]+12*lifted,right[1]-10*lifted];
        hands={left:{kind:"open",angle:0,amount:lifted},right:{kind:"open",angle:0,amount:lifted}};break;
      }
      case "weight-shift":{
        const sway=keyAt(p,[[0,0],[.12,0],[.3,-1],[.5,0],[.7,1],[.88,0],[1,0]]);
        bodyX=sway*20*unit;torsoAngle=sway*3;headAngle=-sway*2;look=sway*.35;break;
      }
      default:{const exhaustive:never=action.exercise;throw new Error(`Unknown exercise ${exhaustive}`);}
    }
  }else{
    const bpm=positive(action.bpm??112,"Dance bpm must be finite and positive");
    if(bpm>240)throw new RangeError("Dance bpm must not exceed 240");
    const cycles=action.cycles===undefined?null:positive(action.cycles,"Dance cycles must be a positive integer");
    if(cycles!==null&&!Number.isInteger(cycles))throw new RangeError("Dance cycles must be a positive integer");
    const cycleBeats=puppetCycleBeats(action.style);
    const beats=Math.min(action.time*bpm/60,cycles===null?Infinity:cycles*cycleBeats);
    motionClock=beats*60/bpm;
    const finiteEnd=cycles!==null&&beats>=cycles*cycleBeats;
    const p=finiteEnd?4:(beats/cycleBeats*4)%4;
    const wave=Math.sin(p*Math.PI/2),beat=Math.sin(p*Math.PI);
    const down=Math.sin(p*Math.PI)**2;
    const phrase=Math.sin(Math.PI*p/4)**2;
    amount=phrase;
    if(action.style==="step-touch"){
      const compact=Math.max(22,hip.half+2),step=24*unit;
      feet={left:[keyAt(p,[[0,-compact],[.35,-compact],[.95,-compact-step],[3.25,-compact-step],[3.85,-compact],[4,-compact]]),-liftAt(p,.35,.95,12*unit)-liftAt(p,3.25,3.85,12*unit)],
        right:[keyAt(p,[[0,compact],[1.5,compact],[1.95,compact-step],[2.1,compact-step],[2.7,compact],[4,compact]]),-liftAt(p,1.5,1.95,12*unit)-liftAt(p,2.1,2.7,12*unit)]};
      const leftSupport=-compact-step+4*unit,rightSupport=compact-4*unit;
      bodyX=keyAt(p,[[0,0],[.28,rightSupport],[.95,rightSupport],[1.4,leftSupport],[2.7,leftSupport],[3.15,rightSupport],[3.85,rightSupport],[4,0]]);
      bodyY=3*unit*down;torsoAngle=bodyX<0?-1.5*bodyX/leftSupport:1.5*bodyX/rightSupport;headAngle=-torsoAngle*.45;
    }else if(action.style==="bounce"){
      bodyY=10*unit*down;torsoAngle=2*wave;headAngle=-2*Math.sin(p*Math.PI*.5+.25)*phrase;
    }else{
      bodyX=16*unit*wave;bodyY=(5*down+3*phrase)*unit;
      torsoAngle=-4.5*Math.sin(p*Math.PI/2-.35)*phrase;headAngle=3*Math.sin(p*Math.PI/2-.8)*phrase;
    }
    const armSwing=action.style==="bounce"?7*beat:12*wave;
    const readyLeft:FigurePoint=[-shoulder.half-14+armSwing,shoulder.y+profile.armLength*1.2-8*down];
    const readyRight:FigurePoint=[shoulder.half+14+armSwing,shoulder.y+profile.armLength*1.2+8*down];
    const enter=keyAt(beats,[[0,0],[.8,1]]),exit=cycles===null?1:keyAt(beats,[[0,1],[cycles*cycleBeats-.6,1],[cycles*cycleBeats,0]]);
    const arms=enter*exit;
    left=mixPoint(left,readyLeft,arms);right=mixPoint(right,readyRight,arms);
    hands={left:{kind:"relaxed",angle:8+armSwing*.5*arms,amount:0},right:{kind:"relaxed",angle:-8+armSwing*.5*arms,amount:0}};
    if(action.style!=="step-touch"){bodyX*=arms;bodyY*=arms;}
    torsoAngle*=arms;headAngle*=arms;
    joy=.4+down*.2*arms;look=wave*.25*arms;
  }
  // Lower the pelvis only as far as the fixed leg length requires. This never moves a planted shoe.
  const legLength=profileLegLength(profile),maximum=legLength*2*.995;
  for(const [side,foot] of [[-1,feet.left],[1,feet.right]] satisfies [-1|1,FigurePoint][]){
    const dx=foot[0]-bodyX-side*hip.half;
    if(Math.abs(dx)>=maximum)throw new RangeError("Motion foot target is outside calibrated leg reach");
    bodyY=Math.max(bodyY,foot[1]-12-hip.y-Math.sqrt(maximum*maximum-dx*dx));
  }
  const leftArm=solveFigureLimb([-shoulder.half,shoulder.y],left,profile.armLength,profile.armLength,1);
  const rightArm=solveFigureLimb([shoulder.half,shoulder.y],right,profile.armLength,profile.armLength,-1);
  const blinkPhase=motionClock%3.7;
  const blink=1-.92*Math.sin(Math.PI*Math.min(1,Math.max(0,(blinkPhase-3.35)/.18)));
  const pose:FreePuppetPose={kind:action.kind,travel:0,bodyX,bodyY,headAngle,headTurn:0,gaze:[look*6,2],blink,
    facing:"front",hands,contacts:{leftFoot:feet.left[1]===0,rightFoot:feet.right[1]===0,palms},feet,
    arms:{left:leftArm,right:rightArm},
    legs:{left:solveFigureLimb([-hip.half,hip.y],[feet.left[0]-bodyX,feet.left[1]-12-bodyY],legLength,legLength,1),
      right:solveFigureLimb([hip.half,hip.y],[feet.right[0]-bodyX,feet.right[1]-12-bodyY],legLength,legLength,-1)}};
  return {pose,bodyX,torsoAngle,pluck:0,joy,look,antenna:headAngle*.1};
}
