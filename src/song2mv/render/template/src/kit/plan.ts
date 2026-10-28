import type { Shot } from "./camera";
import type { Kind, Line, Section, SongCtxValue } from "./song";

/**
 * Cut planning that passes `song2mv check` by construction. Give it a stretch of the song and the framings to cut
 * between; it picks the cut times, which framing each cut takes and each shot's drift:
 *
 *   const ctx = useSong();
 *   const { shots, hits } = planShots(ctx, sec.start, sec.end, [
 *     { x: 960, y: 540 },                     // wide
 *     { x: 700, y: 640, zoom: 2.2 },          // the hero up close
 *     { x: 1350, y: 420, zoom: 1.5, rotate: -4 },
 *   ]);
 *   <Camera T={T} shots={shots} hits={hits}>…the world…</Camera>
 *
 * The rules follow the section kinds and check's goals:
 * - every section starts on a cut (or on a board that starts sooner than its first shot could end, after its start or
 *   before it, at a line sung into it); cuts sit on bar lines (or a bar's middle, when bars are long) or a 16th before
 *   a line's first word, where check counts the cut as that line's own;
 * - mid sections cut unevenly (2, 1, 3, 1, 2 … bars; on dense lines, one every 1.6 s or less as in rap, every 2–3
 *   lines), with interval CV ≥ 0.42 where it can (`cuts.rhythm` wants 0.35), no shot over 5.2 s (`cuts.max_gap`), no
 *   cut inside a line shorter than 1.8 s and never two in one short line (`motion.max`);
 * - calm sections hold shots of 3–4 bars with slow drifts; hot sections cut on downbeats, every bar or two (half bars on
 *   slow songs), a hit (the camera's punch) on each bar line;
 * - every shot drifts (a push, a pan or a pull; `drift` scales it), so a held line never measures still;
 * - copy n of a section opens on framing n − 1 (ch2 on framings[1], v3 on framings[2]) and takes the rest in turn, so
 *   it does not repeat the first copy's shots (`variation.repeats`);
 * - consecutive shots never take framings too alike to show a cut: under 1.35× apart in zoom, closer than 400 px / zoom
 *   and under 4° apart in roll. The plan skips such a framing, and lists one that no shot took under `dropped`.
 *
 * `pattern` sets your own bar counts between cuts (cycled); the rules above still hold. A cut only counts when the
 * picture changes: give framings that show different parts of the world (the sky, the ground, the subject up close),
 * not one layout at two zooms, and keep large still overlays off the picture, where they hide cuts. A single framing
 * alternates with one 1.6× closer. A drift keeps a framing that shows only the stage on it. The plan ends with a shot
 * at `to` that holds where the last one drifted to. Each shot says which framing it took (`framing`).
 */

/** Where a shot looks: the stage point at the middle of the frame, its zoom and roll, as in a Shot */
export type Framing = { x: number; y: number; zoom?: number; rotate?: number };

/** A camera Shot of the plan, and the index of the framing it took */
export type PlannedShot = Shot & { framing: number };

export type Plan = {
  shots: PlannedShot[]; hits: number[];
  /** framings no shot took because each turn they came after one too alike: [framing, the framing before it] */
  dropped?: [number, number][];
  /** true when the board's `pattern` set no section's rhythm (planBoards): no section opens on the board */
  idlePattern?: boolean;
};

export type PlanOptions = {
  /** bar counts between cuts, cycled through the stretch: replaces each section kind's default rhythm */
  pattern?: number[];
  /** scales every shot's drift (default 1): lower it over fine high-contrast detail, which measures as motion */
  drift?: number;
  /** false: a later copy of a section opens on the first framing too, as a board keyed to a line does */
  reorder?: boolean;
};

/** One board of a storyboard for planBoards: its stretch, framings and options */
export type BoardPlan = PlanOptions & { from: number; to: number; framings: Framing[] };

type Rule = { pattern: number[]; min: number; max: number; zoom: number; pan: number };

const RULES: Record<Kind, Rule> = {
  calm: { pattern: [4, 3, 4, 2], min: 2.5, max: 9, zoom: 0.016, pan: 20 },
  mid: { pattern: [2, 1, 3, 1, 2, 1, 3, 2], min: 1.0, max: 5.2, zoom: 0.03, pan: 40 },
  hot: { pattern: [1, 1, 2, 1, 1, 2], min: 0.9, max: 4.5, zoom: 0.04, pan: 45 },
};
const MID = [RULES.mid.pattern, [1, 3, 1, 2, 3, 1, 2], [3, 1, 2, 1, 1, 3, 2], [2, 3, 1, 3, 2, 1, 3], [1, 2, 3, 1, 1, 3, 2],
  [1, 4, 2, 1, 3, 4], [4, 1, 1, 3, 1, 4, 2]];
/** dense lines (one every 1.6 s or less), in lines: cut every 2–3 lines, now and then on the next */
const DENSE = [2, 3, 1, 3, 2, 1, 3];
const SHORT_LINE = 1.8;
/** a line under SHORT_KEYED s takes no cut in a section with boards at its lines, which cut already, while the
 * section's rhythm reaches KEYED_CV */
const SHORT_KEYED = 2.5;
const KEYED_CV = 0.37;
const MOVES = ["in", "right", "out", "left", "in", "up"] as const;

type Grid = SongCtxValue["grid"];
type Part = { sec: Section; start: number; end: number; open?: number };
type Zone = { from: number; to: number; start: number; cap: number };
type Cand = { t: number; lead: boolean };

const repeatOf = (sec: Section) => Number(/(\d+)$/.exec(sec.id)?.[1] ?? 1);
const cv = (ts: number[]) => {
  const iv = ts.slice(1).map((t, i) => t - ts[i]);
  if (iv.length < 3) return 1;
  const m = iv.reduce((a, b) => a + b, 0) / iv.length;
  return Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / iv.length) / m;
};

function beatLen(grid: Grid, t: number) {
  const b = Math.floor(grid.beatPos(t));
  return grid.beatTime(b + 1) - grid.beatTime(b);
}

function barLen(grid: Grid, t: number) {
  const k = Math.floor((grid.beatPos(t) - grid.downbeat_mod4) / 4);
  return grid.bar(k + 1) - grid.bar(k);
}

/** The lead-in of a line: a 16th before its first word, at most 0.15 s, so check counts the cut as the line's own */
function leadIn(grid: Grid, line: Line) {
  const t = line.words[0].t;
  return t - Math.min(0.15, beatLen(grid, t) / 4);
}

/** The stretch of each line where a cut counts as motion in it (as check measures lines), and how many it takes */
function zonesOf(lines: Line[], short: number): Zone[] {
  return lines.map((l, i) => {
    const s = l.words[0].t, next = lines[i + 1]?.words[0].t ?? Infinity;
    const end = Math.max(Math.min(l.end, next), s + 1.5);
    const len = Math.min(end, next) - s;
    return { from: s + 0.12, to: Math.min(end, next - 0.25), start: s, cap: len < short ? 0 : 1 + Math.floor(Math.max(0, len - 2.6) / 2.6) };
  });
}

function partsOf(ctx: SongCtxValue, from: number, to: number): Part[] {
  const parts: Part[] = [];
  for (let t = from; t < to - 1e-6;) {
    const sec = ctx.section(t + 1e-6);
    const end = sec.end > t + 1e-6 ? Math.min(to, sec.end) : to;
    parts.push({ sec, start: t, end });
    t = end;
  }
  return parts;
}

function barsIn(grid: Grid, a: number, b: number) {
  const out: number[] = [];
  let k = Math.floor((grid.beatPos(a) - grid.downbeat_mod4) / 4) - 1;
  while (grid.bar(k) < a) k++;
  for (; grid.bar(k) < b; k++) out.push(grid.bar(k));
  return out;
}

function beatsIn(grid: Grid, a: number, b: number) {
  const out: number[] = [];
  for (let n = Math.ceil(grid.beatPos(a)); grid.beatTime(n) < b; n++) out.push(grid.beatTime(n));
  return out;
}

/**
 * Where a section's part opens: its start, or a key (a board start) sooner after it than the shortest shot, when the
 * shot before, which began at `before`, can run on to the key instead of cutting twice (check counts the two as one)
 */
function opening(part: Part, keys: number[], before: number) {
  const rule = RULES[part.sec.kind];
  const soon = keys.find((k) => k > part.start + 1e-6 && k < part.start + rule.min);
  return soon !== undefined && soon - before <= rule.max ? soon : part.start;
}

/**
 * The cut times of one section's part of the stretch: a greedy walk along the pattern over the allowed candidates. It
 * takes every key (a board start) on its way, as it takes the part's opening.
 */
function walk(part: Part, rule: Rule, unit: number, pattern: number[], phase: number, cands: Cand[], zones: Zone[], beats: number[], strict: boolean,
  keys: number[]) {
  const out = [part.open ?? part.start];
  const used = new Map<Zone, number[]>();
  const zoneAt = (t: number) => zones.find((z) => t > z.from && t < z.to);
  const fits = (t: number) => {
    if (!strict) return true;
    const z = zoneAt(t);
    if (!z) return true;
    const u = used.get(z) ?? [];
    return u.length < z.cap && t - z.start >= 0.5 && z.to - t >= 0.4 && u.every((v) => Math.abs(t - v) >= 1.5);
  };
  const take = (t: number) => {
    const z = zoneAt(t);
    if (z) used.set(z, [...(used.get(z) ?? []), t]);
    out.push(t);
  };
  let prev = out[0];
  for (let i = phase; ; i++) {
    const want = prev + Math.min(rule.max, Math.max(rule.min, pattern[i % pattern.length] * unit));
    const key = keys.find((k) => k > prev + 1e-6);
    const last = Math.min(part.end, key ?? Infinity) - 0.4;
    let best = NaN, score = Infinity;
    for (const c of cands) {
      if (c.t < prev + rule.min || c.t > prev + rule.max || c.t > last || !fits(c.t)) continue;
      const s = Math.abs(c.t - want) - (c.lead ? 0.25 * unit : 0);
      if (s < score) [best, score] = [c.t, s];
    }
    if (key !== undefined && key <= prev + rule.max && (Number.isNaN(best) || want >= key)) best = key;
    if (Number.isNaN(best)) {
      if (part.end - prev <= rule.max) break;
      const room = beats.filter((t) => t >= prev + rule.min && t <= prev + rule.max);
      best = [...room].reverse().find(fits) ?? room[room.length - 1] ?? prev + rule.max;
    }
    take(best);
    prev = best;
  }
  return out;
}

/**
 * The cut times of one section's part of the stretch, and which of them are on a bar line (a hot section's hits). `keys`
 * are the board starts inside it: cuts of the plan, counted in its rhythm.
 */
function cutsOf(ctx: SongCtxValue, part: Part, pattern: number[] | undefined, lines: Line[], keys: number[]) {
  const { grid } = ctx;
  const kind = part.sec.kind;
  const rule = RULES[kind];
  const bar = barLen(grid, part.start);
  const inside = lines.filter((l) => l.words[0].t > part.start + rule.min && l.words[0].t < part.end);
  const gaps = inside.slice(1).map((l, i) => l.words[0].t - inside[i].words[0].t).sort((a, b) => a - b);
  const dense = kind === "mid" && gaps.length >= 3 && gaps[gaps.length >> 1] <= 1.6;
  const half = !pattern && kind !== "calm" && bar > (kind === "hot" ? 2.2 : 1.8);
  let unit = half ? bar / 2 : bar;
  if (!pattern && kind === "mid") {
    unit = dense ? gaps[gaps.length >> 1] : unit;
    while (unit > 2.4) unit /= 2;
    while (unit < 1.2) unit *= 2;
  }
  const bars = barsIn(grid, part.start + 0.3, part.end - 0.3);
  const halves = half ? bars.map((t) => grid.beatTime(grid.beatPos(t) + 2)).filter((t) => t < part.end - 0.3) : [];
  const leads: Cand[] = kind === "hot" ? [] : inside.map((l) => ({ t: leadIn(grid, l), lead: true }));
  const cands: Cand[] = [...leads, ...[...bars, ...halves].filter((t) => leads.every((c) => Math.abs(c.t - t) > 0.35)).map((t) => ({ t, lead: false }))]
    .sort((a, b) => a.t - b.t);
  const beats = beatsIn(grid, part.start, part.end);
  const patterns = pattern ? [pattern] : kind !== "mid" ? [rule.pattern] : dense ? [DENSE, ...MID] : MID;
  const plansIn = (zones: Zone[]) =>
    patterns.flatMap((pat) => pat.map((_, phase) => walk(part, rule, unit, pat, phase, cands, zones, beats, kind === "mid", keys)));
  const keyed = keys.length > 0;
  const zones = zonesOf(lines, SHORT_LINE);
  const plans = plansIn(keyed ? zonesOf(lines, SHORT_KEYED) : zones);
  // check measures the rhythm of a section with 4 cuts or more, the next section's first cut among them when it is inside
  const even = (ts: number[]) => Math.min(cv(ts), cv([...ts, part.end]));
  const best = (ps: number[][]) => ps.reduce((a, b) => (even(b) > even(a) ? b : a));
  // with boards at its lines, a section cuts inside as few lines as its rhythm allows (room above check's 0.35), short
  // ones last: evenly spaced lines cut only where they meet keep too even a rhythm
  const split = (ts: number[]) => ts.slice(1).filter((t) => zones.some((z) => t > z.from && t < z.to)).length;
  const fewest = (ps: number[][]) => {
    const ok = ps.filter((ts) => even(ts) >= KEYED_CV);
    return ok.length ? ok.reduce((a, b) => (split(b) < split(a) || (split(b) === split(a) && even(b) > even(a)) ? b : a)) : undefined;
  };
  let times = plans[0];
  if (kind === "mid" && !keyed) times = plans.find((ts) => even(ts) >= 0.42) ?? best(plans);
  if (kind === "mid" && keyed) {
    const whole = fewest(plans);
    const loose = whole ? [] : plansIn(zones);
    times = whole ?? fewest(loose) ?? best([...plans, ...loose]);
  }
  const hit = (t: number) => (t === part.start && t === part.sec.start) || bars.some((b) => Math.abs(b - t) < 0.02);
  return { times, rule, hits: kind === "hot" ? times.filter(hit) : [] };
}

/** A shot on framing f for d seconds, drifting by `move` at the kind's speed times `drift`, its end kept on the stage */
function drifted(f: Framing, d: number, rule: Rule, move: (typeof MOVES)[number], t: number, framing: number, drift: number): PlannedShot {
  const z = f.zoom ?? 1, r = f.rotate ?? 0;
  const k = Math.min(0.15, rule.zoom * d) * drift;
  const c = Math.abs(Math.cos((r * Math.PI) / 180)), sn = Math.abs(Math.sin((r * Math.PI) / 180));
  const fitsAt = (x: number, y: number, zz: number) =>
    Math.abs(x - 960) <= 960 - (960 * c + 540 * sn) / zz + 1e-6 && Math.abs(y - 540) <= 540 - (960 * sn + 540 * c) / zz + 1e-6;
  const pan = (Math.min(140, rule.pan * d) * drift) / z;
  const shot = { t, x: f.x, y: f.y, zoom: z, rotate: r, framing };
  const tries: { x?: number; y?: number; zoom?: number }[] = [];
  if (z >= 1.1) {
    if (move === "right") tries.push({ x: f.x + pan });
    if (move === "left") tries.push({ x: f.x - pan });
    if (move === "up") tries.push({ y: f.y - pan * 0.6 });
    if (move === "out") tries.push({ zoom: z / (1 + k) });
  }
  tries.push({ zoom: z * (1 + k) });
  const inStage = fitsAt(f.x, f.y, z);
  const to = tries.find((m) => !inStage || fitsAt(m.x ?? f.x, m.y ?? f.y, m.zoom ?? z)) ?? tries[tries.length - 1];
  return { ...shot, to };
}

/** Two framings too alike for a cut between them to show: under 1.35× apart in zoom, and not far apart */
function alike(a: Framing, b: Framing) {
  const za = a.zoom ?? 1, zb = b.zoom ?? 1;
  return Math.max(za, zb) / Math.min(za, zb) < 1.35 && Math.hypot(a.x - b.x, a.y - b.y) < 400 / Math.min(za, zb)
    && Math.abs((a.rotate ?? 0) - (b.rotate ?? 0)) < 4;
}

/** The framings to cut between: a single one alternates with one 1.6× closer */
export function twoAtLeast(framings: Framing[]): Framing[] {
  const f = framings[0] ?? { x: 960, y: 540 };
  return framings.length > 1 ? framings : [f, { ...f, zoom: 1.6 * (f.zoom ?? 1) }];
}

/**
 * The same plan filmed with other framings, taken by index, each drifting as its shot does. A framing too alike to
 * the one before it for a cut gives way to the next one in the list, as in the plan.
 */
export function refilm(plan: Plan, framings: Framing[]): Plan {
  const views = twoAtLeast(framings);
  const shots: PlannedShot[] = [];
  let last = -1;
  for (const s of plan.shots) {
    let i = s.framing % views.length;
    for (let k = 0; k < views.length && s.to && last >= 0 && alike(views[i], views[last]); k++) i = (i + 1) % views.length;
    if (s.to) last = i;
    const f = views[i], z = f.zoom ?? 1, k = (s.zoom ?? 1) / z;
    if (!s.to) {
      const p = shots[shots.length - 1];
      shots.push(p ? { ...s, x: p.to?.x ?? p.x, y: p.to?.y ?? p.y, zoom: p.to?.zoom ?? p.zoom, rotate: p.rotate } : { ...s, ...f });
      continue;
    }
    const to = {
      x: s.to.x === undefined ? undefined : f.x + (s.to.x - s.x) * k,
      y: s.to.y === undefined ? undefined : f.y + (s.to.y - s.y) * k,
      zoom: s.to.zoom === undefined ? undefined : z * (s.to.zoom / (s.zoom ?? 1)),
    };
    shots.push({ ...s, x: f.x, y: f.y, zoom: z, rotate: f.rotate ?? 0, to, framing: i });
  }
  return { shots, hits: plan.hits };
}

/**
 * Plans the shots of the song from `from` to `to` (seconds) over `framings`; see the top of this file. Returns the
 * shots for <Camera> or cameraAt() and the hits (a hot section's cuts on bar lines) for their `hits`.
 */
export function planShots(ctx: SongCtxValue, from: number, to: number, framings: Framing[], o: PlanOptions = {}): Plan {
  return planBoards(ctx, [{ ...o, from, to, framings }])[0];
}

/**
 * Plans boards that follow each other (sorted, each up to the next one's `from`) as planShots plans one stretch, with
 * a section's cuts planned across its boards: every board start is a cut its section's rhythm counts, and a section
 * with boards starting at its lines cuts inside as few of them as an interval CV of 0.37 allows (check wants 0.35),
 * inside none under 2.5 s if it can. A section cuts in the `pattern` of the board it opens on; a board whose pattern
 * no section takes says so (`idlePattern`).
 */
export function planBoards(ctx: SongCtxValue, boards: BoardPlan[]): Plan[] {
  const lines = ctx.song.lines.filter((l) => l.words.length).sort((a, b) => a.words[0].t - b.words[0].t);
  const keys = boards.slice(1).map((b) => b.from);
  const at = (t: number) => boards.find((b) => t >= b.from - 1e-6 && t < b.to - 1e-6) ?? boards[0];
  const patterned = new Set<BoardPlan>();
  let before = -Infinity;
  const parts = partsOf(ctx, boards[0].from, boards[boards.length - 1].to).map((p) => {
    const inner = keys.filter((k) => k > p.start + 1e-6 && k < p.end - 1e-6);
    // a board starting at a line sung into the section, sooner before it than the shortest shot, opens it
    const pickup = keys.includes(before) && p.start - before > 1e-6 && p.start - before < RULES[p.sec.kind].min;
    const part = { ...p, open: pickup ? before : opening(p, inner, before) };
    const opens = at(part.open);
    if (opens.pattern) patterned.add(opens);
    const cuts = cutsOf(ctx, part, opens.pattern, lines, inner);
    before = cuts.times[cuts.times.length - 1] ?? before;
    return { part, ...cuts };
  });
  return boards.map((o) => {
    const views = twoAtLeast(o.framings);
    const shots: PlannedShot[] = [];
    const hits: number[] = [];
    const skipped = new Map<number, number>();
    let last = -1;
    for (const { part, times: all, rule, hits: on } of parts) {
      const times = all.filter((t) => t >= o.from - 1e-6 && t < o.to - 1e-6);
      const rep = repeatOf(part.sec) - 1;
      const first = o.reorder === false ? 0 : rep;
      hits.push(...on.filter((t) => times.includes(t)));
      times.forEach((t, j) => {
        if (shots.length && Math.abs(shots[shots.length - 1].t - t) < 1e-6) {
          shots.pop(); // the section opens on the cut the part before ended with
          last = shots.length ? shots[shots.length - 1].framing : -1;
        }
        let f = (j + first) % views.length;
        for (let k = 0; k < views.length && last >= 0 && alike(views[f], views[last]); k++) {
          skipped.set(f, last);
          f = (f + 1) % views.length;
        }
        last = f;
        const end = times[j + 1] ?? Math.min(part.end, o.to);
        shots.push(drifted(views[f], end - t, rule, MOVES[(j + 2 * rep) % MOVES.length], t, f, o.drift ?? 1));
      });
    }
    const tail = shots[shots.length - 1];
    if (tail) {
      // the last drift ends at `to`: a shot there holds where it has drifted to, and is never a cut
      const end = { x: tail.to?.x ?? tail.x, y: tail.to?.y ?? tail.y, zoom: tail.to?.zoom ?? tail.zoom, rotate: tail.rotate };
      shots.push({ t: o.to, ...end, framing: tail.framing });
    }
    const dropped = [...skipped].filter(([f]) => !shots.some((s) => s.framing === f)).sort((a, b) => a[0] - b[0]);
    return { shots, hits, dropped, ...(o.pattern && !patterned.has(o) ? { idlePattern: true } : {}) };
  });
}
