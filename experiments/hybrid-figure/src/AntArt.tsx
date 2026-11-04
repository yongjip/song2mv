import React,{useId} from 'react';
const ink='#242126';
export function AntAbdomen() {
  const id=useId();
  const shape="M-33 -31C-17 -50 14 -51 31 -28C47 -6 40 24 18 39C-2 52 -30 35 -37 13C-43 -3 -43 -17 -33 -31Z";
  return <g data-art="ant-abdomen" strokeLinecap="round">
    <defs><linearGradient id={`${id}-abd`} x1="-29" y1="-35" x2="28" y2="36" gradientUnits="userSpaceOnUse"><stop stopColor="#62555b"/><stop offset=".45" stopColor="#423d46"/><stop offset="1" stopColor="#292b34"/></linearGradient><clipPath id={`${id}-abd-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill={`url(#${id}-abd)`} stroke={ink} strokeWidth={2.8}/>
    <g clipPath={`url(#${id}-abd-clip)`} fill="none"><path d="M-24 -43Q-45 -7 -7 41M-6 -46Q-22 -3 14 43M14 -41Q2 -8 32 31" stroke="#282832" strokeWidth={4.7}/><path d="M-20 -40Q-38 -8 -6 35M-1 -42Q-16 -3 17 37" stroke="#827078" strokeWidth={1.6} opacity={.58}/></g>
    <path d="M-27 -24Q-31 -16 -30 -8" fill="none" stroke="#968088" strokeWidth={2.2} opacity={.55}/>
  </g>;
}
