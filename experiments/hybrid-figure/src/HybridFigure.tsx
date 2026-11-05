import React from 'react';
import {sampleAt} from '../runtime.js';
import {Character} from './Character';
import type {HybridOptions,HybridArt,Point} from './types';
function Phone({corners}:{corners:Point[]}){const shape=corners.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join('')+'Z';return <g><path d={shape} fill="#38525b" stroke="#302730" strokeWidth="5"/><path d={shape} fill="#a3beb0" stroke="#e3d7b8" strokeWidth="2" transform={`translate(${corners[0].x*.10} ${corners[0].y*.10}) scale(.9)`}/></g>;}
export function HybridFigure({action,time,bpm=112,view='front',appearance='lead',Head,Body}:{appearance?:'lead'|'guitarist'|'drummer'}&HybridOptions&HybridArt){const frame=sampleAt({action,time,bpm,view});return <Character pose={frame.view} time={time} acting={frame.acting} headScale={frame.headScale} appearance={appearance} Head={Head} Body={Body} prop={frame.phone?<Phone corners={frame.phone}/>:undefined}/>;}
