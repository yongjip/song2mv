import React from "react";
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from "remotion";
import {Figure, minimalFigure, donghakAntFigure} from "./kit/figure";
import type {FigureAction} from "./kit/figure-motion";

const ink = "#273b40";
const actions: FigureAction["kind"][] = ["walk", "phone", "bass"];
const titles = ["01 / WALK", "02 / CHECK PHONE", "03 / PLAY BASS"];
const notes = ["Planted feet. Real travel. A shared gait.", "Raise, look, touch, lower. One continuous grip.", "Four strings. Two hands. One instrument space."];

export function FigureDemo({overview = false}: {overview?: boolean}) {
  const {fps} = useVideoConfig(), T = useCurrentFrame() / fps;
  const section = Math.min(2, Math.floor(T / 6)), time = T - section * 6;
  return <AbsoluteFill style={{background: "#f4f0e7"}}>
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{fontFamily: "Arial, sans-serif"}}>
      <text x={88} y={80} fill="#55817a" fontSize={22} letterSpacing={4} fontWeight={700}>SONG2MV / MOTION STUDY 01</text>
      <text x={88} y={145} fill={ink} fontSize={52} fontWeight={700}>{overview ? "One figure. Two identities. Three actions." : titles[section]}</text>
      <text x={90} y={191} fill="#687778" fontSize={26}>{overview ? "Minimal rig + Donghak ant / shared joints and prop anchors" : notes[section]}</text>
      {overview ? actions.map((kind,column) => [minimalFigure,donghakAntFigure].map((look,row) => {
        const x=70+column*600, y=235+row*397;
        return <g key={`${kind}-${look.kind}`}>
          <rect x={x} y={y} width={574} height={375} rx={24} fill={row===0?"#e9e8df":"#e8e2d8"}/>
          <text x={x+24} y={y+37} fontSize={21} fill="#526b6b">{kind.toUpperCase()} / {row===0?"MINIMAL":"DONGHAK ANT"}</text>
          <path d={`M${x+35} ${y+335}H${x+535}`} stroke="#c1c7bb" strokeWidth={2}/>
          <Figure action={{kind,time:kind==="phone"?2.4:1.1}} look={look} x={x+235} y={y+335} scale={0.77}/>
        </g>;
      })) : [minimalFigure,donghakAntFigure].map((look,i) => {
        const x=70+i*905;
        return <g key={look.kind}>
          <rect x={x} y={235} width={875} height={730} rx={32} fill={i===0?"#e9e8df":"#e8e2d8"}/>
          <text x={x+35} y={291} fontSize={25} fontWeight={700} fill="#526b6b">{i===0?"MINIMAL FIGURE":"DONGHAK ANT"}</text>
          <path d={`M${x+34} 890H${x+841}`} stroke="#b1beb4" strokeWidth={3}/>
          {[0,1,2,3,4,5,6].map(j => <path key={j} d={`M${x+65+j*115} 890v10`} stroke="#b1beb4" strokeWidth={2}/>)}
          <Figure action={{kind:actions[section],time}} look={look} x={x+(section===0?245:385)} y={890} scale={1.5}/>
        </g>;
      })}
      <text x={90} y={1037} fontSize={22} fill="#687778">{overview ? "Reusable SVG assets / deterministic time / no external artwork" : "Same action state in both panels • shot changes separate the three demonstrations"}</text>
      {!overview && <text x={1828} y={1037} textAnchor="end" fontSize={22} fill="#687778">{T.toFixed(1)}s / 18.0s</text>}
    </svg>
  </AbsoluteFill>;
}
