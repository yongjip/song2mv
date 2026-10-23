import React from "react";
import { clamp01 } from "../math";
import { PortraitHand, type HandShape } from "../portrait-body";

/**
 * Office and street props drawn flat, as on a poster, in one palette (`colors`). Use inside <Svg>; each says what its
 * (x, y) is, and `s` scales it.
 */

export const colors = {
  ink: "#141414",
  paper: "#fbf8f1",
  shade: "#e4dccb",
  red: "#de4933",
  blue: "#245c88",
  sky: "#8cc8f0",
  yellow: "#f4c21b",
};

/** A phone centred at (x, y), 380 × 720 at s = 1; `children` draw in its coordinates, the screen 334 × 622 */
export function Phone({
  x,
  y,
  s = 1,
  screen = colors.paper,
  children,
}: {
  x: number;
  y: number;
  s?: number;
  screen?: string;
  children?: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-198} y={-152} width={11} height={76} rx={5} fill="#424953" />
      <rect x={187} y={-108} width={11} height={104} rx={5} fill="#424953" />
      <rect x={-190} y={-360} width={380} height={720} rx={55} fill="#292d35" stroke={colors.ink} strokeWidth={6} />
      <path
        d="M-174 278V-302Q-174 -344 -130 -344H117"
        fill="none"
        stroke="#747b85"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path d="M176 -285V298Q176 344 129 344H-118" fill="none" stroke="#070b11" strokeWidth={6} strokeLinecap="round" />
      <rect x={-167} y={-319} width={334} height={622} rx={31} fill={screen} stroke="#10151b" strokeWidth={4} />
      <rect x={-39} y={-344} width={78} height={9} rx={5} fill="#10151b" />
      <path d="M-29 -341H29" stroke="#727985" strokeWidth={2} strokeLinecap="round" />
      <circle cx={66} cy={-339} r={6} fill="#121820" />
      <circle cx={64} cy={-341} r={2.2} fill={colors.sky} opacity={0.65} />
      {children}
      <rect x={-44} y={327} width={88} height={6} rx={3} fill="#949ba4" />
    </g>
  );
}

/** An office block standing at (x, y), w × h, with rows of lit windows and a door (none under 160 tall), `sign` on its roof */
export function Building({
  x,
  y,
  w,
  h,
  color = colors.ink,
  win = "#f4e7b8",
  sign,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  win?: string;
  sign?: string;
}) {
  if (h <= 0) return null;
  const cols = Math.max(1, Math.floor(w / 76)),
    rows = Math.max(0, Math.floor((h - 102) / 82));
  const front = w * 0.86,
    cell = Math.max(0, front - 32) / cols;
  const window = Math.min(42, cell * 0.62),
    top = y - h;
  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} rx={Math.min(8, h / 2)} fill={color} />
      <path d={`M${x + w * 0.36} ${top}H${x + w / 2}V${y}H${x + w * 0.36}Z`} fill="#000" opacity={0.2} />
      {h > 16 && (
        <path
          d={`M${x - w / 2 + 7} ${top + 10}H${x + w * 0.36 - 5}`}
          stroke={win}
          strokeWidth={5}
          opacity={0.42}
          strokeLinecap="round"
        />
      )}
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const wx = x - w / 2 + 16 + col * cell + (cell - window) / 2,
            wy = top + 32 + row * 82;
          const dim = (row * 7 + col * 3) % 7 === 0;
          return (
            <g key={`${row}-${col}`}>
              <rect x={wx - 3} y={wy - 3} width={window + 6} height={48} rx={3} fill="#000" opacity={0.22} />
              <rect x={wx} y={wy} width={window} height={40} rx={2} fill={win} opacity={dim ? 0.26 : 0.88} />
              <path d={`M${wx} ${wy + 40}h${window}`} stroke={win} strokeWidth={4} opacity={0.36} />
              {!dim && (
                <path d={`M${wx + 4} ${wy + 5}h${window - 8}`} stroke={colors.paper} strokeWidth={3} opacity={0.38} />
              )}
            </g>
          );
        }),
      )}
      {h > 160 && (
        <g>
          <rect x={x - w * 0.23} y={y - 78} width={w * 0.32} height={78} rx={4} fill={win} opacity={0.6} />
          <path d={`M${x - w * 0.07} ${y - 74}V${y}`} stroke={color} strokeWidth={5} />
          <path
            d={`M${x - w * 0.23 + 5} ${y - 70}H${x + w * 0.09 - 5}`}
            stroke={colors.paper}
            strokeWidth={3}
            opacity={0.55}
          />
          <path
            d={`M${x - w * 0.1} ${y - 35}v16M${x - w * 0.04} ${y - 35}v16`}
            stroke={colors.paper}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <rect x={x - w * 0.27} y={y - 88} width={w * 0.4} height={12} rx={3} fill={win} opacity={0.35} />
          <path d={`M${x - w / 2} ${y - 5}H${x + w / 2}`} stroke="#000" strokeWidth={10} opacity={0.15} />
        </g>
      )}
      {sign && (
        <g>
          <path d={`M${x - w * 0.25} ${top}v-30M${x + w * 0.25} ${top}v-30`} stroke={color} strokeWidth={8} />
          <rect
            x={x - w * 0.42}
            y={top - 110}
            width={w * 0.84}
            height={96}
            rx={9}
            fill={colors.red}
            stroke={color}
            strokeWidth={5}
          />
          <path
            d={`M${x - w * 0.42 + 12} ${top - 99}H${x + w * 0.42 - 12}`}
            stroke={colors.paper}
            strokeWidth={3}
            opacity={0.35}
            strokeLinecap="round"
          />
          <text x={x} y={top - 41} textAnchor="middle" fontSize={64} fontWeight={900} fill={colors.paper}>
            {sign}
          </text>
        </g>
      )}
    </g>
  );
}

/** A traffic light, (x, y) where the pole meets the housing and the pole 520 × s long; `lit` red or green, `glow` 0–1 */
export function Light({
  x,
  y,
  s = 1,
  lit,
  glow = 0,
}: {
  x: number;
  y: number;
  s?: number;
  lit: "red" | "green";
  glow?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-14} y={0} width={28} height={520} rx={5} fill="#343b44" stroke={colors.ink} strokeWidth={4} />
      <path d="M-6 20V514" stroke="#89949e" strokeWidth={5} opacity={0.55} />
      <rect x={-91} y={-330} width={182} height={340} rx={34} fill="#343b44" stroke={colors.ink} strokeWidth={6} />
      <path d="M-77 -35V-290Q-77 -316 -48 -316H46" fill="none" stroke="#77838c" strokeWidth={4} strokeLinecap="round" />
      <path d="M78 -291V-24Q78 -4 53 -4H-48" fill="none" stroke="#111921" strokeWidth={5} strokeLinecap="round" />
      {(["red", "green"] as const).map((state, i) => {
        const cy = -245 + i * 160,
          active = lit === state,
          fill = state === "red" ? colors.red : "#21b35a";
        return (
          <g key={state}>
            <circle cy={cy} r={66} fill="#111820" />
            <circle cy={cy} r={57} fill={active ? fill : state === "red" ? "#573731" : "#304d40"} />
            <path
              d={`M-49 ${cy + 16}Q0 ${cy + 75} 49 ${cy + 16}`}
              fill="none"
              stroke="#000"
              strokeWidth={8}
              opacity={0.16}
            />
            {active && (
              <circle
                cy={cy}
                r={62 + 4 * clamp01(glow)}
                fill="none"
                stroke={fill}
                strokeWidth={3}
                opacity={0.3 + 0.2 * clamp01(glow)}
              />
            )}
            <path
              d={`M-61 ${cy - 25}Q0 ${cy - 86} 61 ${cy - 25}Q0 ${cy - 60} -61 ${cy - 25}Z`}
              fill="#202832"
              stroke={colors.ink}
              strokeWidth={3}
              strokeLinejoin="round"
            />
            <path
              d={`M-28 ${cy - 28}Q-18 ${cy - 37} -5 ${cy - 37}`}
              fill="none"
              stroke={colors.paper}
              strokeWidth={7}
              opacity={active ? 0.32 : 0.07}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

/** A chat bubble centred at (x, y), w × h, its tail pointing at `tail`; `children` draw over it */
export function Bubble({
  x,
  y,
  w,
  h,
  tail,
  color = colors.paper,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tail: [number, number];
  color?: string;
  children?: React.ReactNode;
}) {
  const offset = Math.max(-w * 0.3, Math.min(w * 0.3, (tail[0] - x) * 0.3));
  return (
    <g>
      <path
        d={`M${x + offset - 26} ${y + h * 0.36}Q${x + offset - 18} ${y + h * 0.56} ${tail[0]} ${tail[1]}Q${x + offset + 48} ${y + h * 0.55} ${x + offset + 26} ${y + h * 0.36}Z`}
        fill={color}
      />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={Math.min(h / 2, 70)} fill={color} />
      {children}
    </g>
  );
}

/** A ribbon of smoke or steam rising h from (x, y), `width` wide there and thinning, waving with T */
export function Smoke({
  T,
  x,
  y,
  h = 520,
  color = colors.paper,
  width = 14,
}: {
  T: number;
  x: number;
  y: number;
  h?: number;
  color?: string;
  width?: number;
}) {
  const point = (u: number, side: number) => [
    x + Math.sin(u * 7 - T * 2) * 48 * u + u * 48 + side * width * (0.5 - 0.38 * u),
    y - u * h,
  ];
  const left = Array.from({ length: 41 }, (_, i) => point(i / 40, -1));
  const right = Array.from({ length: 41 }, (_, i) => point(1 - i / 40, 1));
  return <path d={`M${left.join("L")}L${right.join("L")}Z`} fill={color} opacity={0.78} />;
}

/** A cloud centred at (x, y), 400 wide at s = 1 */
export function Cloud({ x, y, s = 1, color = colors.paper }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-112 82C-186 82 -193 -13 -127 -48C-107 -86 -58 -88 -29 -66C6 -151 116 -131 135 -39C210 -34 208 82 126 82Z"
        fill={color}
      />
      <path d="M-142 59Q-22 82 142 58Q131 82 108 82H-112Q-131 82 -142 59" fill="#141414" opacity={0.07} />
    </g>
  );
}

/** A lighter, its flint wheel at (x, y) and the case 370 × s below it: a flame starts at (x, y) */
export function Lighter({ x, y, s = 1, color = colors.red }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-90 64H90V332Q90 370 54 370H-54Q-90 370 -90 332Z"
        fill={color}
        stroke={colors.ink}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M62 80V326Q62 350 44 357H61Q81 357 81 334V80Z" fill="#141414" opacity={0.14} />
      <path d="M-69 111V307" stroke={colors.paper} strokeWidth={8} opacity={0.32} strokeLinecap="round" />
      <path d="M-48 349H33" stroke={colors.paper} strokeWidth={4} opacity={0.2} strokeLinecap="round" />
      <path
        d="M0 206C-3 227 -28 234 -25 255C-22 279 22 281 27 256C31 238 13 229 13 218C10 231 4 234 0 237C-7 225 1 219 0 206Z"
        fill={colors.paper}
        opacity={0.3}
      />
      <path
        d="M-90 17Q-90 0 -73 0H73Q90 0 90 17V79H-90Z"
        fill="#c4c9c9"
        stroke={colors.ink}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M-77 14H69" stroke={colors.paper} strokeWidth={5} strokeLinecap="round" opacity={0.8} />
      <path d="M71 15V67H-81" fill="none" stroke="#6d7a80" strokeWidth={7} opacity={0.65} />
      {[-52, -18, 18, 52].map((cx) => (
        <rect key={cx} x={cx - 7} y={25} width={14} height={24} rx={6} fill="#606e75" />
      ))}
      <rect x={-29} y={-25} width={58} height={28} rx={9} fill="#73808a" stroke={colors.ink} strokeWidth={4} />
      {[-17, -5, 7, 19].map((cx) => (
        <path key={cx} d={`M${cx} -18v14`} stroke="#c7ced0" strokeWidth={3} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** A take-away cup standing at (x, y), 450 tall at s = 1; `band` colours its sleeve */
export function CoffeeCup({
  x,
  y,
  s = 1,
  color = colors.paper,
  band = colors.red,
}: {
  x: number;
  y: number;
  s?: number;
  color?: string;
  band?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-150 -380H150L120 -22Q118 -5 99 -3Q0 11 -99 -3Q-118 -5 -120 -22Z"
        fill={color}
        stroke={colors.ink}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M110 -375H147L118 -23Q117 -8 99 -7L89 -6Z" fill="#141414" opacity={0.09} />
      <path d="M-143 -288Q0 -267 143 -288L132 -151Q0 -129 -132 -151Z" fill={band} />
      <path
        d="M-140 -280Q0 -261 140 -280M-130 -156Q0 -136 130 -156"
        fill="none"
        stroke={colors.ink}
        strokeWidth={3}
        opacity={0.18}
      />
      <path d="M110 -283L99 -146Q115 -147 132 -151L143 -288Z" fill={colors.ink} opacity={0.08} />
      <g transform="translate(0 -212) rotate(24)">
        <ellipse rx={20} ry={32} fill={colors.paper} opacity={0.9} />
        <path d="M3 -23C-15 -9 16 3 -3 23" fill="none" stroke={band} strokeWidth={4} strokeLinecap="round" />
      </g>
      <path
        d="M-164 -405Q-164 -420 -150 -420H150Q164 -420 164 -405V-385Q164 -371 150 -371H-150Q-164 -371 -164 -385Z"
        fill="#272d34"
        stroke={colors.ink}
        strokeWidth={5}
      />
      <path
        d="M-145 -420V-433Q-145 -449 -126 -449H126Q145 -449 145 -433V-420Z"
        fill="#424b54"
        stroke={colors.ink}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M-125 -437H22M-142 -393H137" stroke="#85919a" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
      <rect x={45} y={-440} width={53} height={11} rx={6} fill="#141b23" />
      <path d="M-116 -348L-112 -310" stroke={colors.paper} strokeWidth={7} opacity={0.7} strokeLinecap="round" />
      <path d="M-103 -30Q-3 -16 98 -30" fill="none" stroke={colors.shade} strokeWidth={3} />
    </g>
  );
}

/** An open notebook centred at (x, y), 480 wide at s = 1; `write` 0–1 fills the left page with writing; `embeddedPen` lays a pen on the right page */
export function Notebook({
  x,
  y,
  s = 1,
  write = 0,
  color = colors.paper,
  embeddedPen = true,
}: {
  x: number;
  y: number;
  s?: number;
  write?: number;
  color?: string;
  embeddedPen?: boolean;
}) {
  const notes = [
    "M-197 -94q5 -12 9 -1t11 -2q4 -9 8 -1l5 3",
    "M-154 -96q5 -12 9 -1t10 -2q4 -9 8 -1l9 2",
    "M-107 -99q5 -11 9 0t10 -2l8 1",
    "M-198 -53q5 -12 9 -1t11 -2q4 -9 8 -1l5 3",
    "M-155 -55q5 -12 9 -1t10 -2q4 -9 8 -1l5 2",
    "M-196 -12l5 5 8 -13",
    "M-170 -14q5 -12 9 -1t11 -2q4 -9 8 -1l5 3",
    "M-127 -16q5 -12 9 -1t10 -2l10 1",
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-240 -148Q-120 -174 0 -140Q120 -174 240 -148V151Q120 130 0 165Q-120 130 -240 151Z"
        fill={colors.blue}
        stroke={colors.ink}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M-231 123Q-118 102 0 140Q118 102 231 123V143Q116 122 0 158Q-116 122 -231 143Z" fill={colors.shade} />
      <path d="M-224 137Q-112 117 -4 151M4 151Q112 117 224 137" fill="none" stroke="#a8a18f" strokeWidth={2} />
      {([-1, 1] as const).map((side) => (
        <g key={side} transform={`scale(${side} 1)`}>
          <path
            d="M2 -137Q116 -171 230 -145V128Q115 107 2 146Z"
            fill={color}
            stroke="#9c9b8f"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path d="M3 -137Q14 -122 17 -106V132L3 146Z" fill={colors.shade} opacity={0.7} />
          <path d="M218 -135V116" stroke={colors.paper} strokeWidth={4} opacity={0.8} />
          {[-85, -44, -3, 38, 79].map((yy) => (
            <path
              key={yy}
              d={`M33 ${yy}Q116 ${yy - 12} 205 ${yy - 4}`}
              fill="none"
              stroke={colors.blue}
              strokeWidth={1.8}
              opacity={0.2}
            />
          ))}
        </g>
      ))}
      <path d="M0 -136V146" stroke="#9b9689" strokeWidth={2} />
      {notes.map(
        (d, i) =>
          clamp01(write * notes.length - i) > 0 && (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#364c64"
              strokeWidth={3.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - clamp01(write * notes.length - i)}
            />
          ),
      )}
      <path d="M28 -142L39 -145V-84L33 -91L28 -86Z" fill={colors.red} />
      {embeddedPen && (
        <g transform="translate(154 4) rotate(-12)">
          <path d="M-2 -115H6V101H-2Z" fill={colors.ink} opacity={0.1} transform="translate(4 3)" />
          <rect x={-5} y={-116} width={11} height={211} rx={2} fill={colors.blue} stroke="#173d5a" strokeWidth={1.5} />
          <path d="M-2 -112V91" stroke={colors.sky} strokeWidth={2.5} opacity={0.7} />
          <path d="M-5 95H6L.5 115Z" fill="#cba275" />
          <path d="M-1.7 107H2.7L.5 115Z" fill={colors.ink} />
          <rect x={-5} y={-126} width={11} height={13} rx={3} fill={colors.red} />
          <path d="M-5 -113H6" stroke="#a9b5bb" strokeWidth={5} />
        </g>
      )}
    </g>
  );
}

/** A hand in a sleeve, the wrist at (x, y) and the sleeve `length` × s behind it; `angle` 0 points the fingers down, −90 right */
export function SleevedHand({
  x,
  y,
  s = 1,
  angle = 0,
  length = 160,
  color = colors.blue,
  skin = "#eac09f",
  shape = "relaxed",
}: {
  x: number;
  y: number;
  s?: number;
  angle?: number;
  length?: number;
  color?: string;
  skin?: string;
  shape?: HandShape;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
      <path
        d={`M-13 -1L-21 ${-length}H21L13 -1Z`}
        fill={color}
        stroke={colors.ink}
        strokeOpacity={0.45}
        strokeWidth={2.3}
        strokeLinejoin="round"
      />
      <path d={`M9 -6L12 ${-length}H18L12 -6Z`} fill={colors.ink} opacity={0.15} />
      <path
        d={`M-13 -19L-17 ${-length + 6}`}
        stroke={colors.paper}
        strokeWidth={1.8}
        opacity={0.12}
        strokeLinecap="round"
      />
      <PortraitHand shape={shape} skin={skin} />
      <path
        d="M-14 -11H14L13 3H-13Z"
        fill={color}
        stroke={colors.ink}
        strokeOpacity={0.45}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M-12 -9H12L11 1H-11Z" fill={colors.paper} opacity={0.12} />
      <path d="M-9 -7H9" stroke={colors.paper} strokeWidth={1.6} opacity={0.3} strokeLinecap="round" />
    </g>
  );
}

/** A trouser pocket hanging from (x, y), w × h; `children`, in its own 1000 × 760 frame, go in behind its front */
export function Pocket({
  x,
  y,
  w = 1000,
  h = 760,
  color = colors.blue,
  children,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${w / 1000} ${h / 760})`}>
      <rect x={-500} y={0} width={1000} height={760} rx={40} fill={color} />
      <path d="M386 0H460Q500 0 500 40V760H432Z" fill={colors.ink} opacity={0.08} />
      <path d="M-438 32V730M428 32V730" stroke={colors.paper} strokeWidth={3} opacity={0.14} />
      <path d="M-370 180Q0 330 370 180V260Q0 405 -370 260Z" fill="#132638" />
      <path d="M-369 192Q0 339 369 192" fill="none" stroke={colors.ink} strokeWidth={13} opacity={0.35} />
      {children}
      <path
        d="M-370 260Q0 405 370 260V550Q369 573 348 582Q0 721 -348 582Q-369 573 -370 550Z"
        fill={color}
        stroke={colors.ink}
        strokeWidth={5}
        strokeOpacity={0.45}
        strokeLinejoin="round"
      />
      <path
        d="M331 278L329 540Q328 561 307 572Q181 627 32 637Q205 645 348 582Q369 573 370 550V260Z"
        fill={colors.ink}
        opacity={0.1}
      />
      <path
        d="M-345 283V544Q-345 558 -329 565Q0 696 329 565Q345 558 345 544V283"
        fill="none"
        stroke={colors.paper}
        strokeWidth={4}
        strokeDasharray="12 12"
        opacity={0.45}
        strokeLinecap="round"
      />
      <path d="M-366 271Q0 414 366 271" fill="none" stroke={colors.paper} strokeWidth={7} opacity={0.2} />
      <path
        d="M-370 180Q0 330 370 180"
        fill="none"
        stroke={colors.paper}
        strokeWidth={6}
        opacity={0.3}
        strokeLinecap="round"
      />
      {[-365, 365].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={273} r={11} fill="#c8a96b" stroke="#6f633e" strokeWidth={3} />
          <circle cx={cx - 3} cy={270} r={3} fill={colors.paper} opacity={0.7} />
        </g>
      ))}
    </g>
  );
}

/** A glass centred at (x, y), 500 tall at s = 1, `fill` 0–1 of `liquid` */
export function Glass({
  x,
  y,
  s = 1,
  fill = 0.75,
  liquid = colors.blue,
}: {
  x: number;
  y: number;
  s?: number;
  fill?: number;
  liquid?: string;
}) {
  const amount = clamp01(fill),
    level = 280 - 430 * amount,
    bottom = 280;
  const waterWidth = 103 + ((280 - level) * 12) / 430;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-130 -200Q0 -177 130 -200L113 283Q113 299 97 300H-97Q-113 299 -113 283Z"
        fill={colors.paper}
        opacity={0.23}
      />
      {amount > 0 && (
        <g>
          <path
            d={`M${-waterWidth} ${level}Q0 ${level + 20} ${waterWidth} ${level}L103 ${bottom}Q0 ${bottom + 13} -103 ${bottom}Z`}
            fill={liquid}
            opacity={0.63}
          />
          <ellipse cy={level} rx={waterWidth} ry={12} fill={liquid} opacity={0.78} />
          <path
            d={`M${-waterWidth + 8} ${level + 1}Q0 ${level + 14} ${waterWidth - 8} ${level + 1}`}
            fill="none"
            stroke={colors.paper}
            strokeWidth={3}
            opacity={0.35}
          />
        </g>
      )}
      <path
        d="M-130 -200L-113 283Q-113 299 -97 300H97Q113 299 113 283L130 -200"
        fill="none"
        stroke={colors.paper}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <ellipse cy={-200} rx={130} ry={13} fill={colors.paper} fillOpacity={0.1} stroke={colors.paper} strokeWidth={7} />
      <path
        d="M-96 -159L-87 94M-85 126L-81 239"
        stroke={colors.paper}
        strokeWidth={9}
        strokeLinecap="round"
        opacity={0.65}
      />
      <path d="M97 -155L88 216" stroke={colors.paper} strokeWidth={4} strokeLinecap="round" opacity={0.25} />
      <path d="M-100 281Q0 296 100 281" fill="none" stroke={colors.paper} strokeWidth={6} opacity={0.65} />
    </g>
  );
}
