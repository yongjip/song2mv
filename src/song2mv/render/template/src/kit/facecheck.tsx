import { useLayoutEffect } from "react";
import { Line, useSong } from "./song";

type Box = { x0: number; y0: number; x1: number; y1: number };

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const meet = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });

/** On screen: an HTML element's text, an SVG element's shape */
function boxOf(el: Element): Box {
  const range = document.createRange();
  if (el instanceof HTMLElement) range.selectNodeContents(el);
  const r = el instanceof HTMLElement ? range.getBoundingClientRect() : el.getBoundingClientRect();
  return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
}

const opaque = (el: Element) => {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
  return o >= 0.5;
};

const SHAPES = "path, rect, circle, ellipse, polygon, polyline, text, image";
const COVERED = 0.3;
const CUT = 0.3;
const TEXT_CUT = 0.15;
const said = new Set<string>();

/**
 * Looks at the frame the page has just drawn and logs, once each for the line sung, what a viewer would see wrong: a
 * face (`data-face="WHO"`) under over 30 % of what shows of it from a `data-over="WHAT"` element after it (by its
 * half opaque shapes: a glow inside is no cover), `face: WHO: covered by WHAT (LINE) at T s`; a face the frame cuts,
 * 2 % to 70 % of it in view, `face: WHO: cut by the frame (LINE) at T s`; text the frame cuts, under 85 % in view,
 * `text: WHAT: cut by the frame (LINE) at T s`.
 */
export function checkFrame(T: number, lines: Line[]) {
  const frame: Box = { x0: 0, y0: 0, x1: window.innerWidth, y1: window.innerHeight };
  let line = "intro";
  for (const l of lines) if (l.words.length && l.words[0].t <= T) line = l.id;
  const where = `${line}${frame.y1 > frame.x1 ? ", 9:16" : ""}`;
  const say = (message: string) => {
    const key = `${message} (${where})`;
    if (said.has(key)) return;
    said.add(key);
    console.warn(`${key} at ${T.toFixed(2)} s`);
  };
  const fronts = [...document.querySelectorAll("[data-over]")];
  for (const f of document.querySelectorAll("[data-face]")) {
    const box = boxOf(f);
    const seen = meet(box, frame);
    if (!area(seen) || !opaque(f)) continue;
    const who = f.getAttribute("data-face");
    const visible = area(seen) / area(box);
    if (visible > 0.02 && visible < 1 - CUT) say(`face: ${who}: cut by the frame`);
    for (const front of fronts) {
      if (!(f.compareDocumentPosition(front) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const solids = front instanceof HTMLElement ? [front] : [...(front.matches(SHAPES) ? [front] : front.querySelectorAll(SHAPES))];
      if (solids.some((e) => area(meet(seen, boxOf(e))) / area(seen) > COVERED && opaque(e))) say(`face: ${who}: covered by ${front.getAttribute("data-over")}`);
    }
  }
  for (const e of [...document.querySelectorAll("svg text, [data-over]")].filter((e) => e instanceof HTMLElement || e.tagName === "text")) {
    const box = boxOf(e);
    const inside = area(box) ? area(meet(box, frame)) / area(box) : 1;
    if (inside > 0 && inside < 1 - TEXT_CUT && e.textContent?.trim() && opaque(e))
      say(`text: ${e.getAttribute("data-over") || `"${e.textContent.trim().slice(0, 18)}"`}: cut by the frame`);
  }
}

/** Mount once inside the song's context: checks every frame the render draws */
export const FaceCheck: React.FC<{ T: number }> = ({ T }) => {
  const { song } = useSong();
  useLayoutEffect(() => {
    checkFrame(T, song.lines);
  });
  return null;
};
