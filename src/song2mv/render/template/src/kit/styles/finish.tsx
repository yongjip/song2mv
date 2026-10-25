import React from "react";

/**
 * Finishes for a whole frame, over any style: `Film` an old print (sepia or black and white, grain, scratches, dust,
 * flicker, gate weave, a vignette), `Vhs` a tape played back (colour fringing, scanlines, a rolling band, a play mark
 * and a counter), `Print` a halftone print in cyan, magenta, yellow and black dots off register. Wrap the frame,
 * camera and all, `w` × `h` from (0, 0). `step(T)` holds a picture for a twelfth of a second, as film animation was.
 */

export const step = (T: number, fps = 12) => Math.floor(T * fps + 1e-6) / fps;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const TONES = {
  sepia: "0.36 0.72 0.18 0 0  0.32 0.64 0.16 0 0  0.25 0.5 0.12 0 0  0 0 0 1 0",
  bw: "0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0",
};

export const Film: React.FC<{
  id: string; T: number; tone?: keyof typeof TONES; w?: number; h?: number; children: React.ReactNode;
}> = ({ id, T, tone = "sepia", w = 1920, h = 1080, children }) => {
  const k = Math.floor(T * 12 + 1e-6);
  const lit = (0.94 + 0.08 * hash(k)) * 1.1;
  const [dx, dy] = [(hash(k + 3) - 0.5) * 3, (hash(k + 7) - 0.5) * 2];
  return (
    <g>
      <defs>
        <filter id={`${id}-film`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={TONES[tone]} result="toned" />
          <feComponentTransfer in="toned" result="lit">
            <feFuncR type="linear" slope={lit} intercept={-0.04} />
            <feFuncG type="linear" slope={lit} intercept={-0.04} />
            <feFuncB type="linear" slope={lit} intercept={-0.04} />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={2} seed={k % 97} result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="grey" />
          <feComposite in="lit" in2="grey" operator="arithmetic" k2={0.86} k3={0.24} k4={-0.1} />
        </filter>
        <radialGradient id={`${id}-vignette`} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.6" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#1a1008" stopOpacity={0.75} />
        </radialGradient>
        <clipPath id={`${id}-frame`}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        <g filter={`url(#${id}-film)`}>
          <g transform={`translate(${dx} ${dy})`}>{children}</g>
        </g>
        {[0, 1, 2].map((i) => {
          if (hash(k * 3 + i) < 0.45) return null;
          const x = hash(k * 5 + i) * w;
          return <line key={i} x1={x} y1={0} x2={x + (hash(k + i) - 0.5) * 20} y2={h} stroke="#f5ead2" strokeWidth={1.6} opacity={0.35} />;
        })}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={`d${i}`} cx={hash(k * 11 + i) * w} cy={hash(k * 13 + i) * h} r={1.5 + 3 * hash(k * 17 + i)} fill="#1a1008" opacity={0.5} />
        ))}
        <rect width={w} height={h} fill={`url(#${id}-vignette)`} />
      </g>
    </g>
  );
};

export const Vhs: React.FC<{
  id: string; T: number; label?: string; w?: number; h?: number; children: React.ReactNode;
}> = ({ id, T, label = "PLAY ▶", w = 1920, h = 1080, children }) => {
  const band = ((T * 0.35) % 1.2) * h - 0.1 * h;
  const s = (w / 1920) * 1;
  return (
    <g>
      <defs>
        <filter id={`${id}-vhs`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={0.9} result="soft" />
          <feColorMatrix in="soft" type="saturate" values="1.35" result="sat" />
          <feColorMatrix in="sat" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feColorMatrix in="sat" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="sat" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="r" dx={4} result="rs" />
          <feOffset in="b" dx={-4} result="bs" />
          <feBlend in="rs" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bs" mode="screen" result="rgb" />
          <feTurbulence type="fractalNoise" baseFrequency="0.0008 0.35" numOctaves={1} seed={Math.floor(T * 30) % 50} result="jitter" />
          <feDisplacementMap in="rgb" in2="jitter" scale={7} xChannelSelector="R" yChannelSelector="A" />
        </filter>
        <pattern id={`${id}-scan`} width={4} height={4} patternUnits="userSpaceOnUse">
          <rect width={4} height={2} fill="#000" opacity={0.22} />
        </pattern>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.16} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={`${id}-frame`}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        <g filter={`url(#${id}-vhs)`}>{children}</g>
        <rect width={w} height={h} fill={`url(#${id}-scan)`} />
        <rect y={band} width={w} height={0.08 * h} fill={`url(#${id}-band)`} />
        <g fontFamily="'Courier New', monospace" fontWeight={700} fill="#ffffff" opacity={0.9}>
          <text x={70 * s} y={110 * s} fontSize={56 * s}>{label}</text>
          <text x={w - 70 * s} y={h - 70 * s} textAnchor="end" fontSize={48 * s}>
            {`0:${String(Math.floor(T / 60) % 60).padStart(2, "0")}:${String(Math.floor(T) % 60).padStart(2, "0")}`}
          </text>
        </g>
      </g>
    </g>
  );
};

const DOT = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><defs><radialGradient id='d' r='0.72'>" +
    "<stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#fff'/></radialGradient></defs>" +
    "<rect width='10' height='10' fill='url(#d)'/></svg>",
);

const INKS = [
  { name: "c", color: "#00a0dc", tone: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 0 0 0 1", screen: [0, 0], shift: [0, 0] },
  { name: "m", color: "#e6007e", tone: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -1 0 0 1", screen: [3, 5], shift: [2.5, 1.5] },
  { name: "y", color: "#ffe100", tone: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -1 0 1", screen: [6, 2], shift: [-1.5, 2] },
] as const;

export const Print: React.FC<{ id: string; w?: number; h?: number; children: React.ReactNode }> = ({
  id, w = 1920, h = 1080, children,
}) => (
  <g>
    <defs>
      <filter id={`${id}-print`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={`data:image/svg+xml;utf8,${DOT}`} x={0} y={0} width={10} height={10} result="cell" />
        <feTile in="cell" result="screenRGB" />
        <feColorMatrix in="screenRGB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.3 0.59 0.11 0 0" result="screen" />
        <feFlood floodColor="#f6f1e6" result="paper" />
        {INKS.map((ink) => (
          <React.Fragment key={ink.name}>
            <feColorMatrix in="SourceGraphic" type="matrix" values={ink.tone} result={`${ink.name}Tone`} />
            <feOffset in="screen" dx={ink.screen[0]} dy={ink.screen[1]} result={`${ink.name}Screen`} />
            <feComposite in={`${ink.name}Tone`} in2={`${ink.name}Screen`} operator="arithmetic" k2={1.35} k3={-1} k4={-0.12} result={`${ink.name}Raw`} />
            <feComponentTransfer in={`${ink.name}Raw`} result={`${ink.name}Dots`}>
              <feFuncA type="linear" slope={12} intercept={-0.5} />
            </feComponentTransfer>
            <feFlood floodColor={ink.color} />
            <feComposite in2={`${ink.name}Dots`} operator="in" result={`${ink.name}Ink0`} />
            <feOffset in={`${ink.name}Ink0`} dx={ink.shift[0]} dy={ink.shift[1]} result={`${ink.name}Ink`} />
          </React.Fragment>
        ))}
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.3 -0.59 -0.11 0 1" result="kTone" />
        <feComposite in="kTone" in2="screen" operator="arithmetic" k2={1.6} k3={-1} k4={-0.75} result="kRaw" />
        <feComponentTransfer in="kRaw" result="kDots">
          <feFuncA type="linear" slope={12} intercept={-0.5} />
        </feComponentTransfer>
        <feFlood floodColor="#1c1a1f" />
        <feComposite in2="kDots" operator="in" result="kInk" />
        <feBlend in="cInk" in2="paper" mode="multiply" result="p1" />
        <feBlend in="mInk" in2="p1" mode="multiply" result="p2" />
        <feBlend in="yInk" in2="p2" mode="multiply" result="p3" />
        <feBlend in="kInk" in2="p3" mode="multiply" />
      </filter>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={0.8} numOctaves={2} seed={5} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0.25 -0.07" />
      </filter>
      <clipPath id={`${id}-frame`}>
        <rect width={w} height={h} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-frame)`}>
      <g filter={`url(#${id}-print)`}>{children}</g>
      <rect width={w} height={h} filter={`url(#${id}-grain)`} />
    </g>
  </g>
);
