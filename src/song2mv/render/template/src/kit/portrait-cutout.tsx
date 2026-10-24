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


/** A small downwards nod for a flat portrait, preserving its neckline. This projects the head plane, not the eyes. */
export function portraitHeadTransform({neck, angle = 0, pitch = 0}: {
  neck: readonly [number, number]; angle?: number; pitch?: number;
}): string {
  if (!Array.isArray(neck) || neck.length !== 2 || ![neck[0], neck[1], angle, pitch].every(Number.isFinite))
    throw new RangeError("Portrait head pose must contain finite coordinates and angles");
  const down = Math.max(0, Math.min(30, pitch));
  const height = Math.cos(down * Math.PI / 180);
  return `translate(${neck[0]} ${neck[1]}) rotate(${angle}) scale(1 ${height}) translate(${-neck[0]} ${-neck[1]})`;
}
