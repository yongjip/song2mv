import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song2mv-figure-test-'));
try {
  const bundle = path.join(dir, 'figures.mjs');
  buildSync({stdin:{contents:'export * from "./src/kit/figure-motion"; export * from "./src/kit/figure";',resolveDir:process.cwd()},bundle:true,jsx:'transform',format:'esm',platform:'node',outfile:bundle});
  const {figurePose, Figure, minimalFigure, donghakAntFigure, figurePropPoint}=await import(pathToFileURL(bundle).href);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const near=(a,b,tol=1e-8)=>assert.ok(distance(a,b)<tol,`${a} must meet ${b}`);
  let samples=0, planted=0;
  for (const kind of ['walk','phone','bass']) {
    let previous;
    for(let f=0;f<=360;f++) {
      const action={kind,time:f/60},pose=figurePose(action);
      for(const name of ['leftArm','rightArm','leftLeg','rightLeg']) {
        const limb=pose[name],length=name.endsWith('Arm')?48:37;
        assert.ok(Math.abs(distance(limb.root,limb.joint)-length)<1e-8,`${name}: fixed upper length`);
        assert.ok(Math.abs(distance(limb.joint,limb.end)-length)<1e-8,`${name}: fixed lower length`);
        if(previous) assert.ok(distance(limb.end,previous[name].end)<6,`${kind}: no one-frame contact teleport`);
      }
      if(kind==='walk' && previous) for(const name of ['left','right']) {
        if(Math.abs(pose.feet[name][1])<1e-8 && Math.abs(previous.feet[name][1])<1e-8){
          near([pose.travel+pose.feet[name][0],0],[previous.travel+previous.feet[name][0],0]);planted++;
        }
      }
      if(kind==='phone') {
        near(pose.rightArm.end,figurePropPoint(pose.phone.origin,0,[16,18]));
        assert.equal(pose.phone.grip,pose.rightArm.end);
      }
      if(kind==='bass') {
        near(pose.rightArm.end,figurePropPoint(pose.bass.origin,pose.bass.angle,[pose.bass.fret,0]));
        near(pose.leftArm.end,figurePropPoint(pose.bass.origin,pose.bass.angle,[-9,0]));
      }
      if(f%10===0) for(const look of [minimalFigure,donghakAntFigure]) {
        const draw=()=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(Figure,{action,look,x:150,y:500,scale:1.3})));
        const markup=draw(); assert.ok(!/NaN|Infinity|undefined/.test(markup));
        assert.equal((markup.match(/data-part="phone"/g)||[]).length,kind==='phone'?1:0);
        assert.equal((markup.match(/data-part="bass"/g)||[]).length,kind==='bass'?1:0);
        for(const part of ['left-arm','right-arm','left-leg','right-leg']) assert.equal((markup.match(new RegExp(`data-part="${part}"`,'g'))||[]).length,1);
        figurePose({kind:'walk',time:99}); assert.equal(draw(),markup,'Random seek cannot alter SVG');
      }
      previous=pose;samples++;
    }
  }
  assert.ok(planted>300);
  for(const action of [{kind:'walk',time:NaN},{kind:'phone',time:-1},{kind:'bass',time:0,bpm:0},{kind:'walk',time:0,speed:-3}]) assert.throws(()=>figurePose(action),RangeError);
  assert.equal(figurePose({kind:'walk',time:6,speed:0}).travel,0);
  console.log(`Figure checks passed: ${samples} poses; ${planted} planted-foot intervals; fixed bones, prop contact, limb/prop counts, seek-stable SVG.`);
} finally {fs.rmSync(dir,{recursive:true,force:true});}
