import {Vector3} from 'three';
export {solveLimb,keys,ease} from './gait-source.js';
export const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
export const PROFILE=Object.freeze({waist:.94,pelvis:.845,hip:.80,shoulder:.50,shoulderHalf:.35,head:.88,upperArm:.35,forearm:.33,thigh:.35,shin:.34,footScale:.9});
