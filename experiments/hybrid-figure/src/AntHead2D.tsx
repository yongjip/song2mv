import React,{useId} from 'react';
import type {HeadProps} from './types';

type P=readonly [number,number];
type Outline=readonly [P,P,P,P,P,P,P,P,P,P,P,P,P];
type Hair=readonly [P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P];
type Eye={x:number;y:number;width:number};
type Antenna=readonly [P,P,P,P];
type Drawing={
 yaw:number;face:Outline;hair:Hair;forelock:Outline;
 leftEye:Eye;rightEye:Eye;mouth:P;mouthWidth:number;
 band:readonly [P,P,P,P,P,P];bow:P;bowClipEdge:number;bowWidth:number;
 leftAntenna:Antenna;rightAntenna:Antenna;leftAntennaVisible:number;rightAntennaVisible:number;
};
const ink='#2d2730';
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const point=(a:P,b:P,t:number):P=>[mix(a[0],b[0],t),mix(a[1],b[1],t)];
const curves=(points:readonly P[])=>`M${points[0].join(' ')}${points.slice(1).map((p,i)=>`${i%3===0?'C':''}${p.join(' ')}`).join(' ')}Z`;
const front:Drawing={
 yaw:0,
 face:[[0,-58],[34,-59],[60,-44],[63,-18],[69,11],[54,43],[28,53],[7,61],[-26,59],[-46,44],[-62,31],[-69,-15],[0,-58]],
 hair:[[0,-65],[34,-66],[63,-52],[69,-27],[78,-7],[77,31],[68,48],[61,59],[47,59],[36,56],[9,60],[-29,59],[-47,56],[-73,63],[-80,33],[-73,-13],[-72,-46],[-42,-66],[0,-65]],
 forelock:[[-65,-29],[-62,-49],[-47,-55],[-24,-53],[-30,-38],[-42,-21],[-43,3],[-47,21],[-43,42],[-40,48],[-60,57],[-70,24],[-65,-29]],
 leftEye:{x:-25,y:-1,width:1},rightEye:{x:25,y:-1,width:1},mouth:[1,30],mouthWidth:11,
 band:[[-64,-44],[0,-61],[62,-44],[64,-29],[1,-44],[-63,-28]],bow:[-65,-34],bowClipEdge:120,bowWidth:1,
 leftAntenna:[[-26,-56],[-33,-82],[-51,-115],[-64,-98]],rightAntenna:[[26,-56],[34,-83],[52,-114],[65,-97]],leftAntennaVisible:1,rightAntennaVisible:1
};
const leftQuarter:Drawing={
 yaw:-Math.PI/4,
 face:[[-12,-58],[20,-61],[46,-42],[48,-18],[53,10],[32,44],[5,54],[-18,59],[-47,50],[-58,30],[-68,6],[-68,-29],[-12,-58]],
 hair:[[-3,-65],[29,-65],[55,-49],[61,-24],[68,-3],[68,31],[58,48],[51,59],[35,59],[24,56],[-1,61],[-33,58],[-49,53],[-72,56],[-80,26],[-72,-16],[-70,-48],[-39,-67],[-3,-65]],
 forelock:[[-68,-28],[-66,-47],[-56,-54],[-43,-53],[-49,-37],[-57,-20],[-58,1],[-61,18],[-59,37],[-55,45],[-69,48],[-75,20],[-68,-28]],
 leftEye:{x:-39,y:-1,width:.76},rightEye:{x:1,y:-3,width:.94},mouth:[-28,31],mouthWidth:9,
 band:[[-64,-44],[-14,-61],[53,-45],[57,-30],[-11,-44],[-63,-29]],bow:[-40,-36],bowClipEdge:-65,bowWidth:.67,
 leftAntenna:[[-40,-56],[-44,-80],[-58,-111],[-70,-96]],rightAntenna:[[9,-58],[15,-84],[32,-116],[45,-99]],leftAntennaVisible:.86,rightAntennaVisible:1
};
const leftProfile:Drawing={
 yaw:-Math.PI/2,
 face:[[-25,-57],[3,-59],[30,-42],[34,-17],[36,10],[16,43],[-9,52],[-34,56],[-53,42],[-60,24],[-69,7],[-68,-30],[-25,-57]],
 hair:[[-10,-64],[16,-65],[45,-48],[50,-23],[58,-3],[59,29],[49,46],[42,56],[26,58],[16,56],[-7,60],[-34,55],[-46,49],[-69,49],[-76,21],[-69,-17],[-68,-46],[-42,-67],[-10,-64]],
 forelock:[[-72,-28],[-70,-46],[-64,-52],[-56,-52],[-60,-35],[-65,-18],[-65,0],[-67,18],[-66,34],[-63,40],[-73,42],[-77,17],[-72,-28]],
 leftEye:{x:-75,y:-3,width:0},rightEye:{x:-46,y:-1,width:.90},mouth:[-51,29],mouthWidth:4.5,
 band:[[-60,-43],[-22,-59],[42,-44],[47,-29],[-19,-44],[-60,-29]],bow:[0,-37],bowClipEdge:-70,bowWidth:.25,
 leftAntenna:[[-46,-54],[-51,-79],[-62,-109],[-72,-95]],rightAntenna:[[-13,-58],[-9,-83],[6,-115],[19,-99]],leftAntennaVisible:.75,rightAntennaVisible:1
};
const rightQuarter:Drawing={
 yaw:Math.PI/4,
 face:[[12,-58],[44,-57],[63,-35],[64,-11],[70,13],[50,42],[24,53],[1,60],[-30,54],[-47,36],[-59,15],[-54,-29],[12,-58]],
 hair:[[3,-65],[38,-64],[64,-48],[70,-23],[77,-3],[77,31],[66,48],[59,59],[45,59],[33,56],[9,60],[-23,59],[-39,56],[-65,62],[-73,34],[-66,-13],[-64,-45],[-32,-67],[3,-65]],
 forelock:[[-53,-29],[-51,-47],[-34,-54],[-11,-53],[-18,-39],[-30,-23],[-30,-2],[-34,19],[-31,40],[-26,48],[-48,56],[-61,22],[-53,-29]],
 leftEye:{x:-1,y:-3,width:.94},rightEye:{x:39,y:-1,width:.76},mouth:[29,31],mouthWidth:9,
 band:[[-55,-44],[12,-61],[65,-44],[65,-29],[13,-44],[-57,-28]],bow:[-57,-34],bowClipEdge:120,bowWidth:.91,
 leftAntenna:[[-9,-58],[-16,-84],[-34,-115],[-47,-99]],rightAntenna:[[40,-56],[45,-80],[59,-111],[71,-96]],leftAntennaVisible:1,rightAntennaVisible:.86
};
const rightProfile:Drawing={
 yaw:Math.PI/2,
 face:[[25,-57],[51,-53],[65,-31],[66,-8],[73,9],[57,36],[31,50],[8,58],[-18,51],[-33,33],[-43,13],[-36,-30],[25,-57]],
 hair:[[10,-64],[42,-62],[67,-45],[72,-20],[79,1],[77,31],[66,46],[59,56],[44,58],[32,55],[11,59],[-13,57],[-27,53],[-54,58],[-64,30],[-57,-13],[-54,-45],[-24,-66],[10,-64]],
 forelock:[[-35,-29],[-33,-47],[-16,-54],[7,-52],[0,-38],[-13,-22],[-14,-1],[-19,19],[-15,38],[-10,46],[-32,52],[-45,21],[-35,-29]],
 leftEye:{x:46,y:-1,width:.90},rightEye:{x:78,y:-3,width:0},mouth:[55,29],mouthWidth:4.5,
 band:[[-40,-44],[23,-59],[64,-43],[64,-28],[25,-43],[-45,-28]],bow:[-34,-35],bowClipEdge:120,bowWidth:.66,
 leftAntenna:[[13,-58],[8,-83],[-8,-115],[-21,-99]],rightAntenna:[[46,-54],[51,-79],[63,-109],[73,-95]],leftAntennaVisible:1,rightAntennaVisible:.75
};
const drawings:readonly [Drawing,Drawing,Drawing,Drawing,Drawing]=[leftProfile,leftQuarter,front,rightQuarter,rightProfile];
const blendEye=(a:Eye,b:Eye,t:number):Eye=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),width:mix(a.width,b.width,t)});
function drawingAt(yaw:number){
 const angle=clamp(yaw,-Math.PI/2,Math.PI/2);
 let a=drawings[0],b=drawings[1];
 for(let i=0;i<drawings.length-1;i++){if(angle>=drawings[i].yaw){a=drawings[i];b=drawings[i+1];}}
 const t=clamp((angle-a.yaw)/(b.yaw-a.yaw));
 return {angle,a,b,t};
}
const curveBetween=(a:readonly P[],b:readonly P[],t:number)=>curves(a.map((p,i)=>point(p,b[i],t)));
function antennaPath(a:Antenna,b:Antenna,t:number){const p=a.map((v,i)=>point(v,b[i],t));return `M${p[0].join(' ')}C${p[1].join(' ')} ${p[2].join(' ')} ${p[3].join(' ')}`;}
export function AntHead2D({yaw,eyes,joy=.35,look=0,lookY=0,mouthOpen=0,accent=0,appearance='lead'}:HeadProps){
 const id=useId(),{a,b,t,angle}=drawingAt(yaw),face=curveBetween(a.face,b.face,t),hair=curveBetween(a.hair,b.hair,t),lock=curveBetween(a.forelock,b.forelock,t),band=a.band.map((p,i)=>point(p,b.band[i],t)),bow=point(a.bow,b.bow,t),mouth=point(a.mouth,b.mouth,t),mouthWidth=mix(a.mouthWidth,b.mouthWidth,t),opening=clamp(mouthOpen),smile=clamp(joy),concern=clamp((.35-clamp(joy))/.35),mouthCurve=smile<.35?mix(-16,-1,smile/.35):mix(-1,16,(smile-.35)/.65),brow=clamp(accent),leftEye=blendEye(a.leftEye,b.leftEye,t),rightEye=blendEye(a.rightEye,b.rightEye,t);
 const eyeArt=(eye:Eye,side:'left'|'right')=>{
  const width=eye.width,open=eyes.kind==='open'?eyes.openness:0,gaze=clamp(look,-1,1)*3.8,gazeY=clamp(lookY,-1,1)*3.5;
  return <g transform={`translate(${eye.x} ${eye.y}) scale(${width} 1)`}>
   <path d={`M-14 ${-23+(side==='left'?2:-8)*concern}Q0 ${-28-4*brow-3*concern} 14 ${-23+(side==='left'?-10:1)*concern}`} fill="none" stroke={ink} strokeWidth={2.9}/>
   {eyes.kind==='open'?<g>
    <ellipse cy={1-open} rx={16.8} ry={18.8*open} fill="#fff0d4" stroke={ink} strokeWidth={2.4}/>
    <g clipPath={`url(#${id}-${side}-eye)`}><ellipse cx={gaze} cy={gazeY} rx={5.7} ry={7.6} fill="#25232a"/><ellipse cx={gaze-1.8} cy={gazeY-3} rx={1.8} ry={2.1} fill="#fffdf1"/></g>
    {appearance==='lead'&&<path d={side==='left'?`M-15 ${-6*open}Q-22 ${-6*open} -22 ${-13*open}`:`M15 ${-6*open}Q22 ${-7*open} 22 ${-14*open}`} fill="none" stroke={ink} strokeWidth={2.5}/>}
   </g>:<path d={`M-15 1Q0 ${eyes.smile>0.5?-7:3} 15 1`} fill="none" stroke={ink} strokeWidth={2.8}/>}
   {appearance==='guitarist'&&<><ellipse cy="0" rx="19.5" ry="22" fill="none" stroke="#d6b67c" strokeWidth="2.5"/><path d="M-20 -4H-26M20 -4H25" stroke="#d6b67c" strokeWidth="2.4"/></>}
  </g>;
 };
 const bandPath=`M${band[0].join(' ')}Q${band[1].join(' ')} ${band[2].join(' ')}L${band[3].join(' ')}Q${band[4].join(' ')} ${band[5].join(' ')}Z`;
 return <g data-art="ant-head-2d" data-yaw={angle} strokeLinecap="round" strokeLinejoin="round">
  <defs>
   <linearGradient id={`${id}-face`} x1="-44" y1="-50" x2="43" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#5b5152"/><stop offset=".5" stopColor="#413c40"/><stop offset="1" stopColor="#353139"/></linearGradient>
   <linearGradient id={`${id}-hair`} x1="-58" y1="-55" x2="52" y2="53" gradientUnits="userSpaceOnUse"><stop stopColor="#40373d"/><stop offset=".6" stopColor="#28262e"/><stop offset="1" stopColor="#22232a"/></linearGradient>
   <linearGradient id={`${id}-band`} x1="0" y1="-58" x2="0" y2="-25" gradientUnits="userSpaceOnUse"><stop stopColor={appearance==='drummer'?'#efbd7b':'#fff7e6'}/><stop offset="1" stopColor={appearance==='drummer'?'#d49a5e':'#e6d2ad'}/></linearGradient>
   <clipPath id={`${id}-face-clip`}><path d={face}/></clipPath>
   <clipPath id={`${id}-bow-clip`}><rect x="-120" y="-80" width={120+mix(a.bowClipEdge,b.bowClipEdge,t)} height="130"/></clipPath>
   {(['left','right'] satisfies ('left'|'right')[]).map(side=><clipPath key={side} id={`${id}-${side}-eye`}><ellipse cy={eyes.kind==='open'?1-eyes.openness:0} rx="15.5" ry={eyes.kind==='open'?17.5*eyes.openness:0}/></clipPath>)}
  </defs>
  <g fill="none">
   <g opacity={mix(a.leftAntennaVisible,b.leftAntennaVisible,t)}><path d={antennaPath(a.leftAntenna,b.leftAntenna,t)} stroke={ink} strokeWidth="6.8"/><path d={antennaPath(a.leftAntenna,b.leftAntenna,t)} stroke="#817076" strokeWidth="1.7"/></g>
   <g opacity={mix(a.rightAntennaVisible,b.rightAntennaVisible,t)}><path d={antennaPath(a.rightAntenna,b.rightAntenna,t)} stroke={ink} strokeWidth="6.8"/><path d={antennaPath(a.rightAntenna,b.rightAntenna,t)} stroke="#817076" strokeWidth="1.7"/></g>
  </g>
  <path d={hair} fill={`url(#${id}-hair)`} stroke={ink} strokeWidth="2.8"/>
  <path d={face} fill={`url(#${id}-face)`} stroke={ink} strokeWidth="2.6"/>
  <g clipPath={`url(#${id}-face-clip)`}>
   <path d={`M${band[0][0]} -36Q${-37+mix(a.mouth[0],b.mouth[0],t)*.25} -57 ${mix(a.mouth[0],b.mouth[0],t)-11} -44Q${mix(a.mouth[0],b.mouth[0],t)+9} -26 ${band[2][0]} -46L80 -80H-80Z`} fill={`url(#${id}-hair)`}/>
   <ellipse cx={leftEye.x-13} cy="22" rx={10*leftEye.width} ry="5" fill="#b87873" opacity={.33}/>
   <ellipse cx={rightEye.x+13} cy="22" rx={10*rightEye.width} ry="5" fill="#b87873" opacity={.33}/>
   {eyeArt(leftEye,'left')}{eyeArt(rightEye,'right')}
   {appearance==='guitarist'&&<path d={`M${leftEye.x+18*leftEye.width} -2Q${(leftEye.x+rightEye.x)/2} -6 ${rightEye.x-18*rightEye.width} -2`} fill="none" stroke="#d6b67c" strokeWidth="2.3"/>}
   <g transform={`translate(${mouth.join(' ')})`}>
    {opening<.08?<path d={`M${-mouthWidth} 0Q0 ${mouthCurve} ${mouthWidth} 0`} fill="none" stroke={ink} strokeWidth="2.9"/>:<>
     <path d={`M${-mouthWidth} -1Q0 ${smile*2} ${mouthWidth} -1Q${mouthWidth*.8} ${4+opening*14} 0 ${4+opening*15}Q${-mouthWidth*.8} ${4+opening*14} ${-mouthWidth} -1Z`} fill="#bf7269" stroke={ink} strokeWidth="2.2"/>
     <path d={`M${-mouthWidth*.5} ${2+opening*12}Q0 ${opening*10} ${mouthWidth*.5} ${2+opening*12}`} fill="none" stroke="#e5a28c" strokeWidth="2"/>
    </>}
   </g>
  </g>
  {appearance==='lead'&&<path d={lock} fill={`url(#${id}-hair)`} stroke={ink} strokeWidth="2.3"/>}
  {appearance==='lead'&&<path d={`M${mix(a.forelock[0][0],b.forelock[0][0],t)+8} -27Q${mix(a.forelock[0][0],b.forelock[0][0],t)-1} 7 ${mix(a.forelock[9][0],b.forelock[9][0],t)-8} 38`} fill="none" stroke="#66535d" strokeWidth="2.3" opacity=".65"/>}
  <path d={bandPath} fill={`url(#${id}-band)`} stroke={ink} strokeWidth="2.4"/>
  <path d={`M${band[0][0]+7} ${band[0][1]+2}Q${band[1][0]} ${band[1][1]+6} ${band[2][0]-7} ${band[2][1]+2}`} fill="none" stroke="#fffdf1" strokeWidth="2.3" opacity=".85"/>
  {appearance==='lead'&&<g clipPath={`url(#${id}-bow-clip)`}><g transform={`translate(${bow.join(' ')}) scale(${mix(a.bowWidth,b.bowWidth,t)} 1)`}>
   <path d="M0 -1C-12 -13 -23 -14 -23 -2Q-23 6 -5 5L-23 20Q-13 22 1 10L5 2Z" fill={`url(#${id}-band)`} stroke={ink} strokeWidth="2.1"/>
   <path d="M-5 2L-17 -3M-4 7L-16 17" stroke="#b4a285" strokeWidth="1.6" fill="none"/>
   <path d="M1 -5Q9 -5 8 3L3 9L-4 5Q-6 -3 1 -5Z" fill="#f4e6c9" stroke={ink} strokeWidth="2"/>
  </g></g>}
 </g>;
}
