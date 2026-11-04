import React,{useId} from 'react';
import type {ViewPose,Point,Frame,Instrument,Acting,HeadProps,BodyProps} from './types';
import {AntHead2D} from './AntHead2D';
import {AntBodyViews} from './AntBodyViews';
import {AntAbdomen} from './AntArt';
type XY={x:number;y:number};
const ink='#302730';
const sub=(a:XY,b:XY)=>({x:a.x-b.x,y:a.y-b.y});
const add=(a:XY,b:XY)=>({x:a.x+b.x,y:a.y+b.y});
const mul=(a:XY,n:number)=>({x:a.x*n,y:a.y*n});
const length=(a:XY)=>Math.hypot(a.x,a.y);
const normal=(a:XY)=>{const d=length(a);return {x:-a.y/d,y:a.x/d};};
const pt=(p:XY)=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
const curve=(p:Point[])=>`M${pt(p[0])}Q${pt(p[1])} ${pt(p[2])}`;
const polyline=(p:Point[])=>p.map((v,i)=>`${i?'L':'M'}${pt(v)}`).join('');
function matrix(f:Frame,x:number,y:number){return `matrix(${(f.x.x-f.o.x)*x} ${(f.x.y-f.o.y)*x} ${(f.y.x-f.o.x)*y} ${(f.y.y-f.o.y)*y} ${f.o.x} ${f.o.y})`;}
function billboard(f:Frame,unit:number){const v=sub(f.y,f.o),scale=length(v)*unit,angle=Math.atan2(v.x,-v.y)*180/Math.PI;return `translate(${f.o.x} ${f.o.y}) rotate(${angle}) scale(${scale})`;}
function clothPath(points:Point[],width:number[]){
 const[a,b,c]=points,n0=normal(sub(b,a)),n1=normal(sub(c,b)),n=normal(sub(c,a)),sides=(sign:number)=>[add(a,mul(n0,sign*width[0])),add(b,mul(n,sign*width[1])),add(c,mul(n1,sign*width[2]))];
 const[l0,l1,l2]=sides(1),[r0,r1,r2]=sides(-1),cut=(p:XY,q:XY)=>add(mul(p,.77),mul(q,.23));
 return `M${pt(l0)}Q${pt(add(mul(a,.4),add(mul(b,.6),mul(n0,width[1]))))} ${pt(cut(l1,l0))}Q${pt(l1)} ${pt(cut(l1,l2))}L${pt(l2)}Q${pt(add(c,mul(sub(c,b),.09)))} ${pt(r2)}L${pt(cut(r1,r2))}Q${pt(r1)} ${pt(cut(r1,r0))}Q${pt(add(mul(a,.4),add(mul(b,.6),mul(n0,-width[1]))))} ${pt(r0)}Q${pt(add(a,mul(sub(a,b),.08)))} ${pt(l0)}Z`;
}
function Mask({points,radius,children}:{points:Point[];radius:number;children:React.ReactNode}){
 const id=useId();return <g><defs><clipPath id={id}>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={radius}/>)}</clipPath></defs><g clipPath={`url(#${id})`}>{children}</g></g>;
}
function capsule(a:XY,b:XY,ra:number,rb:number){const n=normal(sub(b,a)),al=add(a,mul(n,ra)),bl=add(b,mul(n,rb)),ar=add(a,mul(n,-ra)),br=add(b,mul(n,-rb));return `M${pt(al)}L${pt(bl)}A${rb} ${rb} 0 0 0 ${pt(br)}L${pt(ar)}A${ra} ${ra} 0 0 0 ${pt(al)}Z`;}
export function Cloth({points,scale,leg=false}:{points:Point[];scale:number;leg?:boolean}){
 const id=useId(),w=(leg?[.155,.145,.072]:[.105,.115,.066]).map(v=>v*scale),shape=clothPath(points,w),[a,b,c]=points,n=normal(sub(c,a));
 if(!leg){const outer=[capsule(a,b,w[0]+1.2,w[1]+1.2),capsule(b,c,w[1]+1.2,w[2]+1.2)],inner=[capsule(a,b,w[0],w[1]),capsule(b,c,w[1],w[2])],left=Math.min(a.x,b.x,c.x)-Math.max(...w),right=Math.max(a.x,b.x,c.x)+Math.max(...w),top=Math.min(a.y,b.y,c.y)-Math.max(...w),bottom=Math.max(a.y,b.y,c.y)+Math.max(...w);return <g strokeLinecap="round"><defs><linearGradient id={`${id}-sleeve`} gradientUnits="userSpaceOnUse" x1={left} y1={top} x2={right} y2={bottom}><stop stopColor="#fff4dc"/><stop offset=".7" stopColor="#edd9b5"/><stop offset="1" stopColor="#ceb08a"/></linearGradient><clipPath id={`${id}-united`}>{inner.map((d,i)=><path key={i} d={d}/>)}</clipPath></defs>{outer.map((d,i)=><path key={i} d={d} fill={ink}/>)}{inner.map((d,i)=><path key={i} d={d} fill={`url(#${id}-sleeve)`}/>)}<g clipPath={`url(#${id}-united)`} fill="none"><path d={`M${pt(add(a,mul(n,-w[0]*.4)))}L${pt(add(b,mul(n,-w[1]*.45)))}L${pt(add(c,mul(n,-w[2]*.2)))}`} stroke="#fff9e9" strokeWidth={2.5} opacity={.8}/><path d={`M${pt(add(b,mul(n,w[1]*.5)))}l${-n.x*w[1]*.5} ${-n.y*w[1]*.5}`} stroke="#b79670" strokeWidth={1.5}/></g></g>;}

 return <g strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff4dc"/><stop offset=".7" stopColor="#edd9b5"/><stop offset="1" stopColor="#ceb08a"/></linearGradient><clipPath id={`${id}-clip`}><path d={shape}/></clipPath></defs><path d={shape} fill={`url(#${id}-cloth)`} stroke={ink} strokeWidth={2.3}/><g clipPath={`url(#${id}-clip)`} fill="none"><path d={`M${pt(add(a,mul(n,-w[0]*.4)))}Q${pt(add(b,mul(n,-w[1]*.65)))} ${pt(add(c,mul(n,-w[2]*.2)))}`} stroke="#fff9e9" strokeWidth={3} opacity={.85}/><path d={`M${pt(add(b,mul(n,w[1]*.64)))}l${-n.x*w[1]*.6} ${-n.y*w[1]*.6}`} stroke="#b79670" strokeWidth={1.7}/></g></g>;
}
function Shoe({leg}:{leg:ViewPose['legs'][number]}){
 const id=useId(),p=leg.shoe,shape=p.map((v,i)=>`${i?'L':'M'}${v[0]} ${v[1]}`).join('')+'Z';
 return <g><defs><linearGradient id={`${id}-gold`} x2="0" y2="1"><stop stopColor="#e8c98f"/><stop offset="1" stopColor="#b98c50"/></linearGradient><clipPath id={`${id}-clip`}><path d={shape}/></clipPath></defs><path d={shape} fill={`url(#${id}-gold)`} stroke={ink} strokeWidth={2.1} strokeLinejoin="round"/><g clipPath={`url(#${id}-clip)`} stroke="#fae3b6" strokeWidth={1.4}>{leg.weave.map((line,i)=><path key={i} d={polyline(line)}/>)}</g></g>;
}
export function Hand({frame,side,scale,pointing=false}:{frame:Frame;side:number;scale:number;pointing?:boolean}){
 const y=sub(frame.y,frame.o),len=length(y),dx=y.x/len,dy=y.y/len,projectedWidth=Math.abs((frame.x.x-frame.o.x)*dy-(frame.x.y-frame.o.y)*dx),width=Math.max(scale*.65,projectedWidth)*.0085,height=Math.max(scale*.55,len)*.0085,transform=`matrix(${dy*width} ${-dx*width} ${dx*height} ${dy*height} ${frame.o.x} ${frame.o.y})`;
 return <g transform={transform}><g transform={`scale(${side===0?1:-1} 1)`} fill="#484047" stroke={ink} strokeWidth={2.0} strokeLinejoin="round" strokeLinecap="round"><path d={pointing?'M-6 0Q-11 3 -9 11L-7 19Q-4 22 0 19L1 8L2 30Q3 34 6 32L7 8Q13 5 10 1L3 -2Q-2 -5 -6 0Z':'M-6 0Q-11 3 -9 11L-7 18Q-5 22 -2 20Q1 23 4 20Q8 22 10 16L11 6Q11 3 6 2L4 -2Q0 -4 -2 0Z'}/><path d="M-5 8L-4 15M0 8L0 16M5 7L5 14" stroke="#28242b" fill="none" strokeWidth={1.4}/><path d="M-6 3Q-9 8 -6 13" stroke="#827078" fill="none" strokeWidth={1.2}/></g></g>;
}
function Fingers({instrument,frontOnly,scale}:{instrument:Instrument;frontOnly:boolean;scale:number}){
 return <g strokeLinecap="round" fill="none">{instrument.fingers.map((f,i)=>{
  const path=curve(f.points),content=<g><path d={path} stroke={ink} strokeWidth={f.radius*scale*2+1.6}/><path d={path} stroke="#4b4148" strokeWidth={f.radius*scale*2}/><path d={path} stroke="#8c7780" strokeWidth={.9} opacity={.7}/></g>;
  return frontOnly?<Mask key={i} points={f.front} radius={f.radius*scale*1.65+2}>{content}</Mask>:<g key={i}>{content}</g>;
 })}</g>;
}
function Palms({instrument,scale}:{instrument:Instrument;scale:number}){return <g>{instrument.palms.map((p,i)=><g key={i}><path d={`M${pt(p.wrist)}L${pt(p.frame.o)}`} stroke={ink} strokeWidth={scale*.072+1.6} strokeLinecap="round"/><path d={`M${pt(p.wrist)}L${pt(p.frame.o)}`} stroke="#4b4148" strokeWidth={scale*.072} strokeLinecap="round"/><g transform={matrix(p.frame,1,1)}><ellipse rx={p.rx} ry={p.ry} fill="#4b4148" stroke={ink} strokeWidth={.009}/></g></g>)}</g>;}
function Bass({instrument}:{instrument:Instrument}){
 const id=useId();const paint=(name:string)=>name==='teal'?`url(#${id}-teal)`:name==='cream'?`url(#${id}-cream)`:name==='wood'?'#a4774e':name==='board'?'#694832':name==='metal'?'#d3cbb1':'#293a3a';
 return <g strokeLinejoin="round"><defs><linearGradient id={`${id}-teal`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={instrument.kind==='guitar'?'#efbc76':'#77c7b6'}/><stop offset=".55" stopColor={instrument.kind==='guitar'?'#ca7b48':'#42988b'}/><stop offset="1" stopColor={instrument.kind==='guitar'?'#8d4939':'#256d69'}/></linearGradient><linearGradient id={`${id}-cream`} x2=".7" y2="1"><stop stopColor="#fff2cf"/><stop offset="1" stopColor="#dfcd9f"/></linearGradient></defs>
 {instrument.parts.map((p,i)=><path key={i} d={p.path} fill={paint(p.paint)} stroke={ink} strokeWidth={p.name==='bass-body'?2.5:1.25}/>)}
 {instrument.lines.map((line,i)=><path key={i} d={polyline(line.points)} fill="none" stroke={line.paint==='string'?'#fff5d7':'#c7b99b'} strokeWidth={line.paint==='string'?1.15:.9}/>)}</g>;
}
export function Stage({lines}:{lines:Point[][]}){return <g><path d="M0 352H760V770H0Z" fill="#eae4d6" opacity={.25}/><g stroke="#d8cebc" strokeWidth={1} opacity={.6}>{lines.map((line,i)=><path key={i} d={polyline(line)}/>)}</g></g>;}
export function Character({pose,time,acting,appearance='lead',prop,hiddenHands=[],pointingHand=-1,headScale,Head=AntHead2D,Body=AntBodyViews}:{pose:ViewPose;time:number;acting:Acting;appearance?:'lead'|'guitarist'|'drummer';prop?:React.ReactNode;hiddenHands?:readonly number[];pointingHand?:number;headScale:number;Head?:React.ComponentType<HeadProps>;Body?:React.ComponentType<BodyProps>}){
 const scale=length(sub(pose.body.frame.y,pose.body.frame.o)),playing=pose.instrument.kind!=='none'?pose.instrument:null,armOrder=[0,1].sort((a,b)=>pose.arms[b].points[1].depth-pose.arms[a].points[1].depth),legOrder=[0,1].sort((a,b)=>pose.legs[b].points[1].depth-pose.legs[a].points[1].depth),pelvisWidth=Math.hypot(27*Math.cos(pose.body.yaw),20*Math.sin(pose.body.yaw));
 const sleeve=(i:number)=><Cloth points={pose.arms[i].points} scale={scale}/>;
 return <g>
  <ellipse cx={pose.shadow.x} cy={pose.shadow.y+3} rx={scale*.31} ry={scale*.045} fill="#6f5d4a" opacity={.12}/>
  {playing&&<path d={polyline(playing.strapBack)} fill="none" stroke="#352b32" strokeWidth={scale*.044} strokeLinecap="round"/>}
  <g transform={billboard(pose.abdomen,.0057)}><AntAbdomen/></g>
  {armOrder.map(i=><g key={i}>{sleeve(i)}{!playing&&!hiddenHands.includes(i)&&<Hand frame={pose.arms[i].hand} side={i} scale={scale} pointing={pointingHand===i}/>}</g>)}
  <g transform={billboard(pose.pelvis,.01)}><path d={`M${-pelvisWidth} -15Q0 -22 ${pelvisWidth} -15L${pelvisWidth} 17Q14 35 0 31Q-14 35 ${-pelvisWidth} 17Z`} fill="#edd9b5" stroke="none"/></g>
  {legOrder.map(i=><g key={i}><Cloth points={pose.legs[i].points} scale={scale} leg/><Shoe leg={pose.legs[i]}/></g>)}
  <g transform={billboard(pose.body.frame,.01)}><Body yaw={pose.body.yaw} appearance={appearance}/></g>
  {armOrder.map(i=>pose.arms[i].layerFront?<g key={i}>{sleeve(i)}</g>:null)}
  {prop}
  {!playing&&armOrder.map(i=>pose.arms[i].handFront&&!hiddenHands.includes(i)?<Hand key={i} frame={pose.arms[i].hand} side={i} scale={scale} pointing={pointingHand===i}/>:null)}
  {playing&&<>
   <path d={polyline(playing.strapFront)} fill="none" stroke="#352b32" strokeWidth={scale*.044} strokeLinecap="round"/>
   <Fingers instrument={playing} frontOnly={false} scale={scale}/>
   <Bass instrument={playing}/>
   {armOrder.map(i=><Mask key={i} points={pose.arms[i].frontBass} radius={scale*.16}>{sleeve(i)}</Mask>)}
   <Palms instrument={playing} scale={scale}/><Fingers instrument={playing} frontOnly scale={scale}/>
  </>}
  <g transform={`translate(${pose.head.frame.o.x} ${pose.head.frame.o.y}) rotate(${Math.atan2(pose.head.frame.y.x-pose.head.frame.o.x,pose.head.frame.o.y-pose.head.frame.y.y)*180/Math.PI}) scale(${headScale})`}><Head yaw={pose.head.yaw} time={time} joy={acting.joy} look={acting.look} lookY={acting.lookY} mouthOpen={acting.mouthOpen} accent={acting.accent} eyes={acting.eyes} appearance={appearance}/></g>
 </g>;
}
