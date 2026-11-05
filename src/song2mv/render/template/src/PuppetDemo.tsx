import React from "react";
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from "remotion";
import {PuppetFigure} from "./kit/puppet";
import {cleanPuppetParts} from "./kit/puppet-clean-art";
import {roundProfile} from "./kit/profile-motion";
import type {FigureAction} from "./kit/figure-motion";
const actions:FigureAction["kind"][]=["walk","phone","bass"];
export function PuppetDemo({overview=false}:{overview?:boolean}) {
 const T=useCurrentFrame()/useVideoConfig().fps,section=Math.min(2,Math.floor(T/6));
 return <AbsoluteFill style={{background:"#f5efe5"}}><svg viewBox="0 0 1920 1080" style={{fontFamily:"Arial, sans-serif"}}>
  <text x={80} y={80} fontSize={22} fill="#718679" letterSpacing={4} fontWeight={700}>SONG2MV / REUSABLE ARTWORK TEMPLATE</text>
  <text x={80} y={146} fontSize={49} fill="#2d3c3b" fontWeight={700}>{overview?"Artwork, proportions and movement are separate.":["01 / WALK","02 / CHECK PHONE","03 / PLAY BASS"][section]}</text>
  <text x={82} y={196} fontSize={25} fill="#77817b">Swap artwork parts. Keep shared joints, prop anchors and depth order.</text>
  {(overview?actions:[actions[section]]).map((kind,i)=>{
   const x=overview?65+i*625:140;
   return <g key={kind}>
    <rect x={x} y={242} width={overview?590:1640} height={716} rx={32} fill="#e3e9df"/>
    <text x={x+30} y={293} fontSize={24} fontWeight={700} fill="#5d7366">{kind.toUpperCase()}</text>
    <path d={`M${x+28} 900H${x+(overview?562:1600)}`} stroke="#b0bca9" strokeWidth={2}/>
    <PuppetFigure parts={cleanPuppetParts} action={{kind,time:overview?(kind==="phone"?2.4:1.15):T-section*6,bpm:112}} profile={roundProfile} x={x+(overview?230:650)} y={900} scale={overview?1.45:1.6}/>
   </g>;
  })}
  <text x={80} y={1038} fontSize={22} fill="#77817b">Clean vector starter / original artwork slots / elapsed-time motion / no song required</text>
 </svg></AbsoluteFill>;
}
