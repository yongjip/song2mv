import React from "react";
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from "remotion";
import {ProfileFigure} from "./kit/profile-figure";
import {figureProfiles} from "./kit/profile-motion";
import type {FigureAction} from "./kit/figure-motion";

const names=["A / PEBBLE","B / ROUND","C / CAPSULE"];
const subtitles=["Large head · compact legs","Balanced head · rounded torso","Small head · longer legs"];
const actions:FigureAction["kind"][]=["walk","phone","bass"];
export function FigureComparison({overview=false}:{overview?:boolean}) {
  const T=useCurrentFrame()/useVideoConfig().fps,section=Math.min(2,Math.floor(T/6)),time=T-section*6;
  return <AbsoluteFill style={{background:"#f5f1e9"}}><svg viewBox="0 0 1920 1080" style={{fontFamily:"Arial, sans-serif"}}>
    <text x={70} y={75} fontSize={21} letterSpacing={4} fill="#567a73" fontWeight={700}>SONG2MV / FIGURE COMPARISON</text>
    <text x={70} y={139} fontSize={47} fill="#243c40" fontWeight={700}>{overview?"Three proportions. The same three actions.":["01 / WALK","02 / CHECK PHONE","03 / PLAY BASS"][section]}</text>
    <text x={72} y={185} fontSize={25} fill="#657675">Same height, palette, timing and prop size. Walk: 30 units/s. Bass: 112 BPM.</text>
    {figureProfiles.map((profile,i)=>{
      const x=55+i*625;
      return <g key={profile.id}>
        <rect x={x} y={222} width={600} height={770} rx={27} fill="#e7e8df"/>
        <text x={x+30} y={271} fill="#304b4c" fontSize={27} fontWeight={700}>{names[i]}</text>
        <text x={x+30} y={307} fill="#687b77" fontSize={21}>{subtitles[i]}</text>
        {overview?actions.map((kind,j)=><g key={kind}>
          <text x={x+25} y={376+j*207} fill="#6c7f78" fontSize={18}>{kind.toUpperCase()}</text>
          <path d={`M${x+150} ${511+j*207}H${x+555}`} stroke="#b0bfb2" strokeWidth={2}/>
          <ProfileFigure profile={profile} action={{kind,time:kind==="phone"?2.4:1.1}} x={x+295} y={511+j*207} scale={.52}/>
        </g>):<>
          <path d={`M${x+26} 910H${x+574}`} stroke="#aabdae" strokeWidth={2}/>
          {[0,1,2,3,4].map(j=><path key={j} d={`M${x+55+j*115} 910v10`} stroke="#aabdae" strokeWidth={2}/>)}
          <ProfileFigure profile={profile} action={{kind:actions[section],time}} x={x+(section===0?128:270)} y={910} scale={1.45}/>
        </>}
      </g>;
    })}
    <text x={70} y={1042} fontSize={21} fill="#657675">{overview?"Neutral silhouettes / compare pose clarity and reuse, not costume":"Independent action studies • cuts at 6s and 12s • no music"}</text>
    {!overview&&<text x={1845} y={1042} textAnchor="end" fontSize={21} fill="#657675">{T.toFixed(1)}s / 18s</text>}
  </svg></AbsoluteFill>;
}
