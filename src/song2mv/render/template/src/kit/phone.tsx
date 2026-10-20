import React from "react";

/**
 * A smartphone seen from the front, for songs about messages, calls and waiting for a reply. Use inside <Svg> on the
 * 1920×1080 stage; about 380 × 780 px at s = 1, origin at its centre.
 *
 * - `messages` appear at their times `t` as chat bubbles stacked from the bottom (older ones move up and leave the
 *   top of the screen): `me` on the right in the accent colour, the other side on the left. A bubble pops in once
 *   and then holds still — text never wobbles.
 * - `typing` lists [from, to] spans when the other side is typing (three dots in a bubble).
 * - `call` turns the screen into an incoming call from time t (name, a pulsing answer button).
 * - `clock` is the time in the status bar; `title` the contact's name at the top of the chat.
 */
export type Message = { t: number; text: string; me?: boolean };

export const Phone: React.FC<{
  T: number; x: number; y: number; s?: number; tilt?: number; title?: string; clock?: string;
  messages?: Message[]; typing?: [number, number][]; call?: { t: number; name: string };
  dark?: boolean; accent?: string; id?: string;
}> = ({ x, y, s = 1, tilt = 0 }) => (
  // placeholder until the phone is drawn
  <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
    <rect x={-190} y={-390} width={380} height={780} rx={56} fill="#14182e" />
    <rect x={-172} y={-372} width={344} height={744} rx={42} fill="#2a3258" />
  </g>
);
