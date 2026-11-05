import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'song2mv-puppet-test-'));
try {
 const file=path.join(dir,'puppets.mjs');
 await build({stdin:{contents:'export * from "./src/kit/puppet";export * from "./src/kit/puppet-performance";export * from "./src/kit/sprite-parts";export * from "./src/kit/puppet-clean-art";export * from "./src/kit/profile-motion";',resolveDir:process.cwd()},bundle:true,jsx:'transform',format:'esm',platform:'node',outfile:file,
  plugins:[{name:'shared-runtime',setup(build){build.onResolve({filter:/^(react(?:\/jsx-runtime)?|remotion)$/},args=>({path:require.resolve(args.path),external:true}));}}]});
 const {PuppetFigure,puppetPerformance,cleanPuppetParts,figureProfiles,profilePose,profileLegLength,AtlasSprite,AtlasSegment,atlasBoneMatrix}=await import(pathToFileURL(file).href);
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),near=(a,b)=>assert.ok(dist(a,b)<1e-7);
 let poses=0;
 for(const profile of figureProfiles)for(let frame=0;frame<=360;frame++){
  const action={kind:'bass',time:frame/60,bpm:112},base=profilePose(action,profile),acting=puppetPerformance(action,profile,base);
  for(const side of ['left','right']){
   const leg=acting.pose.legs[side],len=profileLegLength(profile);
   near([leg.end[0],leg.end[1]+acting.pose.bodyY+12],acting.pose.feet[side]);
   assert.ok(Math.abs(dist(leg.root,leg.joint)-len)<1e-7);
   assert.ok(Math.abs(dist(leg.joint,leg.end)-len)<1e-7);
  }
  assert.ok(Number.isFinite(acting.torsoAngle));poses++;
 }
 for(const profile of figureProfiles)for(const kind of ['walk','phone','bass'])for(const time of [0,.5,1.1,2.4,4.9,8,20]){
  const markup=renderToStaticMarkup(React.createElement('svg',{},React.createElement(PuppetFigure,{parts:cleanPuppetParts,profile,action:{kind,time}})));
  assert.ok(!/NaN|Infinity|undefined/.test(markup));
  for(const name of ['left-upper-arm','left-forearm','right-upper-arm','right-forearm','left-thigh','left-shin','right-thigh','right-shin','left-hand','right-hand','left-shoe','right-shoe'])assert.equal((markup.match(new RegExp(`data-part="${name}"`,'g'))||[]).length,1,name);
  if(kind==='walk')assert.ok(markup.indexOf('data-part="left-hand"')<markup.indexOf('data-part="left-thigh"'));
  assert.equal((markup.match(/data-part="bass"/g)||[]).length,kind==='bass'?1:0);
  assert.equal((markup.match(/data-part="phone"/g)||[]).length,kind==='phone'?1:0);
  const ids=Array.from(markup.matchAll(/ id="([^"]+)"/g),m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 }
 const draw=time=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(PuppetFigure,{parts:cleanPuppetParts,action:{kind:'bass',time},performance:{kind:'phrase',duration:5}})));
 assert.equal(draw(5),draw(20),'A finite phrase must hold its complete final pose, including fingers/instrument');
 const loop=(time)=>puppetPerformance({kind:'bass',time},figureProfiles[1],profilePose({kind:'bass',time},figureProfiles[1]));
 assert.notEqual(loop(8).torsoAngle,loop(8.2).torsoAngle,'The default performance must keep moving after the five-second demo');
 const atlas={src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lKQAAAAASUVORK5CYII=',width:100,height:100};
 let matrices=0;
 for(const [start,end] of [[[20,20],[80,80]],[[80,20],[20,80]],[[50,10],[50,90]],[[10,50],[90,50]]])for(const length of [20,65]){
  const bone={cell:{x:0,y:0,width:100,height:100},start,end,width:20},m=atlasBoneMatrix(bone,length,15);
  const map=([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  near(map(start),[0,0]);near(map(end),[0,length]);
  const element=AtlasSegment({atlas,bone,length,width:15});
  assert.equal(element.props.transform,`matrix(${m.join(' ')})`);matrices++;
 }
 for(const piece of [{cell:{x:95,y:0,width:10,height:20},pivot:[99,10]},{cell:{x:0,y:0,width:10,height:20},pivot:[99,10]}])assert.throws(()=>renderToStaticMarkup(React.createElement(AtlasSprite,{atlas,piece,width:30,height:40})),RangeError);
 assert.throws(()=>atlasBoneMatrix({cell:{x:0,y:0,width:10,height:10},start:[5,5],end:[5,5],width:5},40,10),RangeError);
 console.log(JSON.stringify({ok:true,performancePoses:poses,atlasTransforms:matrices,artworkCases:63,phraseHold:true,continuingLoop:true}));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
