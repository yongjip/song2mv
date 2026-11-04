import * as THREE from 'three';
import {V,PROFILE,solveLimb} from './rig-math.js';
import {createFoot,updateFoot} from './foot.js';
import {createBass} from './bass.js';
import {playingAt} from './playing-state.js';
export function createRig({instrumentFactory=createBass}={}){
 const scene=new THREE.Scene(),body=new THREE.Group(),pelvis=new THREE.Group(),head=new THREE.Group(),hands=[new THREE.Group(),new THREE.Group()];scene.add(body,pelvis);body.add(head,...hands);head.position.y=PROFILE.head;
 const feet=[createFoot(scene,new THREE.MeshBasicMaterial()),createFoot(scene,new THREE.MeshBasicMaterial())];feet.forEach(f=>f.root.scale.setScalar(PROFILE.footScale));
 const bass=instrumentFactory(body);bass.root.position.set(-.16,.08,.33);bass.root.scale.setScalar(.80);bass.root.rotation.z=.26;
 const torso={center:V(0,.21,0),radius:V(.35,.34,.21)};
 function update(p){
  const center=p.center.clone(),fs=[p.leftFoot,p.rightFoot].map((f,i)=>updateFoot(feet[i],f));
  pelvis.position.set(center.x,PROFILE.pelvis,center.z);pelvis.rotation.set(0,p.yaw+p.hipYaw,p.hipRoll,'YXZ');pelvis.updateMatrixWorld(true);
  for(let i=0;i<2;i++){const h=pelvis.localToWorld(V(i===0?-.17:.17,PROFILE.hip-PROFILE.pelvis,0)),a=fs[i].ankle,dx=a.x-h.x,dz=a.z-h.z,reach=(PROFILE.thigh+PROFILE.shin-.004)**2-dx*dx-dz*dz;if(reach<=0)throw Error('Foot outside calibrated leg span');center.y=Math.min(center.y,a.y-h.y+Math.sqrt(reach));}
  pelvis.position.y=PROFILE.pelvis+center.y;pelvis.updateMatrixWorld(true);
  body.position.set(center.x,PROFILE.waist+center.y,center.z);body.rotation.set(p.lean,p.yaw+p.chestYaw,p.chestRoll,'YXZ');head.rotation.set(-p.lean*.5+(p.headPitch??0),-p.chestYaw*.65+p.headYaw,-p.chestRoll*.7);body.updateMatrixWorld(true);
  let playing=null,wrists=[p.rightWrist,p.leftWrist];
  if(p.bass){playing=playingAt(p.playTime,p.playEnvelope,bass.stringZ,p.bpm??112);wrists=[playing.rightWrist,playing.leftWrist].map(v=>body.worldToLocal(bass.root.localToWorld(v.clone()))).map(v=>v.add(V(0,PROFILE.waist,0)));}
  const arms=wrists.map((w,i)=>{const side=i===0?-1:1,local=w.clone().sub(V(0,PROFILE.waist,0)),pole=(i===0?p.rightPole:p.leftPole).clone().sub(V(0,PROFILE.waist,0)),points=solveLimb(V(side*PROFILE.shoulderHalf,PROFILE.shoulder,0),local,pole,PROFILE.upperArm,PROFILE.forearm),dir=points[2].clone().sub(points[1]).normalize();hands[i].position.copy(points[2]);hands[i].quaternion.setFromUnitVectors(V(0,-1,0),dir).multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI));return points.map(v=>body.localToWorld(v.clone()));});
  const legs=fs.map((f,i)=>{const side=i===0?-1:1,h=pelvis.localToWorld(V(side*.17,PROFILE.hip-PROFILE.pelvis,0)),pole=pelvis.localToWorld(V(side*.19,-.25,.8));return solveLimb(h,f.ankle,pole,PROFILE.thigh,PROFILE.shin);});
  scene.updateMatrixWorld(true);return {p,center,arms,legs,footStates:fs,playing};
 }
 function rayOrigin(point,camera){if(!camera.isOrthographicCamera)return camera.position.clone();const p=point.clone().project(camera);return V(p.x,p.y,-1).unproject(camera);}
 function ellipsoidState(point,camera,object,shape,radius=0){
  const origin=object.worldToLocal(rayOrigin(point,camera)).sub(shape.center),end=object.worldToLocal(point.clone()).sub(shape.center),delta=end.clone().sub(origin),dist=delta.length(),d=delta.divideScalar(dist),r=shape.radius;
  const a=d.x*d.x/r.x**2+d.y*d.y/r.y**2+d.z*d.z/r.z**2,b=2*(origin.x*d.x/r.x**2+origin.y*d.y/r.y**2+origin.z*d.z/r.z**2),c=origin.x**2/r.x**2+origin.y**2/r.y**2+origin.z**2/r.z**2-1,disc=b*b-4*a*c;
  if(disc<0)return 'miss';const hit=(-b-Math.sqrt(disc))/(2*a);if(hit<=0)return 'miss';return dist<=hit+radius*.25?'front':'behind';
 }
 const torsoOccludes=(p,c,r=0)=>ellipsoidState(p,c,body,torso,r)==='behind';
 const torsoFront=(p,c,r=0)=>ellipsoidState(p,c,body,torso,r)==='front';
 function supportFront(point,camera,object,shape,radius=0){
  const origin=object.worldToLocal(rayOrigin(point,camera)),toward=origin.clone().sub(shape.center).normalize(),p=object.worldToLocal(point.clone()).sub(shape.center),r=shape.radius,support=Math.sqrt((r.x*toward.x)**2+(r.y*toward.y)**2+(r.z*toward.z)**2);return p.dot(toward)>support-radius*.15;
 }
 function armLayerFront(point,camera){return supportFront(point,camera,body,torso,.07);}
 function handFront(point,camera){const lower={center:V(0,-.03,0),radius:V(.27,.24,.20)},states=[ellipsoidState(point,camera,body,torso,.08),ellipsoidState(point,camera,pelvis,lower,.08)];return !states.includes('behind')&&(states.includes('front')||supportFront(point,camera,body,torso,.08)||supportFront(point,camera,pelvis,lower,.08));}

 function bassFront(point,camera){
  const o=bass.root.worldToLocal(rayOrigin(point,camera)),end=bass.root.worldToLocal(point.clone()),d=end.clone().sub(o),u=(.045-o.z)/d.z;if(u<1)return false;const q=o.addScaledVector(d,u);
  if(q.x>=.13&&q.x<=.94&&Math.abs(q.y)<=.059)return true;
  const poly=bass.root.getObjectByName('bass-body').geometry.parameters.shapes.getPoints(50);let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
 }
 function bassOccludes(point,camera){
  const o=bass.root.worldToLocal(rayOrigin(point,camera)),end=bass.root.worldToLocal(point.clone()),d=end.clone().sub(o),u=(.045-o.z)/d.z;if(u<=0||u>=1)return false;const q=o.addScaledVector(d,u);
  if(q.x>=.13&&q.x<=.94&&Math.abs(q.y)<=.059)return true;
  const poly=bass.root.getObjectByName('bass-body').geometry.parameters.shapes.getPoints(50);let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
 }
 return {scene,body,pelvis,head,hands,feet,bass,update,torsoOccludes,bassOccludes,torsoFront,bassFront,handFront,armLayerFront};
}
