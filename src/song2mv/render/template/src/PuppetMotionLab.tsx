import React from "react";
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from "remotion";
import {PuppetFigure} from "./kit/puppet";
import {cleanPuppetParts} from "./kit/puppet-clean-art";
import type {JointExercise,PuppetDance} from "./kit/puppet-motion";
const exercises:JointExercise[]=["arm-raise","hands-together","squat","balance","weight-shift"];
const names=["RAISE ARMS","PALMS TOGETHER","SHALLOW SQUAT","ONE-FOOT BALANCE","SHIFT WEIGHT"];
const dances:PuppetDance[]=["bounce","step-touch","funk"];
const danceNames=["BOUNCE","STEP-TOUCH","FUNK GROOVE"];
const danceNotes=["Planted feet / bend and release","Half-time / step, land, transfer, touch","Lower-body pulse / delayed shoulders"];
export function PuppetMotionLab({gallery=false}:{gallery?:boolean}) {
 const T=useCurrentFrame()/useVideoConfig().fps;
 const dance=T>=8;
 return <AbsoluteFill style={{background:"#f5f0e7"}}><svg viewBox="0 0 1920 1080" style={{fontFamily:"Arial, sans-serif"}}>
  <text x={65} y={75} fontSize={22} letterSpacing={4} fontWeight={700} fill="#748578">SONG2MV / REUSABLE MOTION LAB</text>
  <text x={65} y={140} fontSize={48} fontWeight={700} fill="#2a3d3b">{gallery?"Joint exercises + three dance patterns":dance?"02 / DANCE PATTERNS":"01 / JOINT & BALANCE EXERCISES"}</text>
  <text x={68} y={190} fontSize={25} fill="#77827b">{dance&&!gallery?"Same figure, same 112 BPM. Watch the feet, weight shift and shoulder timing.":"Fixed bone lengths. Grounded shoes. Separate palm contacts. Shared artwork."}</text>
  {gallery?<>
   {exercises.map((exercise,i)=><g key={exercise}>
    <rect x={35+i*375} y={235} width={350} height={367} rx={22} fill="#e4e9df"/>
    <text x={55+i*375} y={273} fontSize={17} fontWeight={700} fill="#587363">{names[i]}</text>
    <path d={`M${55+i*375} 571H${365+i*375}`} stroke="#a9b9a9" strokeWidth={2}/>
    <PuppetFigure parts={cleanPuppetParts} action={{kind:"pose",exercise,time:1.8,duration:4}} x={195+i*375} y={571} scale={.76}/>
   </g>)}
   {dances.map((style,i)=><g key={style}>
    <rect x={35+i*625} y={627} width={600} height={363} rx={22} fill="#e9e3d8"/>
    <text x={55+i*625} y={665} fontSize={19} fontWeight={700} fill="#587363">{danceNames[i]}</text>
    <path d={`M${55+i*625} 962H${615+i*625}`} stroke="#a9b9a9" strokeWidth={2}/>
    <PuppetFigure parts={cleanPuppetParts} action={{kind:"dance",style,time:1.4,bpm:112}} x={325+i*625} y={962} scale={.8}/>
   </g>)}
  </>:dance?dances.map((style,i)=><g key={style}>
   <rect x={35+i*625} y={235} width={600} height={730} rx={30} fill="#e4e9df"/>
   <text x={65+i*625} y={285} fontSize={27} fontWeight={700} fill="#587363">{danceNames[i]}</text>
   <text x={65+i*625} y={325} fontSize={20} fill="#77827b">{danceNotes[i]}</text>
   <path d={`M${65+i*625} 909H${605+i*625}`} stroke="#a9b9a9" strokeWidth={2}/>
   <PuppetFigure parts={cleanPuppetParts} action={{kind:"dance",style,time:T-8,bpm:112,cycles:style==="step-touch"?2:4}} x={335+i*625} y={909} scale={1.48}/>
  </g>):exercises.map((exercise,i)=><g key={exercise}>
   <rect x={24+i*380} y={235} width={366} height={730} rx={26} fill="#e4e9df"/>
   <text x={43+i*380} y={285} fontSize={20} fontWeight={700} fill="#587363">{names[i]}</text>
   <path d={`M${44+i*380} 909H${370+i*380}`} stroke="#a9b9a9" strokeWidth={2}/>
   <PuppetFigure showRig={T>=4} parts={cleanPuppetParts} action={{kind:"pose",exercise,time:T%4,duration:4}} x={203+i*380} y={909} scale={1.35}/>
  </g>)}
  <text x={65} y={1038} fontSize={22} fill="#77827b">{gallery?"Authored motion presets / template study / no music":"0–4s: exercises • 4–8s: joint overlay • 8–16.6s: dance • 16.6–20s: settle"}</text>
 </svg></AbsoluteFill>;
}
