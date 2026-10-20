import React from "react";

/**
 * Weather and celebration over the whole stage. Use inside <Svg> on the 1920×1080 stage, usually in front of the
 * scene. Everything is a pure function of T (and of the burst times you pass), so put bursts on the beat with
 * `grid.bar(k)` or a line's word times.
 */

/**
 * Rain falling at `angle` degrees from vertical; `strength` 0–1 scales how much. With `ground` (a y), drops splash
 * there. Nearer drops are longer, brighter and faster.
 */
export const Rain: React.FC<{
  T: number; n?: number; angle?: number; speed?: number; color?: string; strength?: number; ground?: number; seed?: number; id?: string;
}> = () => null; // placeholder until the rain is drawn

/** One firework: it launches from below, bursts at (x, y) at time t and falls and fades over about two seconds */
export type Burst = { t: number; x: number; y: number; color?: string; size?: number; kind?: "peony" | "willow" | "ring" };

/** Fireworks: each burst with a rising rocket trail before t, a flash and sparks after it */
export const Fireworks: React.FC<{ T: number; bursts: Burst[]; id?: string }> = () => null; // placeholder

/** Confetti raining down from time `from`: paper pieces that tumble and flutter as they fall */
export const Confetti: React.FC<{ T: number; from?: number; n?: number; colors?: string[]; seed?: number; id?: string }> = () => null; // placeholder
