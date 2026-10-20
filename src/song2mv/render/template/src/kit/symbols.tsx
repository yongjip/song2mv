import React from "react";

/**
 * Symbols songs lean on: time and love. Use inside <Svg> on the 1920×1080 stage; each is drawn around its centre.
 */

/**
 * A clock. `time` is minutes after 12:00 shown at song time `from`; `spin` advances it by that many clock minutes
 * per second of song (time flying by), 0 for a still clock. `ticks`: the second hand jumps every second, on every
 * beat of the song, or isn't drawn. `look`: a wall clock or an alarm clock (bells, legs). r is the face's radius.
 */
export const Clock: React.FC<{
  T: number; x: number; y: number; r?: number; time?: number; spin?: number; from?: number;
  ticks?: "second" | "beat" | "none"; look?: "wall" | "alarm"; color?: string; id?: string;
}> = ({ x, y, r = 160 }) => (
  // placeholder until the clock is drawn
  <g transform={`translate(${x} ${y})`}>
    <circle r={r} fill="#e8e6df" />
    <circle r={r} fill="none" stroke="#3a3550" strokeWidth={r * 0.08} />
  </g>
);

/**
 * A heart. `beat` 0–1 makes it pulse on the song's beat; `crack` 0–1 breaks it: a jagged crack opens down the
 * middle and the two halves drift apart and tilt (1 = fully broken). `glow` adds a soft halo. ~240 px wide at s = 1.
 */
export const Heart: React.FC<{
  T: number; x: number; y: number; s?: number; color?: string; beat?: number; crack?: number; glow?: number; id?: string;
}> = ({ x, y, s = 1, color = "#ff3355" }) => (
  // placeholder until the heart is drawn
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M 0 90 C -40 60 -120 10 -120 -40 C -120 -100 -50 -120 0 -70 C 50 -120 120 -100 120 -40 C 120 10 40 60 0 90 Z" fill={color} />
  </g>
);
