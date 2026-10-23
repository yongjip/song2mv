import React, { useMemo } from "react";
import {
  Board, BoardSpan, City, Clouds, Confetti, Crowd, Dust, Fireworks, Framing, Ground, Lantern, Lanterns, Look, Moon, Person,
  Rain, Room, Sea, Section, SkyGradient, Song, STRIDE, Storyboard, Street, Sun, linesDrawnBy, personHand, span, useSong,
} from "../kit";

/**
 * The starter: a music video for any song, made of the kit's worlds and cut by the kit's planner, so it passes
 * `song2mv check` as it is. It is a starting point, not this song's video: edit the block below (what each part of the
 * song shows, the palette, the hero), then draw worlds of the song's own concept and add them to WORLDS. The planning
 * (cuts, framings, drifts, hits, the 9:16 frame) stays in the kit: see Storyboard in kit/storyboard.tsx and planShots in
 * kit/plan.ts. To use it, put this line in scenes/index.ts instead of the LyricScene one:
 *   export { Starter as Scene, StarterTall as VerticalScene, linesDrawnByScene } from "./Starter";
 */

// ── Edit here ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The hero, in every world: a kit Person's look (outfit hoodie, suit or dress; hair short, long or ponytail; colours) */
const HERO: Partial<Look> = { outfit: "hoodie", hair: "short", top: "#e0a12f", pants: "#2a2f55", hairColor: "#1a1210" };

/** Colours the worlds share: the stage light, the moon and dust, the fireworks, the hills */
const PALETTE = { light: "#ff3355", glow: "#ffd36b", sparks: ["#ff5fd2", "#3fe6ff", "#ffd36b"], land: "#141a3a" };

/**
 * What each part of the song shows. A key is a line id ("v1-05": a new board from that line on), a section id ("ch2")
 * or a section's role (intro, verse, pre, chorus, post, bridge, outro); the most specific wins. `worlds` name worlds of
 * WORLDS below: copies of a section take them in turn (ch1 the first, ch2 the second …), and so does each 8 lines of a
 * long section. `big`: its lines are big type in the scene instead of bottom captions. `pattern`: bar counts between
 * cuts, instead of the section kind's rhythm.
 */
const SHOW: Record<string, Show> = {
  intro: { worlds: ["hills"] },
  verse: { worlds: ["street", "rain"] },
  pre: { worlds: ["room"] },
  chorus: { worlds: ["stage", "fireworks", "beach"], big: true },
  post: { worlds: ["fireworks", "stage"], big: true },
  bridge: { worlds: ["beach", "hills"] },
  outro: { worlds: ["hills"] },
};

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Show = { worlds: string[]; big?: boolean; pattern?: number[] };
/** A world: what it draws, and its framings in 16:9 and 9:16 */
type World = { draw: (T: number, b: BoardSpan) => React.ReactNode; framings: Framing[]; tall?: Framing[] };

/** A framing kept on the stage, its roll included: the frame shows only what the worlds draw */
const at = (x: number, y: number, zoom = 1, rotate = 0): Framing => {
  const c = Math.abs(Math.cos((rotate * Math.PI) / 180)), s = Math.abs(Math.sin((rotate * Math.PI) / 180));
  const w = (960 * c + 540 * s) / zoom, h = (960 * s + 540 * c) / zoom;
  return { x: Math.min(1920 - w, Math.max(w, x)), y: Math.min(1080 - h, Math.max(h, y)), zoom, rotate };
};
/** Ground under the stage's bottom edge, for the 9:16 frame */
const Below: React.FC<{ color: string; y?: number }> = ({ color, y = 1070 }) => (
  <rect x={-400} y={y} width={2720} height={1600} fill={color} />
);
type Pose = React.ComponentProps<typeof Person>["pose"];
const hero = (T: number, x: number, y: number, s: number, pose: Pose, o: { phase?: number; flip?: boolean } = {}) => (
  <Person x={x} y={y} s={s} pose={pose} T={T} look={HERO} phase={o.phase} flip={o.flip} id="hero" />
);

/** Bursts on the bar lines of a board, from its start */
const BarFireworks: React.FC<{ T: number; b: BoardSpan; every?: number; y?: number; id: string }> = ({ T, b, every = 1, y = 260, id }) => {
  const { grid } = useSong();
  const bursts = useMemo(() => {
    const out = [];
    let k = Math.ceil((grid.beatPos(b.from) - grid.downbeat_mod4) / 4);
    for (let i = 0; grid.bar(k) < b.to; k += every, i++) {
      const kind = (["peony", "willow", "ring"] as const)[i % 3];
      out.push({ t: grid.bar(k), x: 380 + ((i * 523) % 1160), y: y + ((i * 97) % 160), color: PALETTE.sparks[i % PALETTE.sparks.length], kind, size: 1 + (i % 2) * 0.3 });
    }
    return out;
  }, [grid, b.from, b.to, every, y]);
  return <Fireworks T={T} bursts={bursts} id={id} />;
};

/** Stage light: beams from a point, turning slowly, pulsing on the beat */
const Beams: React.FC<{ T: number; x: number; y: number; color: string; n?: number }> = ({ T, x, y, color, n = 14 }) => {
  const { grid } = useSong();
  const o = 0.18 + 0.2 * grid.pulse(T, 0.25);
  return (
    <g opacity={o}>
      <defs>
        <radialGradient id="starter-beam" cx={x} cy={y} r={1400} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} stopOpacity={0.95} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={`rotate(${T * 7} ${x} ${y})`}>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * 2 * Math.PI, w = 0.06, R = 2200;
          const p = (da: number) => `${x + R * Math.cos(a + da)},${y + R * Math.sin(a + da)}`;
          return <polygon key={i} fill="url(#starter-beam)" points={`${x},${y} ${p(-w)} ${p(w)}`} />;
        })}
      </g>
    </g>
  );
};

const WORLDS: Record<string, World> = {
  /** hills at dusk, lanterns rising, the hero letting one go */
  hills: {
    draw: (T, b) => {
      const [hx, hy] = personHand("reach", 1.3, 0, T);
      const up = ((T - b.from) % 5) / 5;
      return (
        <>
          <SkyGradient time="dusk" to="night" k={0.55} id="st-hills-sky" />
          <Moon T={T} color={PALETTE.glow} x={1480} y={230} r={58} />
          <Lanterns T={T} from={b.from - 12} n={34} speed={85} id="st-hills-lanterns" />
          <Ground T={T} y={880} glow="#ff9a3c" color={PALETTE.land} id="st-hills-ground" />
          <Below color={PALETTE.land} />
          {hero(T, 760, 960, 1.3, "reach")}
          <Lantern x={760 + hx + 6} y={960 + hy - 34 - 700 * up * up} s={0.5} T={T} sway={up} opacity={1 - span(up, 0.75, 1)} id="st-hills-hand" />
          <g transform="translate(-480 -200) scale(1.5)">
            <Lanterns T={T} from={b.from - 10} n={7} speed={60} seed={9} id="st-hills-near" />
          </g>
          <Dust T={T} color={PALETTE.glow} n={60} speed={40} />
        </>
      );
    },
    framings: [at(960, 540), at(800, 700, 2.4), at(1400, 330, 1.8, -3), at(1000, 600, 1.3)],
    tall: [at(800, 600), at(800, 700, 2.2), at(1350, 420, 1.5, -3), at(900, 640, 1.2)],
  },
  /** a city street at dusk, the hero walking with the crowd */
  street: {
    draw: (T) => {
      const speed = 25, walk = (T * speed) / (STRIDE * 1.15);
      return (
        <>
          <SkyGradient time="dusk" id="st-street-sky" />
          <Sun T={T} x={1450} y={700} r={120} id="st-street-sun" />
          <Clouds T={T} time="dusk" light={{ x: 1450, y: 700 }} y0={80} y1={320} seed={13} id="st-street-clouds" />
          <City T={T} y={950} dusk shift={T * speed * 0.3} id="st-street-city" />
          <Street T={T} y={950} speed={speed} id="st-street-street" />
          <Below color="#121426" />
          <Person x={1900 - ((T * 40) % 2600)} y={972} s={0.85} pose="walk" phase={(T * 40) / (STRIDE * 0.85)} T={T} flip look={{ outfit: "dress", top: "#2f8f6b", hair: "ponytail" }} id="st-street-a" />
          {hero(T, 820, 990, 1.15, "walk", { phase: walk % 1 })}
        </>
      );
    },
    framings: [at(960, 540), at(830, 740, 2.0), at(1450, 360, 1.7, 3), at(1100, 700, 1.4)],
    tall: [at(900, 620), at(830, 760, 1.9), at(1400, 420, 1.5, 3), at(1000, 700, 1.3)],
  },
  /** the same street at night in the rain */
  rain: {
    draw: (T) => {
      const speed = 30, walk = (T * speed) / (STRIDE * 1.1);
      return (
        <>
          <SkyGradient time="night" stars={0.4} T={T} id="st-rain-sky" />
          <Moon T={T} color={PALETTE.glow} x={420} y={200} r={50} />
          <City T={T} y={950} signs shift={T * speed * 0.3} id="st-rain-city" />
          <Street T={T} y={950} speed={speed} id="st-rain-street" />
          <Below color="#121426" />
          {hero(T, 1080, 990, 1.1, "walk", { phase: walk % 1 })}
          <Rain T={T} strength={0.55} ground={990} id="st-rain-rain" />
        </>
      );
    },
    framings: [at(960, 540), at(1090, 750, 2.0), at(520, 330, 1.7, -3), at(800, 700, 1.4)],
    tall: [at(1000, 620), at(1090, 760, 1.9), at(700, 420, 1.5, -3), at(1000, 700, 1.3)],
  },
  /** a room at night, the city through the window, the hero on the phone */
  room: {
    draw: (T) => (
      <>
        <Room T={T} id="st-room" view={
          <>
            <SkyGradient time="night" stars={0.6} T={T} id="st-room-view-sky" />
            <Moon T={T} color={PALETTE.glow} x={720} y={300} r={44} />
            <City T={T} y={690} scale={0.45} id="st-room-view-city" />
          </>
        } />
        <Below color="#2a2030" />
        {hero(T, 1060, 985, 1.5, "phone", { flip: true })}
        <Dust T={T} color={PALETTE.glow} n={30} speed={14} />
      </>
    ),
    framings: [at(960, 540), at(450, 420, 2.0), at(1060, 640, 2.3), at(1400, 640, 1.6, 3)],
    tall: [at(960, 600), at(450, 430, 1.8), at(1060, 660, 2.0), at(1300, 640, 1.4, 3)],
  },
  /** a concert: the hero sings on a stage over the crowd's raised hands */
  stage: {
    draw: (T, b) => (
      <>
        <SkyGradient time="night" stars={0.8} T={T} id="st-stage-sky" />
        <BarFireworks T={T} b={b} every={2} y={200} id="st-stage-fw" />
        <Beams T={T} x={960} y={380} color={PALETTE.light} />
        <rect x={560} y={600} width={800} height={60} fill="#1b1430" />
        {hero(T, 960, 610, 1.15, "sing")}
        <Crowd T={T} mode="handsUp" id="st-stage-crowd" />
        <Below color="#0d0a1a" />
      </>
    ),
    framings: [at(960, 540), at(960, 420, 2.6), at(400, 900, 2.4, -4), at(960, 500, 1.7, 2)],
    tall: [at(960, 420, 1.3), at(960, 400, 2.2), at(300, 720, 1.7, -4), at(960, 470, 1.6, 2)],
  },
  /** fireworks over the city on the bar lines, a crowd jumping, the hero's arms up */
  fireworks: {
    draw: (T, b) => (
      <>
        <SkyGradient time="dusk" to="night" k={0.4} id="st-fw-sky" />
        <BarFireworks T={T} b={b} y={240} id="st-fw-fw" />
        <City T={T} y={900} scale={0.8} dusk id="st-fw-city" />
        <Crowd T={T} mode="jump" cones={false} id="st-fw-crowd" />
        <Below color="#0d0a1a" />
        {hero(T, 1240, 1000, 1.45, "armsUp")}
        <Confetti T={T} from={b.from} n={120} id="st-fw-confetti" />
      </>
    ),
    framings: [at(960, 540), at(700, 280, 2.0, -3), at(1240, 600, 2.2), at(500, 880, 2.0, 2)],
    tall: [at(1150, 560), at(800, 320, 1.8, -3), at(1240, 640, 2.0), at(600, 860, 1.8, 2)],
  },
  /** a beach at sunset: the hero walks along the water; in a hot section the crowd dances and fireworks go up */
  beach: {
    draw: (T, b) => {
      const party = b.section.kind === "hot";
      return (
        <>
          <SkyGradient time="dusk" horizon={640} id="st-beach-sky" />
          <Clouds T={T} time="dusk" light={{ x: 960, y: 600 }} y0={90} y1={360} seed={3} id="st-beach-clouds" />
          {party && <BarFireworks T={T} b={b} y={220} id="st-beach-fw" />}
          <Sun T={T} x={960} y={600} r={130} horizon={640} id="st-beach-sun" />
          <Sea T={T} horizon={640} color="#7a3f7a" deep="#1a1238" light={{ x: 960, color: "#ffc48a" }} beach id="st-beach-sea" />
          <Below color="#c9a27a" y={1060} />
          {party && <Crowd T={T} mode="jump" cones={false} id="st-beach-crowd" />}
          {party ? hero(T, 760, 1040, 1.4, "armsUp")
            : b.section.kind === "calm" ? hero(T, 760, 1030, 1.15, "lookUp", { flip: true })
            : hero(T, 560 + (400 * (T - b.from)) / (b.to - b.from), 1030, 1.1, "walk", { phase: (400 * (T - b.from)) / (b.to - b.from) / (STRIDE * 1.1) })}
          <Dust T={T} color="#ffe2b0" n={50} speed={30} />
        </>
      );
    },
    framings: [at(960, 540), at(760, 760, 2.1), at(860, 660, 1.5), at(1100, 860, 2.0, 3)],
    tall: [at(860, 620), at(760, 760, 1.9), at(860, 660, 1.4), at(900, 820, 1.8, 3)],
  },
};

const ROLES: Record<string, string> = {
  in: "intro", intro: "intro", v: "verse", rp: "verse", sp: "verse", pc: "pre", ch: "chorus", rf: "chorus", hk: "chorus",
  dr: "chorus", po: "post", br: "bridge", it: "bridge", bk: "bridge", ins: "bridge", ou: "outro", outro: "outro",
};
const BY_KIND = { calm: "bridge", mid: "verse", hot: "chorus" } as const;
const roleOf = (sec: Section) => ROLES[sec.id.replace(/\d*b*$/, "")] ?? BY_KIND[sec.kind];

function board(at: string | number, show: Show, copy: number): Board {
  const w = WORLDS[show.worlds[copy % show.worlds.length]];
  return { at, world: w.draw, framings: w.framings, tall: w.tall, pattern: show.pattern, big: show.big };
}

/** The boards for a song: one per section from SHOW, a new one every 8 lines of a long section, and one per line key */
function boardsOf(song: Song): Board[] {
  const out: Board[] = [];
  const secs: Section[] = song.sections.length ? song.sections : [{ id: "", name: "", kind: "mid", start: 0, end: song.duration }];
  for (const sec of secs) {
    const show = SHOW[sec.id] ?? SHOW[roleOf(sec)];
    const copy = Number(/(\d+)$/.exec(sec.id)?.[1] ?? 1) - 1;
    const lines = song.lines.filter((l) => l.section === sec.id && l.words.length);
    out.push(board(sec.id || 0, show, copy));
    lines.forEach((l, i) => i > 0 && i % 8 === 0 && out.push(board(l.id, show, copy + i / 8)));
  }
  for (const [key, show] of Object.entries(SHOW)) if (song.lines.some((l) => l.id === key)) out.push(board(key, show, 0));
  return out;
}

const useBoards = () => {
  const { song } = useSong();
  return useMemo(() => boardsOf(song), [song]);
};

export function linesDrawnByScene(song: Song): Set<string> {
  return linesDrawnBy(song, boardsOf(song));
}

export const Starter: React.FC<{ T: number }> = ({ T }) => <Storyboard T={T} boards={useBoards()} />;
export const StarterTall: React.FC<{ T: number }> = ({ T }) => <Storyboard T={T} boards={useBoards()} vertical />;
