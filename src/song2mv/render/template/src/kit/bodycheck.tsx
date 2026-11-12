import React, { useLayoutEffect, useRef, useState } from "react";

/**
 * What a render can measure of bodies that touch, from marks on the elements drawn. Three kinds of fault, each found
 * by the user in a finished video before anything printed them: a child's arms drawn longer than her rig so her hands
 * could meet behind a neck, a hug with a gap between the bodies, a close-up drawn apart from the standing rig at
 * other proportions.
 *
 * Marks, in the style of `data-face` and `data-over`:
 * - `data-figure="WHO"` on each group that draws a character; a figure split into layers (a hug's far arm behind the
 *   other figure) puts it on each layer. `data-view="close-up"` (or any name) marks a drawing that must keep the
 *   proportions of the same figure's drawing without `data-view`, its standing rig.
 * - `data-part="NAME"` on a part inside a figure: `head`, `torso`, `right-arm`, `left-hand`. A head marked
 *   `data-face` counts as the figure's `head`.
 * - On a limb, `data-joints="x y x y x y"` (shoulder, elbow, hand, in the element's own drawing, where its shapes
 *   are) and `data-rig="UPPER LOWER"` (the rig's bone lengths in the same units); `limbMarks()` writes all three.
 * - `data-touch="WHO: PART"` on a part that must touch another figure's part: a hand on a back, a torso pressed to
 *   a torso. `data-gap="PX"` sets how far apart they may be drawn (6 px on the 1920 × 1080 stage by default).
 *
 * The faults, each line keyed without its number, so a line is said once however the number moves:
 * - `limb: WHO: PART: upper bone longer than its rig by N %`: a bone drawn over 10 % (`data-tol="0.1"` on the limb)
 *   longer than its rig length;
 * - `contact: WHO: PART: apart from WHO: PART by N px`: the shapes drawn, outlines and strokes, further apart than
 *   `data-gap` (`contact: WHO: PART: no WHO: PART drawn` when nothing on the page has that name);
 * - `proportions: WHO: close-up PART longer than the standing rig's by N %` (or shorter): a part's size over the
 *   head's differs by over 10 % (`data-tol` on the `data-view` group) between a view and the standing rig drawn on
 *   the same page. A limb's size is its bones' length from `data-joints`, any other part's the longer side of its
 *   box in its own drawing (draw it upright and turn it with a transform: its box then holds as it turns).
 * A video render prints them as it prints `face:` lines (`FaceCheck`); a still prints nothing the page logs, so a
 * test tile wraps its figures in `<ShowFaults>`, which writes them on the tile.
 */

type P = [number, number];
type Shape = SVGGeometryElement;

const GEOMETRY = "path, rect, circle, ellipse, polygon, polyline, line";
const GAP = 6;
const TOL = 0.1;

const fmt = (v: number) => String(Math.round(v * 10) / 10);
const nums = (s: string | null) => (s ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);

/** The marks of a limb drawn from `joints` (shoulder, elbow, hand) whose rig gives it the bone lengths `rig`: spread them on its element */
export function limbMarks(part: string, joints: P[], rig: number[]) {
  return { "data-part": part, "data-joints": joints.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join(" "), "data-rig": rig.map(fmt).join(" ") };
}

const opaque = (el: Element) => {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
  return o >= 0.5;
};
/** How much an element's drawing is scaled on screen */
const scaleOf = (m: DOMMatrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
const ctm = (el: Element) => (el instanceof SVGGraphicsElement ? el.getScreenCTM() : null);

function shapesOf(el: Element): Shape[] {
  const all = el.matches(GEOMETRY) ? [el] : [...el.querySelectorAll(GEOMETRY)];
  return all.filter((s): s is Shape => s instanceof SVGGeometryElement && getComputedStyle(s).display !== "none");
}

type Outline = { shape: Shape; m: DOMMatrix; inv: DOMMatrix; points: P[]; pad: number; fill: boolean; stroke: boolean };

/** A shape's outline in screen points, about every 3 px, and half its stroke's width on screen */
function outline(shape: Shape): Outline | null {
  const m = shape.getScreenCTM();
  if (!m) return null;
  const st = getComputedStyle(shape);
  const k = scaleOf(m);
  const stroke = st.stroke !== "none" && parseFloat(st.strokeWidth) > 0;
  // a closed shape counts as filled even unpainted: an anchor drawn as a circle with no fill is still a place to touch
  const fill = shape.tagName !== "line" && shape.tagName !== "polyline";
  let len = 0;
  try {
    len = shape.getTotalLength();
  } catch {
    return null;
  }
  const n = Math.max(12, Math.min(400, Math.ceil((len * k) / 3)));
  const points: P[] = [];
  for (let i = 0; i <= n; i++) {
    const p = shape.getPointAtLength((len * i) / n).matrixTransform(m);
    points.push([p.x, p.y]);
  }
  return { shape, m, inv: m.inverse(), points, pad: stroke ? (parseFloat(st.strokeWidth) * k) / 2 : 0, fill, stroke };
}

function inside(o: Outline, [x, y]: P) {
  const p = new DOMPoint(x, y).matrixTransform(o.inv);
  return (o.fill && o.shape.isPointInFill(p)) || (o.stroke && o.shape.isPointInStroke(p));
}

/** How far apart two elements' shapes are drawn, in screen px: 0 when they meet or overlap */
export function gapBetween(a: Element, b: Element) {
  const A = shapesOf(a).map(outline).filter((o): o is Outline => !!o);
  const B = shapesOf(b).map(outline).filter((o): o is Outline => !!o);
  if (!A.length || !B.length) return Infinity;
  for (const [xs, ys] of [[A, B], [B, A]]) for (const o of xs) for (const p of o.points) if (ys.some((q) => inside(q, p))) return 0;
  let best = Infinity;
  for (const oa of A)
    for (const ob of B)
      for (const p of oa.points)
        for (const q of ob.points) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]) - oa.pad - ob.pad);
  return Math.max(0, best);
}

type Figure = { name: string; view: string | null; groups: Element[] };

function figuresIn(root: ParentNode): Figure[] {
  const out = new Map<string, Figure>();
  for (const g of root.querySelectorAll("[data-figure]")) {
    const name = g.getAttribute("data-figure") ?? "", view = g.getAttribute("data-view");
    const key = `${name}\u0000${view ?? ""}`;
    if (!out.has(key)) out.set(key, { name, view, groups: [] });
    out.get(key)!.groups.push(g);
  }
  return [...out.values()];
}

/** A figure's parts by name, the first of each; its head from `data-face` when no part is called `head` */
function partsOf(f: Figure) {
  const parts = new Map<string, Element>();
  for (const g of f.groups) {
    for (const p of [g, ...g.querySelectorAll("[data-part]")]) {
      const name = p.getAttribute("data-part");
      if (name && !parts.has(name)) parts.set(name, p);
    }
  }
  if (!parts.has("head")) for (const g of f.groups) {
    const face = g.matches("[data-face]") ? g : g.querySelector("[data-face]");
    if (face) { parts.set("head", face); break; }
  }
  return parts;
}

const ownerOf = (el: Element) => el.closest("[data-figure]")?.getAttribute("data-figure") ?? null;
const nameOf = (el: Element) => {
  const who = ownerOf(el), part = el.getAttribute("data-part") ?? el.closest("[data-part]")?.getAttribute("data-part");
  return [who, part].filter(Boolean).join(": ") || "unnamed";
};

/** A part's size on screen: its bones' length for a limb, else the longer side of its box in its own drawing */
function sizeOf(el: Element) {
  const m = ctm(el);
  if (!m) return 0;
  const joints = nums(el.getAttribute("data-joints"));
  if (joints.length >= 4) {
    let l = 0;
    for (let i = 2; i + 1 < joints.length; i += 2) l += Math.hypot(joints[i] - joints[i - 2], joints[i + 1] - joints[i - 1]);
    return l * scaleOf(m);
  }
  const b = (el as SVGGraphicsElement).getBBox();
  return Math.max(b.width, b.height) * scaleOf(m);
}

function limbFaults(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("[data-joints][data-rig]")) {
    if (!opaque(el)) continue;
    const j = nums(el.getAttribute("data-joints")), rig = nums(el.getAttribute("data-rig"));
    const tol = Number(el.getAttribute("data-tol") ?? TOL);
    const bones: number[] = [];
    for (let i = 2; i + 1 < j.length; i += 2) bones.push(Math.hypot(j[i] - j[i - 2], j[i + 1] - j[i - 1]));
    const names = bones.length === 2 ? ["upper bone", "lower bone"] : bones.map((_, i) => `bone ${i + 1}`);
    const pairs = rig.length === bones.length ? bones.map((b, i) => [names[i], b, rig[i]] as const)
      : rig.length === 1 ? [["limb", bones.reduce((a, b) => a + b, 0), rig[0]] as const] : [];
    for (const [what, drawn, length] of pairs) {
      if (length > 0 && drawn > length * (1 + tol)) out.push(`limb: ${nameOf(el)}: ${what} longer than its rig by ${Math.round((drawn / length - 1) * 100)} %`);
    }
  }
  return out;
}

function contactFaults(root: ParentNode, k: number): string[] {
  const out: string[] = [];
  const figures = figuresIn(root);
  for (const el of root.querySelectorAll("[data-touch]")) {
    if (!opaque(el)) continue;
    const want = el.getAttribute("data-touch") ?? "";
    const cut = want.indexOf(": ");
    const [who, part] = cut < 0 ? [want, ""] : [want.slice(0, cut), want.slice(cut + 2)];
    const targets = figures.filter((f) => f.name === who).map((f) => partsOf(f).get(part)).filter((t): t is Element => !!t && t !== el);
    if (!targets.length) {
      out.push(`contact: ${nameOf(el)}: no ${want} drawn`);
      continue;
    }
    const gap = Math.min(...targets.map((t) => gapBetween(el, t))) / k;
    const allowed = Number(el.getAttribute("data-gap") ?? GAP);
    if (gap > allowed) out.push(`contact: ${nameOf(el)}: apart from ${want} by ${Number.isFinite(gap) ? Math.round(gap) : "?"} px`);
  }
  return out;
}

function proportionFaults(root: ParentNode): string[] {
  const out: string[] = [];
  const figures = figuresIn(root);
  for (const view of figures.filter((f) => f.view !== null)) {
    const rig = figures.find((f) => f.name === view.name && f.view === null);
    if (!rig) continue;
    const a = partsOf(rig), b = partsOf(view);
    const ha = a.get("head"), hb = b.get("head");
    if (!ha || !hb) continue;
    const headA = sizeOf(ha), headB = sizeOf(hb);
    if (!headA || !headB) continue;
    const tol = Number(view.groups[0].getAttribute("data-tol") ?? TOL);
    for (const [name, pb] of b) {
      const pa = a.get(name);
      if (name === "head" || !pa) continue;
      const ra = sizeOf(pa) / headA, rb = sizeOf(pb) / headB;
      if (!ra || !rb || Math.abs(rb / ra - 1) <= tol) continue;
      const by = Math.round(Math.abs(rb / ra - 1) * 100);
      out.push(`proportions: ${view.name}: ${view.view} ${name} ${rb > ra ? "longer" : "shorter"} than the standing rig's by ${by} %`);
    }
  }
  return out;
}

/**
 * The faults of the marked bodies in `root` (the page by default) as drawn now, each a line as `FaceCheck` prints it
 * without the line sung and the time. `k` is how many screen px a stage px is (the gallery's small tiles: under 1).
 */
export function bodyFaults(root: ParentNode = document, k = 1): string[] {
  return [...limbFaults(root), ...contactFaults(root, k), ...proportionFaults(root)];
}

/** A fault line without its number, so that a line moving by a pixel is the same fault */
export const faultKey = (line: string) => line.replace(/ by (?:\d+(?:\.\d+)?|\?) (?:px|%)/, "");

/**
 * Draws its children and writes the body faults found among them at the bottom left, in red, or "no faults" in
 * green: for test tiles and stills, where nothing the page logs is printed. `style` places the box.
 */
export const ShowFaults: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState<string[] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const k = el.getBoundingClientRect().width / (el.offsetWidth || 1);
    const now = bodyFaults(el, k);
    if (JSON.stringify(now) !== JSON.stringify(said)) setSaid(now);
  });
  return (
    <>
      <div ref={ref} style={{ position: "absolute", inset: 0 }}>{children}</div>
      {said && (
        <div style={{ position: "absolute", left: 40, bottom: 36, fontSize: 26, fontWeight: 600, lineHeight: 1.35, color: said.length ? "#c62f22" : "#23803a", ...style }}>
          {said.length ? said.map((s) => <div key={s}>{s}</div>) : "no body faults"}
        </div>
      )}
    </>
  );
};
