import React from "react";

/**
 * Watercolour for any drawing: `Paint` turns what it holds, kit pieces included, into washes: edges that wander, colour
 * thinned and uneven, pigment settling in the paper's grain and pooling darker at the edges of each wash, over a pencil
 * underdrawing traced from the same drawing. `Paper` lays the sheet; paint goes on it.
 */

export const colors = { paper: "#f8f2e4", pencil: "#5b524a" };

const LUM = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.3 0.59 0.11 0 0";


/** Cold-press paper, `w` × `h` from (0, 0) */
export const Paper: React.FC<{ id: string; w?: number; h?: number }> = ({ id, w = 1920, h = 1080 }) => (
  <g>
    <defs>
      <filter id={`${id}-mottle`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={0.01} numOctaves={3} seed={4} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0.18 -0.04" />
      </filter>
      <filter id={`${id}-tooth`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={0.75} numOctaves={2} seed={8} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0.25 -0.08" />
      </filter>
    </defs>
    <rect width={w} height={h} fill={colors.paper} />
    <rect width={w} height={h} filter={`url(#${id}-mottle)`} />
    <rect width={w} height={h} filter={`url(#${id}-tooth)`} />
  </g>
);

/**
 * Its children in watercolour, on whatever is under them (a `Paper`). `wobble` is how far the edges wander, `seed`
 * where the blooms fall (give neighbours different seeds), `pencil` the underdrawing. A world wider than the frame
 * paints only `region`, [x, y, w, h] in its own units (the stage, say); by default the filter covers what it holds.
 */
export const Paint: React.FC<{
  id: string; wobble?: number; seed?: number; pencil?: boolean; region?: [number, number, number, number]; children: React.ReactNode;
}> = ({ id, wobble = 8, seed = 3, pencil = true, region, children }) => (
  <>
    <defs>
      <filter id={`${id}-paint`} colorInterpolationFilters="sRGB" {...(region
        ? { filterUnits: "userSpaceOnUse", x: region[0], y: region[1], width: region[2], height: region[3] }
        : { x: "-12%", y: "-12%", width: "124%", height: "124%" })}>
        <feComponentTransfer in="SourceGraphic" result="solid">
          <feFuncA type="linear" slope={10} intercept={-6} />
        </feComponentTransfer>
        <feFlood floodColor="#ffffff" result="white" />
        <feComposite in="solid" in2="white" operator="over" result="onWhite" />
        {/* 1.51, not 1.5: an offset lands on whole pixels, and Chrome rounds a half up in software, down on the GPU */}
        <feOffset in="onWhite" dx={1.51} result="sx" />
        <feComposite in="sx" in2="white" operator="over" result="shiftX" />
        <feOffset in="onWhite" dy={1.51} result="sy" />
        <feComposite in="sy" in2="white" operator="over" result="shiftY" />
        <feColorMatrix in="onWhite" type="matrix" values={LUM} result="lum" />
        <feColorMatrix in="shiftX" type="matrix" values={LUM} result="lx" />
        <feColorMatrix in="shiftY" type="matrix" values={LUM} result="ly" />
        <feComposite in="lum" in2="lx" operator="arithmetic" k2={1} k3={-1} result="dx1" />
        <feComposite in="lx" in2="lum" operator="arithmetic" k2={1} k3={-1} result="dx2" />
        <feComposite in="lum" in2="ly" operator="arithmetic" k2={1} k3={-1} result="dy1" />
        <feComposite in="ly" in2="lum" operator="arithmetic" k2={1} k3={-1} result="dy2" />
        <feComposite in="dx1" in2="dx2" operator="arithmetic" k2={1} k3={1} result="dx" />
        <feComposite in="dy1" in2="dy2" operator="arithmetic" k2={1} k3={1} result="dy" />
        <feComposite in="dx" in2="dy" operator="arithmetic" k2={3} k3={3} result="edges" />
        <feTurbulence type="fractalNoise" baseFrequency={0.03} numOctaves={2} seed={seed} result="warp" />
        <feDisplacementMap in="solid" in2="warp" scale={wobble} xChannelSelector="R" yChannelSelector="G" result="wobbly" />
        <feGaussianBlur in="wobbly" stdDeviation={2.2} result="bleed" />
        <feColorMatrix in="bleed" type="matrix" values="0.62 0 0 0 0.34  0 0.62 0 0 0.34  0 0 0.62 0 0.34  0 0 0 1 0" result="wash" />
        <feTurbulence type="fractalNoise" baseFrequency={0.012} numOctaves={2} seed={seed + 2} result="bloomNoise" />
        <feColorMatrix in="bloomNoise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 0.35" result="bloom" />
        <feComposite in="wash" in2="bloom" operator="in" result="uneven" />
        <feTurbulence type="fractalNoise" baseFrequency={0.55} numOctaves={2} seed={seed + 5} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0.45 0 0 0 0.7  0.45 0 0 0 0.7  0.45 0 0 0 0.7  0 0 0 0 1" result="grainGrey" />
        <feComposite in="uneven" in2="grainGrey" operator="arithmetic" k1={1} result="granular" />
        <feDisplacementMap in="edges" in2="warp" scale={wobble} xChannelSelector="R" yChannelSelector="G" result="wobblyEdges" />
        <feGaussianBlur in="wobblyEdges" stdDeviation={1.4} result="poolMask" />
        <feColorMatrix in="granular" type="matrix" values="0.68 0 0 0 0  0 0.68 0 0 0  0 0 0.68 0 0  0 0 0 1 0" result="darker" />
        <feComposite in="darker" in2="poolMask" operator="in" result="pool0" />
        <feComposite in="pool0" in2="wobbly" operator="in" result="pool" />
        <feComponentTransfer in="bleed" result="inner">
          <feFuncA type="linear" slope={4} intercept={-2.6} />
        </feComponentTransfer>
        <feComposite in="wobbly" in2="inner" operator="out" result="rim" />
        <feGaussianBlur in="rim" stdDeviation={1.1} result="rimSoft" />
        <feColorMatrix in="rimSoft" type="matrix" values="0.5 0 0 0 0  0 0.5 0 0 0  0 0 0.5 0 0  0 0 0 0.75 0" result="rimDark" />
        {pencil && (
          <>
            <feComponentTransfer in="edges" result="graphite">
              <feFuncA type="linear" slope={1.6} intercept={-0.45} />
            </feComponentTransfer>
            <feFlood floodColor={colors.pencil} floodOpacity={0.6} />
            <feComposite in2="graphite" operator="in" result="pencilLines" />
          </>
        )}
        <feMerge>
          <feMergeNode in="granular" />
          <feMergeNode in="pool" />
          <feMergeNode in="rimDark" />
          {pencil && <feMergeNode in="pencilLines" />}
        </feMerge>
      </filter>
    </defs>
    <g style={{ mixBlendMode: "multiply" }} filter={`url(#${id}-paint)`}>{children}</g>
  </>
);
