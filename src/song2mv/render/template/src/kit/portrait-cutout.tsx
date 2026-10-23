import React, { useId } from "react";

export type PortraitCutoutProps = {
  x?: number;
  y?: number;
  s?: number;
  anchor: [number, number];
  path: string;
  children: React.ReactNode;
};

/**
 * A portrait (an <image>, or any drawing) clipped to `path`, both in the source's own coordinates, scaled by `s` and
 * placed so that `anchor`, its neckline, lands at (x, y). Clip a bust to the head and neck before putting it on a
 * PortraitBody, or its shoulders double the body's.
 */
export function PortraitCutout({ x = 0, y = 0, s = 1, anchor, path, children }: PortraitCutoutProps) {
  const id = `portrait-${useId().replace(/:/g, "")}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(${-anchor[0]} ${-anchor[1]})`}>
      <defs>
        <clipPath id={id}>
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );
}
