import React from "react";
import { shade } from "../color";

/**
 * A toon look for any drawing: one ink outline round each character or prop, colour shaded from a lit side to a dark
 * side, a shine on round forms. Put `Defs` in the scene's <Svg> once, wrap what gets an outline in `Ink` (kit pieces
 * too: a Person, a Car), paint forms with `fill()` of a `Shade`, and draw limbs, cords and handles as a `Line`.
 */

export const colors = { ink: "#2b1410", shine: "#ffffff" };

/**
 * The scene's ink: `width` px of `ink` round the silhouette of everything an `Ink` with the same `id` holds. Only the
 * solid parts count, so a soft shadow or glow under a piece gets no outline.
 */
export const Defs: React.FC<{ id: string; ink?: string; width?: number }> = ({ id, ink = colors.ink, width = 3 }) => (
  <defs>
    <filter id={`${id}-ink`} x="-50%" y="-50%" width="200%" height="200%">
      <feComponentTransfer in="SourceAlpha" result="solid">
        <feFuncA type="linear" slope={10} intercept={-6} />
      </feComponentTransfer>
      <feMorphology in="solid" operator="dilate" radius={width} result="grown" />
      <feFlood floodColor={ink} />
      <feComposite in2="grown" operator="in" result="outline" />
      <feMerge>
        <feMergeNode in="outline" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

/** Its children inside one outline, drawn by `Defs id` */
export const Ink: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <g filter={`url(#${id}-ink)`}>{children}</g>
);

/** A gradient `id` from `color`: light at the top, dark at the bottom; `round` lights a ball from the top left */
export const Shade: React.FC<{ id: string; color: string; round?: boolean }> = ({ id, color, round = false }) => {
  const stops = [
    <stop key="lit" offset="0" stopColor={shade(color, 1.35)} />,
    <stop key="base" offset="0.55" stopColor={color} />,
    <stop key="dark" offset="1" stopColor={shade(color, 0.72)} />,
  ];
  return (
    <defs>
      {round ? (
        <radialGradient id={id} cx="0.38" cy="0.3" r="0.8">{stops}</radialGradient>
      ) : (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stops}</linearGradient>
      )}
    </defs>
  );
};

/** The fill that paints with `Shade id` */
export const fill = (id: string) => `url(#${id})`;

/** A shine on a round form, an ellipse centred at (x, y) on its lit side */
export const Shine: React.FC<{ x: number; y: number; rx: number; ry?: number; rotate?: number; opacity?: number }> = ({
  x, y, rx, ry = rx * 0.55, rotate = -30, opacity = 0.7,
}) => <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${rotate} ${x} ${y})`} fill={colors.shine} opacity={opacity} />;

/** A stroke with an outline of its own, `ink` px each side: limbs, cords, handles; outside an `Ink`, or it gets two */
export const Line: React.FC<{ d: string; width: number; color: string; ink?: number; inkColor?: string }> = ({
  d, width, color, ink = 4, inkColor = colors.ink,
}) => (
  <>
    <path d={d} fill="none" stroke={inkColor} strokeWidth={width + ink * 2} strokeLinecap="round" strokeLinejoin="round" />
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </>
);
