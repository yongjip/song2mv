import {V,keys} from './rig-math.js';
import {beatAt,attackAt} from './clock.js';
export function playingAt(time,envelope,stringZ=.083,bpm=112){
 const beat=beatAt(time,bpm),attack=attackAt(time,bpm),phase=attack.phase,note=attack.index,pulse=keys(phase,[[0,0],[.15,1],[.5,.35],[1,0]])*envelope,fretX=.59+.042*Math.sin(beat*Math.PI/4),fingers=[];
 for(let i=0;i<4;i++){
  const x=fretX+(i-1.5)*.04,pressure=(.5+.5*Math.cos(beat*Math.PI-i*Math.PI/2))*envelope,tip=V(x+.006*(1-pressure),-.012-.048*(1-pressure),stringZ+.013+.021*(1-pressure));
  fingers.push({role:'fret',radius:.013,points:[V(x,-.086,.16),V(x+.004,-.025-.029*(1-pressure),.174),tip],surface:V(x,-.012,stringZ)});
 }
 fingers.push({role:'thumb',radius:.017,points:[V(fretX+.065,-.12,.13),V(fretX+.097,-.105,-.006),V(fretX+.045,-.008,-.038)]});
 for(let i=0;i<4;i++){
  if(i>1){fingers.push({role:'curl',radius:.013,points:[V(-.16+(i-2)*.027,.077,.155),V(-.14+(i-2)*.027,.027,.17),V(-.12+(i-2)*.027,.039,.137)]});continue;}
  const amount=note%2===i?pulse:0,x=-.078+i*.043,y=-.012+i*.024,tip=V(x+.008*amount,y+.046*(1-amount)-.019*amount,stringZ+.013+.026*(1-amount));
  fingers.push({role:'pluck',radius:.013,points:[V(x,.05,.151),V(x+.008*amount,.035-.045*amount,.169-.012*amount),tip],surface:V(x,y,stringZ),stroke:amount});
 }
 fingers.push({role:'thumb',radius:.017,points:[V(-.162,.106,.14),V(-.166,.065,.12),V(-.146,.036,stringZ+.017)]});
 return {rightWrist:V(-.179,.174,.14),leftWrist:V(fretX+.034,-.192,.14),palms:[{center:V(-.105,.095,.145),size:V(.078,.072,.038),role:'pluck'},{center:V(fretX,-.122,.15),size:V(.087,.080,.038),role:'fret'}],fingers};
}
