import * as THREE from 'three';
import {createRig} from './rig/pose-rig.js';
import {V,PROFILE,keys} from './rig/rig-math.js';
import {gaitMotionAt as gait} from './rig/gait-source.js';
import {motionAt as bass} from './rig/motion.js';
import {projectView,point} from './rig/projection.js';
import {expressionAt} from './rig/clock.js';
export const ACTIONS=Object.freeze(['walk','phone','bass','dance','turn','reach','heel-toe']);
const flat=x=>({anchor:V(x),yaw:0,pitch:0,lift:0});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function poseAt(action,time,bpm){
 const p={time,section:action,bpm,center:V(0,-.055,0),yaw:0,hipYaw:0,hipRoll:0,chestYaw:0,chestRoll:0,lean:.015,headYaw:0,headPitch:0,leftFoot:flat(-.2),rightFoot:flat(.2),rightWrist:V(-.39,.84,.12),leftWrist:V(.39,.84,.12),rightPole:V(-.85,.85,-.4),leftPole:V(.85,.85,-.4),bass:false,playTime:time,playEnvelope:0,acting:{eyes:expressionAt(time).eyes,joy:.6,look:0,lookY:0,mouthOpen:0,accent:0}};
 if(action==='bass'){Object.assign(p,bass(time,bpm));p.bpm=bpm;}
 if(action==='walk'||action==='dance'||action==='heel-toe'){
  const t=action==='walk'?6+clamp(time,0,7.99):action==='dance'?14+time:time%6;
  Object.assign(p,gait(t));p.section=action;p.time=time;p.bpm=bpm;p.yaw=0;p.bass=false;p.acting={eyes:expressionAt(time).eyes,joy:.65,look:0,lookY:0,mouthOpen:0,accent:0};
  if(action==='walk'||action==='heel-toe'){p.rightWrist.set(-.39,.84,p.rightWrist.z);p.leftWrist.set(.39,.84,p.leftWrist.z);p.rightPole=V(-.85,.85,-.4);p.leftPole=V(.85,.85,-.4);}
 }
 if(action==='phone'){
  const u=keys(time,[[0,0],[.35,0],[1.2,1],[4.8,1],[5.7,0],[100,0]]);
  p.rightWrist.lerp(V(-.12,1.20,.39),u);p.leftWrist.lerp(V(.13,1.29,.43),u);p.headPitch=.13*u;p.acting.lookY=u;
  p.phone={amount:u,center:V(0,.36,.4),width:.24,height:.34,tilt:.08};
 }
 if(action==='turn'){
  const a=keys(time%6,[[0,0],[.5,0],[1.7,.65],[2.2,.65],[3,0],[4.2,-.65],[4.7,-.65],[5.6,0],[6,0]]);
  p.chestYaw=a*.45;p.hipYaw=-a*.15;p.headYaw=a*.55;p.acting.look=a;
 }
 if(action==='reach'){
  const u=keys(time%6,[[0,0],[.5,0],[1.7,1],[2.8,1],[4,0],[6,0]]);
  p.leftWrist=V(.44,1.46,-.35).lerp(V(.44,1.46,.62),u);p.acting.look=.35*u;
 }
 return p;
}
function makeCamera(quarter){const c=new THREE.OrthographicCamera(-3.4,3.4,2,-1.825,.1,100);c.position.set(quarter?4.5:0,quarter?2.5:2.15,quarter?8:10);c.lookAt(0,1.15,0);c.updateMatrixWorld(true);return c;}
export function createSampler(){
 const rig=createRig(),cameras={front:makeCamera(false),quarter:makeCamera(true)};
 return ({action,time,bpm=112,view='front'})=>{
  if(!ACTIONS.includes(action)||!Number.isFinite(time)||time<0||!Number.isFinite(bpm)||bpm<=0||bpm>240||!(view in cameras))throw new RangeError('Use a supported action/view, nonnegative finite seconds and BPM in (0,240]');
  const p=poseAt(action,time,bpm),a=rig.update(p),camera=cameras[view],projected=projectView(rig,a,camera),head=rig.head.getWorldPosition(V()),up=V(0,1,0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())),o=point(head,camera),above=point(head.clone().add(up),camera);
  const phone=p.phone&&p.phone.amount>.001?[V(-.12,-.17,0),V(.12,-.17,0),V(.12,.17,0),V(-.12,.17,0)].map(v=>point(rig.body.localToWorld(v.applyAxisAngle(V(1,0,0),p.phone.tilt).add(p.phone.center)),camera)):null;
  return {view:projected,acting:p.acting,headScale:Math.hypot(above.x-o.x,above.y-o.y)*.0066,phone,audit:{arms:a.arms.map(ps=>ps.map(v=>v.toArray())),legs:a.legs.map(ps=>ps.map(v=>v.toArray())),feet:a.footStates.map(f=>({support:f.support,contact:f.contact?.toArray()??null,heel:f.heel.toArray(),toe:f.toe.toArray()})),profile:PROFILE}};
 };
}
export const sampleAt=createSampler();
