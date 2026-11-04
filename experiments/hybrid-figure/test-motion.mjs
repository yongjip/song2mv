import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ACTIONS,createSampler} from './runtime.js';
const sample=createSampler(),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
let poses=0,contacts=0;
for(const action of ACTIONS)for(const view of ['front','quarter'])for(let frame=0;frame<=144;frame+=2){
 const data=sample({action,time:frame/24,view}),p=data.audit.profile;
 for(const arm of data.audit.arms){assert(Math.abs(dist(arm[0],arm[1])-p.upperArm)<1e-8);assert(Math.abs(dist(arm[1],arm[2])-p.forearm)<1e-8);}
 for(const leg of data.audit.legs){assert(Math.abs(dist(leg[0],leg[1])-p.thigh)<1e-8);assert(Math.abs(dist(leg[1],leg[2])-p.shin)<1e-8);}
 for(const foot of data.audit.feet)if(foot.contact){assert(Math.abs(foot.contact[1])<1e-9);contacts++;}
 assert(data.audit.feet.some(f=>f.contact),'At least one foot must support the body');
 assert(!/NaN|Infinity/.test(JSON.stringify(data)));poses++;
}
const a=sample({action:'bass',time:2.25});sample({action:'turn',time:5});assert.deepEqual(sample({action:'bass',time:2.25}),a,'Seeking must not depend on the last action');
assert.notDeepEqual(sample({action:'bass',time:2,bpm:90}).view.instrument,sample({action:'bass',time:2,bpm:130}).view.instrument);
for(const args of [{action:'walk',time:-1},{action:'walk',time:NaN},{action:'unknown',time:1},{action:'phone',time:1,bpm:0}])assert.throws(()=>sample(args),RangeError);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'song2mv-hybrid-')),require=createRequire(import.meta.url);
try{
 const file=path.join(temp,'drawings.mjs');
 await build({stdin:{contents:'export {AntHead2D} from "./src/AntHead2D"; export {HybridFigure} from "./src/HybridFigure";',resolveDir:process.cwd()},outfile:file,bundle:true,jsx:'transform',platform:'node',format:'esm',plugins:[{name:'shared-react',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:require.resolve(args.path),external:true}));}}]});
 const {AntHead2D,HybridFigure}=await import(pathToFileURL(file).href);
 const head=yaw=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(AntHead2D,{yaw,time:0,eyes:{kind:'open',openness:1},joy:.6,look:0,lookY:0,mouthOpen:0,accent:0})));
 const numbers=s=>[...s.matchAll(/(?:d|cx|cy|rx|ry|transform)="([^"]*)"/g)].flatMap(m=>[...m[1].matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)].map(n=>Number(n[0])));
 const left=numbers(head(-1e-6)),right=numbers(head(1e-6));assert.equal(left.length,right.length);assert(Math.max(...left.map((n,i)=>Math.abs(n-right[i])))<.01,'Crossing front must not mirror asymmetric artwork');
 for(const action of ACTIONS){const markup=renderToStaticMarkup(React.createElement('svg',{},React.createElement(HybridFigure,{action,time:2.2,view:'quarter'})));assert(!/NaN|Infinity|undefined/.test(markup));assert.match(markup,/data-art="ant-head-2d"/);}
 console.log(JSON.stringify({ok:true,poses,plantedContacts:contacts,seekStable:true,headFrontCrossing:true,limits:'Geometry and static drawing only. No claim of natural acting or note-accurate performance.'}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
