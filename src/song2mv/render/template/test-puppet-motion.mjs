import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'song2mv-motion-test-'));
try{
 const file=path.join(dir,'motion.mjs');
 await build({stdin:{contents:'export * from "./src/kit/puppet-motion";export * from "./src/kit/puppet";export * from "./src/kit/puppet-clean-art";export * from "./src/kit/profile-motion";',resolveDir:process.cwd()},bundle:true,jsx:'transform',format:'esm',platform:'node',outfile:file,
  plugins:[{name:'shared-runtime',setup(build){build.onResolve({filter:/^(react(?:\/jsx-runtime)?|remotion)$/},args=>({path:require.resolve(args.path),external:true}));}}]});
 const {puppetMotion,PuppetFigure,cleanPuppetParts,figureProfiles,profileLegLength,puppetCycleBeats}=await import(pathToFileURL(file).href);
 const exercises=['arm-raise','hands-together','squat','balance','weight-shift'],dances=['bounce','step-touch','funk'];
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const near=(a,b,tol=1e-7)=>assert.ok(dist(a,b)<tol,`${a} must meet ${b}`);
 const features=a=>[a.bodyX,a.pose.bodyY,a.torsoAngle,a.pose.headAngle,a.pose.hands.left.angle,a.pose.hands.right.angle,a.look,...['left','right'].flatMap(side=>[...a.pose.feet[side],...a.pose.arms[side].end,...a.pose.legs[side].joint])];
 let poses=0,contacts=0,palms=0,balance=0;
 for(const profile of figureProfiles){
  const actions=[...exercises.map(exercise=>({kind:'pose',exercise,time:0,duration:4})),...dances.map(style=>({kind:'dance',style,time:0,bpm:112}))];
  for(const base of actions){
   let previous;
   const duration=base.kind==='pose'?4:60/112*puppetCycleBeats(base.style)*3;
   for(let f=0;f<=Math.floor(duration*120);f++){
    const time=f/120,acting=puppetMotion({...base,time},profile),pose=acting.pose;poses++;
    for(const side of ['left','right']){
     const leg=pose.legs[side],arm=pose.arms[side],length=profileLegLength(profile);
     near([leg.end[0]+acting.bodyX,leg.end[1]+pose.bodyY+12],pose.feet[side]);
     for(const [bone,size] of [[leg,length],[arm,profile.armLength]]){
      assert.ok(Math.abs(dist(bone.root,bone.joint)-size)<1e-7);
      assert.ok(Math.abs(dist(bone.joint,bone.end)-size)<1e-7);
     }
     assert.ok(pose.feet[side][1]<=0,'A foot cannot sink into the floor');
     if(previous&&pose.contacts[side+'Foot']&&previous.pose.contacts[side+'Foot']){near(pose.feet[side],previous.pose.feet[side]);contacts++;}
    }
    assert.ok(pose.contacts.leftFoot||pose.contacts.rightFoot,'Every grounded action needs a supporting foot');
    if(pose.contacts.palms){near([pose.arms.left.end[0]+8,pose.arms.left.end[1]],[pose.arms.right.end[0]-8,pose.arms.right.end[1]]);assert.ok(dist(pose.arms.left.end,pose.arms.right.end)>=15.9);palms++;}
    if(base.kind==='dance'&&base.style==='step-touch'&&pose.contacts.leftFoot!==pose.contacts.rightFoot){
     const support=pose.contacts.leftFoot?pose.feet.left:pose.feet.right;
     assert.ok(Math.abs(acting.bodyX-support[0])<5*(-profile.hip.y-12)/96,'Step-touch must preload the supporting foot before the other foot lifts');
    }
    if(base.kind==='pose'&&base.exercise==='balance'&&!pose.contacts.rightFoot){assert.ok(Math.abs(acting.bodyX-pose.feet.left[0])<5*(-profile.hip.y-12)/96,'Transfer weight before lifting');balance++;}
    if(previous){const current=features(acting),old=features(previous);assert.ok(Math.max(...current.map((v,i)=>Math.abs(v-old[i])))<7,`${profile.id}/${base.kind}/${base.style??base.exercise} at ${time}: ${current.map((v,i)=>[i,Math.abs(v-old[i])]).filter(v=>v[1]>=7)}`);}
    previous=acting;
   }
  }
  for(const style of dances){
   const period=puppetCycleBeats(style)*60/112,eps=1e-5;
   const a=features(puppetMotion({kind:'dance',style,time:period*2-eps,bpm:112},profile));
   const b=features(puppetMotion({kind:'dance',style,time:period*2,bpm:112},profile));
   const c=features(puppetMotion({kind:'dance',style,time:period*2+eps,bpm:112},profile));
   assert.ok(Math.max(...a.map((v,i)=>Math.abs(v-c[i])))<.01,'Loop positions must meet');
   const velocities=a.map((v,i)=>Math.abs((b[i]-v)/eps-(c[i]-b[i])/eps));
   assert.ok(Math.max(...velocities)<.1,`${profile.id}/${style} loop velocity mismatch: ${velocities.map((v,i)=>[i,v]).filter(v=>v[1]>.1)}`);
   const duration=period*2;
   const final=features(puppetMotion({kind:'dance',style,time:duration,bpm:112,cycles:2},profile));
   const before=features(puppetMotion({kind:'dance',style,time:duration-eps,bpm:112,cycles:2},profile));
   assert.ok(Math.max(...before.map((v,i)=>Math.abs((final[i]-v)/eps)))<.1,`${profile.id}/${style} must settle its velocity before finite stop`);
   const draw=time=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(PuppetFigure,{parts:cleanPuppetParts,profile,action:{kind:'dance',style,time,bpm:112,cycles:2}})));
   assert.equal(draw(period*2),draw(period*2+3),'A finite dance holds its complete final pose');
  }
 }
 assert.ok(palms>0&&balance>0);
 for(const exercise of exercises)for(const time of [0,.6,1.8,3.5]){
  const draw=()=>renderToStaticMarkup(React.createElement('svg',{},React.createElement(PuppetFigure,{parts:cleanPuppetParts,action:{kind:'pose',exercise,time,duration:4},showRig:true})));
  const markup=draw();assert.ok(!/NaN|Infinity|undefined/.test(markup));assert.match(markup,/data-part="rig-overlay"/);
  for(const part of ['left-hand','right-hand','left-shoe','right-shoe'])assert.equal((markup.match(new RegExp(`data-part="${part}"`,'g'))||[]).length,1);
  puppetMotion({kind:'dance',style:'funk',time:100},figureProfiles[1]);assert.equal(draw(),markup,'Motion is independent of render order');
 }
 for(const action of [{kind:'pose',exercise:'squat',time:-1},{kind:'pose',exercise:'squat',time:1,duration:0},{kind:'dance',style:'funk',time:0,bpm:0},{kind:'dance',style:'funk',time:0,cycles:1.5}])assert.throws(()=>puppetMotion(action,figureProfiles[1]),RangeError);
 console.log(JSON.stringify({ok:true,poses,plantedIntervals:contacts,palmContactSamples:palms,singleFootSamples:balance,loopPositionAndVelocity:true,finiteDanceHold:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
