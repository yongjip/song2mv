import * as THREE from 'three';

export const FOOT = Object.freeze({heelZ:-.13, ballZ:.15, toeZ:.27, halfWidth:.125, ankleY:.15});

function soleOutline(z0,z1,roundBack,roundFront){
 const w=FOOT.halfWidth,r=.055,points=[];
 const corners=[[-w+r,z0+r,Math.PI,Math.PI*1.5,roundBack],[w-r,z0+r,Math.PI*1.5,Math.PI*2,roundBack],[w-r,z1-r,0,Math.PI*.5,roundFront],[-w+r,z1-r,Math.PI*.5,Math.PI,roundFront]];
 for(const [x,z,a,b,rounded] of corners){
  if(rounded){for(let i=0;i<=7;i++){const t=a+(b-a)*i/7;points.push(new THREE.Vector2(x+r*Math.cos(t),z+r*Math.sin(t)));}}
  else points.push(new THREE.Vector2(x<0?-w:w,z<(z0+z1)/2?z0:z1));
 }
 return points;
}

function shoeGeometry(z0,z1,height,roundBack,roundFront){
 const outline=soleOutline(z0,z1,roundBack,roundFront),n=outline.length,mid=(z0+z1)/2;
 const rings=[[0,1],[.025,1],[height*.7,.98],[height,.82]],positions=[],indices=[];
 for(const [y,scale] of rings)for(const p of outline)positions.push(p.x*scale,y,mid+(p.y-mid)*scale);
 for(let ring=0;ring<rings.length-1;ring++)for(let j=0;j<n;j++){const next=(j+1)%n,a=ring*n+j,b=ring*n+next,c=(ring+1)*n+j,d=(ring+1)*n+next;indices.push(a,c,b,b,c,d);}
 const triangles=THREE.ShapeUtils.triangulateShape(outline,[]);
 for(const [a,b,c] of triangles){indices.push(a,b,c);const top=(rings.length-1)*n;indices.push(top+c,top+b,top+a);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
 return geometry;
}

export function createFoot(scene,material){
 const root=new THREE.Group(),rocker=new THREE.Group(),toeJoint=new THREE.Group();root.name='foot-world';rocker.name='heel-toe-rocker';toeJoint.name='toe-flexion';scene.add(root);root.add(rocker);rocker.add(toeJoint);
 const rear=new THREE.Mesh(shoeGeometry(FOOT.heelZ,FOOT.ballZ,.14,true,false),material);
 const toeGeometry=shoeGeometry(FOOT.ballZ,FOOT.toeZ,.105,false,true);toeGeometry.translate(0,0,-FOOT.ballZ);
 const toe=new THREE.Mesh(toeGeometry,material);rocker.add(rear);toeJoint.add(toe);
 for(const mesh of [rear,toe]){mesh.castShadow=true;mesh.receiveShadow=true;}
 return {root,rocker,rear,toeJoint,toe,meshes:[rear,toe]};
}

// Anchor is the neutral sole origin. The ground pivot never moves during a roll.
export function updateFoot(foot,{anchor,yaw=0,pitch=0,lift=0}){
 if(![anchor.x,anchor.y,anchor.z,yaw,pitch,lift].every(Number.isFinite)||lift<0||Math.abs(pitch)>=Math.PI/2)throw new RangeError('Foot pose must be finite, with nonnegative lift and pitch within +/-90 degrees');
 const pivotZ=pitch>0?FOOT.ballZ:pitch<0?FOOT.heelZ:0;
 foot.root.position.copy(anchor);foot.root.position.y+=lift;foot.root.rotation.set(0,yaw,0);
 foot.rocker.position.set(0,0,pivotZ);foot.rocker.rotation.set(pitch,0,0);
 foot.rear.position.set(0,0,-pivotZ);
 foot.toeJoint.position.set(0,0,FOOT.ballZ-pivotZ);foot.toeJoint.rotation.set(-Math.max(0,pitch),0,0);
 foot.root.updateMatrixWorld(true);
 const ankle=foot.rocker.localToWorld(new THREE.Vector3(0,FOOT.ankleY,-pivotZ));
 const support=lift>1e-9?'air':pitch>1e-8?'toe':pitch< -1e-8?'heel':'flat';
 const contact=support==='air'?null:foot.root.localToWorld(new THREE.Vector3(0,0,pivotZ));
 return {ankle,contact,support,pivotZ,heel:foot.rocker.localToWorld(new THREE.Vector3(0,0,FOOT.heelZ-pivotZ)),toe:foot.toeJoint.localToWorld(new THREE.Vector3(0,0,FOOT.toeZ-FOOT.ballZ))};
}
