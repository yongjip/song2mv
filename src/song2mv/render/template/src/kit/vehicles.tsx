import React from "react";

/**
 * Vehicles for journeys, departures and long distance. Use inside <Svg> on the 1920×1080 stage. Seen from the side,
 * facing right (`flip` faces left).
 */

/**
 * A car, about 520 px long at s = 1, origin at the middle of the ground line under its wheels. `distance` is how far
 * it has travelled (px at s = 1): the wheels turn by it, so pass the same value you move x by and they won't skid.
 * `lights` turns on head- and tail-lights with a beam (night). `bounce` 0–1 adds a little suspension bob.
 */
export const Car: React.FC<{
  T: number; x: number; y: number; s?: number; color?: string; flip?: boolean; lights?: boolean; distance?: number;
  bounce?: number; id?: string;
}> = ({ x, y, s = 1, flip = false, color = "#e04a5f" }) => (
  // placeholder until the car is drawn
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <rect x={-260} y={-150} width={520} height={110} rx={30} fill={color} />
    <circle cx={-160} cy={-40} r={44} fill="#1a1d2e" />
    <circle cx={160} cy={-40} r={44} fill="#1a1d2e" />
  </g>
);

/**
 * An airliner, about 460 px long at s = 1, origin at its centre. `trail` is the length of the contrail behind it
 * (px, fading out); `lights` blinks the navigation lights and strobes; `tilt` pitches it (degrees, + nose up).
 */
export const Plane: React.FC<{
  T: number; x: number; y: number; s?: number; flip?: boolean; trail?: number; lights?: boolean; tilt?: number; id?: string;
}> = ({ x, y, s = 1, flip = false, tilt = 0 }) => (
  // placeholder until the plane is drawn
  <g transform={`translate(${x} ${y}) rotate(${-tilt}) scale(${flip ? -s : s} ${s})`}>
    <rect x={-230} y={-22} width={460} height={44} rx={22} fill="#e8ecf4" />
  </g>
);
