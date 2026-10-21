import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  Car, City, Clock, Clouds, Confetti, Crowd, Fireworks, Ground, Heart, Lantern, Lanterns, Moon, Person, Phone, Plane, Rain,
  Rays, Room, Sea, SkyGradient, Song, SongContext, Street, Sun, Svg, makeSongCtx, mix, paper, personHand, shade, SKINS, STRIDE,
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
];

const Tile: React.FC<{ x: number; y: number; k: number; children: React.ReactNode }> = ({ x, y, k, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 1920, height: 1080, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden" }}>
    {children}
  </div>
);

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
            const x = (i % 4) * 480, y = Math.floor(i / 4) * 270;
            return (
              <React.Fragment key={i}>
                <Tile x={x} y={y} k={1 / 4}>{t.draw(T)}</Tile>
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
