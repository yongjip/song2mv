import { inOut, lerp } from "./math";
import { portraitMotion } from "./portrait-motion";
import { figurePropPoint, solveFigureLimb, type FigureAction, type FigurePoint, type FigureLimb } from "./figure-motion";

export type FigureProfile = {
  id: "pebble" | "round" | "capsule";
  head: {rx: number; ry: number; cy: number};
  shoulder: {half: number; y: number};
  hip: {half: number; y: number};
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legWidth: number;
};
export const pebbleProfile: FigureProfile = {
  id: "pebble", head: {rx: 64, ry: 62, cy: -253}, shoulder: {half: 37, y: -180},
  hip: {half: 20, y: -70}, torsoWidth: 51, armLength: 50, armWidth: 24, legWidth: 24,
};
export const roundProfile: FigureProfile = {
  id: "round", head: {rx: 49, ry: 50, cy: -265}, shoulder: {half: 34, y: -203},
  hip: {half: 19, y: -108}, torsoWidth: 43, armLength: 53, armWidth: 20, legWidth: 22,
};
export const capsuleProfile: FigureProfile = {
  id: "capsule", head: {rx: 38, ry: 42, cy: -273}, shoulder: {half: 29, y: -221},
  hip: {half: 16, y: -131}, torsoWidth: 35, armLength: 58, armWidth: 17, legWidth: 18,
};
export const figureProfiles = [pebbleProfile, roundProfile, capsuleProfile];

export type ProfileBodyPose = {
  travel: number; bodyY: number; headAngle: number; headTurn: number; gaze: FigurePoint; blink: number;
  facing: "three-quarter" | "front";
  feet: {left: FigurePoint; right: FigurePoint};
  arms: {left: FigureLimb; right: FigureLimb};
  legs: {left: FigureLimb; right: FigureLimb};
};
export type ProfilePose = ProfileBodyPose & (
  | {kind: "walk"}
  | {kind: "phone"; phone: {origin: FigurePoint; grip: FigurePoint; touch: number}}
  | {kind: "bass"; bass: {origin: FigurePoint; angle: number; fret: number; pluck: number; neckGrip: FigurePoint; stringContact: FigurePoint}}
);
const mixPoint = (a: FigurePoint, b: FigurePoint, u: number): FigurePoint => [lerp(a[0],b[0],u),lerp(a[1],b[1],u)];
export const profileLegLength = (profile: FigureProfile) => (-profile.hip.y - 12) * 1.015 / 2;

/** All profiles share timing and prop dimensions. Body-local anchors are calibrated from the selected proportions. */
export function profilePose(action: FigureAction, profile: FigureProfile): ProfilePose {
  if (!Number.isFinite(action.time) || action.time < 0) throw new RangeError("Profile time must be finite and non-negative");
  const t=action.time, {shoulder, hip}=profile;
  const walking=action.kind==="walk";
  const shoulderHalf=shoulder.half*(walking?0.62:1), hipHalf=walking?7:hip.half;
  const armReach=profile.armLength*1.86;
  let feet: ProfileBodyPose["feet"]={left:[-hipHalf,0],right:[hipHalf,0]};
  let left: FigurePoint=[-shoulderHalf-13,shoulder.y+armReach], right: FigurePoint=[shoulderHalf+13,shoulder.y+armReach];
  let travel=0, bodyY=0, headAngle=0, headTurn=walking?1:0;
  let gaze: FigurePoint=walking?[5,0]:[0,0];
  let item: Pick<Extract<ProfilePose,{kind:"phone"}>,"kind"|"phone"> | Pick<Extract<ProfilePose,{kind:"bass"}>,"kind"|"bass"> | {kind:"walk"};
  switch(action.kind) {
    case "walk": {
      const speed=action.speed??30;
      if(!Number.isFinite(speed)||speed<0) throw new RangeError("Profile speed must be finite and non-negative");
      const motion=portraitMotion(t,"walk",{speed,stride:28,footLift:12});
      travel=motion.travel;
      feet={left:[-hipHalf+motion.feet.left.x,-motion.feet.left.lift],right:[hipHalf+motion.feet.right.x,-motion.feet.right.lift]};
      const swing=motion.armSwing*3;
      left=[-shoulderHalf-swing,shoulder.y+armReach];
      right=[shoulderHalf+swing,shoulder.y+armReach];
      const length=profileLegLength(profile)*2*0.99;
      for(const [x,foot] of [[-hipHalf,feet.left],[hipHalf,feet.right]] satisfies [number,FigurePoint][]) {
        const dx=foot[0]-x;
        bodyY=Math.max(bodyY,foot[1]-12-hip.y-Math.sqrt(length*length-dx*dx));
      }
      headAngle=motion.armSwing*0.25;
      item={kind:"walk"};
      break;
    }
    case "phone": {
      const amount=inOut((t-.25)/.95)*(1-inOut((t-4.4)/1.1));
      const raised: FigurePoint=[Math.max(profile.head.rx+24,shoulder.half+41),shoulder.y-6];
      right=mixPoint(right,raised,amount);
      const origin: FigurePoint=[right[0]-16,right[1]-18];
      headAngle=7*amount; headTurn=amount; gaze=[5*amount,5*amount];
      item={kind:"phone",phone:{origin,grip:right,touch:inOut((t-2.1)/.3)*(1-inOut((t-2.65)/.3))}};
      break;
    }
    case "bass": {
      const bpm=action.bpm??112;
      if(!Number.isFinite(bpm)||bpm<=0||bpm>240) throw new RangeError("Profile bass bpm must be within (0,240]");
      const beats=t*bpm/60;
      bodyY=(1-Math.cos(beats*Math.PI*2))*.7;
      const origin: FigurePoint=[-9,shoulder.y+73], angle=-24+Math.sin(beats*Math.PI)*1.5;
      const fret=111+10*inOut((beats%8-2)/.6)-10*inOut((beats%8-6)/.6);
      left=figurePropPoint(origin,angle,[-9,0]);right=figurePropPoint(origin,angle,[fret,0]);
      headAngle=Math.sin(beats*Math.PI)*3;gaze=[3,2];
      item={kind:"bass",bass:{origin,angle,fret,pluck:Math.sin(beats*Math.PI*4),neckGrip:right,stringContact:left}};
      break;
    }
  }
  const legLength=profileLegLength(profile);
  const blinkPhase=t%3.7;
  const blink=1-.92*Math.sin(Math.PI*Math.min(1,Math.max(0,(blinkPhase-3.35)/.18)));
  return {travel,bodyY,headAngle,headTurn,gaze,blink,facing:walking?"three-quarter":"front",feet,
    arms:{left:solveFigureLimb([-shoulderHalf,shoulder.y],left,profile.armLength,profile.armLength,1),
      right:solveFigureLimb([shoulderHalf,shoulder.y],right,profile.armLength,profile.armLength,walking?-1:1)},
    legs:{left:solveFigureLimb([-hipHalf,hip.y], [feet.left[0],feet.left[1]-12-bodyY],legLength,legLength,-1),
      right:solveFigureLimb([hipHalf,hip.y], [feet.right[0],feet.right[1]-12-bodyY],legLength,legLength,-1)},...item};
}
