import React, { useContext } from "react";

/**
 * The song config (mv.json, written by `song2mv sync`) and everything derived from it.
 * Every scene is a pure function of the song time T in seconds — never of the frame number — so a
 * scene renders the same whether the video starts at 0 s or at the chorus.
 */

export type Kind = "calm" | "mid" | "hot";
export type Word = { w: string; t: number };
export type Line = { id: string; section: string; text: string; start: number; end: number; words: Word[] };
export type Section = {
  id: string; name: string; kind: Kind; start: number; end: number;
  /** optional per-section colours, overriding the theme's colours for its kind */
  tint?: string; glow?: string; strength?: number;
};
export type Grid = { bpm: number; beat: number; phi: number; downbeat_mod4: number; bar0?: number };
type KindStyle = { tint: string; glow: string; strength: number };
export type Theme = {
  bg: string;
  /** star colours: [most stars, accent, accent] */
  stars: string[];
  kinds: Record<Kind, KindStyle>;
  sung: string; unsung: string; sungGlow: string;
  bigText: string; bigGlow: string;
  title: string; titleGlow: string; subtitle: string;
  font: string;
};
export type ThemeInput = Partial<Omit<Theme, "kinds">> & { kinds?: Partial<Record<Kind, Partial<KindStyle>>> };
export type Song = {
  title: string; subtitle?: string;
  /** file name under public/ (render.mjs links it there for you); null renders silently */
  audio: string | null;
  duration: number;
  grid: Grid;
  sections: Section[];
  lines: Line[];
  captions?: {
    /** line ids the bottom karaoke captions skip, because a scene draws them itself */
    hide?: string[];
    /** {"ch1-08": 4} — the caption of that line starts at word 4 (the scene drew the first words) */
    from_word?: Record<string, number>;
    /** line ids shown small and wide-spaced, for whispered lines */
    whisper?: string[];
  };
  theme?: ThemeInput;
  /** white flashes [song time, strength 0–1]; default: one at the start of every hot section */
  flashes?: [number, number][];
};
export type MvProps = { song: Song; from: number; to: number | null; hold: number };

export const FPS = 30;

export const DEFAULT_THEME: Theme = {
  bg: "#04050b",
  stars: ["#ffffff", "#3fe6ff", "#ff5fd2"],
  kinds: {
    calm: { tint: "#0a0d26", glow: "#ffd36b", strength: 0.3 },
    mid: { tint: "#0b1030", glow: "#ff3355", strength: 0.7 },
    hot: { tint: "#2a0612", glow: "#ff3355", strength: 1 },
  },
  sung: "#ffffff", unsung: "rgba(255,255,255,0.32)", sungGlow: "rgba(255,51,85,0.6)",
  bigText: "#ffffff", bigGlow: "#ff3355",
  title: "#ffffff", titleGlow: "rgba(255,51,85,0.75)", subtitle: "#ffd36b",
  font: '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", "Noto Sans", system-ui, sans-serif',
};

export function mergeTheme(t: ThemeInput | undefined): Theme {
  const k = t?.kinds ?? {};
  return {
    ...DEFAULT_THEME, ...(t ?? {}),
    kinds: {
      calm: { ...DEFAULT_THEME.kinds.calm, ...(k.calm ?? {}) },
      mid: { ...DEFAULT_THEME.kinds.mid, ...(k.mid ?? {}) },
      hot: { ...DEFAULT_THEME.kinds.hot, ...(k.hot ?? {}) },
    },
  };
}

/** Beat-grid helpers. Beat n (integer) sits at phi + n·beat; a bar starts where n % 4 == downbeat_mod4. */
export function makeGrid(g: Grid) {
  const bar0 = g.bar0 ?? g.phi + g.downbeat_mod4 * g.beat;
  const beatPos = (T: number) => (T - g.phi) / g.beat;
  return {
    ...g,
    bar0,
    /** continuous beat number — whole numbers are beats */
    beatPos,
    /** start time of bar k (bar 0 = first full bar) */
    bar: (k: number) => bar0 + k * 4 * g.beat,
    /** snap a time to the grid, `div` steps per beat (4 = 16th notes) */
    snap: (t: number, div = 4) => g.phi + Math.round((t - g.phi) / (g.beat / div)) * (g.beat / div),
    /** 0–1 decay right after each beat; the first beat of a bar is stronger */
    pulse: (T: number, tau = 0.16) => {
      const b = Math.floor(beatPos(T));
      const down = ((b % 4) + 4) % 4 === g.downbeat_mod4;
      return Math.exp(-(T - (g.phi + b * g.beat)) / tau) * (down ? 1 : 0.6);
    },
  };
}

export type SongCtxValue = {
  song: Song;
  theme: Theme;
  grid: ReturnType<typeof makeGrid>;
  section: (T: number) => Section;
  lineById: Record<string, Line>;
};

export function makeSongCtx(song: Song): SongCtxValue {
  const secs = [...song.sections].sort((a, b) => a.start - b.start);
  const fallback: Section = { id: "all", name: "", kind: "mid", start: 0, end: song.duration };
  return {
    song,
    theme: mergeTheme(song.theme),
    grid: makeGrid(song.grid),
    section: (T) => secs.find((s) => T >= s.start && T < s.end) ?? (T < (secs[0]?.start ?? 0) ? secs[0] : secs[secs.length - 1]) ?? fallback,
    lineById: Object.fromEntries(song.lines.map((l) => [l.id, l])),
  };
}

export const SongContext = React.createContext<SongCtxValue | null>(null);
export function useSong(): SongCtxValue {
  const v = useContext(SongContext);
  if (!v) throw new Error("useSong() outside <SongContext.Provider>");
  return v;
}

/** 9:16 mode — scenes that spread things left and right can stack them in the middle instead */
export const VerticalCtx = React.createContext(false);

/** Colours of the section at T: background tint, beat-glow colour and strength */
export function sectionLook(ctx: SongCtxValue, T: number) {
  const sec = ctx.section(T);
  const base = ctx.theme.kinds[sec.kind];
  return { sec, tint: sec.tint ?? base.tint, glow: sec.glow ?? base.glow, strength: sec.strength ?? base.strength };
}

/** The white flashes to draw: the song's own list, or one at the start of every hot section after the first second */
export function flashesOf(song: Song): [number, number][] {
  if (song.flashes) return song.flashes;
  return song.sections.filter((s) => s.kind === "hot" && s.start > 1).map((s) => [s.start, 0.55] as [number, number]);
}
