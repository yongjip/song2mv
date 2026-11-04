import {Vector3} from 'three';
export const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const clamp=x=>Math.min(1,Math.max(0,x));
export const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
export function keys(t,points){if(t<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++){const[a,x]=points[i-1],[b,y]=points[i];if(t<=b)return x+(y-x)*ease((t-a)/(b-a));}return points.at(-1)[1];}
export function solveLimb(root,end,pole,a,b){const delta=end.clone().sub(root),d=delta.length();if(d>a+b-1e-5||d<Math.abs(a-b)+1e-5)throw Error(`Unreachable limb ${d}`);const axis=delta.divideScalar(d),side=pole.clone().sub(root);side.addScaledVector(axis,-side.dot(axis));if(side.length()<.05)throw Error('Elbow/knee pole too close to limb axis');side.normalize();const x=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(0,a*a-x*x));return [root,root.clone().addScaledVector(axis,x).addScaledVector(side,h),end];}
const flat=(x,z=0)=>({anchor:V(x,0,z),yaw:0,pitch:0,lift:0});
export function steppingFoot(t,start,end,from,to){
 const q=clamp((t-start)/(end-start)),f={anchor:from.clone(),yaw:0,pitch:0,lift:0};
 if(q<=.2){f.pitch=.4*ease(q/.2);}
 else if(q<.82){const u=(q-.2)/.62;f.anchor.lerp(to,ease(u));f.lift=.12*Math.sin(Math.PI*u)**2;f.pitch=keys(u,[[0,.4],[.33,.12],[.7,-.22],[1,-.22]]);}
 else{f.anchor.copy(to);f.pitch=-.22*(1-ease((q-.82)/.18));}
 if(t<=start){f.anchor.copy(from);f.pitch=0;f.lift=0;}if(t>=end){f.anchor.copy(to);f.pitch=0;f.lift=0;}return f;
}
function walkFoot(t,side){let from=V(side===0?-.17:.17,0,-.9),f=flat(from.x,from.z);for(let i=side;i<7;i+=2){const start=.65+i*.85,end=start+.85,target=V(from.x,0,i===6?.78:-.9+(i+1)*.28);if(t<start)return f;f=steppingFoot(t,start,end,from,target);if(t<=end)return f;from=target;}return f;}
function walkCenter(t){
 const speed=.28/.85;
 if(t<1.075)return -.9;
 if(t<1.925){const u=(t-1.075)/.85;return -.9+speed*.85*(u*u*u-.5*u*u*u*u);}
 const z=-.76+speed*(t-1.925);
 if(t<5.75)return z;
 const u=clamp((t-5.75)/1.4),a=-.76+speed*(5.75-1.925),b=.78;
 return (2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*1.4*speed+(-2*u**3+3*u*u)*b;
}
function danceFoot(t,side){
 const q=t%4.8,origin=side===0?V(-.18,0,0):V(.18,0,0);
 if(side===0){if(q<.40)return flat(-.18);if(q<1.32)return steppingFoot(q,.40,1.32,origin,V(-.41,0,0));if(q<4.0)return flat(-.41);return steppingFoot(q,4.0,4.72,V(-.41,0,0),origin);}
 if(q<1.86)return flat(.18);if(q<2.56)return steppingFoot(q,1.86,2.56,origin,V(-.13,0,0));if(q<2.66)return flat(-.13);if(q<3.36)return steppingFoot(q,2.66,3.36,V(-.13,0,0),origin);return flat(.18);
}
export function gaitMotionAt(T){
 const mode=T<6?'roll':T<14?'walk':'dance',t=mode==='roll'?T:mode==='walk'?T-6:T-14;
 const p={mode,t,center:V(),hipYaw:0,hipRoll:0,chestYaw:0,chestRoll:0,lean:0,headYaw:0,leftFoot:flat(-.2),rightFoot:flat(.2),rightWrist:V(-.49,1.17,.06),leftWrist:V(.49,1.17,.06),rightPole:V(-1.5,1.94,-1),leftPole:V(1.5,1.94,-1)};
 if(mode==='roll'){
  const a=keys(t,[[0,0],[.6,0],[1.25,1],[2,1],[2.7,0],[3.2,0],[3.9,-1],[4.6,-1],[5.4,0],[6,0]]);
  p.center.x=.11*a;p.leftFoot.pitch=Math.max(a,0)*.4+Math.min(a,0)*.18;p.rightFoot.pitch=Math.min(a,0)*-.4+Math.max(a,0)*-.18;
  p.hipYaw=.10*a;p.hipRoll=.025*a;p.chestYaw=-.13*a;p.chestRoll=-.035*a;p.headYaw=.06*a;
 }else if(mode==='walk'){
  p.leftFoot=walkFoot(t,0);p.rightFoot=walkFoot(t,1);p.center.z=walkCenter(t);
  const u=(t-.65)/.85,cycle=Math.PI*u,envelope=keys(t,[[0,0],[.4,0],[.8,1],[6.2,1],[7.2,0],[8,0]]);
  const shift=[];for(let i=0;i<7;i++){const s=.65+i*.85;shift.push([s+.12,i%2===0?.1:-.1],[s+.70,i%2===0?.1:-.1]);}shift.push([7.1,0],[8,0]);
  p.center.x=t<.2?0:t<.48?.1*ease((t-.2)/.28):keys(t,shift);
  p.center.y=-.018*(1-Math.cos(2*cycle))*envelope;
  p.hipYaw=.065*Math.sin(cycle)*envelope;p.hipRoll=.025*Math.sin(cycle)*envelope;
  p.chestYaw=-.055*Math.sin(cycle-.25)*envelope;p.chestRoll=-p.hipRoll*.65;p.lean=.025*envelope;
  const arm=.21*Math.sin(cycle)*envelope;
  p.rightWrist.z=.06-arm;p.leftWrist.z=.06+arm;
  p.rightWrist.y+=.035*(1-Math.cos(cycle))*envelope;p.leftWrist.y+=.035*(1+Math.cos(cycle))*envelope;
 }else{
  const dt=Math.min(t,9.6),q=dt>=9.6?4.8:dt%4.8,beat=2*Math.PI*dt/.6,phrase=2*Math.PI*dt/4.8;
  const envelope=keys(dt,[[0,0],[.5,1],[8.9,1],[9.6,0]]);
  p.leftFoot=dt>=9.6?flat(-.18):danceFoot(dt,0);p.rightFoot=dt>=9.6?flat(.18):danceFoot(dt,1);
  p.center.x=keys(q,[[0,0],[.32,.11],[1.16,.11],[1.76,-.33],[3.24,-.33],[3.94,.11],[4.6,.11],[4.8,0]]);
  p.center.y=(-.07-.025*(.5-.5*Math.cos(beat)))*envelope;
  p.hipYaw=.10*Math.sin(phrase)*envelope;p.hipRoll=-.035*Math.sin(phrase)*envelope;
  p.chestYaw=-.13*Math.sin(phrase-.3)*envelope;p.chestRoll=-p.hipRoll*.9;p.headYaw=-p.chestYaw*.3;
  p.rightWrist.lerp(V(-.58,1.52+.10*Math.sin(phrase),.30+.10*Math.cos(phrase)),envelope);
  p.leftWrist.lerp(V(.56,1.5-.10*Math.sin(phrase),.28-.07*Math.cos(phrase)),envelope);
 }
 return p;
}

export function motionAt(T){
 if(T<18){const p=gaitMotionAt(T+6);p.time=T;p.bass=false;return p;}
 const t=Math.min(12,T-18),beat=t*112/60,envelope=keys(t,[[0,0],[.5,1],[10.4,1],[11.5,0],[12,0]]);
 const p={mode:'bass',t,time:T,bass:true,playTime:Math.min(t,11.5),playEnvelope:envelope,center:V(0,-.045-.012*Math.sin(beat*Math.PI)**2*envelope,0),hipYaw:.045*Math.sin(beat*Math.PI/2)*envelope,hipRoll:.014*Math.sin(beat*Math.PI/2)*envelope,chestYaw:-.06*Math.sin(beat*Math.PI/2-.2)*envelope,chestRoll:-.012*Math.sin(beat*Math.PI/2-.2)*envelope,lean:.02,headYaw:.08*envelope,leftFoot:flat(-.22),rightFoot:flat(.22),rightWrist:V(),leftWrist:V(),rightPole:V(-1.5,1.94,-1),leftPole:V(1.5,1.94,-1)};
 return p;
}
