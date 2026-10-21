import React, { createContext, useContext } from "react";
import { Blurs } from "../backgrounds";
import { Shot, cameraAt } from "../camera";
import { clamp01, outBack, outCubic, rng } from "../math";
import { DEFAULT_THEME, Line, Word } from "../song";

type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

export const colors = {
  ink: "#1b1713", paper: "#f2e6c9", white: "#fffcf2",
  cyan: "#1aa1d6", sky: "#bfe4f4", blue: "#2d62c4", navy: "#22346c",
  magenta: "#df3a7c", pink: "#f5a8b8", red: "#e22a20", orange: "#f28a24", yellow: "#f8d11f",
  green: "#2f914f", leaf: "#80c44c", purple: "#7d58a8", brown: "#8b5433", peach: "#f6c8a0", grey: "#a3a9b0",
};

export const fonts = {
  lettering: `"Chalkboard SE", "Comic Sans MS", "Comic Neue", ${DEFAULT_THEME.font}`,
  display: `Impact, Haettenschweiler, "Arial Black", ${DEFAULT_THEME.font}`,
};

const f2 = (v: number) => v.toFixed(2);

type Print = { scope: string; ink: string; line: number; misregister: Pt; zoom: number; styled: boolean };
const PRINT: Print = { scope: "comic", ink: colors.ink, line: 6, misregister: [4, 3], zoom: 1, styled: false };
const PrintCtx = createContext<Print>(PRINT);

const RULES = `
.comic-colour * { stroke: none !important; }
.comic-line * { fill: none !important; stroke: var(--comic-ink) !important; stroke-linejoin: round; stroke-linecap: round; }
.comic-line .comic-flat, .comic-line [filter] { display: none; }
`;

const FIBRES = (() => {
  const r = rng(77);
  return Array.from({ length: 170 }, () => {
    const x = r() * 640, y = r() * 640, a = r() * Math.PI, l = 4 + r() * 14;
    return { x, y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, o: 0.05 + r() * 0.1, w: 0.6 + r() * 1.2 };
  });
})();

export const Page: React.FC<{
  id: string; w?: number; h?: number; paper?: string; ink?: string; line?: number; misregister?: Pt; children: React.ReactNode;
}> = ({ id, w = 1920, h = 1080, paper = colors.paper, ink = PRINT.ink, line = PRINT.line, misregister = PRINT.misregister, children }) => (
  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
    <style>{RULES}</style>
    <Blurs />
    <defs>
      <pattern id={`${id}-fibres`} width={640} height={640} patternUnits="userSpaceOnUse">
        {FIBRES.map((f, i) => (
          <line key={i} x1={f2(f.x)} y1={f2(f.y)} x2={f2(f.x2)} y2={f2(f.y2)} stroke="#5a4628" strokeOpacity={f2(f.o)} strokeWidth={f2(f.w)} />
        ))}
      </pattern>
    </defs>
    <rect width={w} height={h} fill={paper} />
    <PrintCtx.Provider value={{ scope: id, ink, line, misregister, zoom: 1, styled: true }}>{children}</PrintCtx.Provider>
    <rect width={w} height={h} fill={`url(#${id}-fibres)`} />
  </svg>
);

// Lines are drawn over the colours of their own Ink only: what hides part of another drawing goes in a later Ink.
export const Ink: React.FC<{ line?: number; misregister?: Pt; children: React.ReactNode }> = ({ line, misregister, children }) => {
  const print = useContext(PrintCtx);
  const [dx, dy] = misregister ?? print.misregister;
  const lineStyle = { strokeWidth: f2((line ?? print.line) / Math.sqrt(print.zoom)), "--comic-ink": print.ink } as React.CSSProperties;
  return (
    <g>
      {!print.styled && <style>{RULES}</style>}
      <g className="comic-colour" transform={`translate(${f2(dx / print.zoom)} ${f2(dy / print.zoom)})`}>{children}</g>
      <g className="comic-line" style={lineStyle}>{children}</g>
    </g>
  );
};

export const Flat: React.FC<{ children: React.ReactNode }> = ({ children }) => <g className="comic-flat">{children}</g>;

export const Dots: React.FC<{
  color: string; d?: string; x?: number; y?: number; w?: number; h?: number; r?: number; gap?: number; angle?: number; opacity?: number;
}> = ({ color, d, x = -4000, y = -4000, w = 8000, h = 8000, r = 3, gap = 11, angle = 45, opacity }) => {
  const { scope, zoom } = useContext(PrintCtx);
  const id = `${scope}-dots-${[color, r, gap, angle].join("-").replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return (
    <g className="comic-flat" opacity={opacity}>
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle}) scale(${f2(1 / zoom)})`}>
          <circle cx={gap / 2} cy={gap / 2} r={r} fill={color} />
        </pattern>
      </defs>
      {d ? <path d={d} fill={`url(#${id})`} /> : <rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />}
    </g>
  );
};

export function layout(rows: number[][], area: Partial<Box> & { gutter?: number; heights?: number[] } = {}): Box[] {
  const { x = 40, y = 40, w = 1840, h = 1000, gutter = 24, heights = rows.map(() => 1) } = area;
  const total = heights.reduce((a, b) => a + b, 0);
  const boxes: Box[] = [];
  let top = y;
  rows.forEach((row, i) => {
    const rowH = ((h - gutter * (rows.length - 1)) * heights[i]) / total;
    const sum = row.reduce((a, b) => a + b, 0);
    let left = x;
    for (const share of row) {
      const cellW = ((w - gutter * (row.length - 1)) * share) / sum;
      boxes.push({ x: left, y: top, w: cellW, h: rowH });
      left += cellW + gutter;
    }
    top += rowH + gutter;
  });
  return boxes;
}

function panelOutline(w: number, h: number, slant?: [number, number, number, number], round?: boolean): string {
  if (round) {
    const r = Math.min(w, h) / 2;
    return `M ${w / 2 - r} ${h / 2} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  const [a, b, c, d] = slant ?? [0, 0, 0, 0];
  return `M ${a} 0 L ${w + b} 0 L ${w + c} ${h} L ${d} ${h} Z`;
}

export const Panel: React.FC<{
  id: string; T: number; x: number; y: number; w: number; h: number;
  shots?: Shot[]; hits?: number[]; punch?: number;
  t?: number; until?: number; from?: "left" | "right" | "top" | "bottom";
  slant?: [number, number, number, number]; round?: boolean; fill?: string; children?: React.ReactNode;
}> = ({ id, T, x, y, w, h, shots, hits, punch = 0.06, t, until, from, slant, round, fill = colors.white, children }) => {
  const print = useContext(PrintCtx);
  if ((t !== undefined && T < t) || (until !== undefined && T >= until)) return null;
  const k = t === undefined ? 1 : outCubic((T - t) / 0.2);
  const d = (1 - k) * 80;
  const [sx, sy] = from === "left" ? [-d, 0] : from === "right" ? [d, 0] : from === "top" ? [0, -d] : from === "bottom" ? [0, d] : [0, 0];
  const s = from ? 1 : 0.92 + 0.08 * k;
  const cam = cameraAt(T, shots ?? [{ t: 0, x: x + w / 2, y: y + h / 2 }], { hits, punch, w, h });
  const outline = panelOutline(w, h, slant, round);
  return (
    <g transform={`translate(${f2(x + sx + w / 2)} ${f2(y + sy + h / 2)}) scale(${f2(s)}) translate(${f2(-w / 2)} ${f2(-h / 2)})`}
      opacity={t === undefined ? 1 : clamp01((T - t) / 0.06)}>
      <defs><clipPath id={`${id}-frame`}><path d={outline} /></clipPath></defs>
      <g clipPath={`url(#${id}-frame)`}>
        <rect x={-20} y={-20} width={w + 40} height={h + 40} fill={fill} />
        <g transform={cam.svg}>
          <PrintCtx.Provider value={{ ...print, scope: id, zoom: cam.zoom }}>{children}</PrintCtx.Provider>
        </g>
      </g>
      <path d={outline} fill="none" stroke={print.ink} strokeWidth={print.line + 2} strokeLinejoin="round" />
    </g>
  );
};

// ── lettering ────────────────────────────────────────────────

let measurer: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
function textWidth(s: string, size: number, font: string): number {
  const key = `${font}|${s}`;
  let em = widths.get(key);
  if (em === undefined) {
    if (measurer === undefined) measurer = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (measurer) measurer.font = `700 100px ${font}`;
    em = measurer && measurer.font.includes("100px")
      ? measurer.measureText(s).width / 100
      : [...s].reduce((a, ch) => a + (/\s/.test(ch) ? 0.3 : /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1 : 0.62), 0);
    widths.set(key, em);
  }
  return em * size;
}

type Placed = Word & { x: number; y: number; width: number };
const LEADING = 1.12;

function setWords(words: Word[], size: number, maxWidth: number, font: string, align: "center" | "left") {
  const space = textWidth(" ", size, font);
  const ws = words.map((w) => textWidth(w.w, size, font));
  const rowsAt = (limit: number) => {
    const rows: number[][] = [];
    let width = 0;
    ws.forEach((w, i) => {
      const row = rows[rows.length - 1];
      if (row && width + space + w <= limit) { row.push(i); width += space + w; } else { rows.push([i]); width = w; }
    });
    return rows;
  };
  const count = rowsAt(maxWidth).length;
  let lo = Math.max(0, ...ws), hi = Math.max(maxWidth, lo);
  if (count > 1) for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (rowsAt(mid).length > count) lo = mid; else hi = mid; }
  const rows = rowsAt(hi);
  const rowWidth = (row: number[]) => row.reduce((a, i) => a + ws[i], 0) + space * (row.length - 1);
  const W = Math.max(1, ...rows.map(rowWidth)), H = rows.length * size * LEADING;
  const placed: Placed[] = [];
  rows.forEach((row, r) => {
    let x = align === "center" ? -rowWidth(row) / 2 : -W / 2;
    const y = -H / 2 + size * LEADING * (r + 0.5) + size * 0.36;
    for (const i of row) {
      placed.push({ ...words[i], x, y, width: ws[i] });
      x += ws[i] + space;
    }
  });
  return { placed, W, H };
}

const Lettering: React.FC<{ T: number; placed: Placed[]; size: number; font: string; color: string; ghost: number }> = ({
  T, placed, size, font, color, ghost,
}) => (
  <g fontFamily={font} fontWeight={700} fontSize={size} fill={color}>
    {placed.map((p, i) => {
      const sung = T >= p.t;
      const s = sung ? 1 + 0.14 * (1 - outCubic((T - p.t) / 0.1)) : 1;
      const cx = p.x + p.width / 2, cy = p.y - size * 0.36;
      return (
        <text key={i} x={f2(p.x)} y={f2(p.y)} opacity={sung ? 1 : ghost}
          transform={s !== 1 ? `translate(${f2(cx)} ${f2(cy)}) scale(${f2(s)}) translate(${f2(-cx)} ${f2(-cy)})` : undefined}>
          {p.w}
        </text>
      );
    })}
  </g>
);

type Said = {
  T: number; line: Line; slice?: [number, number]; x: number; y: number; width?: number; size?: number; until?: number;
  fill?: string; color?: string; ghost?: number; font?: string; caps?: boolean;
};

function wordsOf(line: Line, slice: [number, number] | undefined, caps: boolean): Word[] {
  const ws = slice ? line.words.slice(...slice) : line.words;
  return caps ? ws.map((w) => ({ ...w, w: w.w.toUpperCase() })) : ws;
}

function shownFrom(T: number, words: Word[], until?: number): number | null {
  if (!words.length) return null;
  const t0 = words[0].t - 0.15;
  return T < t0 || (until !== undefined && T >= until) ? null : t0;
}

/** n points evenly spaced along an ellipse, from the top clockwise, each with its outward normal */
function around(rx: number, ry: number, n: number): { at: Pt; out: Pt }[] {
  const steps = 720, pts: Pt[] = [], dist = [0];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
    if (i) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  let i = 0;
  return Array.from({ length: n }, (_, k) => {
    const d = (k / n) * dist[steps];
    while (dist[i + 1] < d) i++;
    const f = (d - dist[i]) / (dist[i + 1] - dist[i] || 1);
    const at: Pt = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    const nx = at[0] / (rx * rx), ny = at[1] / (ry * ry), L = Math.hypot(nx, ny) || 1;
    return { at, out: [nx / L, ny / L] };
  });
}

const perimeter = (rx: number, ry: number) => Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));

function spiky(rx: number, ry: number, spike: number, seed: number): string {
  const r = rng(seed);
  const n = 2 * Math.max(8, Math.round(perimeter(rx, ry) / (spike * 3.2)));
  return `M ${around(rx, ry, n).map(({ at: [x, y], out: [ox, oy] }, k) => {
    const o = k % 2 ? -0.15 * spike : spike * (0.75 + 0.5 * r());
    return `${f2(x + ox * o)} ${f2(y + oy * o)}`;
  }).join(" L ")} Z`;
}

/** semi-axes of the ellipse round a w × h block of text with the same margin at the sides as at the top */
function fitEllipse(w: number, h: number): Pt {
  let lo = 1.001, hi = 4;
  for (let i = 0; i < 30; i++) {
    const s = (lo + hi) / 2;
    if ((w / 2) * (s - 1) < (h / 2) * (s / Math.sqrt(s * s - 1) - 1)) lo = s; else hi = s;
  }
  return [(w / 2) * hi, ((h / 2) * hi) / Math.sqrt(hi * hi - 1)];
}

function tailPath(rx: number, ry: number, [tx, ty]: Pt): string {
  const a = Math.atan2(ty / ry, tx / rx);
  const at = (da: number) => [0.8 * rx * Math.cos(a + da), 0.8 * ry * Math.sin(a + da)];
  const [ax, ay] = at(-0.24), [bx, by] = at(0.24);
  const bend = 0.18 * Math.hypot(tx, ty);
  const [mx, my] = [tx * 0.55 - Math.sin(Math.atan2(ty, tx)) * bend, ty * 0.55 + Math.cos(Math.atan2(ty, tx)) * bend];
  return `M ${f2(ax)} ${f2(ay)} Q ${f2(mx)} ${f2(my)} ${f2(tx)} ${f2(ty)} Q ${f2(mx * 0.86)} ${f2(my * 0.86)} ${f2(bx)} ${f2(by)} Z`;
}

export const Balloon: React.FC<Said & { tail?: Pt; kind?: "speech" | "shout" | "thought"; seed?: number }> = ({
  T, line, slice, x, y, tail, kind = "speech", width = 520, size = 46, until, fill = colors.white, color, ghost = 0.28,
  font = fonts.lettering, caps = true, seed = 1,
}) => {
  const print = useContext(PrintCtx);
  const words = wordsOf(line, slice, caps);
  const t0 = shownFrom(T, words, until);
  if (t0 === null) return null;
  const { placed, W, H } = setWords(words, size, width, font, "center");
  const [fx, fy] = fitEllipse(W, H);
  const rx = fx + size * 0.6, ry = fy + size * 0.45;
  const to: Pt | undefined = tail && [tail[0] - x, tail[1] - y];
  const shapes: React.ReactNode[] = [];
  if (kind === "thought") {
    const n = Math.max(9, Math.round(perimeter(rx, ry) / (size * 1.9)));
    const bump = perimeter(rx, ry) / n / 1.6;
    shapes.push(<ellipse key="body" rx={rx} ry={ry} />);
    around(rx, ry, n).forEach(({ at: [cx, cy] }, i) => shapes.push(<circle key={i} cx={f2(cx)} cy={f2(cy)} r={f2(bump)} />));
    if (to) {
      const L = Math.hypot(to[0], to[1]) || 1, a = Math.atan2(to[1] / ry, to[0] / rx);
      const edge = Math.hypot(rx * Math.cos(a), ry * Math.sin(a)) + bump;
      [0.2, 0.55, 0.85].forEach((k, i) => {
        const along = edge + (L - edge) * k;
        shapes.push(<circle key={`b${i}`} cx={f2((to[0] / L) * along)} cy={f2((to[1] / L) * along)} r={f2(size * (0.42 - 0.12 * i))} />);
      });
    }
  } else {
    shapes.push(kind === "shout" ? <path key="body" d={spiky(rx, ry, size * 0.55, seed)} /> : <ellipse key="body" rx={rx} ry={ry} />);
    if (to) shapes.push(<path key="tail" d={tailPath(rx, ry, to)} />);
  }
  const s = 0.85 + 0.15 * outBack((T - t0) / 0.16);
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${f2(s)})`} opacity={clamp01((T - t0) / 0.05)}>
      <g fill={print.ink} stroke={print.ink} strokeWidth={print.line + 1} strokeLinejoin="round">{shapes}</g>
      <g fill={fill}>{shapes}</g>
      <Lettering T={T} placed={placed} size={size} font={font} color={color ?? print.ink} ghost={ghost} />
    </g>
  );
};

export const Caption: React.FC<Said> = ({
  T, line, slice, x, y, width = 560, size = 40, until, fill = colors.yellow, color, ghost = 0.28, font = fonts.lettering, caps = true,
}) => {
  const print = useContext(PrintCtx);
  const words = wordsOf(line, slice, caps);
  const t0 = shownFrom(T, words, until);
  if (t0 === null) return null;
  const { placed, W, H } = setWords(words, size, width, font, "left");
  const bw = W + size * 0.9, bh = H + size * 0.6;
  const s = 0.9 + 0.1 * outBack((T - t0) / 0.14);
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${f2(s)})`} opacity={clamp01((T - t0) / 0.05)}>
      <rect width={f2(bw)} height={f2(bh)} fill={fill} stroke={print.ink} strokeWidth={print.line - 1} strokeLinejoin="round" />
      <g transform={`translate(${f2(bw / 2)} ${f2(bh / 2)})`}>
        <Lettering T={T} placed={placed} size={size} font={font} color={color ?? print.ink} ghost={ghost} />
      </g>
    </g>
  );
};

export const Sfx: React.FC<{
  T: number; t: number; text: string; x: number; y: number; size: number; rotate?: number; until?: number;
  fill?: string; shadow?: string; font?: string; seed?: number;
}> = ({ T, t, text, x, y, size, rotate = -6, until, fill = colors.yellow, shadow = colors.red, font = fonts.display, seed = 1 }) => {
  const print = useContext(PrintCtx);
  if (T < t || (until !== undefined && T >= until)) return null;
  const r = rng(seed);
  const glyphs = [...text];
  const turns = glyphs.map(() => f2((r() - 0.5) * 14)).join(" ");
  const lifts = glyphs.map(() => (r() - 0.5) * 0.08 * size);
  const dy = lifts.map((v, i) => f2(v - (lifts[i - 1] ?? 0))).join(" ");
  const s = 1 + 0.55 * (1 - outCubic((T - t) / 0.14));
  const o = size * 0.07;
  const letters = (dx: number, color: string) => (
    <text x={dx} y={dx} dy={dy} rotate={turns} textAnchor="middle" dominantBaseline="central" fontFamily={font} fontWeight={900}
      fontSize={size} fill={color} stroke={print.ink} strokeWidth={f2(size * 0.075)} strokeLinejoin="round" paintOrder="stroke">
      {text}
    </text>
  );
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) rotate(${rotate}) scale(${f2(s)})`} opacity={clamp01((T - t) / 0.03)}>
      {letters(o, shadow)}
      {letters(0, fill)}
    </g>
  );
};
