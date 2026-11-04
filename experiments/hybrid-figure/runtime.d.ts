import type {HybridOptions,HybridFrame,HybridAction} from './src/types';
export const ACTIONS:readonly HybridAction[];
export function createSampler():(options:HybridOptions)=>HybridFrame;
export const sampleAt:ReturnType<typeof createSampler>;
