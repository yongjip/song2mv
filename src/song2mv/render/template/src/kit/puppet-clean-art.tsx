import React, {useId} from "react";
import type {PuppetHeadProps, PuppetParts, PuppetSegmentProps, PuppetHandProps} from "./puppet";
import type {FigureProfile,ProfileBodyPose} from "./profile-motion";

const ink="#263b3c";
const clamp=(value:number,low=0,high=1)=>Math.max(low,Math.min(high,value));

function Head({profile,pose,look,blink,joy}:PuppetHeadProps) {
  const id=useId(),open=clamp(blink),smile=clamp(joy),turn=pose.headTurn,gaze=clamp(look,-1,1)*3.3;
  const shift=turn*8;
  const face="M-44 -25C-41 -46 -17 -51 9 -49C40 -47 50 -28 47 3C45 30 30 48 4 50C-20 50 -41 35 -46 8C-50 -7 -49 -15 -44 -25Z";
  return <g transform={`scale(${profile.head.rx/50} ${profile.head.ry/50})`} data-art="clean-head" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id={`${id}-skin`} x1="-36" y1="-39" x2="36" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe4bb"/><stop offset=".6" stopColor="#edc29d"/><stop offset="1" stopColor="#d9a987"/></linearGradient>
      <linearGradient id={`${id}-hair`} x1="-39" y1="-49" x2="29" y2="-9" gradientUnits="userSpaceOnUse"><stop stopColor="#56605a"/><stop offset=".5" stopColor="#344743"/><stop offset="1" stopColor="#243b3b"/></linearGradient>
      <clipPath id={`${id}-face-clip`}><path d={face}/></clipPath>
    </defs>
    <path d={face} fill={`url(#${id}-skin)`} stroke={ink} strokeWidth={2.2}/>
    <g clipPath={`url(#${id}-face-clip)`}>
      <path d="M-51 18Q-32 51 7 47Q32 43 47 20L54 59H-55Z" fill="#ae7d67" opacity={.12}/>
      <ellipse cx={shift-26} cy={19} rx={9} ry={5} fill="#dc8f7c" opacity={.25}/>
      <ellipse cx={shift+29} cy={19} rx={9} ry={5} fill="#dc8f7c" opacity={.25}/>
    </g>
    <path d="M-47 -2Q-55 -33 -31 -47Q-16 -56 -4 -53Q11 -66 18 -51Q42 -51 48 -30Q40 -15 24 -17Q8 -13 -4 -23Q-15 -9 -33 -15L-39 2Z" fill={`url(#${id}-hair)`} stroke={ink} strokeWidth={2.3}/>
    <path d="M-34 -34Q-20 -48 -4 -41M1 -44Q16 -49 30 -38" fill="none" stroke="#829083" strokeWidth={2.1} opacity={.68}/>
    <path d="M-34 -16L-35 -3Q-37 3 -41 2L-44 -12" fill="#344743"/>
    <ellipse cx={-46+turn*6} cy={9} rx={6.5} ry={9} fill="#edc19b" stroke={ink} strokeWidth={1.8}/>
    <path d={`M${-47+turn*6} 5q5 -2 4 5`} fill="none" stroke="#bd886f" strokeWidth={1.4}/>
    {[-1,1].map(side=><g key={side} transform={`translate(${shift+side*(16-turn*3)} 4)`}>
      <path d={`M-8 -13Q0 ${-17-smile*2} 8 -13`} fill="none" stroke={ink} strokeWidth={2.3}/>
      <g transform={`scale(1 ${Math.max(.025,open)})`} opacity={clamp(open*5)}>
        <ellipse rx={8.4} ry={10} fill="#fff8e4"/>
        <ellipse cx={gaze} cy={1} rx={3.4} ry={5.4} fill={ink}/>
        <circle cx={gaze-1.1} cy={-1.1} r={1.2} fill="#fffdf0"/>
      </g>
      <path d="M-7 1Q0 6 7 0" fill="none" stroke={ink} strokeWidth={2} opacity={1-open}/>
    </g>)}
    <path d={`M${shift+5} 12q6 5 0 7`} fill="none" stroke="#bd886f" strokeWidth={1.5}/>
    <path d={`M${shift-8} 29Q${shift} ${33-smile*2} ${shift+10} 27Q${shift+9} ${30+smile*13} ${shift} ${32+smile*12}Q${shift-7} ${32+smile*11} ${shift-8} 29Z`} fill={smile>.2?"#b9655d":"#7e5b51"} stroke={ink} strokeWidth={1.8}/>
    {smile>.4&&<path d={`M${shift-3} ${34+smile*6}q4 -3 8 -1`} fill="none" stroke="#e9a18a" strokeWidth={2.2}/>}
  </g>;
}

function Torso({profile,pose}:{profile:FigureProfile;pose:ProfileBodyPose}) {
  const id=useId(),factor=pose.facing==="three-quarter"?.62:1,shoulder={...profile.shoulder,half:profile.shoulder.half*factor},hip=profile.hip,w=profile.torsoWidth*(pose.facing==="three-quarter"?.74:1);
  const top=shoulder.y-8,bottom=hip.y+4;
  const shape=`M${-shoulder.half} ${top}Q0 ${top-10} ${shoulder.half} ${top}Q${w+5} ${top+20} ${w} ${bottom-9}Q0 ${bottom+8} ${-w} ${bottom-9}Q${-w-5} ${top+20} ${-shoulder.half} ${top}Z`;
  return <g data-art="clean-torso" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id={`${id}-shirt`} x1={-w} y1={top} x2={w} y2={bottom} gradientUnits="userSpaceOnUse"><stop stopColor="#94b3a1"/><stop offset=".5" stopColor="#668f7f"/><stop offset="1" stopColor="#436d64"/></linearGradient>
      <clipPath id={`${id}-shirt-clip`}><path d={shape}/></clipPath>
    </defs>
    <path d={`M-10 ${profile.head.cy+profile.head.ry-5}H10V${top+15}H-10Z`} fill="#e9bc96" stroke={ink} strokeWidth={1.8}/>
    <path d={shape} fill={`url(#${id}-shirt)`} stroke={ink} strokeWidth={2.3}/>
    <g clipPath={`url(#${id}-shirt-clip)`}>
      <path d={`M-15 ${top-2}Q0 ${top+11} 15 ${top-2}L10 ${top+40}H-9Z`} fill="#fff1d5"/>
      <path d={`M-16 ${top-2}L-27 ${top+9}L-11 ${top+29}L-1 ${top+13}ZM16 ${top-2}L27 ${top+9}L10 ${top+29}L0 ${top+13}Z`} fill="#7fa18f" stroke="#3b655d" strokeWidth={1.6}/>
      <path d={`M-1 ${top+18}V${bottom+5}`} stroke="#345950" strokeWidth={2}/>
      <path d={`M4 ${top+24}V${bottom-5}`} stroke="#b5c8ad" strokeWidth={1.1} opacity={.6}/>
      <path d={`M${w*.32} ${top+39}h${w*.5}l-1 20q${-w*.25} 7 ${-w*.47} 0Z`} fill="#5b8475" stroke="#365d54" strokeWidth={1.5}/>
      <path d={`M${w*.36} ${top+42}h${w*.4}`} fill="none" stroke="#a8c2a8" strokeWidth={1.3}/>
      {[top+43,top+65,top+85].filter(y=>y<bottom-8).map(y=><g key={y}><circle cx={5} cy={y} r={2} fill="#dcd9b6" stroke="#385c54" strokeWidth={.8}/><path d={`M5 ${y-1}v2`} stroke="#6c7e64" strokeWidth={.7}/></g>)}
      <path d={`M${-w*.72} ${top+33}Q${-w*.88} ${top+50} ${-w*.72} ${top+65}M${w*.77} ${bottom-23}l-8 10`} fill="none" stroke="#b4c8b0" strokeWidth={1.7} opacity={.55}/>
      <path d={`M${-w} ${bottom-9}Q0 ${bottom+4} ${w} ${bottom-9}V${bottom+15}H${-w}Z`} fill="#34574f" opacity={.25}/>
    </g>
    <path d={`M${-w+7} ${bottom-6}Q0 ${bottom+3} ${w-7} ${bottom-6}`} fill="none" stroke="#b4c6a8" strokeWidth={1.2} opacity={.65}/>
  </g>;
}

function Segment({length,width,part,side}:PuppetSegmentProps) {
  const id=useId(),r=width/2,leg=part==="thigh"||part==="shin",lower=part==="forearm"||part==="shin";
  const taper=lower?.84:1.02;
  const shape=`M${-r} -4Q0 -9 ${r} -4Q${r*(leg?1.12:1.05)} ${length*.35} ${r*taper} ${length+3}Q0 ${length+8} ${-r*taper} ${length+3}Q${-r*(leg?1.12:1.05)} ${length*.35} ${-r} -4Z`;
  return <g data-art={`clean-${part}`} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id={`${id}-cloth`} x1={-r} y1="0" x2={r*1.5} y2={length*.5} gradientUnits="userSpaceOnUse">
        <stop stopColor={leg?"#586873":"#94b3a1"}/><stop offset=".5" stopColor={leg?"#364c58":"#709786"}/><stop offset="1" stopColor={leg?"#243d47":"#426e64"}/>
      </linearGradient>
      <clipPath id={`${id}-cloth-clip`}><path d={shape}/></clipPath>
    </defs>
    <path d={shape} fill={`url(#${id}-cloth)`} stroke={ink} strokeWidth={2.1}/>
    <g clipPath={`url(#${id}-cloth-clip)`} fill="none">
      <path d={`M${-r*.58} ${length*.1}Q${-r*.9} ${length*.34} ${-r*.53} ${length*.57}`} stroke={leg?"#83908f":"#d4debd"} strokeWidth={1.5} opacity={side==="left"?.5:.75}/>
      <path d={`M${r*.65} ${length*.19}Q${r*.35} ${length*.57} ${r*.7} ${length*.81}`} stroke={leg?"#1f3741":"#345b52"} strokeWidth={1.5} opacity={.6}/>
      {lower&&<><path d={`M${-r} ${length-5}Q0 ${length-1} ${r} ${length-5}`} stroke={leg?"#87918c":"#b7cbb2"} strokeWidth={1.8}/><path d={`M${-r*.6} ${length*.7}l${r*.55} ${length*.12}`} stroke={leg?"#213942":"#355d53"} strokeWidth={1.4}/></>}
    </g>
  </g>;
}

function Shoe({side}:{side:"left"|"right"}) {
  const id=useId(),shape="M-12 -3Q-13 -13 -6 -15Q2 -18 9 -10L20 -8Q25 -7 25 -2Q19 1 -11 -1Z";
  return <g data-art="clean-shoe" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id={`${id}-shoe`} x1="-9" y1="-15" x2="20" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#f8edcf"/><stop offset="1" stopColor="#d5d3b8"/></linearGradient><clipPath id={`${id}-shoe-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill={`url(#${id}-shoe)`} stroke={ink} strokeWidth={1.9}/>
    <g clipPath={`url(#${id}-shoe-clip)`}>
      <path d="M-13 -13L-4 -14L-2 -3L-13 -2Z" fill={side==="left"?"#456d65":"#557f70"}/>
      <path d="M-3 -12L8 -7M-1 -14L10 -9M4 -12L11 -8" stroke="#5b786c" strokeWidth={1.5}/>
      <path d="M15 -7Q19 -6 21 -4" fill="none" stroke="#fff9e5" strokeWidth={1.7}/>
    </g>
    <path d="M-11 -2Q7 0 23 -2" fill="none" stroke={ink} strokeWidth={2}/>
  </g>;
}

function Hand({kind,amount,side}:PuppetHandProps) {
  const id=useId(),flex=clamp(amount,-1,1),grip=kind==="fret"||kind==="phone";
  if(kind==="open"||kind==="palm")return <g transform={`scale(${side==="right"?-1:1} 1)`} data-art={`clean-${kind}-hand`} fill="#edc29d" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={kind==="palm"?"M-8 10Q-13 5 -10 -3L-3 -20Q-1 -25 3 -22L8 -9V9Q0 15 -8 10Z":"M-9 10Q-14 6 -14 1L-20 -5Q-21 -9 -17 -8L-10 -3L-12 -19Q-12 -24 -9 -22L-5 -8L-5 -25Q-4 -30 -1 -26L1 -8L3 -24Q5 -28 7 -24L6 -6L10 -17Q13 -21 14 -16L10 5Q9 14 -2 14Z"}/>
    <path d={kind==="palm"?"M1 -16L5 -5M-6 -1Q-3 -4 2 0M-7 7Q-1 10 5 7":"M-7 6Q-1 2 5 6M-5 -4L-4 3M0 -4V2"} fill="none" stroke="#b78068" strokeWidth={1.2}/>
  </g>;
  const shape=grip?"M-9 9Q-13 3 -11 -5Q-11 -12 -7 -11L-3 -7Q-1 -14 3 -12L6 -7Q11 -10 14 -5Q16 1 10 7L6 12Q-2 16 -9 9Z":kind==="pluck"?
    `M-9 8Q-12 4 -11 -4L-9 -10Q-6 -13 -3 -8L-1 -4L3 ${-10-flex*3}Q7 ${-13-flex*3} 8 -7L6 1L11 ${-3-flex*3}Q15 ${-5-flex*3} 14 1L11 9Q4 16 -3 12Z`:
    "M-9 7Q-13 2 -11 -5Q-11 -9 -8 -9L-5 -7L-3 -12Q0 -14 3 -9L6 -8Q10 -11 12 -7Q15 -3 11 4L8 11Q0 15 -9 7Z";
  return <g data-art={`clean-${kind}-hand`} strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id={`${id}-skin`} x1="-10" y1="-10" x2="12" y2="13" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe3b8"/><stop offset=".6" stopColor="#ecc09a"/><stop offset="1" stopColor="#ce9c7d"/></linearGradient><clipPath id={`${id}-hand-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill={`url(#${id}-skin)`} stroke={ink} strokeWidth={1.9}/>
    <g clipPath={`url(#${id}-hand-clip)`} fill="none" stroke="#ab7d65" strokeWidth={1.4}>
      {grip?<><path d="M-7 -6Q-1 -7 3 -2M0 -9L6 -4M7 -6L11 -2M-9 2Q-3 -2 2 3L5 7"/></>:<path d="M-7 -5Q-3 -2 -3 4M2 -5L1 5M8 -1L6 6"/>}
      <path d="M-8 7Q-4 12 2 11" stroke="#fce0b4" strokeWidth={1.3}/>
    </g>
  </g>;
}

function Phone() {
  const id=useId();
  return <g data-art="clean-phone" strokeLinejoin="round">
    <defs><linearGradient id={`${id}-screen`} x1="-12" y1="-20" x2="12" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="#edf3d9"/><stop offset="1" stopColor="#b5d8c3"/></linearGradient></defs>
    <rect x={-17} y={-28} width={34} height={56} rx={6} fill="#2b4147" stroke={ink} strokeWidth={2.5}/>
    <rect x={-12} y={-20} width={24} height={39} rx={2.5} fill={`url(#${id}-screen)`}/>
    <path d="M-5 -24H5" stroke="#9eb9ab" strokeWidth={2} strokeLinecap="round"/>
    <path d="M-8 10L-3 3L2 5L8 -6" fill="none" stroke="#5b9481" strokeWidth={2} strokeLinecap="round"/>
    <path d="M-8 -13H5M-8 -8H0" stroke="#94b6a0" strokeWidth={1.5} strokeLinecap="round"/>
    <path d="M-14 -20V15" stroke="#e2e5cc" strokeWidth={1} opacity={.35}/>
  </g>;
}

function Bass() {
  const id=useId();
  const body="M-28 -37Q-47 -39 -49 -17Q-58 2 -47 21C-38 39 -14 45 7 33Q24 25 24 12Q23 2 17 -3Q15 -9 26 -18Q35 -28 26 -35Q18 -40 11 -26Q5 -15 -5 -20Q-10 -24 -10 -34Q-16 -42 -28 -37Z";
  const guard="M-29 -26Q-41 -29 -40 -13Q-48 2 -37 20Q-25 33 -7 29Q8 26 14 16L10 3Q-2 1 4 -12Q-12 -5 -18 -19Q-19 -28 -29 -26Z";
  return <g data-art="clean-bass" strokeLinejoin="round" strokeLinecap="round">
    <defs>
      <linearGradient id={`${id}-body`} x1="-45" y1="-36" x2="20" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#8bd5c3"/><stop offset=".3" stopColor="#4ca99e"/><stop offset=".72" stopColor="#287875"/><stop offset="1" stopColor="#175559"/></linearGradient>
      <linearGradient id={`${id}-guard`} x1="-20" y1="-24" x2="6" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#fff5d8"/><stop offset="1" stopColor="#d9c99e"/></linearGradient>
      <linearGradient id={`${id}-wood`} x1="0" y1="-10" x2="0" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#c2915e"/><stop offset=".4" stopColor="#7d543c"/><stop offset="1" stopColor="#4c3730"/></linearGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="-10" x2="0" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#fff7da"/><stop offset=".38" stopColor="#b9bcad"/><stop offset=".65" stopColor="#e8dfbf"/><stop offset="1" stopColor="#7c8b88"/></linearGradient>
      <clipPath id={`${id}-body-clip`}><path d={body}/></clipPath>
    </defs>
    <path d="M19 -10H123V10H19Z" fill={`url(#${id}-wood)`} stroke={ink} strokeWidth={2.5}/>
    <path d="M25 -7H123M25 7H123" fill="none" stroke="#d9b77f" strokeWidth={1.3}/>
    <path d="M121 -11Q133 -15 141 -11Q148 -7 144 2Q140 13 123 10Z" fill={`url(#${id}-body)`} stroke={ink} strokeWidth={2.5}/>
    <path d="M125 -8Q137 -11 141 -7" fill="none" stroke="#b0e4cf" strokeWidth={1.5}/>
    {[124,130,136,142].map((x,i)=><g key={x}>
      <path d={`M${x} -8V${-17-i%2*3}`} fill="none" stroke={ink} strokeWidth={2}/>
      <ellipse cx={x} cy={-19-i%2*3} rx={3.7} ry={3.2} fill={`url(#${id}-metal)`} stroke={ink} strokeWidth={1.5}/>
    </g>)}
    <path d={body} fill={`url(#${id}-body)`} stroke={ink} strokeWidth={3}/>
    <g clipPath={`url(#${id}-body-clip)`}>
      <path d="M-49 -29Q-35 -43 -24 -32Q-17 -25 -15 -14Q-2 6 27 -9L34 -46H-55Z" fill="#a1e2ca" opacity={.17}/>
      <path d="M-51 10Q-37 42 -4 35Q15 33 25 17L35 40H-55Z" fill="#123f4b" opacity={.22}/>
      <path d="M-44 -20Q-46 -8 -44 -3M-39 22Q-26 33 -13 33" fill="none" stroke="#c2eacb" strokeWidth={2.3} opacity={.82}/>
      <path d="M20 -29Q24 -32 27 -29" fill="none" stroke="#c2eacb" strokeWidth={1.8}/>
      <path d={guard} fill={`url(#${id}-guard)`} stroke="#344745" strokeWidth={1.8}/>
      <path d="M-27 -11H-21V11H-27ZM-7 -12H0V12H-7Z" fill="#273435" stroke="#142d31" strokeWidth={1.2}/>
      {[-8,-4,0,4,8].map(y=><g key={y}><path d={`M-26 ${y}H-22M-6 ${y}H-1`} stroke="#c2b895" strokeWidth={.8}/></g>)}
      <path d="M-38 -10H-31V11H-38Z" fill={`url(#${id}-metal)`} stroke={ink} strokeWidth={1.2}/>
      {[-6,-2,2,6].map(y=><path key={y} d={`M-37 ${y}H-32`} stroke="#576f6c" strokeWidth={.8}/>)}
      {[[-10,25],[1,22]].map(([x,y])=><g key={x}><circle cx={x} cy={y} r={3.7} fill={`url(#${id}-metal)`} stroke={ink} strokeWidth={1.4}/><path d={`M${x} ${y-2}v2`} stroke="#617673" strokeWidth={1}/></g>)}
      {[[-31,-22],[-37,14],[-6,23],[9,13]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="#8c937c"/>)}
    </g>
    {[33,45,56,66,75,83,90,97,103,109,115,120].map(x=><path key={x} d={`M${x} -8V8`} stroke="#d6c9a8" strokeWidth={1.1}/>)}
    {[50,70,88,103].map(x=><circle key={x} cx={x} cy={0} r={1.6} fill="#f0d9ad"/>)}
    {[-4.5,-1.5,1.5,4.5].map((y,i)=><path key={y} d={`M-36 ${y}H133`} fill="none" stroke={i%2?"#f5ebc8":"#fff8e7"} strokeWidth={i===3?.95:.7}/>)}
    <path d="M23 -10H28V10H23Z" fill={`url(#${id}-metal)`} stroke={ink} strokeWidth={1}/>
  </g>;
}

export const cleanPuppetParts: PuppetParts={Head,Torso,Segment,Hand,Shoe,Bass,Phone};
