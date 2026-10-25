import React from "react";

/**
 * Line art from any drawing: `Lines` traces the outline of what it holds and the edges inside it where the brightness
 * changes, and draws only those lines, in one of four looks; `Paper` lays the look's ground. Kit pieces go in as they
 * are; their soft shadows and glows leave no line.
 */

export const looks = {
  ink: { paper: "#f3ead7", line: "#231d18", width: 0.9, glow: 0, rough: 0, detail: 0.6 },
  chalk: { paper: "#22382c", line: "#eeeadc", width: 1.2, glow: 0, rough: 2.5, detail: 0.6 },
  blueprint: { paper: "#1f4f8f", line: "#e6f0ff", width: 0.6, glow: 0, rough: 0, detail: 0.6 },
  neon: { paper: "#140b13", line: "#ff5ad8", width: 0.8, glow: 4, rough: 0, detail: 1.0 },
} as const;

export type Look = keyof typeof looks;

const LUM = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.3 0.59 0.11 0 0";

/**
 * Its children as lines in `look`, `color` instead of the look's line colour. `soften` blurs the drawing before it is
 * traced, in px at its own scale, to drop small detail.
 */
export const Lines: React.FC<{
  id: string; look: Look; color?: string; soften?: number; region?: [number, number, number, number]; children: React.ReactNode;
}> = ({ id, look, color, soften = 0, region, children }) => {
  const L = looks[look];
  return (
    <>
      <defs>
        <filter id={`${id}-line`} colorInterpolationFilters="sRGB" {...(region
          ? { filterUnits: "userSpaceOnUse", x: region[0], y: region[1], width: region[2], height: region[3] }
          : { x: "-10%", y: "-10%", width: "120%", height: "120%" })}>
          <feComponentTransfer in="SourceGraphic" result="solid">
            <feFuncA type="linear" slope={10} intercept={-6} />
          </feComponentTransfer>
          <feMorphology in="solid" operator="dilate" radius={1} result="grown" />
          <feComposite in="grown" in2="solid" operator="arithmetic" k2={1} k3={-1} result="ring" />
          <feFlood floodColor="#7f7f7f" result="grey" />
          <feComposite in="solid" in2="grey" operator="over" result="flat" />
          {soften > 0 ? <feGaussianBlur in="flat" stdDeviation={soften} result="soft" /> : <feOffset in="flat" result="soft" />}
          {/* 1.01, not 1: an offset lands on whole pixels, and at half size Chrome rounds its half up in software and
              down on the GPU, where the shifted copy then matches the drawing and the lines inside vanish */}
          <feOffset in="soft" dx={1.01} result="sx" />
          <feComposite in="sx" in2="grey" operator="over" result="softX" />
          <feOffset in="soft" dy={1.01} result="sy" />
          <feComposite in="sy" in2="grey" operator="over" result="softY" />
          <feColorMatrix in="soft" type="matrix" values={LUM} result="lum" />
          <feColorMatrix in="softX" type="matrix" values={LUM} result="lx" />
          <feColorMatrix in="softY" type="matrix" values={LUM} result="ly" />
          <feComposite in="lum" in2="lx" operator="arithmetic" k2={1} k3={-1} result="dx1" />
          <feComposite in="lx" in2="lum" operator="arithmetic" k2={1} k3={-1} result="dx2" />
          <feComposite in="lum" in2="ly" operator="arithmetic" k2={1} k3={-1} result="dy1" />
          <feComposite in="ly" in2="lum" operator="arithmetic" k2={1} k3={-1} result="dy2" />
          <feComposite in="dx1" in2="dx2" operator="arithmetic" k2={1} k3={1} result="dx" />
          <feComposite in="dy1" in2="dy2" operator="arithmetic" k2={1} k3={1} result="dy" />
          <feComposite in="dx" in2="dy" operator="arithmetic" k2={2.5} k3={2.5} result="inside" />
          <feComposite in="inside" in2="ring" operator="arithmetic" k2={1} k3={4} result="edgeA" />
          <feComponentTransfer in="edgeA" result="edge">
            <feFuncA type="linear" slope={3} intercept={-L.detail} />
          </feComponentTransfer>
          <feMorphology in="edge" operator="dilate" radius={L.width} result="thick" />
          <feGaussianBlur in="thick" stdDeviation={0.6} result="blurred" />
          <feComponentTransfer in="blurred" result="smooth">
            <feFuncA type="linear" slope={3} intercept={-0.9} />
          </feComponentTransfer>
          <feGaussianBlur in="smooth" stdDeviation={1.5 + L.width} result="density" />
          <feComponentTransfer in="density" result="blobs">
            <feFuncA type="linear" slope={6} intercept={-4.2} />
          </feComponentTransfer>
          <feComposite in="smooth" in2="blobs" operator="out" result="clean" />
          {L.rough > 0 ? (
            <>
              <feTurbulence type="fractalNoise" baseFrequency={0.8} numOctaves={2} seed={7} result="noise" />
              <feDisplacementMap
                in="clean" in2="noise" scale={L.rough * 2} xChannelSelector="R" yChannelSelector="G" result="moved"
              />
              <feComponentTransfer in="noise" result="grain">
                <feFuncA type="discrete" tableValues="0 1 1 1 1" />
              </feComponentTransfer>
              <feComposite in="moved" in2="grain" operator="in" result="shape" />
            </>
          ) : (
            <feOffset in="clean" result="shape" />
          )}
          <feFlood floodColor={color ?? L.line} />
          <feComposite in2="shape" operator="in" result="lines" />
          {L.glow > 0 && <feGaussianBlur in="lines" stdDeviation={L.glow} result="halo" />}
          <feMerge>
            {L.glow > 0 && <feMergeNode in="halo" />}
            <feMergeNode in="lines" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-line)`}>{children}</g>
    </>
  );
};

/** The ground of a look, `w` × `h` from (0, 0): grained paper, a chalkboard, blueprint paper with its grid, a brick wall */
export const Paper: React.FC<{ id: string; look: Look; w?: number; h?: number }> = ({ id, look, w = 1920, h = 1080 }) => {
  const L = looks[look];
  return (
    <g>
      <defs>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={look === "chalk" ? 0.012 : 0.9} numOctaves={3} seed={11} />
          <feColorMatrix type="matrix" values={look === "chalk"
            ? "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.1 -0.01"
            : "0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.22 -0.06"} />
        </filter>
        <pattern id={`${id}-grid`} width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#7fa6dc" strokeWidth={1} opacity={0.35} />
        </pattern>
        <pattern id={`${id}-major`} width={200} height={200} patternUnits="userSpaceOnUse">
          <path d="M200 0H0V200" fill="none" stroke="#a9c4ea" strokeWidth={2} opacity={0.45} />
        </pattern>
        <pattern id={`${id}-bricks`} width={160} height={80} patternUnits="userSpaceOnUse">
          <path d="M0 0H160M0 40H160M0 80H160M40 0V40M120 40V80" fill="none" stroke="#2a1822" strokeWidth={4} />
        </pattern>
        <radialGradient id={`${id}-dark`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.55} />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill={L.paper} />
      {(look === "ink" || look === "chalk") && <rect width={w} height={h} filter={`url(#${id}-grain)`} />}
      {look === "blueprint" && (
        <>
          <rect width={w} height={h} fill={`url(#${id}-grid)`} />
          <rect width={w} height={h} fill={`url(#${id}-major)`} />
        </>
      )}
      {look === "neon" && (
        <>
          <rect width={w} height={h} fill={`url(#${id}-bricks)`} />
          <rect width={w} height={h} fill={`url(#${id}-dark)`} />
        </>
      )}
    </g>
  );
};
