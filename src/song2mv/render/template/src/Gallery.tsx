import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  Car, City, Clock, Clouds, Confetti, Crowd, Fireworks, Ground, Heart, Lantern, Lanterns, Moon, Person, Phone, Plane, Rain,
  Rays, Room, Sea, SkyGradient, Song, SongContext, Street, Sun, Svg, makeSongCtx, personHand, SKINS, STRIDE,
} from "./kit";
import sample from "./sample-song.json";

/**
 * The kit's people, places and objects in use, to see what there is before designing scenes:
 *   npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0    every tile at once
 *   npx remotion still src/index.ts Kit-Gallery tile.png --frame=3       one tile at full size (1…)
 * Each tile is a small scene; read its code here for how the pieces combine.
 */

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
