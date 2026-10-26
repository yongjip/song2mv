import React, { useMemo } from "react";
import { Svg } from "./backgrounds";
import { cameraAt } from "./camera";
import { Framing, Plan, planBoards, refilm } from "./plan";
import { Line, Section, Song, SongCtxValue, useSong } from "./song";
import { BigLine } from "./text";
import { VERTICAL, verticalView, wideView } from "./vertical";

/**
 * A storyboard: the song as a list of boards. A board is a stretch of the song, from a line, a section or a time up
 * to the next board, that films one world through shots planned by `planShots` (cuts, framings, drifts and hits that
 * pass `song2mv check`), a section's cuts across its boards: a board start is a cut, counted in its section's rhythm.
 * One component draws the board on at T, in 16:9 or, from the same boards, as the 9:16 frame:
 *
 *   const BOARDS: Board[] = [
 *     { at: "v1", world: (T) => <Street T={T} />, framings: [LONG, HERO, SKYLINE] },
 *     { at: "v1-05", world: (T) => <Room T={T} />, framings: [LONG, WINDOW] },          // from line v1-05 on
 *     { at: "ch1", world: (T, b) => <Stage T={T} copy={b.repeat} />, framings: [LONG, CROWD], big: true },
 *   ];
 *   export const Scene = ({ T }) => <Storyboard T={T} boards={BOARDS} />;
 *   export const VerticalScene = ({ T }) => <Storyboard T={T} boards={BOARDS} vertical />;
 *   export const linesDrawnByScene = (song: Song) => linesDrawnBy(song, BOARDS);
 *
 * A world is SVG drawn on the 1920×1080 stage (no text: the camera would move it); what it draws past the stage's
 * edges shows when a shot rolls or drifts there. A framing's point is its subject's middle: both frames put it in the
 * middle of their picture, above the captions and big type (`wideView`, and `verticalView` with the board's `tall`
 * framings), so a subject that fits the picture is never under them. Under the picture both frames run on past the
 * stage's bottom edge (the 16:9 one by 120 px at zoom 1): draw the ground on below y 1080. The first board also covers
 * the song before it. A board keyed to a line opens on its first framing; one keyed to a section opens on framing
 * n − 1 in the section's copy n (ch2 on framings[1]), so the copies differ, and so does a board keyed to the same
 * line of each copy with the same framings (ch1-04, ch2-04). A framing too alike to the one before it for a cut
 * (under 1.35× apart in zoom, near it, under 4° apart in roll) is skipped, in either frame; one that never shows is
 * named in a video render's log.
 */

export type BoardSpan = {
  /** the board's first cut and the next board's (or the song's end), in song time */
  from: number; to: number;
  /** the section the board starts in, and which copy of it that is (ch2 → 2; 1 without a number) */
  section: Section; repeat: number;
  /** the lines sung on the board */
  lines: Line[];
  /** true when drawn for the 9:16 frame */
  vertical: boolean;
};

export type Board = {
  /** where the board starts: a line id ("v1-05": a 16th before its first word), a section id ("ch1") or a song time */
  at: string | number;
  /** the world filmed: SVG on the 1920×1080 stage at song time T */
  world: (T: number, span: BoardSpan) => React.ReactNode;
  /** where the camera looks, cut between in turn (planShots) */
  framings: Framing[];
  /** the 9:16 frame's framings, matched to `framings` by index; default `framings` */
  tall?: Framing[];
  /**
   * bar counts between cuts, instead of the section kind's rhythm, in each section that opens on this board (a board
   * at a section, or at its first line); a video render's log names a pattern no section takes
   */
  pattern?: number[];
  /** how far its shots drift (planShots' `drift`): below 1 over fine high-contrast detail, which reads as motion */
  drift?: number;
  /** more camera punches (song times: a slam, a word), besides a hot section's cuts */
  hits?: number[];
  /**
   * drawn over the filmed world and not moved by the camera: text and labels, in the frame's own coordinates (the
   * 1920×1080 stage, or the 1080×1920 frame when `span.vertical`)
   */
  overlay?: (T: number, span: BoardSpan) => React.ReactNode;
  /**
   * true: the board's lines are drawn big (BigLine) instead of as captions, where the captions go, under the picture
   * (WIDE.captions, VERTICAL.captions), so they hide no subject, no cut and no change between copies; a number puts
   * them at that y in the 16:9 frame instead
   */
  big?: boolean | number;
};

type Placed = Omit<BoardSpan, "vertical"> & { board: Board; plan: Plan; tall: Plan; hits: number[] };

/** Song time of `at` and the time its lines start from: a line's lead-in and first word, a section's start, a time */
function anchor(ctx: SongCtxValue | null, song: Song, at: string | number): [number, number] {
  if (typeof at === "number") return [at, at];
  const line = song.lines.find((l) => l.id === at && l.words.length);
  if (line) {
    const t = line.words[0].t;
    const b = ctx ? Math.floor(ctx.grid.beatPos(t)) : 0;
    const beat = ctx ? ctx.grid.beatTime(b + 1) - ctx.grid.beatTime(b) : 0.6;
    return [t - Math.min(0.15, beat / 4), t];
  }
  const sec = song.sections.find((s) => s.id === at);
  // a section's first line can start before it (a pickup): it is the section's board's line all the same
  const first = Math.min(...song.lines.filter((l) => l.section === at && l.words.length).map((l) => l.words[0].t));
  if (sec) return [sec.start, Math.min(sec.start, first)];
  throw new Error(`storyboard: a board is at "${at}", which is no line or section id of this song`);
}

function place(ctx: SongCtxValue | null, song: Song, boards: Board[]) {
  const at = boards.map((board) => ({ board, a: anchor(ctx, song, board.at) })).sort((p, q) => p.a[1] - q.a[1]);
  return at.map(({ board, a }, i) => {
    const from = i === 0 ? 0 : a[0];
    const to = at[i + 1]?.a[0] ?? song.duration;
    const next = at[i + 1]?.a[1] ?? Infinity;
    const lines = song.lines.filter((l) => l.words.length && (i === 0 || l.words[0].t >= a[1]) && l.words[0].t < next);
    const keyed = song.lines.some((l) => l.id === board.at && l.words.length);
    return { board, from, to, lines, keyed };
  });
}

/** A line's place in its section, the same in every copy of it: ch2-04 → ch-04 */
const slot = (id: string | number) => (typeof id === "string" ? id.replace(/^(.*?)\d+(-\d+)$/, "$1$2") : id);

/** Boards keyed to the same line of two copies of a section, with the same framings: copies of one board */
const copies = (a: Board, b: Board) =>
  a !== b && slot(a.at) === slot(b.at) && a.at !== slot(a.at) && JSON.stringify(a.framings) === JSON.stringify(b.framings);

/** The ids of the lines the boards draw as big type, for linesDrawnByScene */
export function linesDrawnBy(song: Song, boards: Board[]): Set<string> {
  const big = place(null, song, boards).filter((p) => p.board.big !== undefined && p.board.big !== false);
  return new Set(big.flatMap((p) => p.lines.map((l) => l.id)));
}

const warned = new Set<string>();

/** Logs once per render: a render runs the scenes in several tabs, and only the main one says it */
function warnOnce(message: string) {
  if (warned.has(message) || (typeof window !== "undefined" && window.remotion_isMainTab === false)) return;
  warned.add(message);
  console.warn(message);
}

/** The boards in song order, each with its stretch and lines and the shots that film it in both frames */
export function planStoryboard(ctx: SongCtxValue, boards: Board[]): Placed[] {
  const spans = place(ctx, ctx.song, boards);
  const plans = planBoards(ctx, spans.map((p) => ({
    from: p.from, to: p.to, framings: p.board.framings, pattern: p.board.pattern, drift: p.board.drift,
    reorder: !p.keyed || spans.some((q) => q.keyed && copies(p.board, q.board)),
  })));
  const where = (b: Board) => (typeof b.at === "number" ? `${b.at} s` : b.at);
  spans.forEach((p, i) => plans[i].dropped?.forEach(([f, before]) => warnOnce(
    `storyboard: the board at ${where(p.board)} never shows `
    + `framing ${f} ${JSON.stringify(p.board.framings[f])}: it comes after framing ${before}, too alike for a cut `
    + "(a cut needs 1.35× in zoom, another part of the world or 4° of roll)")));
  spans.forEach((p, i) => plans[i].idlePattern && warnOnce(
    `storyboard: no section takes the pattern of the board at ${where(p.board)}: a section cuts in the pattern of `
    + "the board it opens on (a board at the section, or at its first line)"));
  const opens = (i: number) => JSON.stringify(spans[i].board.framings[plans[i].shots[0]?.framing ?? 0]);
  spans.forEach((p, i) => spans.forEach((q, j) => j > i && p.keyed && q.keyed && slot(p.board.at) === slot(q.board.at)
    && opens(i) === opens(j) && warnOnce(
      `storyboard: the boards at ${where(p.board)} and ${where(q.board)} open on the same framing ${opens(i)}: `
      + "copies of a section that open alike measure alike (variation.repeats); open each on a framing of its own")));
  return spans.map((p, i) => {
    const section = ctx.section(p.from + 1e-3);
    const plan = plans[i];
    const tall = p.board.tall ? refilm(plan, p.board.tall) : plan;
    const hits = [...plan.hits, ...(p.board.hits ?? [])];
    return { ...p, section, repeat: Number(/(\d+)$/.exec(section.id)?.[1] ?? 1), plan, tall, hits };
  });
}

/**
 * Draws the board on at T, filmed by its planned shots, and its lines as big type when the board asks for it.
 * `wrap` holds the filmed world in the frame, unmoved by the camera, such as a style pack's `paper.Stack`.
 * The 16:9 frame films through `wideView`; `vertical` draws the whole 1080×1920 frame for a VerticalScene: the same
 * shots through `verticalView`, big type where the template's captions go, larger (the picture above stays clear,
 * and `check` measures only the picture). `world` is the area the worlds fill, [left, top, right, bottom], which both
 * frames keep inside: by default the stage's sides and top, open below.
 */
export const Storyboard: React.FC<{
  T: number; boards: Board[]; vertical?: boolean; wrap?: (filmed: React.ReactNode, span: BoardSpan) => React.ReactNode;
  world?: [number, number, number, number];
}> = ({ T, boards, vertical = false, wrap = (filmed) => filmed, world }) => {
  const ctx = useSong();
  const placed = useMemo(() => planStoryboard(ctx, boards), [ctx, boards]);
  let i = 0;
  while (i + 1 < placed.length && placed[i + 1].from <= T) i++;
  const p = placed[i];
  if (!p) return null;
  const { big, overlay } = p.board;
  const span: BoardSpan = { from: p.from, to: p.to, section: p.section, repeat: p.repeat, lines: p.lines, vertical };
  const big16 = typeof big === "number" ? { y: big } : { y: 955, maxSize: 125 };
  if (!vertical) {
    const cam = wideView(cameraAt(T, p.plan.shots, { hits: p.hits }), { world });
    return (
      <>
        <Svg>{wrap(<g transform={cam.svg}>{p.board.world(T, span)}</g>, span)}</Svg>
        {overlay?.(T, span)}
        {big !== undefined && big !== false && <BigLine T={T} lines={p.lines} {...big16} />}
      </>
    );
  }
  const cam = verticalView(cameraAt(T, p.tall.shots, { hits: p.hits }), { world });
  const { safe, captions } = VERTICAL;
  return (
    <>
      <Svg w={VERTICAL.w} h={VERTICAL.h}>{wrap(<g transform={cam.svg}>{p.board.world(T, span)}</g>, span)}</Svg>
      {overlay?.(T, span)}
      {big !== undefined && big !== false && (
        <BigLine T={T} lines={p.lines} x={(safe.left + safe.right) / 2} y={(captions.top + captions.bottom) / 2}
          width={safe.right - safe.left} maxSize={80} />
      )}
    </>
  );
};
