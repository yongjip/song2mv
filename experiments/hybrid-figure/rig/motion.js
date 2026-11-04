import {Vector3} from 'three';
import {steppingFoot,keys} from './gait-source.js';
import {beatAt,vocalAt,expressionAt} from './clock.js';
export {solveLimb,keys,ease} from './gait-source.js';
export const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
export const PROFILE=Object.freeze({waist:.94,pelvis:.845,hip:.80,shoulder:.50,shoulderHalf:.35,head:.88,upperArm:.35,forearm:.33,thigh:.35,shin:.34,footScale:.9});
const flat=x=>({anchor:V(x),yaw:0,pitch:0,lift:0});
function danceFoot(b,side){
 const q=((b%8)+8)%8;
 let foot;
 if(side===0){
  if(q<1)foot=flat(-.20);
  else if(q<2)foot=steppingFoot(q,1,2,V(-.20),V(-.36));
  else if(q<6.75)foot=flat(-.36);
  else if(q<7.75)foot=steppingFoot(q,6.75,7.75,V(-.36),V(-.20));
  else foot=flat(-.20);
 }else{
  if(q<3)foot=flat(.20);
  else if(q<4)foot=steppingFoot(q,3,4,V(.20),V(.015));
  else if(q<4.75)foot=flat(.015);
  else if(q<5.75)foot=steppingFoot(q,4.75,5.75,V(.015),V(.20));
  else foot=flat(.20);
 }
 foot.lift*=.65;foot.pitch*=.75;return foot;
}
export function motionAt(T,bpm=112){
 const b=beatAt(T,bpm),q=((b%8)+8)%8,pulse=.5+.5*Math.cos(b*Math.PI*2),phrase=b*Math.PI/4;
 const glance=keys(T,[[0,1],[.6,1],[1.1,0],[15,0]]),expression=expressionAt(T);
 const x=keys(q,[[0,0],[.7,.13],[1.9,.13],[2.7,-.29],[5.7,-.29],[6.6,.13],[7.8,.13],[8,0]]);
 return {
  section:'bass',time:T,center:V(x,-.072-.014*pulse,0),
  yaw:.09+.065*Math.sin(phrase),hipYaw:.055*Math.sin(phrase),hipRoll:.022*Math.sin(phrase),
  chestYaw:-.072*Math.sin(phrase-.15),chestRoll:-.024*Math.sin(phrase),lean:.016+.018*pulse,
  headYaw:-.055*Math.sin(phrase),headPitch:.025*pulse,
  leftFoot:danceFoot(b,0),rightFoot:danceFoot(b,1),
  rightWrist:V(),leftWrist:V(),rightPole:V(-1.20,1.44,-.76),leftPole:V(1.20,1.44,-.76),
  bass:true,playTime:T,playEnvelope:1,
  acting:{mouthOpen:vocalAt(T),look:glance*.55,lookY:glance*.75,joy:Math.min(1,.60+.15*pulse+.22*expression.accent),accent:Math.min(1,pulse*.3+expression.accent*.6),eyes:expression.eyes}
 };
}
