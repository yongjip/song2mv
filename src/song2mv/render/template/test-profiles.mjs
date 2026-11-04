import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'song2mv-profile-test-'));
try {
 const file=path.join(dir,'profiles.mjs');
 buildSync({stdin:{contents:'export * from "./src/kit/figure-motion"; export * from "./src/kit/figure"; export * from "./src/kit/profile-motion"; export * from "./src/kit/profile-figure";',resolveDir:process.cwd()},bundle:true,jsx:'transform',format:'esm',platform:'node',outfile:file});
 const {profilePose,figureProfiles,profileLegLength,ProfileFigure,figurePropPoint,minimalFigure}=await import(pathToFileURL(file).href);
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const near=(a,b)=>assert.ok(distance(a,b)<1e-7);
 let poses=0,contacts=0;const knees={},drops={};
 for(const profile of figureProfiles) {
  const custom=renderToStaticMarkup(React.createElement('svg',{},React.createElement(ProfileFigure,{profile,action:{kind:'walk',time:1},look:{...minimalFigure,shirt:'#cc4488',trousers:'#8833bb'}})));
  assert.ok(custom.includes('#b43c78')&&custom.includes('#742b9f'),'Rear limbs must derive from the requested palette');
  assert.equal(profile.head.cy-profile.head.ry,-315,'Comparison candidates share the same height');
  const neutral=profilePose({kind:'phone',time:0},profile);
  const leg=neutral.legs.left,len=profileLegLength(profile);
  const bend=Math.acos((2*len*len-distance(leg.root,leg.end)**2)/(2*len*len))*180/Math.PI;
  assert.ok(bend>=155&&bend<=170,`Neutral knee ${profile.id}: ${bend}`);knees[profile.id]=+bend.toFixed(2);
  drops[profile.id]=0;
  for(const kind of ['walk','phone','bass']){
   let previous;
   for(let frame=0;frame<=360;frame++){
    const action={kind,time:frame/60},pose=profilePose(action,profile);poses++;
    for(const [group,length] of [['arms',profile.armLength],['legs',len]]) for(const side of ['left','right']) {
     const limb=pose[group][side];
     assert.ok(Math.abs(distance(limb.root,limb.joint)-length)<1e-7);
     assert.ok(Math.abs(distance(limb.joint,limb.end)-length)<1e-7);
     if(previous)assert.ok(distance(limb.end,previous[group][side].end)<7,`${kind} ${profile.id} endpoint jump`);
    }
    if(kind==='walk'){
     drops[profile.id]=Math.max(drops[profile.id],pose.bodyY);
     assert.ok(pose.bodyY>=0&&pose.bodyY<5);
     if(previous)for(const side of ['left','right']) if(pose.feet[side][1]===0&&previous.feet[side][1]===0){
      near([pose.travel+pose.feet[side][0],0],[previous.travel+previous.feet[side][0],0]);contacts++;
     }
    }
    if(kind==='phone')near(pose.arms.right.end,figurePropPoint(pose.phone.origin,0,[16,18]));
    if(kind==='bass'){near(pose.arms.left.end,figurePropPoint(pose.bass.origin,pose.bass.angle,[-9,0]));near(pose.arms.right.end,figurePropPoint(pose.bass.origin,pose.bass.angle,[pose.bass.fret,0]));}
    for(const side of ['left','right'])near([pose.legs[side].end[0],pose.legs[side].end[1]+pose.bodyY+12],pose.feet[side]);
    if(frame%30===0){
     const draw=()=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(ProfileFigure,{action,profile})));
     const markup=draw();
     if(kind==='walk'){assert.equal((markup.match(/data-part="far-hand"/g)||[]).length,1);assert.ok(markup.indexOf('data-part="far-hand"')<markup.indexOf('data-part="left-leg"'));assert.ok(markup.indexOf('data-part="far-hand"')<markup.indexOf('data-part="torso"'));}
     assert.ok(!/NaN|Infinity|undefined/.test(markup));
     for(const part of ['left-arm','right-arm','left-leg','right-leg','left-shoe','right-shoe'])assert.equal((markup.match(new RegExp(`data-part="${part}"`,'g'))||[]).length,1);
     assert.equal((markup.match(/data-part="phone"/g)||[]).length,kind==='phone'?1:0);
     assert.equal((markup.match(/data-part="bass"/g)||[]).length,kind==='bass'?1:0);
     profilePose({kind:'walk',time:123},profile);assert.equal(draw(),markup);
    }
    previous=pose;
   }
  }
 }
 console.log(JSON.stringify({ok:true,poses,plantedIntervals:contacts,neutralKneesDegrees:knees,maxPelvisDrop:drops}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
