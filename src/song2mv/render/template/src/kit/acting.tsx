import React from "react";
import { clamp01, inOut } from "./math";

export type ReactionTiming = { delay?: number; rise?: number; hold?: number; release?: number };

/** A finite reaction after an event, in song seconds. Drive the event at its word time, then the witness with this. */
export function reactionAt(T: number, event: number, { delay = 0.12, rise = 0.18, hold = 0.65, release = 0.25 }: ReactionTiming = {}): number {
  if (![T, event, delay, rise, hold, release].every(Number.isFinite) || Math.min(delay, rise, hold, release) < 0) {
    throw new RangeError("Reaction times must be finite and durations non-negative");
  }
  const t = T - event - delay;
  if (t < 0) return 0;
  if (t < rise) return inOut(t / rise);
  if (t <= rise + hold) return 1;
  return release === 0 ? 0 : 1 - inOut((t - rise - hold) / release);
}

export type Expression = "curious" | "startled" | "angry" | "delighted" | "deadpan";

/** Facial features only, centred between the eyes; about 120 by 160 px at s=1. Put them on a head, a mug or a prop. */
export const ReactionFace: React.FC<{
  x?: number; y?: number; s?: number; expression?: Expression; amount?: number; look?: number; ink?: string; white?: string;
}> = ({ x = 0, y = 0, s = 1, expression = "curious", amount = 1, look = 0, ink = "#24252b", white = "#fff7e8" }) => {
  const k = clamp01(amount), gaze = Math.max(-1, Math.min(1, look));
  const startled = expression === "startled" ? k : 0;
  const angry = expression === "angry" ? k : 0;
  const glad = expression === "delighted" ? k : 0;
  const dead = expression === "deadpan" ? k : 0;
  const curious = expression === "curious" ? k : 0;
  const eyeH = 16 + 9 * startled - 12 * dead - 7 * glad;
  const mouthW = 18 + 10 * startled + 17 * glad;
  const mouthH = 2 + 33 * startled + 18 * glad;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} data-expression={expression} stroke="none">
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${side * 29} 0)`}>
          <ellipse rx={13 + 4 * startled} ry={eyeH} fill={white} />
          <ellipse cx={gaze * 6} cy={2 - startled * 2} rx={5} ry={Math.min(9, eyeH * 0.72)} fill={ink} />
          <path d={`M-18 ${-25 - startled * 13 - (side === -1 ? curious * 12 : 0) + side * angry * 9} Q0 ${-30 - startled * 12} 18 ${-25 - startled * 13 - side * angry * 9}`}
            fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" />
        </g>
      ))}
      <path transform={`translate(0 ${startled * 26})`} d={`M${-mouthW} 43 Q0 ${42 - angry * 17 - startled * 28 + dead * 2} ${mouthW} 43 Q${mouthW + 3} ${43 + mouthH} 0 ${44 + mouthH} Q${-mouthW - 3} ${43 + mouthH} ${-mouthW} 43Z`}
        fill={ink} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
      {glad > 0.4 && <path d={`M${-mouthW + 5} 45H${mouthW - 5}L${mouthW - 11} 53H${-mouthW + 11}Z`} fill={white} />}
    </g>
  );
};
