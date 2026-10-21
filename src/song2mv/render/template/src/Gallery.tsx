import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  Camera, Car, Cash, City, Flames, FlamesAlong, SleeplessStorm, Flash, Hit, HitKind, Tears, Clock, Clouds, Confetti, Crowd, Fireworks, Ground, Heart, Lantern, Lanterns, Line, Moon, Person, Phone, Plane, Rain,
  Rays, Room, Sea, Shot, SkyGradient, Storm, Strike, strikeFlashes, Song, SongContext, Street, Sun, Svg, comic, makeSongCtx, mix, paper, personHand, pixel, rng, shade, SKINS, STRIDE,
} from "./kit";
import sample from "./sample-song.json";

/**
 * The kit's people, places and objects in use, to see what there is before designing scenes:
 *   npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0    every tile at once
 *   npx remotion still src/index.ts Kit-Gallery tile.png --frame=3       one tile at full size (1…)
 * Each tile is a small scene; read its code here for how the pieces combine.
 */

type Pt = [number, number];
const { Cut, ellipse, poly, rect, strip, colors: PC } = paper;
const CLAY = mix(PC.orange, PC.brown, 0.35);

/**
 * Everyday things cut from paper with the paper style pack (kit/styles/paper.tsx): a window onto hills, a plant, a
 * mug, books, an alarm clock, a lamp and a cat. Each is a few rects, ellipses, polys and strips on Cuts, every piece
 * lifted off the paper under it. The motion runs on paper.step(T), the held steps of cut-out animation.
 */
const PaperRoom: React.FC<{ T: number }> = ({ T }) => {
  const t = paper.step(T);
  const F = 806; // the shelf top, where things stand
  const hillY = (x: number, y0: number, amp: number, k: number, ph: number) => y0 - amp * Math.sin(x * k + ph);
  const hill = (y0: number, amp: number, k: number, ph: number, seed: number) =>
    poly([...Array.from({ length: 31 }, (_, i): Pt => [200 + i * 30, hillY(200 + i * 30, y0, amp, k, ph)]), [1100, 800], [200, 800]], seed);
  const leaf = (L: number, W: number, seed: number) => {
    const at = (k: number, side: number): Pt => [side * (W / 2) * Math.pow(Math.sin(Math.PI * k), 0.8), -L * k];
    return poly([...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => at(i / 8, 1)), ...[7, 6, 5, 4, 3, 2, 1].map((i) => at(i / 8, -1))], seed, 1.5);
  };
  const heart = poly(Array.from({ length: 18 }, (_, i): Pt => {
    const a = (i / 18) * 2 * Math.PI;
    return [21 * Math.pow(Math.sin(a), 3), -1.3 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))];
  }), 46, 1);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI, p = (r: number, da: number): Pt => [r * Math.cos(a + da), r * Math.sin(a + da)];
    return poly([p(78, -0.1), p(124, 0), p(78, 0.1)], 20 + i, 1.5);
  }).join(" ");
  const cloud = (x: number, y: number, s: number, seed: number) => (
    <g transform={`translate(${x.toFixed(1)} ${y}) scale(${s})`}>
      <Cut d={ellipse(-58, 8, 46, 38, seed)} fill={PC.white} lift={3} />
      <Cut d={ellipse(60, 10, 42, 34, seed + 1)} fill={PC.white} lift={3} />
      <Cut d={ellipse(0, -10, 62, 52, seed + 2)} fill={PC.white} lift={4} />
    </g>
  );
  const tree = (x: number, y: number, s: number, seed: number) => (
    <g transform={`translate(${x} ${y.toFixed(1)}) scale(${s})`}>
      <Cut d={rect(-6, -52, 12, 52, seed)} fill={PC.brown} lift={2} />
      <Cut d={ellipse(0, -84, 34, 42, seed + 1)} fill={PC.green} lift={3} />
    </g>
  );
  // the shelf liner: a straight top over 42 scallops, a hole punched in each
  const scallops = Array.from({ length: 42 * 6 + 1 }, (_, i): Pt => {
    const a = ((i % 6) / 6) * Math.PI, x = -30 + Math.floor(i / 6) * 48;
    return [x + 24 - 24 * Math.cos(a), 834 + 18 * Math.sin(a)];
  });
  const holes = Array.from({ length: 42 }, (_, i) => ellipse(-6 + i * 48, 840, 4.5, 4.5, 37 + i, 0.5));
  const liner = [poly([[1950, 818], [-30, 818], ...scallops], 36, 1.2), ...holes].join(" ");
  const far = [520, 30, 0.006, 1] as const, mid = [578, 30, 0.008, 3] as const;
  const blink = (t + 1.3) % 4.5 < 0.17 ? 0.12 : 1;
  return (
    <Svg>
      <paper.Stack id="g13">
        {/* the view, behind the wall */}
        <Cut d={rect(200, 70, 900, 720, 11)} fill={PC.sky} />
        <Cut d={rays} x={880} y={250} rotate={t * 8} fill={PC.mustard} lift={2} />
        <Cut d={ellipse(0, 0, 60, 60, 12)} x={880} y={250} fill={paper.matte("#ffd45a")} lift={4} />
        {cloud(150 + ((t * 12 + 300) % 1000), 225, 0.9, 60)}
        {cloud(150 + ((t * 7 + 780) % 1000), 345, 0.6, 63)}
        {[0, 1].map((i) => (
          <Cut key={i} d={poly([[-20, -4 + 9 * Math.sin(t * 9 + i * 1.7)], [0, 4], [20, -4 + 9 * Math.sin(t * 9 + i * 1.7)], [0, -2]], 50 + i, 1)}
            x={150 + ((t * 46 + 330 + i * 70) % 1000)} y={190 + i * 36 + 8 * Math.sin(t * 1.3 + i)} fill={PC.navy} lift={3} />
        ))}
        <Cut d={hill(...far, 13)} fill={mix(PC.leaf, PC.sky, 0.5)} lift={2} />
        <g transform={`translate(930 ${(hillY(930, ...far) + 6).toFixed(1)})`}>
          <Cut d={rect(-40, -58, 80, 58, 200)} fill={PC.white} lift={3}>
            <Cut d={rect(-11, -32, 22, 32, 201)} fill={PC.brown} lift={0.8} />
            <Cut d={rect(16, -46, 16, 14, 202)} fill={PC.mustard} lift={0.8} />
          </Cut>
          <Cut d={rect(16, -100, 12, 30, 203)} fill={PC.red} lift={3} />
          <Cut d={poly([[-52, -54], [0, -98], [52, -54]], 204)} fill={PC.red} lift={4} />
        </g>
        {tree(1010, hillY(1010, ...far) + 4, 0.8, 205)}
        <Cut d={hill(...mid, 14)} fill={PC.leaf} lift={4} />
        {tree(700, hillY(700, ...mid) + 4, 1, 207)}
        <Cut d={hill(668, 26, 0.011, 4, 15)} fill={PC.green} lift={6} />

        {/* the wall with the window cut out of it, the frame, a curtain on its rod */}
        <Cut d={`${rect(-40, -40, 2000, 1160, 1)} ${rect(250, 120, 800, 620, 2)}`} fill={PC.teal} lift={16} />
        <Cut d={`${rect(226, 96, 848, 668, 3)} ${rect(256, 126, 788, 608, 4)}`} fill={PC.cream} lift={5} />
        <Cut d={rect(638, 126, 24, 608, 5)} fill={PC.cream} lift={12} />
        <Cut d={rect(256, 418, 788, 24, 6)} fill={PC.cream} lift={12} />
        <Cut d={poly([[168, 58], [336, 58], [322, 170], [296, 300], [266, 424], [292, 560], [322, 690], [338, 792], [272, 778], [214, 794], [164, 782]], 210)}
          fill={PC.coral} lift={18}>
          <Cut d={strip([[214, 70], [210, 250], [206, 420], [212, 600], [220, 780]], 7, 9, 211)} fill={shade(PC.coral, 0.86)} lift={0.6} />
          <Cut d={strip([[268, 70], [252, 250], [232, 410]], 6, 3, 212)} fill={shade(PC.coral, 0.86)} lift={0.6} />
          <Cut d={rect(160, 412, 112, 26, 213)} fill={PC.mustard} lift={2} />
        </Cut>
        <Cut d={rect(140, 46, 1020, 16, 214)} fill={PC.brown} lift={10} />
        <Cut d={ellipse(140, 54, 16, 16, 215)} fill={PC.brown} lift={11} />
        <Cut d={ellipse(1160, 54, 16, 16, 216)} fill={PC.brown} lift={11} />

        {/* a lamp swaying on its cord, its light a sheet of thin paper */}
        <Cut d={poly([[1372, 352], [1588, 352], [1790, 786], [1170, 786]], 105)} fill={PC.white} opacity={0.14} />
        <g transform={`rotate(${(1.2 * Math.sin(t * 1.1)).toFixed(2)} 1480 -10)`}>
          <Cut d={strip([[1480, -20], [1480, 240]], 5, 5, 101)} fill={PC.charcoal} lift={6} />
          <Cut d={ellipse(1480, 350, 28, 22, 104)} fill={paper.matte("#fff2b0")} lift={8} />
          <Cut d={poly([[1440, 236], [1520, 236], [1610, 346], [1350, 346]], 102)} fill={PC.navy} lift={10}>
            <Cut d={rect(1358, 326, 244, 12, 103)} fill={PC.mustard} lift={0.8} />
          </Cut>
        </g>

        {/* a sideboard: drawers, and a paper liner with punched holes under the top */}
        <Cut d={rect(-30, 820, 1980, 300, 31)} fill={shade(PC.kraft, 0.8)} lift={5} />
        {[150, 1030].map((x, i) => (
          <Cut key={x} d={rect(x, 884, 740, 136, 33 + i)} fill={shade(PC.kraft, 0.88)} lift={3}>
            <Cut d={ellipse(x + 370, 952, 13, 13, 35 + i)} fill={PC.brown} lift={4} />
          </Cut>
        ))}
        <Cut d={liner} fill={PC.cream} lift={2} />
        <Cut d={rect(-30, 786, 1980, 40, 32)} fill={PC.kraft} lift={7} />

        {/* a plant in a clay pot */}
        {[[-62, 150, 64], [-38, 196, 74], [-15, 226, 78], [6, 244, 80], [27, 214, 74], [48, 184, 68], [66, 146, 60]].map(([a, L, W], i) => (
          <Cut key={i} d={leaf(L, W, 110 + i)} x={420} y={F - 140} rotate={a + 2.5 * Math.sin(t * 1.4 + i)} fill={i % 2 ? PC.green : PC.leaf} lift={5 + (i % 3)}>
            <Cut d={strip([[0, -8], [0, -L * 0.5], [0, -L * 0.86]], 4, 1, 120 + i)} fill={mix(PC.leaf, PC.cream, 0.45)} lift={0.6} />
          </Cut>
        ))}
        <Cut d={poly([[-80, -126], [80, -126], [60, 0], [-60, 0]], 130)} x={420} y={F} fill={CLAY} lift={10}>
          <Cut d={rect(-92, -152, 184, 34, 131)} fill={mix(CLAY, PC.cream, 0.18)} lift={2} />
        </Cut>

        {/* a mug with a heart on it, steaming */}
        <g transform={`translate(800 ${F})`}>
          <Cut d={`${ellipse(70, -80, 44, 50, 140)} ${ellipse(70, -80, 24, 30, 141)}`} fill={shade(PC.mustard, 0.88)} lift={9} />
          <Cut d={poly([[-70, -150], [70, -150], [70, -18], [54, 0], [-54, 0], [-70, -18]], 142)} fill={PC.mustard} lift={10}>
            <Cut d={rect(-70, -114, 140, 22, 143)} fill={PC.cream} lift={1.2} />
            <Cut d={heart} y={-58} fill={PC.red} lift={1.2} />
          </Cut>
          {[-28, 2, 32].map((dx, i) => (
            <Cut key={i} d={strip(Array.from({ length: 9 }, (_, k): Pt => [dx + 11 * Math.sin(k * 0.9 + t * 4 + i * 2.1), -168 - k * 20]), 12, 2, 150 + i)}
              fill={PC.white} lift={14} opacity={0.7} />
          ))}
        </g>

        {/* books, and an alarm clock on them */}
        <g transform={`translate(1300 ${F})`}>
          {([[-26, 320, 52, PC.navy, -0.8], [-76, 280, 48, PC.red, 1.6], [-122, 300, 44, PC.plum, -1.2]] as const).map(([y, w, h, c, a], i) => (
            <Cut key={i} d={rect(-w / 2, -h / 2, w, h, 160 + i)} y={y} rotate={a} fill={c} lift={7}>
              <Cut d={rect(w / 2 - 22, -h / 2 + 6, 14, h - 12, 165 + i)} fill={PC.white} lift={0.8} />
              <Cut d={`${rect(-w / 2 + 18, -h / 2 + 2, 8, h - 4, 170 + i)} ${rect(-w / 2 + 32, -h / 2 + 2, 8, h - 4, 175 + i)}`} fill={PC.mustard} lift={0.8} />
            </Cut>
          ))}
          <g transform="translate(0 -233)">
            <Cut d={rect(-6, 0, 12, 30, 180)} x={-50} y={62} rotate={28} fill={PC.charcoal} lift={4} />
            <Cut d={rect(-6, 0, 12, 30, 181)} x={50} y={62} rotate={-28} fill={PC.charcoal} lift={4} />
            <Cut d={ellipse(0, 0, 30, 24, 182)} x={-56} y={-70} rotate={-32} fill={PC.mustard} lift={5} />
            <Cut d={ellipse(0, 0, 30, 24, 183)} x={56} y={-70} rotate={32} fill={PC.mustard} lift={5} />
            <Cut d={`${rect(-4, -108, 8, 26, 184)} ${ellipse(0, -110, 9, 7, 185)}`} fill={PC.charcoal} lift={4} />
            <Cut d={ellipse(0, 0, 84, 84, 186)} fill={PC.red} lift={6}>
              <Cut d={ellipse(0, 0, 66, 66, 187)} fill={PC.white} lift={1.5}>
                <Cut d={Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * 2 * Math.PI, r = i % 3 ? 3.5 : 6;
                  return ellipse(54 * Math.sin(a), -54 * Math.cos(a), r, r, 190 + i, 0.6);
                }).join(" ")} fill={PC.navy} lift={0.6} />
                <Cut d={rect(-5, -40, 10, 48, 188)} rotate={305 + t * 3} fill={PC.navy} lift={2} />
                <Cut d={rect(-3.5, -58, 7, 66, 189)} rotate={290 + t * 36} fill={PC.navy} lift={3} />
                <Cut d={ellipse(0, 0, 7, 7, 202)} fill={PC.red} lift={1} />
              </Cut>
            </Cut>
          </g>
        </g>

        {/* a cat, its tail twitching */}
        <g transform={`translate(1680 ${F})`}>
          <Cut d={strip(Array.from({ length: 8 }, (_, i): Pt => {
            const k = i / 7;
            return [40 + 80 * Math.sin(k * 1.9) + k * k * 14 * Math.sin(t * 2.2), -8 - 150 * k * k];
          }), 20, 12, 91)} fill={PC.charcoal} lift={6} />
          <Cut d={ellipse(0, -92, 70, 92, 92)} fill={PC.charcoal} lift={7}>
            <Cut d={ellipse(0, -96, 30, 52, 93)} fill={PC.white} lift={0.8} />
          </Cut>
          <Cut d={ellipse(-28, -10, 22, 13, 94)} fill={PC.white} lift={2} />
          <Cut d={ellipse(28, -10, 22, 13, 95)} fill={PC.white} lift={2} />
          {[-1, 1].map((sx) => (
            <Cut key={sx} d={poly([[sx * 50, -214], [sx * 46, -276], [sx * 14, -240]], 96 + sx)} fill={PC.charcoal} lift={8}>
              <Cut d={poly([[sx * 42, -222], [sx * 40, -260], [sx * 21, -238]], 98 + sx)} fill={PC.pink} lift={0.8} />
            </Cut>
          ))}
          <Cut d={ellipse(0, -205, 58, 50, 100)} fill={PC.charcoal} lift={9}>
            {[-1, 1].map((sx) => (
              <Cut key={sx} d={ellipse(sx * 21, -214, 12, 14 * blink, 102 + sx, 1)} fill={PC.mustard} lift={0.8}>
                <Cut d={ellipse(sx * 21, -214, 3.5, 11 * blink, 104 + sx, 0.4)} fill={PC.charcoal} lift={0.4} />
              </Cut>
            ))}
            <Cut d={ellipse(0, -186, 26, 16, 106)} fill={PC.white} lift={0.8}>
              <Cut d={poly([[-7, -197], [7, -197], [0, -189]], 107, 0.5)} fill={PC.pink} lift={0.6} />
            </Cut>
            {[-1, 1].map((sx) => (
              <Cut key={sx} d={`${strip([[sx * 18, -186], [sx * 76, -194]], 2.5, 1.5, 108 + sx)} ${strip([[sx * 18, -180], [sx * 72, -170]], 2.5, 1.5, 110 + sx)}`}
                fill={PC.cream} lift={1.2} />
            ))}
          </Cut>
        </g>
      </paper.Stack>
    </Svg>
  );
};


/** A label in a corner of a tile, outside any camera */
const Label: React.FC<{ x: number; y: number; text: string; size?: number }> = ({ x, y, text, size = 30 }) => (
  <div style={{ position: "absolute", left: x, top: y, padding: "6px 14px", borderRadius: 8, background: "rgba(4,5,11,0.62)", color: "#fff", fontSize: size, fontWeight: 700 }}>
    {text}
  </div>
);

/**
 * One world, a street at night, filmed by one list of shots and seen at four moments: each panel is the frame at
 * that moment. The world is drawn once (in `world`); only the camera changes. The cuts would sit on bars and word
 * times in a song: here the bars are 2 s long.
 */
const CameraShots: React.FC = () => {
  const shots: Shot[] = [
    { t: 0, x: 960, y: 540, to: { zoom: 1.08 } },
    { t: 2, x: 895, y: 760, zoom: 3.4, to: { x: 910 } },
    { t: 4, x: 1340, y: 420, zoom: 1.85, rotate: -9 },
    { t: 6, x: 980, y: 760, zoom: 1.6, glide: 0.6 },
  ];
  const hits = [7];
  const hand = personHand("phone", 1.15);
  const world = (t: number, k: number) => (
    <Svg>
      <SkyGradient time="night" stars={1} T={t} id={`g14-${k}-sky`} />
      <Moon T={t} color="#ffd36b" x={1500} y={230} r={70} />
      <City T={t} y={950} signs id={`g14-${k}-city`} />
      <Street T={t} y={950} speed={0} id={`g14-${k}-street`} />
      <Car T={t} x={1290} y={1068} s={0.55} lights distance={0} id={`g14-${k}-car`} />
      <Person x={900} y={985} s={1.15} pose="phone" T={t} look={{ hair: "ponytail", top: "#e0a12f", hairColor: "#1a1210" }} />
      <Hit T={t} t={hits} x={900 + hand[0]} y={985 + hand[1]} size={80} id={`g14-${k}-hit`} color="#ff5fd2" accent="#3fe6ff" />
    </Svg>
  );
  const moments: [number, string][] = [
    [1, "bar 1 · wide, pushing in"],
    [3.2, "bar 2 · cut to a close-up"],
    [5, "on a word · rolled, on the skyline"],
    [7.08, "bar 4 · glided back, a hit: punch and burst"],
  ];
  return (
    <AbsoluteFill style={{ background: "#04050b" }}>
      {moments.map(([t, label], k) => (
        <div key={k} style={{ position: "absolute", left: (k % 2) * 964, top: Math.floor(k / 2) * 544, width: 956, height: 536, overflow: "hidden" }}>
          <div style={{ position: "absolute", width: 1920, height: 1080, transform: "scale(0.4979)", transformOrigin: "0 0" }}>
            <Camera T={t} shots={shots} hits={hits} punch={0.08}>{world(t, k)}</Camera>
          </div>
          <Label x={14} y={484} text={`${k + 1}. ${label}`} size={22} />
        </div>
      ))}
    </AbsoluteFill>
  );
};

/**
 * The three kinds of Hit, each caught a moment after its hit: neon on the night sky (top) and flat on paper (bottom:
 * paper colours, no glow, square line ends, other sparkle shapes): one prop set restyles it.
 */
const Hits: React.FC<{ T: number }> = ({ T }) => {
  // the hit times: each kind a moment after its hit at the gallery's T (9.55 s)
  const kinds: [HitKind, number][] = [["burst", 9.42], ["sparkle", 9.13], ["ring", 9.33]];
  return (
    <Svg>
      <SkyGradient time="night" stars={1} T={T} id="g15-sky" />
      <rect x={0} y={540} width={1920} height={540} fill={PC.cream} />
      {kinds.map(([kind, t], i) => (
        <React.Fragment key={kind}>
          <Hit T={T} t={t} x={320 + i * 640} y={280} size={170} kind={kind} id={`g15-n${i}`} seed={3 + i}
            color={["#ff3355", "#ffd36b", "#3fe6ff"][i]} accent={["#ffd36b", "#ff5fd2", "#ff5fd2"][i]} />
          <Hit T={T} t={t} x={320 + i * 640} y={810} size={170} kind={kind} id={`g15-f${i}`} seed={3 + i} glow={0} cap="butt"
            shape={["diamond", "star", "dot"][i] as "diamond" | "star" | "dot"} core={PC.white}
            color={[PC.red, PC.mustard, PC.teal][i]} accent={[PC.navy, PC.coral, PC.orange][i]} />
        </React.Fragment>
      ))}
    </Svg>
  );
};

/**
 * A campfire on a hill at night, someone sitting by it; and, on paper, the same Flames redrawn flat (a candle, and a
 * heart burning along its edge with FlamesAlong, in paper colours, no glow).
 */
const Fire: React.FC<{ T: number }> = ({ T }) => {
  const fx = 700, fy = 905;
  /** points on a heart standing on the board, from angle a0 to a1 (0 is the dip at the top, ±π the tip) */
  const heartAt = (a0: number, a1: number, n: number) => Array.from({ length: n }, (_, i): Pt => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    return [1745 + 4.4 * 16 * Math.pow(Math.sin(a), 3), 866 - 4.4 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))];
  });
  const log = (x0: number, y0: number, x1: number, y1: number, r: number, c: string) => (
    <g>
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={c} strokeWidth={r * 2} strokeLinecap="round" />
      <line x1={x0} y1={y0 - r * 0.45} x2={x1} y2={y1 - r * 0.45} stroke={mix(c, "#ffb36b", 0.35)} strokeWidth={r * 0.5} strokeLinecap="round" />
      <ellipse cx={x1} cy={y1} rx={r * 0.95} ry={r} fill={mix(c, "#e8b98a", 0.55)} />
    </g>
  );
  return (
    <Svg>
      <SkyGradient time="night" stars={1} T={T} id="g16-sky" />
      <Moon T={T} color="#ffd36b" x={260} y={190} r={56} />
      <Ground T={T} y={860} town={false} glow="#ff8a3c" id="g16-ground" />
      <ellipse cx={fx} cy={fy + 10} rx={150} ry={22} fill="#120c1c" opacity={0.6} />
      {[-120, -80, -36, 12, 60, 104, 136].map((dx, i) => {
        const cy = fy + 12 + (Math.abs(dx) < 70 ? 14 : 0), c = i % 2 ? "#4a4258" : "#3a3448";
        return (
          <g key={i}>
            <ellipse cx={fx + dx} cy={cy} rx={26} ry={15} fill={c} />
            <ellipse cx={fx + dx - Math.sign(dx) * 3} cy={cy - 5} rx={18} ry={7} fill={mix(c, "#ff9a4a", 0.35)} />
          </g>
        );
      })}
      {log(fx - 110, fy + 6, fx + 40, fy - 20, 15, "#5a3424")}
      {log(fx + 110, fy + 4, fx - 34, fy - 24, 14, "#4a2a1e")}
      <Flames T={T} x={fx} y={fy - 14} w={190} id="g16-fire" />
      {log(fx - 70, fy + 18, fx + 90, fy + 2, 13, "#62392a")}
      {/* a log to sit on, its end towards the fire lit */}
      <path d={`M${fx + 262} ${fy - 72}h124a20 20 0 0 1 0 40h-124a20 20 0 0 1 0 -40Z`} fill="#3a2420" />
      <path d={`M${fx + 262} ${fy - 72}h124a20 20 0 0 1 9 2.2h-133Z`} fill="#6a4232" />
      <ellipse cx={fx + 262} cy={fy - 52} rx={16} ry={20} fill="#a8724e" />
      <ellipse cx={fx + 262} cy={fy - 52} rx={8} ry={10} fill="#7a4a32" />
      <Person x={1010} y={fy + 2} s={1.05} pose="sit" flip T={T} look={{ top: "#2f8f6b", hair: "long", hairColor: "#2a1a14" }} />
      {/* the same Flames on paper: flat, the paper's colours, no glow, lifted off the page like a cut piece */}
      <paper.Stack id="g16">
        <Cut d={rect(1280, -20, 660, 1120, 299)} fill={PC.navy} />
        <Cut d={rect(1500, 690, 90, 250, 300)} fill={PC.white} lift={6}>
          <Cut d={rect(1500, 690, 90, 26, 301)} fill={shade(PC.white, 0.92)} lift={0.6} />
        </Cut>
        <Cut d={rect(1543, 660, 5, 34, 302)} fill={PC.charcoal} lift={6} />
        <Cut d="" fill="none" lift={8}>
          <Flames T={paper.step(T)} x={1545} y={652} w={46} h={110} tongues={1} sharp={0.6} flat glow={0} embers={0} id="g16-candle"
            colors={[PC.orange, PC.mustard, PC.white]} />
        </Cut>
        <Cut d={rect(1420, 940, 420, 30, 303)} fill={PC.kraft} lift={4} />
        {/* a paper heart on fire along its top edge: FlamesAlong on the outline's upper points */}
        <Cut d={poly(heartAt(-Math.PI, Math.PI, 28), 305)} fill={PC.red} lift={7} />
        <Cut d="" fill="none" lift={9}>
          <FlamesAlong T={paper.step(T)} edge={heartAt(-1.7, 1.7, 13)} gap={36} w={44} flat glow={0} embers={0} id="g16-heart" seed={4}
            colors={[PC.orange, PC.mustard, PC.white]} />
        </Cut>
      </paper.Stack>
    </Svg>
  );
};

/**
 * A thunderstorm over a town in the hills, in rain: Storm (the kit's Clouds, lit from inside by each strike) and the
 * kit's Flash for the white frame. Beside it, on paper, the same Lightning as a flat zigzag bolt from paper clouds.
 */
const Thunder: React.FC<{ T: number }> = ({ T }) => {
  const strikes: Strike[] = [{ t: 7.1, x: 300 }, { t: 9.53, x: 720 }];
  const tp = paper.step(T);
  const bolt: Strike[] = [{ t: tp - 0.02, x: 1600, y: 330, to: [1560, 870] }];
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 1080, overflow: "hidden" }}>
        <Svg>
          <SkyGradient time="night" id="g17-sky" />
          <Storm T={T} strikes={strikes} ground={880} id="g17-storm" />
          <Ground T={T} y={900} glow="#8fa0ff" color="#0d0f20" far="#2a3058" id="g17-ground" />
          <Rain T={T} strength={0.8} angle={12} ground={1040} id="g17-rain" />
        </Svg>
        <Flash T={T} flashes={strikeFlashes(strikes, 0.12)} />
      </div>
      <Svg>
        <paper.Stack id="g17">
          <Cut d={rect(1280, -20, 660, 1120, 400)} fill={PC.navy} />
          <Cut d="" fill="none" lift={6}>
            <Storm T={tp} strikes={bolt} y={-60} n={0} sky={PC.navy} belly={PC.navy} id="g17-paper"
              bolt={{ look: "zigzag", glow: 0, color: PC.mustard, core: PC.white }} />
          </Cut>
          {[[1600, 345, 240, 50], [1470, 300, 120, 70], [1600, 260, 150, 95], [1740, 310, 110, 62]].map(([cx, cy, rx, ry], i) => (
            <Cut key={i} d={ellipse(cx, cy, rx, ry, 410 + i)} fill={i ? PC.white : shade(PC.white, 0.8)} lift={7 + i} />
          ))}
          <Cut d={poly([[1280, 900], [1420, 860], [1560, 880], [1700, 850], [1960, 880], [1960, 1100], [1280, 1100]], 420)} fill={PC.green} lift={6} />
        </paper.Stack>
      </Svg>
    </>
  );
};

/** A smooth closed outline through the points (Catmull-Rom), for the faces below */
const outline = (pts: Pt[]) => {
  const n = pts.length, at = (i: number) => pts[((i % n) + n) % n];
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return `${d}Z`;
};

/**
 * Crying at night, in close-up: a face drawn for the scene (eyes shut, brows up), tears welling, running down both
 * cheeks and dripping off the jaw, rain-blurred lights behind. Beside it, on paper, a flat crying face with flat tears.
 */
const Crying: React.FC<{ T: number }> = ({ T }) => {
  const skin = SKINS.light, skinS = mix(skin, "#5b2238", 0.22), hair = "#22161a", hairHi = mix(hair, "#8a6a8a", 0.35), top = "#3b4fb0";
  const ink = "#3a2228";
  const face: Pt[] = [[640, 262], [748, 300], [790, 385], [800, 470], [782, 560], [742, 624], [684, 662], [640, 670], [596, 662], [538, 624], [498, 560], [480, 470], [490, 385], [532, 300]];
  const eye = (cx: number, k: number) => (
    <g>
      {/* shut, the outer end turned down; three lashes there */}
      <path d={`M${cx - 38 * k} 470Q${cx} 494 ${cx + 40 * k} 476`} stroke={ink} strokeWidth={5.5} fill="none" strokeLinecap="round" />
      {[0.6, 0.82, 1].map((u, i) => (
        <path key={i} d={`M${cx + 40 * k * u} ${476 + 8 * (1 - u)}l${(7 + 3 * i) * k} ${5 + i * 2.5}`} stroke={ink} strokeWidth={3.6} strokeLinecap="round" />
      ))}
      {/* the lid, wet and catching the light */}
      <path d={`M${cx - 26 * k} 486Q${cx} 501 ${cx + 30 * k} 488`} stroke="#cdeeff" strokeWidth={2.6} fill="none" strokeLinecap="round" opacity={0.75} />
      {/* the brow: its inner end raised */}
      <path d={`M${cx + 48 * k} 421Q${cx + 6 * k} 404 ${cx - 32 * k} 388Q${cx - 40 * k} 392 ${cx - 36 * k} 400Q${cx + 4 * k} 414 ${cx + 48 * k} 421Z`} fill={hair} />
    </g>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 1080, overflow: "hidden" }}>
        <Svg>
          <defs>
            <linearGradient id="g18-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0a0d26" />
              <stop offset="1" stopColor="#1d2252" />
            </linearGradient>
            <clipPath id="g18-face"><path d={outline(face)} /></clipPath>
          </defs>
          <rect x={0} y={0} width={1280} height={1080} fill="url(#g18-bg)" />
          {/* lights through a rainy window, out of focus */}
          {([[150, 220, 70, "#ffb36b"], [300, 520, 46, "#5fa8ff"], [96, 760, 80, "#ff5fd2"], [1010, 170, 64, "#5fa8ff"], [1150, 420, 90, "#ffb36b"],
            [1010, 690, 50, "#ffd36b"], [1200, 860, 70, "#5fa8ff"], [250, 950, 60, "#ffb36b"], [880, 120, 36, "#ffd36b"]] as const).map(([x, y, r, c], i) => (
            <circle key={i} cx={x + 6 * Math.sin(T * 0.3 + i)} cy={y} r={r} fill={c} opacity={0.26 + 0.05 * Math.sin(T * 0.7 + i * 2)} filter="url(#blur-10)" />
          ))}
          <Rain T={T} strength={0.35} speed={1400} n={500} color="#8fa6e8" id="g18-rain" />
          {/* hair behind the head, falling over the shoulders */}
          <path d={outline([[640, 200], [784, 236], [858, 360], [866, 600], [896, 850], [812, 892], [640, 870], [468, 892], [384, 850], [414, 600], [422, 360], [496, 236]])} fill={hair} />
          {/* shoulders in a hoodie: the far side in shadow, the hood round the neck, its strings */}
          <path d={outline([[640, 768], [806, 794], [968, 904], [1016, 1100], [264, 1100], [312, 904], [474, 794]])} fill={top} />
          <path d={outline([[760, 790], [900, 850], [990, 960], [1016, 1100], [800, 1100], [820, 960]])} fill={mix(top, "#0b0d26", 0.3)} />
          <path d={outline([[540, 746], [640, 778], [740, 746], [790, 806], [640, 856], [490, 806]])} fill={mix(top, "#0b0d26", 0.4)} />
          <path d="M612 842L604 960M668 842L676 960" stroke={mix(top, "#ffffff", 0.7)} strokeWidth={5} strokeLinecap="round" />
          {/* the neck, a shadow under the chin */}
          <path d="M598 600Q600 700 590 780Q640 806 690 780Q680 700 682 600Z" fill={skin} />
          <path d="M598 600Q600 690 596 716Q640 690 684 716Q680 690 682 600Z" fill={skinS} />
          {/* the face: lit from the window on the left; the far side and under the jaw a tone darker, a cool rim on the near cheek */}
          <path d={outline(face)} fill={skin} />
          <g clipPath="url(#g18-face)">
            <path d="M400 200H900V720H400ZM565 468m-200 0a200 252 0 1 0 400 0a200 252 0 1 0 -400 0Z" fill={skinS} fillRule="evenodd" />
            <path d="M400 200H900V720H400ZM716 452m-216 0a216 262 0 1 0 432 0a216 262 0 1 0 -432 0Z" fill="#a9c8ff" fillRule="evenodd" opacity={0.2} />
            <ellipse cx={548} cy={552} rx={44} ry={24} fill="#ff6f86" opacity={0.3} />
            <ellipse cx={732} cy={552} rx={44} ry={24} fill="#ff6f86" opacity={0.3} />
          </g>
          {eye(580, -1)}
          {eye(700, 1)}
          {/* nose and a trembling mouth */}
          <path d="M648 508Q664 548 644 562Q630 566 622 558" stroke={skinS} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M610 614Q640 598 670 614Q640 628 610 614Z" fill="#9a3a4a" />
          {/* the fringe, parted a little off the middle, framing the forehead */}
          <path d={outline([[626, 222], [560, 238], [504, 300], [482, 400], [486, 520], [500, 456], [522, 384], [566, 324], [626, 292]])} fill={hair} />
          <path d={outline([[626, 222], [700, 230], [770, 290], [798, 400], [794, 520], [778, 452], [752, 380], [700, 318], [626, 292]])} fill={hair} />
          <path d={outline([[618, 236], [566, 252], [526, 300], [552, 282], [604, 262]])} fill={hairHi} opacity={0.7} />
          <path d={outline([[640, 236], [700, 244], [748, 286], [700, 262]])} fill={hairHi} opacity={0.5} />
          {/* tears: from the outer end of each eye, down the cheek, dripping off the jaw */}
          <Tears T={T} x={544} y={480} s={12.2} times={[7.6, 8.85]} path={[[0, 0], [-4, 50], [-6, 100], [-2, 152]]} fall={1100} />
          <Tears T={T} x={738} y={482} s={12.2} times={[8.3, 9.3]} path={[[0, 0], [5, 50], [6, 102], [0, 150]]} fall={1100} />
        </Svg>
      </div>
      <Svg>
        <paper.Stack id="g18">
          <Cut d={rect(1280, -20, 660, 1120, 500)} fill={PC.plum} />
          <Cut d={ellipse(1600, 520, 200, 200, 501)} fill={PC.mustard} lift={10}>
            <Cut d={ellipse(1530, 580, 34, 20, 502)} fill={PC.coral} lift={0.6} />
            <Cut d={ellipse(1670, 580, 34, 20, 503)} fill={PC.coral} lift={0.6} />
            <Cut d={strip([[1498, 504], [1514, 514], [1530, 518], [1546, 514], [1562, 504]], 9, 9, 504)} fill={PC.charcoal} lift={0.8} />
            <Cut d={strip([[1638, 504], [1654, 514], [1670, 518], [1686, 514], [1702, 504]], 9, 9, 505)} fill={PC.charcoal} lift={0.8} />
            <Cut d={strip([[1494, 458], [1528, 450], [1560, 432]], 8, 8, 506)} fill={PC.brown} lift={0.8} />
            <Cut d={strip([[1640, 432], [1672, 450], [1706, 458]], 8, 8, 507)} fill={PC.brown} lift={0.8} />
            <Cut d={ellipse(1600, 630, 34, 22, 508)} fill={PC.charcoal} lift={0.8} />
          </Cut>
          <Cut d="" fill="none" lift={4}>
            <Tears T={paper.step(T)} x={1504} y={512} s={13.8} times={[8.4, 9.2]} side={-1} flat color={PC.sky} shine={PC.white} fall={1080} />
            <Tears T={paper.step(T)} x={1696} y={512} s={13.8} times={[8.9]} flat color={PC.sky} shine={PC.white} fall={1080} />
          </Cut>
        </paper.Stack>
      </Svg>
    </>
  );
};

const PixelCorner: React.FC<{ T: number }> = ({ T }) => {
  const t = pixel.step(T);
  const { Canvas, colors: X } = pixel;
  const random = rng(22);
  const back = new Canvas(), front = new Canvas();
  const glow = (canvas: pixel.Canvas, cx: number, cy: number, rx: number, ry: number, color: string, strength: number) => {
    for (let y = Math.ceil(cy - ry); y <= cy + ry; y++)
      for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d < 1) canvas.dither(x, y, 1, 1, color, strength * (1 - d));
      }
  };

  const skyAndSun = () => {
    const bands: [number, string][] = [[0, X.navy], [22, X.dusk], [42, X.plum], [58, X.rose], [71, X.coral], [83, X.orange]];
    bands.forEach(([y0, c], i) => {
      back.box(0, y0, 240, (bands[i + 1]?.[0] ?? 96) - y0, c);
      if (i) back.dither(0, y0 - 2, 240, 2, c);
    });
    [[14, 5], [47, 12], [83, 4], [121, 9], [158, 3], [199, 13], [229, 6]].forEach(([x, y], i) => {
      back.set(x, y, X.cream);
      if ((Math.floor(t * 2) + i) % 3 === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) back.set(x + dx, y + dy, X.stone);
    });
    back.disc(200, 84, 15, 15, X.gold);
    for (let y = 86; y < 100; y += 3) back.box(184, y, 33, 1 + Math.floor((y - 86) / 5), X.orange);
  };
  const cloudLitFromBelow = (x0: number, base: number, speed: number, puffs: [number, number][]) => {
    const x = Math.round(((x0 + t * speed) % 300) - 30);
    for (const [c, dy] of [[X.gold, 2], [X.coral, 1], [X.plum, -1], [X.rose, 0]] as const)
      for (const [dx, k] of puffs) back.disc(x + dx, base - 0.7 * k + dy, k, 0.7 * k, c);
  };
  const birds = () =>
    [[0, 34], [7, 38], [12, 31]].forEach(([dx, y], i) => {
      const x = Math.round(250 - ((t * 12 + 246) % 280) + dx);
      const wingsUp = (Math.floor(t * 4) + i) % 2 === 0;
      back.line(wingsUp ? [[x - 2, y - 1], [x, y + 1], [x + 2, y - 1]] : [[x - 2, y + 1], [x, y], [x + 2, y + 1]], 1, X.ink);
    });
  const townWithLitWindows = () =>
    ([[104, 16, 54], [118, 12, 62], [129, 18, 46], [146, 10, 58], [155, 17, 42], [172, 12, 66], [184, 34, 90], [218, 10, 58], [228, 12, 48]] as const).forEach(([x, w, top]) => {
      back.box(x, top, w, 96 - top, mix(X.dusk, X.ink, 0.35));
      for (let y = top + 3; y < 92; y += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) if (random() < 0.3) back.box(wx, y, 1, 2, X.gold);
    });
  const shop = () => {
    const mortar = shade(X.brick, 0.8), lit = mix(X.cream, X.gold, 0.35);
    const goods = [X.red, X.blue, X.leaf, X.teal, X.orange, X.white, X.plum, X.sky];
    back.box(4, 24, 102, 72, X.brick);
    for (let y = 27; y < 96; y += 4) {
      back.box(4, y, 102, 1, mortar);
      for (let x = 6 + ((y >> 2) % 2) * 4; x < 106; x += 8) back.box(x, y + 1, 1, 3, mortar);
    }
    back.box(2, 21, 106, 3, X.tan); back.box(2, 21, 106, 1, X.cream); back.box(2, 24, 106, 1, X.brown);
    back.box(12, 28, 84, 19, X.ink);
    for (let i = 0; i < 52; i++) {
      const [x, y] = i < 21 ? [13 + i * 4, 29] : i < 42 ? [13 + (i - 21) * 4, 45] : i < 47 ? [13, 33 + (i - 42) * 3] : [94, 33 + (i - 47) * 3];
      back.set(x, y, (i + Math.floor(t * 4)) % 3 === 0 ? X.gold : X.brown);
    }
    back.dither(8, 61, 92, 2, X.ink, 0.5);
    for (let x = 8; x < 100; x += 6) {
      const c = ((x - 8) / 6) % 2 ? X.cream : X.red;
      back.box(x, 50, 6, 8, c);
      back.disc(x + 2.5, 58, 3, 2, c);
    }
    back.box(8, 49, 92, 1, X.ink);
    back.box(11, 63, 57, 31, X.tan);
    back.box(13, 65, 53, 27, lit);
    back.dither(13, 65, 53, 27, X.gold, 0.25);
    back.text("OPEN 24H", 16, 66, X.red);
    [81, 89].forEach((y) => {
      back.box(13, y, 53, 2, X.brown);
      for (let x = 14; x < 63; ) {
        const w = 2 + Math.floor(random() * 3), h = 3 + Math.floor(random() * 4);
        back.box(x, y - h, Math.min(w, 64 - x), h, goods[Math.floor(random() * goods.length)]);
        x += w + 1;
      }
    });
    back.box(71, 62, 25, 34, X.tan);
    back.box(73, 64, 21, 32, X.teal);
    back.box(75, 66, 17, 17, lit);
    back.dither(75, 66, 17, 17, X.gold, 0.25);
    back.box(89, 85, 2, 4, X.gold);
    const plant = new Canvas();
    plant.poly([[97, 89], [105, 89], [104, 96], [98, 96]], X.orange);
    plant.disc(101, 85, 4, 4, X.green); plant.disc(98, 83, 2, 3, X.leaf); plant.disc(104, 82, 2, 3, X.leaf);
    back.stamp(plant, X.ink);
  };
  const streetInLamplight = () => {
    const pavement = mix(X.grey, X.plum, 0.3);
    back.box(0, 96, 240, 10, pavement);
    for (let x = 3; x < 240; x += 12) back.box(x, 97, 1, 9, shade(pavement, 0.85));
    back.box(0, 96, 240, 1, shade(pavement, 0.75));
    back.box(0, 106, 240, 1, X.stone); back.box(0, 107, 240, 1, X.ink);
    back.box(0, 108, 240, 27, mix(X.ink, X.dusk, 0.35));
    for (let x = 0; x < 240; x += 20) back.box(x + 4, 121, 12, 1, X.cream);
    glow(back, 39, 101, 32, 4.5, X.gold, 0.35);
    glow(back, 126, 101, 17, 4.5, X.gold, 0.75);
    glow(back, 143, 101, 12, 4.5, X.cream, 0.35);
  };
  const vendingMachine = () => {
    const machine = new Canvas();
    machine.box(134, 64, 18, 32, X.red);
    machine.box(149, 64, 3, 32, shade(X.red, 0.75));
    machine.box(136, 67, 11, 15, X.night);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) machine.box(137 + i * 4, 68 + j * 5, 2, 3, [X.teal, X.gold, X.leaf, X.sky, X.white][(i + 2 * j) % 5]);
    for (let i = 0; i < 3; i++) machine.set(138 + i * 4, 84, X.cream);
    machine.box(137, 89, 9, 3, X.ink);
    back.stamp(machine, X.ink);
  };
  const streetLamp = () => {
    const lamp = new Canvas();
    lamp.box(115, 36, 2, 60, X.grey); lamp.box(114, 93, 4, 3, X.grey); lamp.box(115, 36, 12, 2, X.grey);
    lamp.box(122, 38, 8, 2, X.grey); lamp.box(123, 40, 6, 1, X.cream);
    glow(front, 126, 41, 10, 6, X.cream, 0.5);
    front.stamp(lamp, X.ink);
  };
  const bicycle = () => {
    for (const cx of [163, 182]) front.line(Array.from({ length: 33 }, (_, i): Pt => [cx + 5 * Math.cos(i / 5), 100 + 5 * Math.sin(i / 5)]), 1, X.ink);
    front.line([[163, 100], [171, 100], [169, 92], [163, 100]], 1, X.blue);
    front.line([[169, 92], [179, 92], [171, 100]], 1, X.blue);
    front.line([[179, 92], [182, 100]], 1, X.blue);
    front.box(167, 90, 4, 1, X.brown); front.box(178, 90, 3, 1, X.ink);
  };

  skyAndSun();
  cloudLitFromBelow(42, 15, 3, [[0, 4], [6, 6], [13, 7], [20, 5], [26, 3]]);
  cloudLitFromBelow(151, 27, 2, [[0, 3], [6, 5], [12, 6], [18, 4]]);
  cloudLitFromBelow(188, 46, 4, [[0, 4], [7, 6], [15, 8], [23, 6], [30, 4]]);
  birds();
  townWithLitWindows();
  shop();
  streetInLamplight();
  vendingMachine();
  streetLamp();
  bicycle();

  const walk = t * 0.8, s = 0.8;
  const carX = ((t * 300 + 1500) % 2600) - 400;
  return (
    <Svg>
      <pixel.Pixels canvas={back} />
      {/* one colour per Pixelate: a fill meeting another colour would leave mixed blocks */}
      {([[X.red, 8, "g22-sign-shadow"], [X.cream, 0, "g22-sign"]] as const).map(([c, d, id]) => (
        <pixel.Pixelate key={id} id={id}>
          <text x={432 + d} y={300 + d} textAnchor="middle" dominantBaseline="central" fontSize={104} fontWeight={900} fill={c}>MINI MART</text>
        </pixel.Pixelate>
      ))}
      <pixel.Pixelate id="g22-walker" outline={X.ink}>
        <Person x={((STRIDE * s * walk + 300) % 2300) - 200} y={828} s={s} pose="walk" phase={walk} T={t} shadow={false}
          look={{ hair: "ponytail", top: X.coral, pants: X.navy, hairColor: X.ink }} />
      </pixel.Pixelate>
      <pixel.Pixels canvas={front} />
      <pixel.Pixelate id="g22-car" outline={X.ink}>
        <Car T={t} x={carX} y={1022} s={0.62} color={X.sky} time="dusk" distance={(t * 300) / 0.62} id="g22-car-body" />
      </pixel.Pixelate>
    </Svg>
  );
};

const ComicKitchen: React.FC<{ T: number }> = ({ T }) => {
  const { Page, Panel, Ink, Flat, Edge, Brush, brushPath, Dots, Balloon, Caption, Sfx, colors: K } = comic;
  const POP = 9.3;
  const said = (id: string, text: string, t0: number, step: number): Line => {
    const words = text.split(" ").map((w, i) => ({ w, t: t0 + i * step }));
    return { id, section: "g23", text, start: t0, end: t0 + words.length * step, words };
  };
  const n1 = (v: number) => v.toFixed(1);
  const at = ([x, y]: Pt) => `${n1(x)} ${n1(y)}`;
  const path = (pts: Pt[]) => `M ${pts.map(at).join(" L ")}`;
  /** the two sides of brushPath(path(pts), [w0, w1]), left and right as it runs */
  const sides = (pts: Pt[], w0: number, w1: number): [Pt[], Pt[]] => {
    const s = pts.map((_, i) => pts.slice(1, i + 1).reduce((a, p, k) => a + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0));
    const L = s[s.length - 1] || 1;
    const out: [Pt[], Pt[]] = [[], []];
    pts.forEach(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1, r = (w0 + ((w1 - w0) * s[i]) / L) / 2;
      out[0].push([x - ((by - ay) / l) * r, y + ((bx - ax) / l) * r]);
      out[1].push([x + ((by - ay) / l) * r, y - ((bx - ax) / l) * r]);
    });
    return out;
  };
  /** the part of a polyline that runs below y */
  const below = (pts: Pt[], y: number): Pt[] => {
    const i = pts.findIndex(([, py]) => py > y);
    if (i <= 0) return pts;
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    return [[ax + ((bx - ax) * (y - ay)) / (by - ay), y], ...pts.slice(i)];
  };
  /** tufts of hair or fur evenly round an ellipse from angle a0 to a1, one per length, each tip turned `lean` radians; `soft` rounds the dips */
  const tufts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, lens: number[], lean: number | ((a: number) => number) = 0, soft = false): [Pt, string] => {
    const on = (a: number, out: number): Pt => [cx + (rx + out) * Math.cos(a), cy + (ry + out) * Math.sin(a)];
    const steps = 240, run = [0];
    for (let k = 1; k <= steps; k++) {
      const [x0, y0] = on(a0 + ((a1 - a0) * (k - 1)) / steps, 0), [x1, y1] = on(a0 + ((a1 - a0) * k) / steps, 0);
      run.push(run[k - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    const angle = (f: number) => {
      const k = Math.max(1, run.findIndex((v) => v >= f * run[steps]));
      return a0 + ((a1 - a0) * (k - 1 + (f * run[steps] - run[k - 1]) / (run[k] - run[k - 1] || 1))) / steps;
    };
    return [on(a0, 0), lens.map((len, i) => {
      const a = angle(i / lens.length), b = angle((i + 1) / lens.length), m = angle((i + 0.5) / lens.length);
      const tip = on(m + (typeof lean === "number" ? lean : lean(m)), len);
      return soft
        ? `C ${at(on(a + (b - a) * 0.12, 0))} ${at(on(a + (b - a) * 0.18, len * 0.6))} ${at(tip)} C ${at(on(b - (b - a) * 0.12, len * 0.45))} ${at(on(b - (b - a) * 0.12, 0))} ${at(on(b, 0))}`
        : `Q ${at(on(a + (b - a) * 0.2, len * 0.55))} ${at(tip)} Q ${at(on(b - (b - a) * 0.15, len * 0.25))} ${at(on(b, 0))}`;
    }).join(" ")];
  };
  const puff = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 6 }, (_, i): Pt => [cx + r * Math.cos((i / 6) * 2 * Math.PI), cy + r * Math.sin((i / 6) * 2 * Math.PI)]);
    return `M ${pts[0].join(" ")} ${pts.map((_, i) => `A ${(r * 0.6).toFixed(1)} ${(r * 0.6).toFixed(1)} 0 0 1 ${pts[(i + 1) % 6].map((v) => v.toFixed(1)).join(" ")}`).join(" ")} Z`;
  };
  const after = (t: number) => Math.max(0, t - POP);
  const toastLift = (t: number) => Math.max(0, 1400 * after(t) - 1500 * after(t) ** 2);
  const catHop = (t: number) => Math.max(0, 1100 * after(t) - 1500 * after(t) ** 2);
  const startled = (t: number) => t >= POP;

  const wallAndWindow = () => (
    <>
      <Dots color={K.yellow} r={3.6} gap={12} />
      <Ink>
        <path d="M 96 150 H 484 V 486 H 96 Z M 128 182 V 454 H 452 V 182 Z" fill={K.white} fillRule="evenodd" />
      </Ink>
      <rect x={128} y={182} width={324} height={272} fill={K.white} />
      <Dots color={K.cyan} x={128} y={182} w={324} h={272} r={3.4} />
      <Ink>
        <circle cx={392} cy={250} r={40} fill={K.yellow} />
        <path d="M 128 410 Q 230 356 330 388 Q 400 408 452 384 V 454 H 128 Z" fill={K.leaf} />
        <path d="M 236 384 V 360" fill="none" />
        <circle cx={236} cy={346} r={20} fill={K.green} />
      </Ink>
      <Ink>
        <path d="M 283 182 H 297 V 454 H 283 Z M 128 311 H 452 V 325 H 128 Z" fill={K.white} />
        <path d="M 84 478 H 496 V 500 H 84 Z" fill={K.white} />
      </Ink>
      <Ink>
        <path d="M 140 478 L 132 430 H 188 L 180 478 Z" fill={K.orange} />
        <path d="M 160 432 Q 128 404 140 380 Q 162 396 160 432 Z M 160 432 Q 166 392 196 386 Q 192 418 160 432 Z" fill={K.green} />
      </Ink>
    </>
  );
  const clock = (t: number) => {
    const at = (deg: number, r: number) => [600 + r * Math.sin((deg * Math.PI) / 180), 270 - r * Math.cos((deg * Math.PI) / 180)].map((v) => v.toFixed(1)).join(" ");
    return (
      <Ink>
        <circle cx={600} cy={270} r={62} fill={K.red} />
        <circle cx={600} cy={270} r={48} fill={K.white} />
        <path d={Array.from({ length: 12 }, (_, i) => `M ${at(i * 30, 38)} L ${at(i * 30, 44)}`).join(" ")} fill="none" />
        <path d={`M ${at(212.5, 24)} L 600 270 L ${at(30, 38)}`} fill="none" />
        <path d={`M 600 270 L ${at(Math.floor(t) * 6, 40)}`} fill="none" />
      </Ink>
    );
  };
  const person = (t: number) => {
    const scared = startled(t);
    const up = scared ? 20 : 0;
    const [crownFrom, crown] = tufts(930, 394, 78, 86, Math.PI * 1.06, Math.PI * 1.94,
      scared ? [28, 44, 36, 36, 44, 28] : [10, 15, 19, 17, 14, 10], scared ? 0 : 0.1);
    const fringe = `Q 990 ${380 - up} 976 ${362 - up} Q 966 ${368 - up} 958 ${372 - up} Q 952 ${358 - up} 942 ${350 - up} Q 934 ${364 - up} 920 ${370 - up} `
      + `Q 914 ${356 - up} 904 ${350 - up} Q 896 ${364 - up} 884 ${370 - up} Q 872 ${384 - up} 868 410`;
    const face = "M 930 318 C 972 318 998 352 998 398 C 998 436 980 466 952 480 Q 940 486 930 486 Q 920 486 908 480 C 880 466 862 436 862 398 C 862 352 888 318 930 318 Z";
    // The forearm, in a later Ink, crosses the upper arm. The upper arm narrows to the width at which the forearm's
    // top edge leaves its outer edge right at the elbow, so the crease starts on the arm's outline.
    const shoulder: Pt = [830, 560], elbow: Pt = [814, 670], fore: Pt = [0.62, -0.78], foreR = 17;
    const L = Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]);
    const outward: Pt = [-(elbow[1] - shoulder[1]) / L, (elbow[0] - shoulder[0]) / L];
    const upperR = foreR * (fore[1] * outward[0] - fore[0] * outward[1]);
    const holdArm: Pt[] = [shoulder, elbow];
    const hangArm: Pt[] = [[1030, 560], [1040, 668], [1034, 780]];
    const [, holdInside] = sides(holdArm, 42, 2 * upperR);
    const [hangInside] = sides(hangArm, 42, 28);
    const skin = (d: string, key?: React.Key) => (
      <React.Fragment key={key}>
        <path d={d} fill={K.peach} />
        <Dots d={d} color={K.magenta} r={1.6} gap={9} />
      </React.Fragment>
    );
    return (
      <>
        <Ink contour line={4}>
          {skin("M 990 380 C 1014 364 1030 390 1021 414 C 1014 430 1002 434 990 428 Z")}
          {skin("M 870 380 C 846 364 830 390 839 414 C 846 430 858 434 870 428 Z")}
          <Brush d="M 1010 393 Q 1019 396 1017 405 Q 1015 412 1010 414" w={1.8} />
          <Brush d="M 850 393 Q 841 396 843 405 Q 845 412 850 414" w={1.8} />
        </Ink>
        <Ink contour>
          {skin("M 907 446 L 905 524 L 955 524 L 953 446 Z")}
          <path d="M 902 506 C 880 510 852 514 838 524 C 828 560 826 640 828 780 L 1032 780 C 1034 640 1032 560 1022 524 C 1008 514 980 510 958 506 Q 930 530 902 506 Z" fill={K.green} />
          {skin(brushPath(path(holdArm), [42, 2 * upperR]))}
          {skin(brushPath(path(hangArm), [42, 28]))}
          <path d="M 881.1 509.8 C 861.4 513.5 810 516 806 556 L 801 590 Q 826 602 852 594 L 856 556 Z" fill={K.green} />
          <path d="M 978.9 509.8 C 998.6 513.5 1050 516 1054 556 L 1059 590 Q 1034 602 1008 594 L 1004 556 Z" fill={K.green} />
          <Brush d="M 902 506 Q 930 530 958 506" w={4} taper={0.1} />
          <Brush d="M 908 514 Q 930 534 952 514" w={2} taper={0.3} />
          <Brush d="M 801 590 Q 826 602 852 594" w={3.6} taper={0.15} />
          <Brush d="M 1059 590 Q 1034 602 1008 594" w={3.6} taper={0.15} />
          <Brush d="M 857 552 L 852 594" w={3.6} taper={[0.7, 0]} />
          <Brush d="M 1003 552 L 1008 594" w={3.6} taper={[0.7, 0]} />
          <Brush d={path(below(holdInside, 596))} w={3.6} taper={[0, 0.2]} />
          <Brush d={path(below(hangInside, 596))} w={3.6} taper={[0, 0.2]} />
          <Brush d="M 858 566 Q 870 574 878 588" w={2.2} />
          <Brush d="M 1006 564 Q 998 572 993 584" w={2.2} />
        </Ink>
        <Ink contour>
          {skin(face)}
          <path d={`M 868 410 Q 852 398 ${at(crownFrom)} ${crown} Q 1008 398 992 410 ${fringe} Z`} fill={K.brown} />
          <Brush d={`M 992 410 ${fringe}`} w={3.2} taper={0.12} />
          <Brush d="M 934 410 Q 938 428 942 434 Q 938 441 926 439" w={3} taper={[0.5, 0.25]} />
          {scared ? (
            <>
              <Brush d="M 883 372 Q 902 354 922 366" w={4} />
              <Brush d="M 938 366 Q 958 354 977 372" w={4} />
              <Edge>
                <ellipse cx={904} cy={400} rx={17} ry={21} fill={K.white} />
                <ellipse cx={956} cy={400} rx={17} ry={21} fill={K.white} />
              </Edge>
              <circle cx={906} cy={402} r={4.5} fill={K.ink} />
              <circle cx={954} cy={402} r={4.5} fill={K.ink} />
              <Edge line={3.4}>
                <path d="M 906 452 Q 930 440 954 452 Q 958 474 930 477 Q 902 474 906 452 Z" fill="#6f1b17" />
              </Edge>
              <path d="M 914 468 Q 930 458 946 468 Q 940 476 930 476 Q 920 476 914 468 Z" fill={K.pink} />
              <Edge line={2}>
                <path d="M 910 453 Q 930 443 950 453 L 949 459 Q 930 451 911 459 Z" fill={K.white} />
              </Edge>
            </>
          ) : (
            <>
              <Brush d="M 886 388 Q 902 380 918 385" w={3.6} />
              <Brush d="M 942 385 Q 958 380 974 388" w={3.6} />
              <Brush d="M 883 401 L 891 406 Q 905 416 919 406" w={3.6} taper={[0.2, 0.35]} />
              <Brush d="M 941 406 Q 955 416 969 406 L 977 401" w={3.6} taper={[0.35, 0.2]} />
              <Brush d="M 916 460 Q 930 468 944 460" w={3.2} />
            </>
          )}
        </Ink>
        {scared && (
          <Ink contour line={4}>
            <Edge><path d="M 1036 254 Q 1047.2 271.6 1042.4 279.6 Q 1036 286 1029.6 279.6 Q 1026.4 271.6 1036 254 Z" fill={K.sky} /></Edge>
          </Ink>
        )}
        <Ink contour line={5}>
          <path d="M 890 562 L 946 562 L 944 620 Q 943 630 933 630 L 903 630 Q 893 630 892 620 Z" fill={K.white} />
          <path d="M 945.6 573 C 984 565 986 623 944 619 Z" fill={K.white} />
          <Edge><path d="M 945.2 584 C 968 581 969 609 944.5 606.5 Z" fill={K.green} /></Edge>
          <Edge><ellipse cx={918} cy={562} rx={28} ry={6} fill={K.white} /></Edge>
          <ellipse cx={918} cy={563} rx={22} ry={3.6} fill={mix(K.brown, K.ink, 0.35)} />
          <Edge line={2}>
            <path d="M 932 607.9 C 925.2 602.8 924.4 596.8 927.8 596 Q 931.2 595.1 932 598.5 Q 932.8 595.1 936.2 596 C 939.6 596.8 938.8 602.8 932 607.9 Z" fill={K.red} />
          </Edge>
        </Ink>
        <Ink contour>
          {skin(brushPath(`M ${at(elbow)} Q ${at([elbow[0] + fore[0] * 34, elbow[1] + fore[1] * 34])} 872 626`, [2 * foreR, 24]))}
          {skin("M 863 616 Q 864 586 882 578 L 896 578 L 898 624 Q 882 634 868 630 Z")}
          {[0, 1, 2, 3].map((i) => skin(brushPath(`M 888 ${584 + i * 11} Q 901 ${582 + i * 11} 907 ${585 + i * 11}`, 11), i))}
          {[1, 2, 3].map((i) => <Brush key={i} d={`M 912 ${579 + i * 11} Q 902 ${578 + i * 11} 892 ${579.5 + i * 11}`} w={2.4} taper={[0, 0.7]} />)}
        </Ink>
        {!scared && (
          <Ink contour>
            {[0, 1].map((i) => {
              const x = 910 + i * 18, w = 4.5 * Math.sin(t * 3 + i * 2);
              return <Brush key={i} d={`M ${x} 552 Q ${n1(x + w)} 547 ${x} 542 Q ${n1(x - w)} 537 ${x} 532`} w={3} taper={0.45} />;
            })}
          </Ink>
        )}
      </>
    );
  };
  const counter = () => (
    <>
      <Ink>
        <rect x={-600} y={728} width={2800} height={600} fill={K.blue} />
        {[-80, 300, 680, 1060].map((x) => <rect key={x} x={x} y={770} width={340} height={360} rx={8} fill={K.blue} />)}
        {[230, 350, 990, 1110].map((x) => <circle key={x} cx={x} cy={830} r={10} fill={K.yellow} />)}
      </Ink>
      <Dots color={K.navy} x={-600} y={728} w={2800} h={34} r={3} gap={9} />
      <Ink>
        <rect x={-600} y={700} width={2800} height={30} fill={K.orange} />
      </Ink>
    </>
  );
  const toaster = (t: number) => {
    const slots = startled(t) ? K.ink : K.orange;
    return (
      <Ink>
        <rect x={436} y={560} width={250} height={140} rx={34} fill={K.red} />
        <rect x={464} y={560} width={194} height={18} rx={9} fill={K.grey} />
        <rect x={476} y={564} width={62} height={9} rx={4.5} fill={slots} />
        <rect x={572} y={564} width={62} height={9} rx={4.5} fill={slots} />
        <circle cx={490} cy={650} r={16} fill={K.white} />
        <path d="M 490 650 L 498 640" fill="none" />
        <rect x={684} y={startled(t) ? 588 : 632} width={34} height={16} rx={8} fill={K.ink} />
        <rect x={460} y={698} width={30} height={10} fill={K.ink} />
        <rect x={632} y={698} width={30} height={10} fill={K.ink} />
        <Flat><path d="M 454 600 Q 452 586 466 584 H 476 Q 462 592 464 640 Q 456 640 454 600 Z" fill={K.white} /></Flat>
      </Ink>
    );
  };
  const toast = (t: number) => {
    const lift = toastLift(t), d = lift > 0 ? after(t) : 0;
    const crumb = "M -34 42 V -14 Q -36 -40 -12 -40 Q 0 -50 12 -40 Q 36 -40 34 -14 V 42 Z";
    const slice = (x: number, dir: number) => (
      <g key={dir} transform={`translate(${(x + dir * 170 * d).toFixed(1)} ${(600 - lift).toFixed(1)}) rotate(${(dir * 80 * d).toFixed(1)})`}>
        <path d="M -46 52 V -18 Q -50 -52 -18 -52 Q 0 -66 18 -52 Q 50 -52 46 -18 V 52 Z" fill={K.brown} />
        <path d={crumb} fill={mix(K.orange, K.brown, 0.45)} />
        <Dots d={crumb} color={mix(K.brown, K.ink, 0.55)} r={2.4} gap={8} />
      </g>
    );
    if (lift <= 0) {
      return (
        <Ink>
          <path d="M 485 568 V 548 Q 500 534 520 548 V 568 Z M 580 568 V 548 Q 600 534 620 548 V 568 Z" fill={K.brown} />
        </Ink>
      );
    }
    return (
      <>
        <Ink line={4}>
          {[-1, 1].map((dir) => {
            const x = (dir < 0 ? 507 : 603) + dir * 170 * d, y = 600 - lift;
            return <path key={dir} d={[-24, 0, 24].map((o) => `M ${(x + o).toFixed(1)} ${(y + 80).toFixed(1)} V ${(y + 80 + Math.min(150, lift * 0.5)).toFixed(1)}`).join(" ")} fill="none" />;
          })}
        </Ink>
        <Ink>{[slice(507, -1), slice(603, 1)]}</Ink>
        <Ink>
          {[0, 1].map((i) => {
            const k = (after(t) * 1.6 + i * 0.5) % 1;
            return <path key={i} d={puff(536 + i * 52 + 14 * Math.sin(k * 5 + i), 552 - 120 * k, 14 + 18 * k)} fill={K.white} />;
          })}
        </Ink>
      </>
    );
  };
  const cat = (t: number) => {
    const scared = startled(t);
    const stripe = mix(K.orange, K.brown, 0.55);
    const head = scared
      ? "M 250 522 C 284 522 300 540 302 558 L 316 566 L 302 574 L 312 586 L 294 588 C 286 600 270 606 250 606 C 230 606 214 600 206 588 L 188 586 L 198 574 L 184 566 L 198 558 C 200 540 216 522 250 522 Z"
      : "M 250 522 C 284 522 300 540 300 560 L 310 572 L 298 577 C 292 594 272 604 250 604 C 228 604 208 594 202 577 L 190 572 L 200 560 C 200 540 216 522 250 522 Z";
    const ears = scared
      ? ["M 212 546 L 177 536 Q 172 540 175 545 L 204 570 Z", "M 288 546 L 323 536 Q 328 540 325 545 L 296 570 Z"]
      : ["M 206 552 L 208 498 Q 212 492 217 497 L 246 526 Z", "M 294 552 L 292 498 Q 288 492 283 497 L 254 526 Z"];
    const innerEars = scared
      ? ["M 207 551 L 184 541 L 204 561 Z", "M 293 551 L 316 541 L 296 561 Z"]
      : ["M 214 540 L 214 510 L 236 530 Z", "M 286 540 L 286 510 L 264 530 Z"];
    const furLens = (n: number, lo: number, hi: number, seed: number) => {
      const r = rng(seed);
      return Array.from({ length: n }, () => lo + (hi - lo) * r());
    };
    const downward = (a: number) => (Math.cos(a) < 0 ? -0.1 : 0.1);
    const fur = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, lens: number[]) => {
      const [from, d] = tufts(cx, cy, rx, ry, a0, a1, lens, downward, true);
      return `M ${at(from)} ${d}${a1 - a0 < 2 * Math.PI - 1e-6 ? ` A ${rx} ${ry} 0 0 1 ${at(from)}` : ""} Z`;
    };
    const body = scared
      ? fur(250, 644, 58, 54, Math.PI * 0.5 + 0.5, Math.PI * 2.5 - 0.5, furLens(11, 13, 22, 5))
      : "M 250 586 C 282 586 302 616 305 650 C 308 682 300 704 284 704 L 216 704 C 200 704 192 682 195 650 C 198 616 218 586 250 586 Z";
    const legs: [Pt, Pt][] = scared ? [[[234, 680], [218, 734]], [[266, 680], [282, 734]]] : [[[236, 644], [233, 693]], [[264, 644], [267, 693]]];
    const foot = scared ? 736 : 700;
    const paws = legs.map(([, [x]], i) => (
      <React.Fragment key={i}>
        <Edge><ellipse cx={x} cy={foot} rx={scared ? 15 : 14} ry={8} fill={K.white} /></Edge>
        {[-4.5, 4.5].map((dx) => <Brush key={dx} d={`M ${x + dx} ${foot + 7} L ${x + dx * 1.2} ${foot + 1}`} w={2.2} taper={[0, 0.8]} />)}
      </React.Fragment>
    ));
    return (
      <g transform={`translate(0 ${(-catHop(t)).toFixed(1)})`}>
        <Ink contour>
          <path d={scared
            ? fur(336, 598, 22, 84, Math.PI * 0.5, Math.PI * 2.5, furLens(13, 9, 16, 9).map((len, i) => (i === 6 ? 24 : len)))
            : brushPath("M 284 696 C 330 704 352 684 348 654 C 345 630 330 626 322 636", [17, 13], [0, 0.12])} fill={K.orange} />
          {!scared && <Brush d="M 343 643 Q 349 652 347 662" w={2.4} />}
        </Ink>
        {scared && (
          <Ink contour>
            {legs.map(([a, b], i) => <path key={i} d={brushPath(path([a, b]), [22, 19])} fill={K.orange} />)}
            {paws}
          </Ink>
        )}
        <Ink contour>
          <path d={body} fill={K.orange} />
          <path d={scared
            ? "M 250 604 C 270 604 278 630 272 656 Q 264 676 250 690 Q 236 676 228 656 C 222 630 230 604 250 604 Z"
            : "M 250 600 C 270 600 277 628 272 656 L 262 700 L 238 700 L 228 656 C 223 628 230 600 250 600 Z"} fill={K.white} />
          {!scared && (
            <>
              {legs.map(([a, b], i) => <path key={i} d={brushPath(path([a, b]), [22, 19])} fill={K.orange} />)}
              {paws}
              {legs.map(([a, b], i) => sides([a, b], 22, 19).map((side, k) => (
                <Brush key={`${i}${k}`} d={path(below(side, 652))} w={3} taper={[0.5, 0]} />
              )))}
              <Brush d="M 208 640 C 224 652 228 680 222 703" w={3.2} taper={[0.6, 0]} />
              <Brush d="M 292 640 C 276 652 272 680 278 703" w={3.2} taper={[0.6, 0]} />
            </>
          )}
        </Ink>
        <Ink contour>
          {ears.map((d, i) => <path key={i} d={d} fill={K.orange} />)}
          <path d={head} fill={K.orange} />
          {innerEars.map((d, i) => <path key={i} d={d} fill={K.pink} />)}
          {[[238, 2], [250, 0], [262, -2]].map(([x, dx]) => <path key={x} d={brushPath(`M ${x} 523 L ${x + dx} 542`, 6, [0, 0.9])} fill={stripe} />)}
          {[[204, 566, 220, 568], [296, 566, 280, 568]].map(([x0, y0, x1, y1]) => <path key={x0} d={brushPath(`M ${x0} ${y0} L ${x1} ${y1}`, 5, [0, 0.9])} fill={stripe} />)}
          <path d="M 250 574 C 262 571 273 577 273 586 C 273 597 261 599 250 595 C 239 599 227 597 227 586 C 227 577 238 571 250 574 Z" fill={K.white} />
          {scared ? (
            <>
              <Edge>
                <ellipse cx={231} cy={557} rx={14} ry={16} fill={K.yellow} />
                <ellipse cx={269} cy={557} rx={14} ry={16} fill={K.yellow} />
              </Edge>
              <ellipse cx={231} cy={557} rx={3} ry={10} fill={K.ink} />
              <ellipse cx={269} cy={557} rx={3} ry={10} fill={K.ink} />
              <Brush d="M 214 538 L 240 546" w={3.6} />
              <Brush d="M 286 538 L 260 546" w={3.6} />
              <Edge line={3}>
                <path d="M 234 588 Q 250 578 266 588 L 263 601 Q 250 596 237 601 Z" fill="#6f1b17" />
              </Edge>
              <Edge line={1.8}>
                <path d="M 239 587 L 242 595 L 245 585 Z M 261 587 L 258 595 L 255 585 Z" fill={K.white} />
              </Edge>
            </>
          ) : (
            <>
              <Brush d="M 219 562 Q 229 570 240 562" w={3.4} />
              <Brush d="M 260 562 Q 271 570 281 562" w={3.4} />
              <Brush d="M 240 589 Q 245 595 250 589 Q 255 595 260 589" w={2.6} taper={0.2} />
            </>
          )}
          <Edge line={2}><path d="M 243 576 H 257 L 250 584 Z" fill={K.pink} /></Edge>
          {(scared
            ? ["M 226 584 L 176 566", "M 226 590 L 174 592", "M 228 596 L 180 616", "M 274 584 L 324 566", "M 274 590 L 326 592", "M 272 596 L 320 616"]
            : ["M 228 584 Q 206 579 182 581", "M 228 590 Q 206 590 184 597", "M 272 584 Q 294 579 318 581", "M 272 590 Q 294 590 316 597"]
          ).map((d) => <Brush key={d} d={d} w={2.2} taper={[0.1, 0.7]} />)}
        </Ink>
        {scared && (
          <Ink contour>
            {[[176, 744], [324, 744], [196, 760], [304, 760]].map(([x, y]) => <Brush key={x} d={`M ${x} ${y} V ${y + 40}`} w={4} taper={0.4} />)}
          </Ink>
        )}
      </g>
    );
  };
  const burst = () => (
    <>
      <path fill={K.orange} d={Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * 2 * Math.PI, b = a + Math.PI / 18;
        return `M 560 340 L ${(560 + 1600 * Math.cos(a)).toFixed(1)} ${(340 + 1600 * Math.sin(a)).toFixed(1)} L ${(560 + 1600 * Math.cos(b)).toFixed(1)} ${(340 + 1600 * Math.sin(b)).toFixed(1)} Z`;
      }).join(" ")} />
      <Dots color={K.red} r={2.6} gap={10} opacity={0.5} />
    </>
  );
  const kitchen = (t: number) => (
    <>
      {wallAndWindow()}
      {clock(t)}
      {person(t)}
      {counter()}
      {toaster(t)}
      {toast(t)}
      {cat(t)}
    </>
  );

  const [wide, right] = comic.layout([[1.42, 1]]);
  const [pop, face, kitty] = comic.layout([[1], [1, 1]], { ...right, heights: [0.92, 1.08] });
  return (
    <Page id="g23">
      <Panel id="g23-wide" T={T} {...wide}>{kitchen(Math.min(T, POP - 0.1))}</Panel>
      <Panel id="g23-pop" T={T} {...pop} t={POP} fill={K.yellow} shots={[{ t: 0, x: 560, y: 430, zoom: 1.35 }]} hits={[POP]} punch={0.1}>
        {burst()}
        {toaster(T)}
        {toast(T)}
      </Panel>
      <Panel id="g23-face" T={T} {...face} t={POP} shots={[{ t: 0, x: 937, y: 316, zoom: 1.4 }]}>
        <Dots color={K.cyan} r={3.2} />
        {person(T)}
      </Panel>
      <Panel id="g23-cat" T={T} {...kitty} t={POP + 0.1} shots={[{ t: 0, x: 268, y: 640 - catHop(T), zoom: 1.5 }]}>
        <Dots color={K.magenta} r={3.2} />
        {cat(T)}
      </Panel>
      <Caption T={T} line={said("g23-when", "Monday, 7:05 a.m.", 7.4, 0.3)} x={62} y={60} width={420} size={38} />
      <Balloon T={T} line={said("g23-dream", "five more minutes...", 7.9, 0.3)} x={860} y={150} tail={[1010, 312]} kind="thought" width={300} size={36} />
      <Balloon T={T} line={said("g23-shout", "not my toast!", 9.46, 0.07)} x={1311} y={602} tail={[1302, 731]} kind="shout" width={230} size={36} />
      <Sfx T={T} t={POP} text="POP!" x={1300} y={330} size={140} rotate={-12} />
      <Sfx T={T} t={POP + 0.15} text="HISS!" x={1650} y={985} size={72} rotate={-6} fill={K.white} shadow={K.magenta} seed={4} />
    </Page>
  );
};

const TILES: { name: string; draw: (T: number) => React.ReactNode }[] = [
  {
    name: "Person: poses, outfits, hair, skin",
    draw: (T) => (
      <Svg>
        <SkyGradient time="dusk" id="g1-sky" />
        <Sun T={T} x={1500} y={760} r={120} id="g1-sun" horizon={860} />
        <Ground T={T} y={900} town={false} glow="#ff8a5c" color="#241a3e" far="#4a2c58" id="g1-ground" />
        <Person x={150} y={985} s={1.15} pose="stand" T={T} />
        <Person x={420 + STRIDE * 1.15 * 0.3} y={985} s={1.15} pose="walk" phase={0.3} T={T} look={{ outfit: "dress", skin: SKINS.medium }} />
        <Person x={690} y={985} s={1.15} pose="run" phase={0.2} T={T} look={{ outfit: "suit", skin: SKINS.tan, hairColor: "#141018" }} />
        <Person x={960} y={985} s={1.15} pose="phone" T={T} look={{ hair: "ponytail", skin: SKINS.deep, top: "#2f8f6b", pants: "#1d2b40", hairColor: "#1a1210" }} />
        <Person x={1230} y={985} s={1.15} pose="sing" T={T} look={{ outfit: "dress", hair: "ponytail", top: "#e0a12f", accent: "#ff3355" }} />
        <Person x={1500} y={985} s={1.15} pose="armsUp" T={T} look={{ top: "#e07b39", pants: "#2a2f55", skin: SKINS.medium, hairColor: "#5a3a24" }} />
        <Person x={1770} y={985} s={1.15} pose="wave" T={T} flip look={{ hair: "long", top: "#7a5ad8", skin: SKINS.light, hairColor: "#c98b4a" }} />
      </Svg>
    ),
  },
  {
    name: "Crowd (handsUp) under stage lights",
    draw: (T) => (
      <>
        <Svg><SkyGradient time="night" id="g2-sky" /></Svg>
        <Rays T={T} color="#ff3355" opacity={0.3} cy={300} />
        <Svg><Crowd T={T} mode="handsUp" /></Svg>
      </>
    ),
  },
  {
    name: "City at night",
    draw: (T) => (
      <Svg>
        <SkyGradient time="night" id="g3-sky" />
        <Moon T={T} color="#ffd36b" x={1500} y={220} r={70} />
        <Clouds T={T} time="night" light={{ x: 1500, y: 220 }} y0={140} y1={330} seed={11} id="g3-clouds" />
        <City T={T} id="g3-city" />
      </Svg>
    ),
  },
  {
    name: "Sunset sea and beach",
    draw: (T) => (
      <Svg>
        <SkyGradient time="dusk" horizon={640} id="g4-sky" />
        <Clouds T={T} time="dusk" light={{ x: 960, y: 600 }} y0={90} y1={360} seed={3} id="g4-clouds" />
        <Sun T={T} x={960} y={600} r={130} horizon={640} id="g4-sun" />
        <Sea T={T} horizon={640} color="#7a3f7a" deep="#1a1238" light={{ x: 960, color: "#ffc48a" }} beach id="g4-sea" />
        <Person x={760} y={1040} s={0.9} pose="walk" phase={0.6} T={T} look={{ outfit: "dress", top: "#f2f2f2", hairColor: "#2a1a14" }} />
        <Person x={880} y={1040} s={0.95} pose="walk" phase={0.1} T={T} look={{ top: "#2a4fb0" }} />
      </Svg>
    ),
  },
  {
    name: "Room at night, city through the window",
    draw: (T) => (
      <Svg>
        <Room T={T} id="g5-room" view={
          <>
            <SkyGradient time="night" id="g5-view-sky" />
            <City T={T} y={690} scale={0.45} id="g5-view-city" />
          </>
        } />
        <Person x={1000} y={985} s={1.5} pose="lookUp" flip T={T} look={{ hair: "long", top: "#d8d0c0", pants: "#3a3550", hairColor: "#20160f" }} />
      </Svg>
    ),
  },
  {
    name: "Hills at night, lanterns rising",
    draw: (T) => {
      const [hx, hy] = personHand("reach", 1.4, 0, T);
      return (
        <Svg>
          <SkyGradient time="night" id="g6-sky" />
          <Moon T={T} color="#ffd36b" x={420} y={230} r={60} />
          <Lanterns T={T + 20} n={26} />
          <Ground T={T} y={900} glow="#ff9a3c" id="g6-ground" />
          <Person x={1100} y={960} s={1.4} pose="reach" T={T} look={{ top: "#3b4fb0" }} />
          <Lantern x={1100 + hx + 6} y={960 + hy - 34} s={0.5} T={T} sway={0} />
        </Svg>
      );
    },
  },
  {
    name: "Street by day",
    draw: (T) => (
      <Svg>
        <SkyGradient time="day" id="g7-sky" />
        <Sun T={T} x={1600} y={180} r={70} color="#ffe08a" core="#fffbe8" id="g7-sun" />
        <Clouds T={T} seed={21} id="g7-clouds" />
        <City T={T} day shift={T * 60} id="g7-city" />
        <Street T={T} day id="g7-street" />
        <Person x={700} y={985} s={1.2} pose="walk" phase={0.4} T={T} look={{ outfit: "suit" }} tie={false} />
        <Person x={1150} y={985} s={1.2} pose="phone" T={T} flip look={{ outfit: "dress", top: "#2f8f6b", hair: "ponytail" }} />
      </Svg>
    ),
  },
  {
    name: "Phone: a chat late at night",
    draw: (T) => (
      <Svg>
        <SkyGradient time="night" stars={1} T={T} id="g8-sky" />
        <City T={T} id="g8-city" />
        <rect x={0} y={0} width={1920} height={1080} fill="#04050b" opacity={0.45} />
        <Phone T={T} x={960} y={540} s={1.2} tilt={-3} title="Mina" clock="11:47" id="g8-phone"
          messages={[
            { t: 6.4, text: "you up?" },
            { t: 7.5, text: "can't sleep. thinking about you", me: true },
            { t: 8.6, text: "same here" },
            { t: 9.2, text: "see you tomorrow?", me: true },
          ]}
          typing={[[9.4, 11]]} />
      </Svg>
    ),
  },
  {
    name: "Clock and heart",
    draw: (T) => (
      <Svg>
        <SkyGradient time="dusk" id="g9-sky" />
        <Clouds T={T} time="dusk" y0={60} y1={260} seed={9} id="g9-clouds" />
        <Clock T={T} x={430} y={470} r={190} time={10 * 60 + 10} spin={30} ticks="beat" look="wall" id="g9-clock" />
        <Clock T={T} x={860} y={760} r={110} time={7 * 60} look="alarm" ticks="second" id="g9-alarm" />
        <Heart T={T} x={1260} y={480} s={1.3} beat={1} glow={0.6} id="g9-heart" />
        <Heart T={T} x={1650} y={600} s={0.95} crack={0.7} color="#c8364f" id="g9-broken" />
      </Svg>
    ),
  },
  {
    name: "Car and plane at dusk",
    draw: (T) => (
      <Svg>
        <SkyGradient time="dusk" id="g10-sky" />
        <Sun T={T} x={1500} y={760} r={110} id="g10-sun" />
        <Clouds T={T} time="dusk" light={{ x: 1500, y: 760 }} y0={80} y1={330} seed={13} id="g10-clouds" />
        <Plane T={T} x={640} y={250} s={0.9} trail={700} lights tilt={4} id="g10-plane" />
        <City T={T} y={950} dusk shift={T * 40} id="g10-city" />
        <Street T={T} y={950} id="g10-street" />
        <Car T={T} x={900} y={1068} s={0.55} lights distance={(T * 120 * 1.18) / 0.55} id="g10-car" />
      </Svg>
    ),
  },
  {
    name: "Rain on a city street at night",
    draw: (T) => (
      <Svg>
        <SkyGradient time="night" id="g11-sky" />
        <City T={T} y={950} signs id="g11-city" />
        <Street T={T} y={950} id="g11-street" />
        <Person x={900} y={985} s={1.1} pose="walk" phase={0.35} T={T} look={{ top: "#2f8f6b", hair: "short" }} />
        <Rain T={T} strength={1} ground={990} id="g11-rain" />
      </Svg>
    ),
  },
  {
    name: "Fireworks and confetti",
    draw: (T) => (
      <Svg>
        <SkyGradient time="night" stars={1} T={T} id="g12-sky" />
        <Fireworks T={T} id="g12-fw" bursts={[
          { t: T - 0.3, x: 980, y: 230, color: "#ff5fd2", size: 1.2 },
          { t: T - 0.9, x: 520, y: 320, color: "#3fe6ff", kind: "willow" },
          { t: T - 1.5, x: 1440, y: 300, color: "#ffd36b", kind: "ring" },
          { t: T - 2.1, x: 760, y: 420, color: "#ff3355" },
        ]} />
        <Crowd T={T} mode="jump" cones={false} id="g12-crowd" />
        <Confetti T={T} from={T - 3} id="g12-confetti" />
      </Svg>
    ),
  },
  {
    name: "Style pack: paper cut-out",
    draw: (T) => <PaperRoom T={T} />,
  },
  {
    name: "Camera: one world, four shots",
    draw: () => <CameraShots />,
  },
  {
    name: "Hit: burst, sparkle, ring (neon and flat)",
    draw: (T) => <Hits T={T} />,
  },
  {
    name: "Flames: a campfire, and flat on paper",
    draw: (T) => <Fire T={T} />,
  },
  {
    name: "Storm and lightning, and flat on paper",
    draw: (T) => <Thunder T={T} />,
  },
  {
    name: "Tears: crying in close-up, and flat on paper",
    draw: (T) => <Crying T={T} />,
  },
  {
    name: "Bed: lying awake at night (Person pose lie)",
    draw: (T) => (
      <Svg>
        <Room T={T} id="g19-room" bed sleeper={<Person x={0} y={0} pose="lie" T={T} look={{ hair: "long", top: "#d8d0c0", hairColor: "#20160f" }} />} view={
          <>
            <SkyGradient time="night" id="g19-view-sky" />
            <Moon T={T} color="#ffd36b" x={700} y={300} r={46} />
            <City T={T} y={690} scale={0.45} id="g19-view-city" />
          </>
        } />
      </Svg>
    ),
  },
  {
    name: "Cash: raining at night, and flat on paper",
    draw: (T) => (
      <>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 1080, overflow: "hidden" }}>
          <Svg>
            <SkyGradient time="night" id="g20-sky" />
            <City T={T} y={950} signs id="g20-city" />
            <Street T={T} y={950} speed={0} id="g20-street" />
            <Person x={560} y={985} s={1.2} pose="armsUp" T={T} look={{ outfit: "suit", accent: "#ffd36b" }} />
            <Cash T={T} n={34} />
          </Svg>
        </div>
        <Svg>
          <defs><clipPath id="g20-panel"><rect x={1280} y={0} width={640} height={1080} /></clipPath></defs>
          <paper.Stack id="g20">
            <Cut d={rect(1280, -20, 660, 1120, 600)} fill={PC.navy} />
            <g clipPath="url(#g20-panel)">
              <Cut d="" fill="none" lift={6}>
                <Cash T={paper.step(T)} n={36} size={120} colors={[PC.leaf, PC.green]} wind={0} seed={9} />
              </Cut>
            </g>
          </paper.Stack>
        </Svg>
      </>
    ),
  },
  {
    name: "Recipe: sleepless in a storm (8 parts)",
    draw: (T) => <SleeplessStorm T={T} strikes={[6.2, 9.5]} tears={[7, 8.75]} from={4} />,
  },
  {
    name: "Style pack: pixel art",
    draw: (T) => <PixelCorner T={T} />,
  },
  {
    name: "Style pack: comic page",
    draw: (T) => <ComicKitchen T={T} />,
  },
];

const Tile: React.FC<{ x: number; y: number; k: number; children: React.ReactNode }> = ({ x, y, k, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 1920, height: 1080, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden" }}>
    {children}
  </div>
);

/** The overview's grid: 4 × 4 tiles, 5 across once there are more than 16, the rows centred on the frame */
const COLS = TILES.length > 16 ? 5 : 4;
const TOP = (1080 - Math.ceil(TILES.length / COLS) * (1080 / COLS)) / 2;

export const KitGallery: React.FC<{ T: number }> = ({ T }) => {
  const frame = useCurrentFrame();
  const ctx = useMemo(() => makeSongCtx(sample as Song), []);
  const one = TILES[frame - 1];
  return (
    <SongContext.Provider value={ctx}>
      <AbsoluteFill style={{ background: "#202124", fontFamily: ctx.theme.font }}>
        {one ? (
          <Tile x={0} y={0} k={1}>{one.draw(T)}</Tile>
        ) : (
          TILES.map((t, i) => {
            const x = (i % COLS) * (1920 / COLS), y = TOP + Math.floor(i / COLS) * (1080 / COLS);
            return (
              <React.Fragment key={i}>
                <Tile x={x} y={y} k={1 / COLS}>{t.draw(T)}</Tile>
                <div style={{ position: "absolute", left: x + 8, top: y + 6, color: "#fff", fontSize: 16, fontWeight: 700, textShadow: "0 1px 4px #000" }}>{i + 1}. {t.name}</div>
              </React.Fragment>
            );
          })
        )}
      </AbsoluteFill>
    </SongContext.Provider>
  );
};

export const GALLERY_TILES = TILES.length;
