import * as THREE from 'three';
import {V} from './rig-math.js';
const width=1920,height=1080;
export function camera(x,y,z,tx=0,ty=1.2,tz=0,fov=34){const c=new THREE.PerspectiveCamera(fov,width/height,.1,100);c.position.set(x,y,z);c.lookAt(tx,ty,tz);c.updateMatrixWorld(true);return c;}
export const cameras=[camera(0,2.4,6.3),camera(3.4,2.3,5.7)];export const detail=new THREE.OrthographicCamera(-.642,.642,.35,-.95,.1,100);detail.position.set(1.1,1.08,3.3);detail.lookAt(.1,1.0,.25);detail.updateMatrixWorld(true);
export const round=n=>Math.round(n*1000)/1000;
export function point(v,c){const p=v.clone().project(c),d=v.clone().applyMatrix4(c.matrixWorldInverse);return {x:round((p.x+1)*width/2),y:round((1-p.y)*height/2),depth:round(-d.z)};}
function frame(object,c,position=V()){const o=object.localToWorld(position.clone());return {o:point(o,c),x:point(object.localToWorld(position.clone().add(V(1,0,0))),c),y:point(object.localToWorld(position.clone().add(V(0,1,0))),c)};}
function view(object,c){const f=frame(object,c),w=object.getWorldPosition(V()),q=object.getWorldQuaternion(new THREE.Quaternion()),e=new THREE.Euler().setFromQuaternion(q,'YXZ'),direction=c.getWorldDirection(V()).negate(),angle=e.y-(c.isOrthographicCamera?Math.atan2(direction.x,direction.z):Math.atan2(c.position.x-w.x,c.position.z-w.z));return {frame:f,yaw:round(Math.atan2(Math.sin(angle),Math.cos(angle)))};}
function hull(points){const sorted=points.map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],hi=[];for(const p of sorted){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}return lo.slice(0,-1).concat(hi.slice(0,-1));}
const xy=p=>`${p.x},${p.y}`;
const path=points=>points.map((p,i)=>`${i?'L':'M'}${xy(p)}`).join('')+'Z';
function mask(points,c,radius,occludes){const out=[];for(let i=0;i<=32;i++){const u=i/32,s=u<.5?0:1,t=u<.5?u*2:(u-.5)*2,p=points[s].clone().lerp(points[s+1],t);if(!occludes(p,c,radius))out.push(point(p,c));}return out;}
function meshShape(mesh,c){
 const g=mesh.geometry,params=g.parameters;
 if(params?.shapes){const shape=Array.isArray(params.shapes)?params.shapes[0]:params.shapes,depth=params.options.depth??0;return path(shape.getPoints(35).map(p=>point(mesh.localToWorld(V(p.x,p.y,depth)),c)));}
 const positions=g.attributes.position,pts=[];for(let i=0;i<positions.count;i++)pts.push(point(mesh.localToWorld(V(positions.getX(i),positions.getY(i),positions.getZ(i))),c));return hull(pts).map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join('')+'Z';
}
function instrument(rig,a,c){
 if(!a.p.bass)return {kind:'none'};
 const root=rig.bass.root,parts=[];
 const groups=[['neck-wood','wood'],['fingerboard','board'],['headstock','teal'],['bass-body','teal'],['cream-pickguard','cream']];
 for(const [name,paint]of groups)parts.push({name,paint,path:meshShape(root.getObjectByName(name),c)});
 const objects=[];root.traverse(m=>{if(m.isMesh)objects.push(m);});
 for(const mesh of objects){if(/^(pickup-|bridge$|control-knob-|tuning-peg-|tuning-post-|nut$)/.test(mesh.name)){parts.push({name:mesh.name,paint:mesh.name.startsWith('pickup-')?'dark':'metal',path:meshShape(mesh,c)});}}
 const lines=[];for(const mesh of objects){if(/^(string-\d|fret-\d|head-string-|peg-stem-)/.test(mesh.name)&&mesh.geometry.parameters?.height){const h=mesh.geometry.parameters.height/2;lines.push({name:mesh.name,points:[point(mesh.localToWorld(V(0,-h,0)),c),point(mesh.localToWorld(V(0,h,0)),c)],paint:mesh.name.startsWith('string-')?'string':'metal'});}}
 const box=new THREE.Box3().setFromObject(root),corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(point(V(x,y,z),c));
 const bounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
 const playing=a.playing;
 const fingers=playing.fingers.map(f=>{const world=f.points.map(v=>root.localToWorld(v.clone()));return {role:f.role,radius:f.radius*.8,points:world.map(v=>point(v,c)),front:mask(world,c,f.radius*.8,(v,cam)=>!rig.bassFront(v,cam))};});
 const palms=playing.palms.map(p=>({frame:frame(root,c,p.center),rx:p.size.x,ry:p.size.y,wrist:point(root.localToWorld((p.role==='pluck'?playing.rightWrist:playing.leftWrist).clone()),c)}));
 const frontLocal=[rig.bass.anchors.strapHigh.clone().applyMatrix4(root.matrix),V(.10,.40,.24),V(.30,.58,.12),V(.32,.61,-.02)],backLocal=[V(.32,.61,-.02),V(.29,.45,-.25),V(-.18,.21,-.25),V(-.44,.02,-.02),rig.bass.anchors.strapLow.clone().applyMatrix4(root.matrix)];
 return {kind:rig.bass.root.userData.instrument.type,bounds,parts,lines,fingers,palms,strapFront:frontLocal.map(v=>point(rig.body.localToWorld(v),c)),strapBack:backLocal.map(v=>point(rig.body.localToWorld(v),c))};
}
export function projectView(rig,a,c){
 const arms=a.arms.map((pts,i)=>({points:pts.map(v=>point(v,c)),hand:frame(rig.hands[i],c),layerFront:rig.armLayerFront(pts[2],c),frontTorso:mask(pts,c,.105,(v,cam,r)=>!rig.torsoFront(v,cam,r)),frontBass:a.p.bass?mask(pts,c,.105,(v,cam)=>!rig.bassFront(v,cam)):[],handFront:rig.handFront(rig.hands[i].localToWorld(V(0,.09,0)),c)}));
 const legs=a.legs.map((pts,i)=>{const vertices=[];for(const mesh of rig.feet[i].meshes){const p=mesh.geometry.attributes.position;for(let k=0;k<p.count;k++)vertices.push(point(mesh.localToWorld(V(p.getX(k),p.getY(k),p.getZ(k))),c));}const weave=[];for(const mesh of rig.feet[i].meshes){const b=mesh.geometry.boundingBox;for(const x of [-.07,-.023,.023,.07])weave.push([point(mesh.localToWorld(V(x,b.max.y+.001,b.min.z+.018)),c),point(mesh.localToWorld(V(x,b.max.y+.001,b.max.z-.018)),c)]);}return {points:pts.map(v=>point(v,c)),shoe:hull(vertices),weave};});
 return {arms,legs,body:view(rig.body,c),head:view(rig.head,c),pelvis:frame(rig.pelvis,c),abdomen:frame(rig.pelvis,c,V(0,-.01,-.26)),shadow:point(V(a.center.x,0,a.center.z),c),instrument:instrument(rig,a,c)};
}
export const floor=c=>{const lines=[];for(let z=-2;z<=2;z+=.5)lines.push([point(V(-2,0,z),c),point(V(2,0,z),c)]);for(let x=-2;x<=2;x+=.5)lines.push([point(V(x,0,-2),c),point(V(x,0,2),c)]);return lines;};
