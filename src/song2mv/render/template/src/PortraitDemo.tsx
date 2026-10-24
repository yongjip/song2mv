import React from "react";
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from "remotion";
import {PortraitInteraction, portraitHeadTransform} from "./kit";

const profiles = [
  {neck:[0,-235] as const,ear:[51,-326.5] as const,temple:[40,-345] as const},
  {neck:[0,-235] as const,ear:[67.6,-314.5] as const,temple:[53,-353] as const},
];
const actions = ["phone", "write", "head-touch"] as const;

function Head({wide, down = 0}: {wide:boolean; down?:number}) {
  const profile=profiles[wide?1:0], rx=wide?68:54;
  return <>
    <path d="M-16 -249H16V-227H-16Z" fill="#eac09f"/>
    <ellipse cy={-315} rx={rx} ry={85} fill="#eac09f"/>
    <ellipse cx={profile.ear[0]} cy={profile.ear[1]} rx={9} ry={13} fill="#eac09f"/>
    <path d={`M${-rx} -320Q-80 -414 0 -415Q80 -413 ${rx} -320L40 -361Q0 -340 -40 -361Z`} fill={wide?"#42392f":"#282b35"}/>
    {[-20,20].map(x=><g key={x}>
      <ellipse cx={x} cy={-321} rx={9} ry={6} fill="#fffbf0"/>
      <circle cx={x} cy={-321+down*3} r={3.2} fill="#252934"/>
    </g>)}
    <path d="M-15 -283Q0 -271 15 -283" fill="none" stroke="#a46758" strokeWidth={3} strokeLinecap="round"/>
  </>;
}

export function PortraitDemo() {
  const frame=useCurrentFrame(), {fps}=useVideoConfig(), T=frame/fps;
  const progress=Math.max(0,Math.min(1,(T-1.7)/3.8));
  return <AbsoluteFill style={{background:"#efe9dc",fontFamily:"system-ui,sans-serif"}}>
    <svg width={1920} height={1080} viewBox="0 0 1920 1080">
      <text x={60} y={70} fontSize={40} fontWeight={900} fill="#182839">REUSABLE SVG BODY + ACTION ASSETS</text>
      <text x={60} y={114} fontSize={24} fill="#6c706d">Same component · two head profiles · different colors and scales</text>
      <path d="M640 150V1040M1280 150V1040" stroke="#d4cbbb" strokeWidth={2}/>
      {actions.map((action,column)=><g key={action}>
        <text x={320+640*column} y={165} textAnchor="middle" fontSize={27} fontWeight={800} fill="#245c88">{action.toUpperCase()}</text>
        {profiles.map((profile,row)=><g key={row}>
          <path d={`M${100+640*column} ${row?1040:560}H${540+640*column}`} stroke="#bdb4a5" strokeWidth={2}/>
          <PortraitInteraction action={action} profile={profile} time={T-.7} progress={progress}
            x={320+640*column} y={row?1040:560} s={row?1.04:.88}
            look={{color:row?"#66846e":"#245c88"}}
            renderHead={(angle,pitch)=><g transform={portraitHeadTransform({neck:profile.neck,angle,pitch})}>
              <Head wide={row===1} down={pitch/16}/>
            </g>}/>
          <text x={90+640*column} y={row?660:240} fontSize={20} fill="#737268">{row?"B · 1.04×":"A · 0.88×"}</text>
        </g>)}
      </g>)}
    </svg>
  </AbsoluteFill>;
}
