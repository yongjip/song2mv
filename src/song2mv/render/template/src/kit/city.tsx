import React from "react";
import { mix, shade } from "./color";
import { rng } from "./math";
import { useSong } from "./song";

/**
 * Places: backdrops that fill the stage. Use inside <Svg>, after the sky and before people. Distance reads as
 * haze: far layers are lighter, smaller and closer to the sky's colour. Animate with T (windows, waves) and pan
 * with `shift` (pixels; layers move by their depth), so a scene can scroll by passing shift = speed × T.
 */

// ── shared helpers ───────────────────────────────────────────
type Pt = [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const poly = (p: Pt[]) => "M" + p.map(([x, y]) => `${n1(x)} ${n1(y)}`).join("L") + "Z";
const box = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;
const fmix = (v: number) => {
  let h = v >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
/** A number in [0, 1) fixed by its arguments: the same window looks the same in every frame, in any order */
const hash = (a: number, b = 0, c = 0, d = 0) => fmix(fmix(fmix(fmix(a) ^ b) + c * 0x9e3779b1) ^ (d * 0x85ebca6b)) / 4294967296;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

// ── city ─────────────────────────────────────────────────────
type Arch = "tower" | "block" | "low";
type Crown = "flat" | "slant" | "pyramid" | "spire" | "mast";
type Win = "grid" | "ribbon" | "slits" | "glass";
type SignKind = "blade" | "board" | "line" | "edge";
type Tier = { l: number; r: number; top: number };
type Bld = {
  l: number; r: number; arch: Arch; tiers: Tier[]; crown: Crown; crownH: number; flip: boolean;
  sw: number; hue: number; win: Win; cw: number; ch: number; awake: number; seed: number;
  water: number; boxes: [number, number, number][]; sign: SignKind | null; signC: number; shops: boolean; light: boolean;
};
/** A building before it is measured out. `sets` setbacks, `steps` a stepped crown; `water` places a water tower (0–1 across the roof) */
type Plan = {
  x: number; w: number; arch: Arch; h: number; sets: number; steps: number; crown: Crown; crownH?: number; flip?: boolean;
  win: Win; sign?: SignKind | null; signC?: number; water?: number; boxes?: number; shops?: boolean; hue: number; awake: number; seed?: number;
};
type Dim = [number, number, number, number];
type Spec = {
  depth: number; seed: number; detail: 1 | 2 | 3; k: number; center: number; gap: [number, number];
  tower: Dim; block: Dim; low: Dim; cell: Dim;
};

/** Far to near. `k` sizes the small things (crowns, roof boxes, signs) for the layer's distance */
const SPECS: Spec[] = [
  { depth: 0.42, seed: 431, detail: 1, k: 0.45, center: 1150, gap: [-12, 14],
    tower: [44, 72, 300, 470], block: [56, 100, 190, 320], low: [66, 120, 140, 220], cell: [6, 7, 7.5, 8.5] },
  { depth: 0.68, seed: 432, detail: 2, k: 0.66, center: 420, gap: [-4, 40],
    tower: [76, 110, 340, 520], block: [96, 150, 210, 340], low: [116, 170, 150, 220], cell: [9.5, 11, 12, 13.5] },
  { depth: 1, seed: 433, detail: 3, k: 1, center: 1500, gap: [24, 130],
    tower: [126, 170, 390, 540], block: [166, 232, 230, 350], low: [190, 280, 120, 196], cell: [15, 18, 18, 21] },
];

/** The near row is composed by hand: tall and low alternate, no two crowns alike, the signs where they read */
const NEAR_PLAN: Plan[] = [
  { x: 8, w: 192, arch: "block", h: 300, sets: 0, steps: 0, crown: "flat", win: "grid", water: 0.66, boxes: 2, shops: true, sign: "blade", signC: 0, hue: 0, awake: 1.15 },
  { x: 262, w: 150, arch: "tower", h: 450, sets: 1, steps: 0, crown: "slant", flip: false, win: "glass", sign: "line", signC: 0, hue: 2, awake: 1 },
  { x: 470, w: 250, arch: "low", h: 200, sets: 0, steps: 0, crown: "flat", win: "slits", boxes: 2, shops: true, sign: "board", signC: 1, hue: 3, awake: 1.2 },
  { x: 788, w: 160, arch: "tower", h: 470, sets: 1, steps: 3, crown: "spire", crownH: 120, win: "slits", hue: 4, awake: 0.9 },
  { x: 1012, w: 222, arch: "block", h: 270, sets: 0, steps: 0, crown: "flat", win: "grid", water: 0.28, boxes: 1, shops: true, sign: "blade", signC: 1, hue: 1, awake: 1 },
  { x: 1296, w: 148, arch: "tower", h: 420, sets: 2, steps: 0, crown: "pyramid", crownH: 70, win: "ribbon", sign: "line", signC: 3, hue: 5, awake: 1 },
  { x: 1500, w: 212, arch: "low", h: 205, sets: 0, steps: 0, crown: "flat", win: "grid", boxes: 1, shops: true, sign: "board", signC: 2, hue: 0, awake: 1.3 },
  { x: 1752, w: 150, arch: "tower", h: 500, sets: 1, steps: 2, crown: "mast", crownH: 90, win: "ribbon", sign: "edge", signC: 0, hue: 2, awake: 0.9, seed: 7101 },
];

/** The near row that alternates with NEAR_PLAN, so a long pan does not repeat every 1920 px */
const NEAR_PLAN_B: Plan[] = [
  { x: 6, w: 236, arch: "low", h: 196, sets: 0, steps: 0, crown: "flat", win: "grid", water: 0.7, boxes: 1, shops: true, hue: 3, awake: 1.2 },
  { x: 300, w: 160, arch: "tower", h: 500, sets: 2, steps: 0, crown: "slant", flip: true, win: "ribbon", sign: "line", signC: 1, hue: 4, awake: 1 },
  { x: 524, w: 200, arch: "block", h: 330, sets: 1, steps: 0, crown: "flat", win: "slits", boxes: 2, shops: true, sign: "blade", signC: 3, hue: 0, awake: 1.1 },
  { x: 786, w: 142, arch: "tower", h: 440, sets: 0, steps: 3, crown: "mast", crownH: 80, win: "glass", sign: "edge", signC: 1, hue: 2, awake: 1 },
  { x: 990, w: 250, arch: "low", h: 180, sets: 0, steps: 0, crown: "flat", win: "grid", boxes: 2, shops: true, sign: "board", signC: 3, hue: 5, awake: 1.25 },
  { x: 1300, w: 150, arch: "tower", h: 520, sets: 1, steps: 2, crown: "spire", crownH: 140, win: "grid", hue: 1, awake: 0.95 },
  { x: 1512, w: 196, arch: "block", h: 280, sets: 0, steps: 0, crown: "flat", win: "grid", water: 0.4, boxes: 1, shops: true, sign: "blade", signC: 0, hue: 3, awake: 1 },
  { x: 1762, w: 140, arch: "tower", h: 410, sets: 1, steps: 0, crown: "pyramid", crownH: 64, win: "glass", sign: "line", signC: 2, hue: 0, awake: 1 },
];

/** Far and middle rows: drawn by chance, with towers gathering downtown around S.center */
function randomPlans(S: Spec): Plan[] {
  const r = rng(S.seed);
  const out: Plan[] = [];
  let x = r() * 24, prev: Arch = "low";
  while (x < 1920) {
    // a periodic bump, so the row tiles every 1920 px
    const env = 0.5 + 0.5 * Math.cos(((x - S.center) / 1920) * Math.PI * 2);
    const pTower: number = (0.1 + 0.55 * env) * (prev === "tower" ? 0.4 : 1);
    const u = r();
    const arch: Arch = u < pTower ? "tower" : u < pTower + (1 - pTower) * 0.55 ? "block" : "low";
    const [w0, w1, h0, h1] = S[arch];
    const w = w0 + r() * (w1 - w0);
    const h = arch === "tower" ? h0 + (h1 - h0) * (0.35 + 0.65 * env) * (0.7 + 0.3 * r()) : h0 + (h1 - h0) * r();
    const sets = arch === "tower" ? Math.floor(r() * 3) : arch === "block" && r() < 0.3 ? 1 : 0;
    const c = r();
    const crown: Crown = arch === "tower"
      ? c < 0.24 ? "spire" : c < 0.44 ? "pyramid" : c < 0.68 ? "slant" : c < 0.86 ? "flat" : "mast"
      : arch === "block" ? c < 0.62 ? "flat" : c < 0.8 ? "slant" : "mast" : "flat";
    const steps = arch === "tower" && (crown === "flat" || crown === "spire" || crown === "mast") && r() < 0.65 ? 2 + Math.floor(r() * 2) : 0;
    const wr = r();
    const win: Win = arch === "tower" ? wr < 0.38 ? "glass" : wr < 0.7 ? "ribbon" : "grid"
      : arch === "block" ? wr < 0.55 ? "grid" : wr < 0.8 ? "slits" : "ribbon" : wr < 0.72 ? "grid" : "slits";
    const water = S.detail >= 2 && arch !== "tower" && crown === "flat" && r() < 0.55 ? 0.25 + r() * 0.5 : -1;
    const boxes = S.detail >= 2 && crown === "flat" ? 1 + Math.floor(r() * 3) : 0;
    let sign: SignKind | null = null;
    const sr = r();
    if (S.detail === 2 && arch === "tower") sign = crown !== "mast" && sr < 0.4 ? "line" : sr > 0.75 ? "edge" : null;
    out.push({ x, w, arch, h, sets, steps, crown, win, water, boxes, sign, signC: Math.floor(r() * 4), hue: Math.floor(r() * 6), awake: 0.4 + r() * 1.1 });
    prev = arch;
    x += w + S.gap[0] + r() * (S.gap[1] - S.gap[0]);
  }
  return out;
}

function build(p: Plan, S: Spec, r: () => number): Bld {
  const k = S.k;
  const tiers: Tier[] = [];
  let l = p.x, rr = p.x + p.w, base = 1080;
  // setbacks step in as the building rises, often more on one side
  const shares = p.sets === 0 ? [1] : p.sets === 1 ? [0.76, 0.24] : [0.62, 0.23, 0.15];
  shares.forEach((s, i) => {
    if (i > 0) {
      const ins = (rr - l) * (0.09 + r() * 0.08), lean = r();
      l += ins * (lean < 0.3 ? 1.7 : 1);
      rr -= ins * (lean > 0.7 ? 1.7 : lean < 0.3 ? 0.3 : 1);
    }
    base -= p.h * s;
    tiers.push({ l, r: rr, top: base });
  });
  for (let i = 0; i < p.steps; i++) {
    const ins = (rr - l) * (0.11 + r() * 0.06);
    l += ins; rr -= ins; base -= (12 + r() * 12) * k;
    tiers.push({ l, r: rr, top: base });
  }
  const tw = rr - l;
  const crownH = p.crownH ?? (p.crown === "slant" ? tw * (0.2 + r() * 0.28) : p.crown === "pyramid" ? tw * (0.32 + r() * 0.34)
    : p.crown === "spire" ? (70 + r() * 90) * k : p.crown === "mast" ? (40 + r() * 60) * k : 0);
  const water = p.water !== undefined && p.water >= 0 ? l + tw * p.water : -1;
  const boxes: [number, number, number][] = [];
  for (let i = 0; i < (p.boxes ?? 0); i++) {
    const bw = (12 + r() * 22) * k, bh = (7 + r() * 13) * k, bx = l + tw * 0.1 + r() * (tw * 0.8 - bw);
    if (water < 0 || Math.abs(bx + bw / 2 - water) > 34 * k) boxes.push([bx, bw, bh]);
  }
  const [cw0, cw1, ch0, ch1] = S.cell;
  return {
    l: p.x, r: p.x + p.w, arch: p.arch, tiers, crown: p.crown, crownH, flip: p.flip ?? r() < 0.5,
    sw: Math.min(p.w * (0.13 + r() * 0.07), 34 * k), hue: p.hue, win: p.win, cw: cw0 + r() * (cw1 - cw0), ch: ch0 + r() * (ch1 - ch0),
    awake: p.awake, seed: p.seed ?? Math.floor(r() * 1e9), water, boxes, sign: p.sign ?? null, signC: p.signC ?? 0, shops: !!p.shops,
    light: p.arch === "tower" && (p.crown === "flat" || p.crown === "slant") && r() < 0.6,
  };
}
/** Two rows per layer that alternate copy by copy: [far, middle, near] × [even copies, odd copies] */
const ROWS = SPECS.map((S, li) => [0, 1].map((v) => {
  const plans = li === 2 ? (v ? NEAR_PLAN_B : NEAR_PLAN) : randomPlans(v ? { ...S, seed: S.seed + 1000 } : S);
  return plans.map((p, i) => build(p, S, rng(S.seed * 97 + v * 7919 + i)));
}));

/** The farthest row: one flat silhouette with a few specks of light */
const FAR = (() => {
  const r = rng(430);
  let d = "", dots = "";
  const lights: Pt[] = [];
  for (let x = -6; x < 1920;) {
    const w = 26 + r() * 64, h = 90 + Math.pow(r(), 1.4) * 220;
    d += box(x, 1080 - h, w, h + 1);
    const t = r();
    if (t < 0.12) { const cx = x + w * 0.5; d += poly([[cx - 2.5, 1081 - h], [cx, 1080 - h - 26 - r() * 36], [cx + 2.5, 1081 - h]]); }
    else if (t < 0.24) d += poly([[x, 1081 - h], [x + w, 1081 - h], [x + w, 1080 - h - w * 0.35]]);
    for (let i = 0; i < w * h * 0.0016; i++) if (r() < 0.55) dots += box(x + 3 + r() * (w - 7), 1080 - h + 6 + r() * (h - 12), 1.6, 1.6);
    if (h > 240 && r() < 0.6) lights.push([x + w * 0.5, 1080 - h - 3]);
    x += w - 3 + r() * 7;
  }
  return { d, dots, lights };
})();

const EYE = 1110, RECEDE = 0.034, SHOP_H = 46;
/** Oblique depth: a point on a side face at fraction u of the way back sinks towards the eye line */
const recede = (y: number, u: number) => y + (EYE - y) * RECEDE * u;

type Look = {
  night: boolean; T: number; detail: number; k: number; id: string;
  face: string[]; side: string[]; unlit: string[]; glass: string; rim: string; rimFade: string; faceFx: string; neon: string[]; sky: string; signs: boolean;
  /** how many windows are lit: 1 at night, fewer at dusk */
  lights: number;
  /** the city's scale: details too small to see at it are left out */
  lod: number;
};

/** The y of the top edge of a tier at x (only a slanted crown is not flat) */
function topAt(b: Bld, ti: number, x: number): number {
  const t = b.tiers[ti];
  if (ti !== b.tiers.length - 1 || b.crown !== "slant") return t.top;
  const u = (x - t.l) / (t.r - t.l);
  return t.top - b.crownH * (b.flip ? u : 1 - u);
}

function building(b: Bld, ox: number, L: Look, key: string): React.ReactElement {
  const { night, T, detail, k } = L;
  const face = L.face[b.hue], side = L.side[b.hue], unlit = L.unlit[b.hue];
  const sideD: string[] = [], faceD: string[] = [], glassD: string[] = [], rimD: string[] = [], capD: string[] = [], ledgeD: string[] = [], mullD: string[] = [];
  const W = { unlit: [] as string[], warm: [] as string[], pale: [] as string[], cool: [] as string[], blind: [] as string[], glow: [] as string[], sideOn: [] as string[], sideOff: [] as string[], refl: [] as string[] };
  const nT = b.tiers.length;
  const swOf = (t: Tier) => Math.max(detail === 1 ? 2 : 3, b.sw * Math.sqrt((t.r - t.l) / (b.r - b.l)));
  const pWin = (b.win === "glass" ? 0.16 : b.win === "ribbon" ? 0.2 : 0.26) * b.awake * L.lights;
  const pFloor = (b.win === "glass" || b.win === "ribbon" ? 0.2 : 0.06) * b.awake * L.lights;
  const office = b.win === "glass" || b.win === "ribbon";

  b.tiers.forEach((t, ti) => {
    const bottom = ti === 0 ? 1080 : b.tiers[ti - 1].top + 0.6;
    const sw = swOf(t), fl = t.l + sw;
    const yl = topAt(b, ti, t.l), yf = topAt(b, ti, fl), yr = topAt(b, ti, t.r);
    sideD.push(poly([[t.l, recede(yl, 1)], [fl, yf], [fl, bottom], [t.l, bottom]]));
    (b.win === "glass" && detail >= 2 ? glassD : faceD).push(poly([[fl, yf], [t.r, yr], [t.r, bottom], [fl, bottom]]));
    // rim on the lit edge (fading down the building) and a fainter cap along the top
    const rw = detail === 3 ? 2.4 : detail === 2 ? 1.8 : 1.2;
    rimD.push(poly([[t.r - rw, yr + rw], [t.r, yr], [t.r, bottom], [t.r - rw, bottom]]));
    capD.push(poly([[fl, yf], [t.r, yr], [t.r, yr + rw * 0.7], [fl, yf + rw * 0.7]]));
    if (detail === 3 && b.win !== "glass") ledgeD.push(poly([[fl, yf + 7], [t.r, yr + 7], [t.r, yr + 10], [fl, yf + 10]]));

    // windows on the front face, floors counted up from the tier's base
    const top = Math.max(yf, yr), cw = b.cw, ch = b.ch;
    const mBot = ti === 0 && b.shops ? SHOP_H + ch * 0.35 : ch * 0.35;
    const mx = b.win === "glass" ? cw * 0.3 : cw * 0.55;
    const cols = Math.floor((t.r - fl - 2 * mx) / cw + 0.35);
    const rows = Math.floor((bottom - mBot - top - ch * 0.75) / ch);
    if (cols < 1 || rows < 1) return;
    const x0 = (fl + t.r) / 2 - (cols * cw) / 2, yb = bottom - mBot;
    if (b.win === "glass" && detail >= 2 && (detail === 3 || L.lod >= 0.6)) {
      for (let c = 1; c < cols; c++) mullD.push(box(x0 + c * cw - 0.6, yb - rows * ch, 1.2, rows * ch));
      for (let rI = 0; rI <= rows; rI++) mullD.push(box(x0, yb - rI * ch - 1, cols * cw, 2));
    }
    const glint = hash(b.seed, ti, 5) * 9;
    for (let rI = 0; rI < rows; rI++) {
      const wy = yb - (rI + 1) * ch;
      const floorLit = hash(b.seed, ti, rI, 77) < pFloor;
      const rowTone = hash(b.seed, ti, rI, 91);
      // offices light up in runs along a floor, not cell by cell
      let runA = -1, runB = -1;
      if (floorLit && office) {
        const len = Math.max(2, Math.round(cols * (0.45 + 0.55 * hash(b.seed, ti, rI, 31))));
        runA = Math.floor(hash(b.seed, ti, rI, 37) * (cols - len + 1)); runB = runA + len;
      }
      for (let c = 0; c < cols; c++) {
        const cx = x0 + c * cw;
        let ww: number, wh: number, wx: number, wyy: number;
        if (b.win === "grid") { ww = cw * 0.5; wh = ch * 0.54; wx = cx + cw * 0.25; wyy = wy + ch * 0.2; }
        else if (b.win === "ribbon") { ww = cw - Math.max(1.2, cw * 0.08); wh = ch * 0.42; wx = cx; wyy = wy + ch * 0.28; }
        else if (b.win === "slits") { ww = cw * 0.24; wh = ch * 0.8; wx = cx + cw * 0.38; wyy = wy + ch * 0.1; }
        else { ww = cw - 1.4; wh = ch * 0.62; wx = cx + 0.7; wyy = wy + ch * 0.2; }
        if (detail === 1) { ww = Math.max(2, ww * 0.8); wh = Math.max(2, wh * 0.8); }
        const pair = b.win === "grid" ? c >> 1 : c;
        let on = office ? (c >= runA && c < runB) || (b.win === "ribbon" && hash(b.seed, ti * 131 + rI, c, 3) < pWin * 0.3)
          : floorLit ? hash(b.seed, ti, rI, c + 500) < 0.9 : hash(b.seed, ti * 131 + rI, pair, 3) < pWin;
        if (hash(b.seed, ti, rI * 97 + c, 9) < 0.05) {
          // a few lights switch every few seconds, out of step with each other
          const P = 4 + 9 * hash(b.seed, rI, c, 11);
          if (Math.floor(T / P + 10 * hash(b.seed, c, rI, 13)) % 2 === 1) on = !on;
        }
        const d = box(wx, wyy, ww, wh);
        if (!night) {
          if (detail === 1) continue;
          // sunlight glances off the glass in diagonal bands
          const shine = wrap(c * 0.55 - rI * 0.32 + glint, 6.5) < 1.3 || hash(b.seed, ti, rI, c + 40) < 0.06;
          if (b.win === "glass") { if (shine) W.refl.push(d); continue; }
          (shine ? W.refl : W.unlit).push(d);
          continue;
        }
        if (!on) { if (detail >= 2 && b.win !== "glass" && (detail === 3 || L.lod >= 0.6)) W.unlit.push(d); continue; }
        const tone = floorLit ? rowTone : hash(b.seed, ti, rI, c + 700);
        const tgt = office ? (tone < 0.5 ? W.pale : tone < 0.8 ? W.cool : W.warm) : tone < 0.62 ? W.warm : tone < 0.9 ? W.pale : W.cool;
        tgt.push(d);
        if (detail === 3 && L.lod >= 0.6) {
          W.glow.push(box(wx - 3, wyy - 3, ww + 6, wh + 6));
          if (!office && hash(b.seed, ti, rI, c + 900) < 0.3) W.blind.push(box(wx, wyy, ww, wh * (0.25 + 0.3 * hash(b.seed, c, rI, 5))));
        }
      }
      // the side face: one narrow window per floor, receding with the face
      if (detail >= 2 && sw * L.lod > 5) {
        const u0 = 0.25, u1 = 0.7, xa = fl - sw * u0, xb = fl - sw * u1;
        const ya = wy + ch * 0.22, yb2 = wy + ch * 0.74;
        const d = poly([[xa, recede(ya, u0)], [xb, recede(ya, u1)], [xb, recede(yb2, u1)], [xa, recede(yb2, u0)]]);
        if (night && hash(b.seed, ti, rI, 4242) < pWin * 0.9) W.sideOn.push(d); else W.sideOff.push(d);
      }
    }
  });

  const tt = b.tiers[nT - 1];
  const sw = swOf(tt), fl = tt.l + sw, roofY = tt.top;
  const extra: React.ReactNode[] = [];
  const red = "#ff4d5e";
  const blink = (ph: number, x: number, y: number, r: number) => {
    if (!night) return null;
    const on = wrap(T / 1.6 + ph, 1) < 0.3;
    return (
      <g key={`bl${n1(x)}`}>
        {on && <circle cx={x} cy={y} r={r * 4.5} fill={red} opacity={0.55} filter="url(#blur-6)" />}
        <circle cx={x} cy={y} r={r} fill={on ? "#ffd0d4" : red} opacity={on ? 1 : 0.55} />
      </g>
    );
  };
  if (b.crown === "pyramid") {
    const ax = (tt.l + tt.r) / 2, ay = roofY - b.crownH;
    sideD.push(poly([[tt.l, recede(roofY, 1)], [fl, roofY], [ax, ay]]));
    faceD.push(poly([[fl, roofY], [tt.r, roofY], [ax, ay]]));
    rimD.push(poly([[ax, ay], [tt.r, roofY], [tt.r - 2.4 * k - 1, roofY], [ax, ay + 3 * k + 1]]));
    if (detail >= 2) extra.push(blink(hash(b.seed, 1), ax, ay - 2, 2 * k + 0.6));
  }
  if (b.crown === "spire") {
    const cx = (fl + tt.r) / 2, bw = Math.max(3, (tt.r - tt.l) * 0.07);
    sideD.push(poly([[cx - bw, roofY + 1], [cx, roofY - b.crownH], [cx, roofY + 1]]));
    faceD.push(poly([[cx, roofY + 1], [cx, roofY - b.crownH], [cx + bw, roofY + 1]]));
    if (detail >= 2) extra.push(blink(hash(b.seed, 2), cx, roofY - b.crownH, 2 * k + 0.6));
  }
  if (b.crown === "mast") {
    const n = 1 + (b.seed % 2), md: string[] = [];
    for (let i = 0; i < n; i++) {
      const mx = fl + (tt.r - fl) * (n === 1 ? 0.5 : 0.3 + 0.4 * i), mh = b.crownH * (i === 0 ? 1 : 0.62);
      md.push(box(mx - 1.2 * k - 0.3, roofY - mh, 2.4 * k + 0.6, mh + 1));
      md.push(box(mx - 6 * k, roofY - mh * 0.55, 12 * k, 1.6 * k + 0.4));
      if (detail >= 2) extra.push(blink(hash(b.seed, 3 + i), mx, roofY - mh, 2 * k + 0.6));
    }
    extra.push(<path key="mast" d={md.join("")} fill={side} />);
  }
  if (b.light && detail >= 2) extra.push(blink(hash(b.seed, 7), fl + (tt.r - fl) * 0.8, roofY - 3 * k, 1.8 * k + 0.5));

  // roof clutter: boxes and a water tower
  if (b.boxes.length) {
    const bf: string[] = [], bs: string[] = [];
    for (const [bx, bw, bh] of b.boxes) {
      const s2 = Math.min(bw * 0.3, 5 * k);
      bs.push(box(bx, roofY - bh, s2, bh + 1));
      bf.push(box(bx + s2, roofY - bh, bw - s2, bh + 1));
    }
    extra.push(<path key="bxs" d={bs.join("")} fill={side} />, <path key="bxf" d={bf.join("")} fill={face} />);
    if (night) extra.push(<path key="bxr" d={b.boxes.map(([bx, bw, bh]) => box(bx + bw - 1.6, roofY - bh, 1.6, bh)).join("")} fill={L.rim} opacity={0.5} />);
  }
  if (b.water >= 0) {
    const s = k, wx = b.water, tw = 30 * s, th = 30 * s, legH = 15 * s, coneH = 13 * s;
    const ty = roofY - legH - th;
    const legs = `M${n1(wx - tw * 0.36)} ${n1(roofY)}L${n1(wx - tw * 0.3)} ${n1(roofY - legH)}M${n1(wx + tw * 0.36)} ${n1(roofY)}L${n1(wx + tw * 0.3)} ${n1(roofY - legH)}M${n1(wx - tw * 0.33)} ${n1(roofY - 2)}L${n1(wx + tw * 0.31)} ${n1(roofY - legH + 2)}M${n1(wx + tw * 0.33)} ${n1(roofY - 2)}L${n1(wx - tw * 0.31)} ${n1(roofY - legH + 2)}`;
    const tankFace = night ? face : "#9a7458", tankSide = night ? side : "#6e5040", cone = night ? side : "#5b4237";
    extra.push(
      <g key="wt">
        <path d={legs} stroke={tankSide} strokeWidth={2 * s} fill="none" />
        <rect x={wx - tw / 2} y={ty} width={tw} height={th} rx={2 * s} fill={tankFace} />
        <rect x={wx - tw / 2} y={ty} width={tw * 0.32} height={th} fill={tankSide} />
        <path d={`${box(wx - tw / 2, ty + th * 0.3, tw, 1.4 * s)}${box(wx - tw / 2, ty + th * 0.68, tw, 1.4 * s)}`} fill={tankSide} opacity={0.7} />
        <path d={poly([[wx - tw / 2 - 2 * s, ty + 1], [wx + tw / 2 + 2 * s, ty + 1], [wx, ty - coneH]])} fill={cone} />
        {night && <path d={`${box(wx + tw / 2 - 1.8 * s, ty, 1.8 * s, th)}${poly([[wx, ty - coneH], [wx + tw / 2 + 2 * s, ty + 1], [wx + tw / 2 - 1, ty + 1], [wx, ty - coneH + 3]])}`} fill={L.rim} opacity={0.55} />}
      </g>,
    );
  }

  // shop fronts along the base of near buildings
  if (b.shops) {
    const t0 = b.tiers[0], f0 = t0.l + swOf(t0), sw0 = t0.r - f0, n = Math.max(1, Math.round(sw0 / 70));
    const gap = 8, ww = (sw0 - gap * (n + 1)) / n, sy = 1080 - SHOP_H;
    const panes = Array.from({ length: n }, (_, i) => box(f0 + gap + i * (ww + gap), sy + 12, ww, SHOP_H - 12)).join("");
    const c = L.neon[b.signC];
    extra.push(
      <g key="shop">
        <rect x={f0} y={sy} width={sw0} height={SHOP_H} fill={shade(face, night ? 0.8 : 0.82)} />
        {night && <path d={panes} fill={`url(#${L.id}-shop)`} />}
        {!night && <path d={panes} fill={mix(face, "#3a5683", 0.6)} />}
        <rect x={f0 + 4} y={sy + 3} width={sw0 - 8} height={3} rx={1.5} fill={night ? c : mix(c, face, 0.45)} opacity={night ? 0.9 : 1} />
        {night && <rect x={f0 + 4} y={sy} width={sw0 - 8} height={9} rx={4} fill={c} opacity={0.45} filter="url(#blur-6)" />}
      </g>,
    );
  }

  // signs: shapes in neon, never text
  if (L.signs && b.sign) {
    const c = L.neon[b.signC], c2 = L.neon[(b.signC + 1) % L.neon.length];
    const flick = night && hash(b.seed, Math.floor(T * 14)) < 0.03 ? 0.35 : 1;
    if (b.sign === "blade") {
      const t0 = b.tiers[0], sh = Math.min(150, (1080 - t0.top) * 0.5), sy = Math.max(t0.top + 30, 1080 - SHOP_H - 30 - sh), sx = t0.r + 7, sW = 30;
      const glyphs: string[] = [];
      for (let i = 0, gy = sy + 14; gy + 14 < sy + sh - 8; i++, gy += 26) {
        const g = hash(b.seed, i, 3);
        glyphs.push(g < 0.33 ? `M${sx + 15 - 7} ${gy + 7}a7 7 0 1 0 14 0a7 7 0 1 0 -14 0z` : g < 0.66 ? box(sx + 8, gy, 14, 14) : poly([[sx + 15, gy - 1], [sx + 23, gy + 7], [sx + 15, gy + 15], [sx + 7, gy + 7]]));
      }
      extra.push(
        <g key="blade" opacity={flick}>
          <path d={`${box(t0.r - 2, sy + 12, 11, 3.5)}${box(t0.r - 2, sy + sh - 16, 11, 3.5)}`} fill={night ? mix(face, L.rim, 0.35) : shade(face, 0.6)} />
          {night && <rect x={sx - 10} y={sy - 10} width={sW + 20} height={sh + 20} rx={14} fill={c} opacity={0.32} filter="url(#blur-14)" />}
          <rect x={sx} y={sy} width={sW} height={sh} rx={6} fill={night ? "#120d22" : mix(c, "#34405e", 0.4)} stroke={night ? c : mix(c, "#34405e", 0.6)} strokeWidth={2.6} />
          <path d={glyphs.join("")} fill={night ? c2 : "#f6f1e6"} />
          {night && <path d={glyphs.join("")} fill={c2} opacity={0.6} filter="url(#blur-2)" />}
        </g>,
      );
    } else if (b.sign === "board") {
      const bw = Math.min(150, (tt.r - fl) * 0.74), bh = bw * 0.44, bx = fl + (tt.r - fl - bw) / 2, by = roofY - 18 - bh;
      const grad = `url(#${L.id}-board${b.signC})`, sunX = bx + bw * 0.66, hor = by + bh * 0.7, sr = bh * 0.36;
      const stripes = [0.2, 0.42, 0.66].map((f, i) => box(sunX - sr - 1, hor - sr * f - 1.2 - i * 0.6, sr * 2 + 2, 1.6 + i * 0.9)).join("");
      const frame = night ? mix(face, L.rim, 0.25) : shade(face, 0.55);
      extra.push(
        <g key="board" opacity={flick}>
          <path d={`${box(bx + bw * 0.18, by + bh, 4, roofY - by - bh)}${box(bx + bw * 0.8, by + bh, 4, roofY - by - bh)}${box(bx - 5, by + bh + 3, bw + 10, 3)}`} fill={frame} />
          {night && <rect x={bx - 12} y={by - 12} width={bw + 24} height={bh + 24} rx={16} fill={c} opacity={0.26} filter="url(#blur-22)" />}
          <rect x={bx - 2.5} y={by - 2.5} width={bw + 5} height={bh + 5} rx={2} fill={frame} />
          <rect x={bx} y={by} width={bw} height={bh} fill={grad} />
          <circle cx={sunX} cy={hor} r={sr} fill={night ? mix(L.neon[3], "#ffffff", 0.35) : "#fff4d6"} />
          <path d={stripes} fill={night ? mix(c, c2, 0.6) : mix(c, c2, 0.6)} />
          <path d={`M${n1(bx)} ${n1(hor)}h${n1(bw)}v${n1(by + bh - hor)}h${n1(-bw)}z`} fill={mix(c2, "#24183a", 0.62)} />
          <path d={poly([[bx, hor], [bx + bw * 0.22, hor - bh * 0.3], [bx + bw * 0.36, hor - bh * 0.12], [bx + bw * 0.46, hor - bh * 0.22], [bx + bw * 0.6, hor]])} fill={mix(c, "#24183a", 0.45)} />
          {night && <rect x={bx} y={by} width={bw} height={bh} fill={`url(#${L.id}-lit)`} />}
          {[0.25, 0.5, 0.75].map((f) => <rect key={f} x={bx + bw * f - 3} y={by + bh + 1} width={6} height={3} rx={1} fill={night ? "#fff2d0" : frame} />)}
        </g>,
      );
    } else if (b.sign === "line" && night) {
      const pts: string[] = [];
      if (b.crown === "pyramid") pts.push(`M${n1(fl)} ${n1(roofY)}L${n1((tt.l + tt.r) / 2)} ${n1(roofY - b.crownH)}L${n1(tt.r)} ${n1(roofY)}`);
      else b.tiers.slice(Math.max(0, nT - 3)).forEach((t, i) => {
        const ti = nT - Math.min(3, nT) + i, f = t.l + swOf(t);
        pts.push(`M${n1(f)} ${n1(topAt(b, ti, f) + 3)}L${n1(t.r)} ${n1(topAt(b, ti, t.r) + 3)}`);
      });
      const d = pts.join("");
      extra.push(
        <g key="line" opacity={flick}>
          <path d={d} stroke={c} strokeWidth={7 * k + 2} fill="none" opacity={0.7} filter="url(#blur-6)" />
          <path d={d} stroke={mix(c, "#ffffff", 0.35)} strokeWidth={2.2 * k + 0.6} fill="none" strokeLinecap="round" />
        </g>,
      );
    } else if (b.sign === "edge" && night) {
      // light strips up the corners of a tower, a brighter pulse climbing them
      const t = b.tiers[0], x1 = t.r - 1.2, y0 = 1080 - (1080 - t.top) * 0.72, y1 = t.top + 4 * k;
      const f = t.l + swOf(t) + 1.2, len = y0 - y1, p = wrap(T / 3.2 + hash(b.seed, 9), 1), py = y0 - len * p;
      const d = `M${n1(x1)} ${n1(y0)}V${n1(y1)}M${n1(f)} ${n1(y0)}V${n1(y1)}`;
      extra.push(
        <g key="edge" opacity={flick}>
          <path d={d} stroke={c} strokeWidth={6 * k + 2} opacity={0.55} filter="url(#blur-6)" />
          <path d={d} stroke={mix(c, "#ffffff", 0.3)} strokeWidth={1.6 * k + 0.5} />
          <path d={`M${n1(x1)} ${n1(Math.min(y0, py + 26 * k))}V${n1(Math.max(y1, py - 26 * k))}M${n1(f)} ${n1(Math.min(y0, py + 26 * k))}V${n1(Math.max(y1, py - 26 * k))}`} stroke="#ffffff" strokeWidth={2.2 * k + 0.5} opacity={0.85} />
        </g>,
      );
    }
  }

  return (
    <g key={key} transform={`translate(${n1(ox)} 0)`}>
      <path d={sideD.join("")} fill={side} />
      {faceD.length > 0 && <path d={faceD.join("")} fill={face} />}
      {glassD.length > 0 && <path d={glassD.join("")} fill={L.glass} />}
      {detail >= 2 && <path d={faceD.concat(glassD).join("")} fill={L.faceFx} />}
      {ledgeD.length > 0 && <path d={ledgeD.join("")} fill={shade(face, night ? 0.72 : 0.84)} />}
      {mullD.length > 0 && <path d={mullD.join("")} fill={night ? mix(face, L.sky, 0.3) : mix(face, "#ffffff", 0.35)} opacity={night ? 0.5 : 0.55} />}
      {W.unlit.length > 0 && <path d={W.unlit.join("")} fill={unlit} />}
      {W.refl.length > 0 && <path d={W.refl.join("")} fill={night ? unlit : mix(unlit, "#eaf5ff", 0.55)} />}
      {W.sideOff.length > 0 && <path d={W.sideOff.join("")} fill={night ? shade(side, 1.25) : shade(unlit, 0.85)} />}
      {W.sideOn.length > 0 && <path d={W.sideOn.join("")} fill="#e8a85a" opacity={0.75} />}
      {W.glow.length > 0 && <path d={W.glow.join("")} fill="#ffc46e" opacity={0.42} filter="url(#blur-6)" />}
      {W.warm.length > 0 && <path d={W.warm.join("")} fill="#ffcb6b" opacity={detail === 1 ? 0.75 : 1} />}
      {W.pale.length > 0 && <path d={W.pale.join("")} fill="#ffe7b5" opacity={detail === 1 ? 0.7 : 1} />}
      {W.cool.length > 0 && <path d={W.cool.join("")} fill="#b4dcff" opacity={detail === 1 ? 0.65 : 0.95} />}
      {W.blind.length > 0 && <path d={W.blind.join("")} fill="#d98a3e" opacity={0.85} />}
      <path d={rimD.join("")} fill={L.rimFade} />
      {detail >= 2 && <path d={capD.join("")} fill={L.rim} opacity={night ? 0.32 : 0.45} />}
      {extra}
    </g>
  );
}

/**
 * A city skyline standing on y (default the bottom edge): three rows of buildings (towers with setbacks, spires,
 * slanted and pyramid crowns, blocks with water towers) in front of a far silhouette, with lit floors and windows
 * that switch on and off, blinking antenna lights, a few neon signs and light-pollution haze between the rows.
 * `day` draws it in daylight (sunlit faces, shaded sides, glass); `dusk` against a sunset (purple silhouettes, warm
 * rims, the first lights coming on). `light` is the side the moon or sun is on (1 right, -1 left); `rim` the colour
 * of the lit edges; `signs={false}` leaves the neon out. Pan with `shift`; `scale` and `y` place it (the skyline
 * keeps filling the stage width when scaled down).
 */
export const City: React.FC<{
  T: number; y?: number; day?: boolean; shift?: number; glow?: string; sky?: string; scale?: number; id?: string;
  light?: number; rim?: string; signs?: boolean; dusk?: boolean;
}> = ({ T, y = 1080, day = false, shift = 0, glow, sky, scale = 1, id = "city", light = 1, rim, signs = true, dusk = false }) => {
  const { theme } = useSong();
  /** lights on: at night and at dusk */
  const night = !day;
  const eve = night && dusk;
  const glowC = glow ?? (eve ? "#ff8a5c" : theme.kinds.mid.glow);
  const skyC = sky ?? (day ? "#a9cdee" : eve ? "#d5546a" : "#1c2560");
  const neon = [theme.stars[1] ?? "#3fe6ff", theme.stars[2] ?? "#ff5fd2", theme.kinds.mid.glow, theme.kinds.calm.glow];
  const rimC = rim ?? (day ? "#fff6e0" : eve ? "#ffb98a" : mix("#aebcff", theme.kinds.calm.glow, 0.18));
  const haze = day ? mix(skyC, "#ffffff", 0.5) : eve ? mix(skyC, "#ffb070", 0.35) : mix(skyC, glowC, 0.34);
  const vis = 1920 / Math.max(0.05, scale);
  const flip = light < 0;

  // night: far rows lighter and pinker (lit haze), the near row darkest and richest
  const NIGHT_TINT = ["#2a2f78", "#3b2766", "#1d3a6e", "#45295f", "#2b2a70", "#1f3a5c"];
  const DUSK_TINT = ["#5a2f6e", "#6a2f5a", "#3f2f6e", "#70384f", "#4f2d66", "#3a3368"];
  const DAY_FACE = ["#ecd6b0", "#f3eee6", "#a6c4e8", "#e0a585", "#c3ccd9", "#9fcbd0"];
  const looks: Look[] = SPECS.map((S, li) => {
    const base = eve ? [mix(skyC, "#6a3a7a", 0.55), mix("#4a2560", theme.bg, 0.4), mix("#2a1636", theme.bg, 0.35)][li]
      : [mix(skyC, haze, 0.3), mix(skyC, theme.bg, 0.3), mix(skyC, theme.bg, 0.7)][li];
    const face = night ? (eve ? DUSK_TINT : NIGHT_TINT).map((t) => mix(base, t, [0.14, 0.15, 0.17][li])) : DAY_FACE.map((c) => mix(c, haze, [0.48, 0.22, 0][li]));
    const side = night ? face.map((c) => shade(c, [0.8, 0.7, 0.6][li])) : face.map((c) => mix(c, "#3f538c", [0.14, 0.24, 0.32][li]));
    const unlit = night ? face.map((c) => mix(c, skyC, [0.25, 0.22, 0.17][li])) : face.map((c) => mix(c, "#45679a", [0.3, 0.45, 0.58][li]));
    return {
      night, T, detail: S.detail, k: S.k, id, face, side, unlit, glass: `url(#${id}-glass${li})`, rim: rimC,
      rimFade: `url(#${id}-rim${li})`, faceFx: `url(#${id}-fx${li})`, neon, sky: skyC, signs, lights: day ? 0 : eve ? 0.55 : 1, lod: scale,
    };
  });

  const glassStops = (li: number): [string, string] => eve
    ? [mix(looks[li].face[2], skyC, 0.32), mix(looks[li].face[2], theme.bg, 0.15)]
    : night
    ? [mix(looks[li].face[2], theme.bg, 0.3), mix(looks[li].face[2], haze, 0.35)]
    : [mix("#d4e8f8", haze, [0.5, 0.3, 0][li]), mix("#6d8fc2", haze, [0.55, 0.3, 0][li])];

  const bands = night
    ? [{ h: 460, o: 0.7 }, { h: 340, o: 0.56 }, { h: 250, o: 0.42 }]
    : [{ h: 420, o: 0.6 }, { h: 320, o: 0.42 }, { h: 240, o: 0.22 }];

  const rows = ROWS.map((pair, li) => {
    const S = SPECS[li];
    // copy n of the row starts at n·1920 − shift·depth; even and odd copies differ, by n, so a wrap never jumps
    const p = shift * S.depth, n0 = Math.floor(p / 1920) - 1;
    const items: { b: Bld; ox: number }[] = [];
    for (let n = n0; n * 1920 - p < vis + 40; n++) {
      const ox = n * 1920 - p;
      for (const b of pair[((n % 2) + 2) % 2]) if (ox + b.r + 80 > 0 && ox + b.l - 80 < vis) items.push({ b, ox });
    }
    items.sort((a, b) => a.b.tiers[a.b.tiers.length - 1].top - b.b.tiers[b.b.tiers.length - 1].top);
    return items.map(({ b, ox }, i) => {
      const g = building(b, ox, looks[li], `${li}-${i}`);
      if (!flip) return g;
      const cx = ox + (b.l + b.r) / 2;
      return <g key={`f${li}-${i}`} transform={`translate(${n1(cx)} 0) scale(-1 1) translate(${n1(-cx)} 0)`}>{g}</g>;
    });
  });

  const farOff = -wrap(shift * 0.22, 1920);
  const farCopies: number[] = [];
  for (let kk = -1; farOff + kk * 1920 < vis + 40; kk++) farCopies.push(farOff + kk * 1920);
  const farFace = eve ? mix(skyC, "#7a3f78", 0.5) : night ? mix(mix(skyC, glowC, 0.2), "#7d86c8", 0.16) : mix("#b9cde6", haze, 0.55);

  return (
    <g transform={`translate(0 ${y}) scale(${scale}) translate(0 ${-1080})`}>
      <defs>
        <linearGradient id={`${id}-dome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={haze} stopOpacity={0} />
          <stop offset="0.6" stopColor={haze} stopOpacity={night ? 0.28 : 0.35} />
          <stop offset="1" stopColor={night ? mix(haze, glowC, 0.3) : haze} stopOpacity={night ? 0.7 : 0.75} />
        </linearGradient>
        {bands.map((b, i) => (
          <linearGradient key={i} id={`${id}-haze${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={haze} stopOpacity={0} />
            <stop offset="1" stopColor={haze} stopOpacity={b.o} />
          </linearGradient>
        ))}
        {looks.map((L, li) => (
          <React.Fragment key={li}>
            <linearGradient id={`${id}-rim${li}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={rimC} stopOpacity={(night ? 0.85 : 0.8) * [0.5, 0.75, 1][li]} />
              <stop offset="0.4" stopColor={rimC} stopOpacity={(night ? 0.2 : 0.4) * [0.5, 0.75, 1][li]} />
              <stop offset="0.8" stopColor={rimC} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${id}-fx${li}`} x1="0" y1="0" x2="0" y2="1">
              {night ? (
                <>
                  <stop offset="0.45" stopColor={haze} stopOpacity={0} />
                  <stop offset="1" stopColor={haze} stopOpacity={[0.1, 0.16, 0.2][li]} />
                </>
              ) : (
                <>
                  <stop offset="0" stopColor="#ffffff" stopOpacity={[0.12, 0.18, 0.24][li]} />
                  <stop offset="0.5" stopColor="#ffffff" stopOpacity={0} />
                  <stop offset="1" stopColor="#2c3c70" stopOpacity={[0.04, 0.07, 0.1][li]} />
                </>
              )}
            </linearGradient>
            <linearGradient id={`${id}-glass${li}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={glassStops(li)[0]} />
              <stop offset="1" stopColor={glassStops(li)[1]} />
            </linearGradient>
          </React.Fragment>
        ))}
        {neon.map((c, i) => (
          <linearGradient key={i} id={`${id}-board${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={night ? c : mix(c, "#ffffff", 0.32)} />
            <stop offset="1" stopColor={night ? neon[(i + 1) % neon.length] : mix(neon[(i + 1) % neon.length], "#ffffff", 0.32)} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="1" stopColor="#fff2d0" stopOpacity={0.28} />
        </linearGradient>
        <linearGradient id={`${id}-shop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffad5c" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffd89a" stopOpacity={0.88} />
        </linearGradient>
        <linearGradient id={`${id}-street`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb36b" stopOpacity={0} />
          <stop offset="1" stopColor="#ffb36b" stopOpacity={0.2} />
        </linearGradient>
      </defs>
      <rect x={0} y={1080 - 720} width={vis} height={720} fill={`url(#${id}-dome)`} />
      {farCopies.map((ox, i) => (
        <g key={`far${i}`} transform={`translate(${n1(ox)} 0)`}>
          <path d={FAR.d} fill={farFace} />
          {night && <path d={FAR.dots} fill="#ffd9a0" opacity={0.45} />}
          {night && FAR.lights.map(([lx, ly], j) => (
            <circle key={j} cx={lx} cy={ly} r={1.6} fill="#ff6070" opacity={wrap(T / 1.6 + j * 0.37, 1) < 0.3 ? 1 : 0.35} />
          ))}
        </g>
      ))}
      {rows.map((row, li) => (
        <React.Fragment key={li}>
          <rect x={0} y={1080 - bands[li].h} width={vis} height={bands[li].h} fill={`url(#${id}-haze${li})`} />
          {row}
        </React.Fragment>
      ))}
      {night && <rect x={0} y={1080 - 170} width={vis} height={170} fill={`url(#${id}-street)`} />}
    </g>
  );
};

// ── street ───────────────────────────────────────────────────
/**
 * A street in side view from y (the back edge of the pavement, default 950) down to the bottom of the stage:
 * paving slabs, a kerb, the road with lane marks and, with `lamps`, street lamps standing on the pavement
 * (lit, with pools of light, at night). It scrolls left at `speed` px/s plus `shift` (pass 0 and 0 for a still
 * camera); the road, nearer the camera, moves a little faster than the pavement. People stand on it at about
 * y + 35. Put it after the City and before the people.
 */
export const Street: React.FC<{
  T: number; y?: number; speed?: number; shift?: number; day?: boolean; lamps?: boolean; gap?: number; lampH?: number;
  light?: string; id?: string;
}> = ({ T, y = 950, speed = 120, shift = 0, day = false, lamps = true, gap = 640, lampH = 600, light = "#ffd59a", id = "street" }) => {
  const night = !day;
  const pan = shift + speed * T;
  const H = 1080 - y;
  const kerb = y + H * 0.44, kerbFace = kerb + H * 0.06, road = kerbFace + H * 0.08;
  const HZ = 520, VX = 960;
  /** where a line on the ground through (x, y0) — pointing at the vanishing point — meets row y1 */
  const fan = (x: number, y0: number, y1: number) => VX + (x - VX) * (y1 - HZ) / (y0 - HZ);
  const C = night
    ? { walk: "#2c2f4c", walkFar: "#23263f", joint: "#1e2136", kerb: "#3d4163", kerbFace: "#1b1d33", gutter: "#0d0f1f", road: "#191b30", roadNear: "#121426", mark: "#9e9984", pole: "#1a1c30", poleLit: "#3a3d5c" }
    : { walk: "#d3d6dc", walkFar: "#c2c6ce", joint: "#b3b8c2", kerb: "#eceef1", kerbFace: "#9fa5b2", gutter: "#3c4254", road: "#5a6175", roadNear: "#4b5165", mark: "#f2efe2", pole: "#3e4a5c", poleLit: "#6b7a8e" };
  const slab = 120;
  const joints: string[] = [];
  const o1 = wrap(pan, slab), o2 = wrap(pan + slab / 2, slab);
  const mid = (y + kerb) / 2;
  for (let x = -slab - o1; x < 1920 + slab; x += slab) joints.push(`M${n1(x)} ${n1(y + 3)}L${n1(fan(x, y + 3, mid))} ${n1(mid)}`);
  for (let x = -slab - o2; x < 1920 + slab; x += slab) joints.push(`M${n1(fan(x, y + 3, mid))} ${n1(mid)}L${n1(fan(x, y + 3, kerb))} ${n1(kerb)}`);
  joints.push(`M0 ${n1(mid)}L1920 ${n1(mid)}`);
  const kerbJ: string[] = [];
  for (let x = -wrap(pan, 180) - 180; x < 2100; x += 180) kerbJ.push(`M${n1(x)} ${n1(kerb)}L${n1(fan(x, kerb, kerbFace))} ${n1(kerbFace)}V${n1(road)}`);
  const markY = road + (1080 - road) * 0.48, markH = Math.max(4, (1080 - road) * 0.11);
  const marks: string[] = [];
  const mo = wrap(pan * 1.18, 300);
  for (let x = -300 - mo; x < 2100; x += 300) marks.push(box(x, markY, 160, markH));
  const nL = Math.ceil((1920 + 600) / gap), span = nL * gap;
  const poles = lamps ? Array.from({ length: nL }, (_, i) => wrap(i * gap + 260 - pan, span) - 300).filter((x) => x > -320 && x < 2240) : [];
  const top = y + 6 - lampH;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-walk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.walkFar} />
          <stop offset="1" stopColor={C.walk} />
        </linearGradient>
        <linearGradient id={`${id}-road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.road} />
          <stop offset="1" stopColor={C.roadNear} />
        </linearGradient>
        <radialGradient id={`${id}-pool`}>
          <stop offset="0" stopColor={light} stopOpacity={0.55} />
          <stop offset="0.6" stopColor={light} stopOpacity={0.16} />
          <stop offset="1" stopColor={light} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-cone`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} stopOpacity={0.26} />
          <stop offset="0.7" stopColor={light} stopOpacity={0.08} />
          <stop offset="1" stopColor={light} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <rect x={0} y={y} width={1920} height={kerb - y + 1} fill={`url(#${id}-walk)`} />
      <rect x={0} y={y} width={1920} height={4} fill={shade(C.walkFar, 0.8)} />
      <path d={joints.join("")} stroke={C.joint} strokeWidth={1.6} fill="none" />
      <rect x={0} y={kerb} width={1920} height={kerbFace - kerb + 1} fill={C.kerb} />
      <rect x={0} y={kerbFace} width={1920} height={road - kerbFace + 1} fill={C.kerbFace} />
      <path d={kerbJ.join("")} stroke={shade(C.kerbFace, 0.85)} strokeWidth={1.4} fill="none" />
      <rect x={0} y={road} width={1920} height={1080 - road} fill={`url(#${id}-road)`} />
      <rect x={0} y={road} width={1920} height={5} fill={C.gutter} opacity={0.55} />
      <path d={marks.join("")} fill={C.mark} opacity={night ? 0.55 : 0.92} />
      {poles.map((px, i) => {
        const hx = px + 70, hy = top + 8;
        return (
          <g key={i}>
            {night && (
              <>
                <path d={poly([[hx - 22, hy + 10], [hx + 22, hy + 10], [hx + 170, kerb], [hx - 170, kerb]])} fill={`url(#${id}-cone)`} filter="url(#blur-14)" />
                <ellipse cx={hx} cy={(y + kerb) / 2 + 6} rx={230} ry={(kerb - y) * 0.9} fill={`url(#${id}-pool)`} />
                <ellipse cx={hx} cy={markY} rx={260} ry={(1080 - road) * 0.7} fill={`url(#${id}-pool)`} opacity={0.6} />
              </>
            )}
            <ellipse cx={px + 4} cy={y + 11} rx={20} ry={4} fill="#000000" opacity={night ? 0.35 : 0.18} />
            <path d={`M${px - 12} ${y + 10}L${px - 8} ${y - 18}L${px + 8} ${y - 18}L${px + 12} ${y + 10}Z`} fill={C.pole} />
            <path d={`M${px - 4.5} ${y - 16}L${px - 3} ${top + 40}L${px + 3} ${top + 40}L${px + 4.5} ${y - 16}Z`} fill={C.pole} />
            <path d={`M${px} ${top + 44}C${px} ${top + 6} ${px + 14} ${top} ${px + 44} ${top}L${hx} ${top}`} stroke={C.pole} strokeWidth={6} fill="none" strokeLinecap="round" />
            <path d={`M${px + 2.5} ${y - 16}L${px + 4.5} ${y - 16}L${px + 3} ${top + 40}L${px + 1.5} ${top + 40}Z`} fill={C.poleLit} opacity={0.8} />
            <path d={`M${hx - 30} ${hy + 2}C${hx - 28} ${hy - 12} ${hx + 28} ${hy - 12} ${hx + 30} ${hy + 2}Z`} fill={C.pole} />
            <ellipse cx={hx} cy={hy + 3} rx={26} ry={5} fill={night ? "#fff3d6" : "#c9d2dc"} />
            {night && <ellipse cx={hx} cy={hy + 6} rx={44} ry={20} fill={light} opacity={0.55} filter="url(#blur-10)" />}
          </g>
        );
      })}
    </g>
  );
};
