export const beatAt=(time,bpm=112)=>time*bpm/60;
export const attackAt=(time,bpm=112)=>{const step=beatAt(time,bpm)*2,index=Math.floor(step);return {index,phase:step-index};};
export const vocalAt=()=>0;
export function expressionAt(time){const p=((time%4.1)+4.1)%4.1,blink=p<3.55||p>3.82?1:Math.max(.3,Math.abs((p-3.685)/.135));return {accent:0,eyes:{kind:'open',openness:blink}};}
