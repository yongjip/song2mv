import React, { useMemo } from "react";
import { mix, shade } from "./color";
import { clamp01, rng } from "./math";
import { useSong } from "./song";

/**
 * Crowds and far-away people as backlit silhouettes: the stage lights are in front of them, the camera behind.
 * Use inside <Svg> on the 1920×1080 stage.
 *
 * A figure is a few smooth outlines (torso, head and hair, tapered arms, hands with fingers) unioned under the
 * nonzero fill rule, every part counter-clockwise. Its upper part (head, arms, shoulders) is drawn twice in the light
 * colours, shifted up-left and up-right towards the lights, then the body goes on top: what stays visible is a thin
 * rim of light along heads, shoulders and raised arms that fades out down the back. No outlines; near figures get one
 * darker tone for hair and hats.
 */

type Pt = [number, number];
/** x, y and tension: 1 smooth, 0 a sharp corner */
type Knot = [number, number, number?];
type Tf = (x: number, y: number) => Pt;

const RAD = Math.PI / 180;
const f = (v: number) => Math.round(v * 100) / 100;
const num = (v: number) => String(v).replace(/^(-?)0\./, "$1.");
const nums = (a: number[]) => a.map((v, i) => (i === 0 || v < 0 ? num(v) : ` ${num(v)}`)).join("");

/**
 * A closed smooth outline through the knots, counter-clockwise on screen whatever order they come in, as compact
 * relative path data on a 1/q px grid
 */
function blob(knots: Knot[], tf: Tf, q = 10): string {
  let P = knots.map(([x, y, t = 1]) => [...tf(x, y), t] as [number, number, number]);
  let area = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], r = P[(i + 1) % P.length];
    area += p[0] * r[1] - r[0] * p[1];
  }
  if (area > 0) P = P.reverse();
  const n = P.length;
  const tan = P.map((_, i) => {
    const a = P[(i + n - 1) % n], b = P[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const R = (v: number) => Math.round(v * q);
  let cx = R(P[0][0]), cy = R(P[0][1]);
  let d = `M${nums([cx / q, cy / q])}`;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = P[i], r = P[j];
    const ex = R(r[0]), ey = R(r[1]);
    if (p[2] === 0 && r[2] === 0) {
      d += `l${nums([(ex - cx) / q, (ey - cy) / q])}`;
    } else {
      const L = Math.hypot(r[0] - p[0], r[1] - p[1]) * 0.36;
      const c1x = R(p[0] + tan[i][0] * L * p[2]), c1y = R(p[1] + tan[i][1] * L * p[2]);
      const c2x = R(r[0] - tan[j][0] * L * r[2]), c2y = R(r[1] - tan[j][1] * L * r[2]);
      d += `c${nums([(c1x - cx) / q, (c1y - cy) / q, (c2x - cx) / q, (c2y - cy) / q, (ex - cx) / q, (ey - cy) / q])}`;
    }
    cx = ex;
    cy = ey;
  }
  return d + "z";
}

const ovalKnots = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 8): Knot[] => {
  const c = Math.cos(rot * RAD), s = Math.sin(rot * RAD);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a);
    return [cx + x * c - y * s, cy + x * s + y * c] as Knot;
  });
};

const catmull = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const t2 = t * t, t3 = t2 * t;
  const g = (i: 0 | 1) =>
    0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3);
  return [g(0), g(1)];
};

/** Outline of a tapered limb along a smooth curve through pts (width w at each), round at both ends */
function limbKnots(pts: Pt[], w: number[], seg: number): Knot[] {
  const m = pts.length;
  const refl = (a: Pt, b: Pt): Pt => [2 * b[0] - a[0], 2 * b[1] - a[1]];
  const ext = [refl(pts[1], pts[0]), ...pts, refl(pts[m - 2], pts[m - 1])];
  const C: Pt[] = [], W: number[] = [];
  for (let i = 0; i < m - 1; i++) {
    for (let k = 0; k < seg; k++) {
      C.push(catmull(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], k / seg));
      W.push(w[i] + (w[i + 1] - w[i]) * (k / seg));
    }
  }
  C.push(pts[m - 1]);
  W.push(w[m - 1]);
  const N = C.length;
  const tg = (i: number): Pt => {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(N - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const left: Knot[] = [], right: Knot[] = [];
  C.forEach((c, i) => {
    const [tx, ty] = tg(i), h = W[i] / 2;
    left.push([c[0] - ty * h, c[1] + tx * h]);
    right.push([c[0] + ty * h, c[1] - tx * h]);
  });
  const c45 = Math.SQRT1_2;
  // round end: from the left side over the tip to the right side (out = 1), or back round the start (out = −1)
  const cap = (i: number, out: number): Knot[] => {
    const c = C[i], [ux, uy] = tg(i), h = W[i] / 2, nx = -uy, ny = ux, tx = ux * out, ty = uy * out;
    return [
      [c[0] + (nx * out + tx) * c45 * h, c[1] + (ny * out + ty) * c45 * h],
      [c[0] + tx * h, c[1] + ty * h],
      [c[0] + (-nx * out + tx) * c45 * h, c[1] + (-ny * out + ty) * c45 * h],
    ];
  };
  return [...left, ...cap(N - 1, 1), ...right.reverse(), ...cap(0, -1)];
}

// ── the figure ───────────────────────────────────────────────────────────────────────────────────────────────────

export type CrowdHair = "short" | "buzz" | "long" | "bob" | "ponytail" | "bun" | "buns" | "cap" | "beanie" | "curly" | "bucket";
export type CrowdHand = "open" | "fist" | "point" | "horns" | "peace";
/** What a raised hand holds: a phone upright, a phone sideways (filming), or a lighter */
export type CrowdLight = "phone" | "wide" | "lighter";

type Spec = {
  hair: CrowdHair; build: number; headW: number; headH: number; neck: number; hood: boolean;
  hands: [CrowdHand, CrowdHand]; side: number;
};
type Pose = {
  /** [shoulder, elbow] angles per arm (left, right), degrees from hanging straight down, outwards + */
  arms: [Pt, Pt]; lean: number; head: number; nod: number; swing: number;
  hold?: { side: number; kind: CrowdLight };
};
type Held = { x: number; y: number; rot: number; k: number; side: number; kind: CrowdLight };
/** torso: the back down to `bottom`; yoke: the shoulders only (the rim's source); upper: head, hair, arms, hands */
type Figure = { torso: string; yoke: string; upper: string; hair: string; held: Held | null };

const EARS: Partial<Record<CrowdHair, boolean>> = { short: true, buzz: true, ponytail: true, bun: true, buns: true, cap: true };

/** Back of the skull: an egg, widest just above the ears */
const skull = (a: number, b: number): Knot[] => [
  [0, -b], [a * 0.74, -b * 0.8], [a, -b * 0.18], [a * 0.9, b * 0.46], [a * 0.55, b * 0.88], [0, b],
  [-a * 0.55, b * 0.88], [-a * 0.9, b * 0.46], [-a, -b * 0.18], [-a * 0.74, -b * 0.8],
];
const ear = (o: number, a: number): Knot[] => [[o * (a - 1.5), -2.4], [o * (a + 1.7), -1.4], [o * (a + 2.1), 2.6], [o * (a + 0.6), 5.8], [o * (a - 1.6), 4.6]];

/** Hair close to the head, `up` px of volume on top */
const crown = (a: number, b: number, up: number, wide: number): Knot[] => [
  [-a - wide, 1], [-a - wide - 0.3, -b * 0.46], [-a * 0.68, -b - up * 0.72], [0, -b - up], [a * 0.68, -b - up * 0.72],
  [a + wide + 0.3, -b * 0.46], [a + wide, 1], [a * 0.56, b * 0.6], [-a * 0.56, b * 0.6],
];

/** Hair and hats in the head's coordinates (centre of the skull, y down); `side` picks the side of a brim or tail */
function hairShapes(h: CrowdHair, a: number, b: number, s: number, swing: number, detail: number): Knot[][] {
  switch (h) {
    case "short":
      return [[
        [-a - 1.1, 0.6], [-a - 1.6, -b * 0.5], [-a * 0.72, -b - 1.5], [-a * 0.12, -b - 2.5], [s * a * 0.3, -b - 2.3, 0.7],
        [s * a * 0.5, -b - 3.8, 0.1], [s * a * 0.72, -b - 1.3], [a + 1.6, -b * 0.42], [a + 1.1, 0.6], [a * 0.56, b * 0.62],
        [-a * 0.56, b * 0.62],
      ]];
    case "buzz":
      return [crown(a, b, 0.6, 0.3)];
    case "long": {
      const w = swing * 2.4;
      return [[
        [0, -b - 2], [a * 0.8, -b * 0.86], [a + 1.7, -b * 0.25], [a + 2.4, b * 0.45], [a + 3.3 + w * 0.4, b * 1.35],
        [a + 3.8 + w, b * 2.02, 0.45], [a * 0.42 + w, b * 2.16], [w * 0.6 + s * 0.8, b * 2.34, 0.55], [-a * 0.42 + w, b * 2.16],
        [-a - 3.6 + w, b * 2.04, 0.45], [-a - 3.2 + w * 0.4, b * 1.35], [-a - 2.4, b * 0.45], [-a - 1.7, -b * 0.25], [-a * 0.8, -b * 0.86],
      ]];
    }
    case "bob":
      return [[
        [s * 1.5, -b - 2.4], [a * 0.88, -b * 0.8], [a + 2.6, -b * 0.12], [a + 3.3, b * 0.55], [a + 2.4, b * 1.16, 0.2],
        [a * 0.45, b * 1.02], [0, b * 0.92], [-a * 0.45, b * 1.02], [-a - 2.4, b * 1.16, 0.2], [-a - 3.3, b * 0.55],
        [-a - 2.6, -b * 0.12], [-a * 0.88, -b * 0.8],
      ]];
    case "ponytail": {
      // a high tail, tied at the crown, falling over one side of the head and swinging
      const w = swing * 3.2;
      const tail = limbKnots(
        [[s * a * 0.3, -b * 0.82], [s * (a + 3.2), -b * 0.42], [s * (a + 5.2 + w * 0.5), b * 0.55], [s * (a + 3.8 + w), b * 1.55]],
        [6.6, 7.4, 5.6, 1.4], detail > 0 ? 2 : 1,
      );
      return [crown(a, b, 1.1, 0.5), tail];
    }
    case "bun":
      return [crown(a, b, 1.1, 0.5), ovalKnots(s * a * 0.14, -b - 3.7, 6.1, 5.4)];
    case "buns":
      return [crown(a, b, 1, 0.5), ovalKnots(-a * 0.72, -b * 0.96, 5.2, 5), ovalKnots(a * 0.72, -b * 0.96, 5.2, 5)];
    case "cap":
      return [
        [[-a - 1.7, -0.4, 0], [-a - 1.3, -b * 0.52], [-a * 0.64, -b - 1.4], [0, -b - 2.4], [a * 0.64, -b - 1.4], [a + 1.3, -b * 0.52], [a + 1.7, -0.4, 0]],
        [[s * (a - 1), -3.4, 0], [s * (a + 5), -2.9], [s * (a + 9.6), -1.4, 0.4], [s * (a + 9.3), 1.4, 0.4], [s * (a - 1), 1.1, 0]],
      ];
    case "beanie":
      return [
        [[-a - 1.6, 0.8, 0], [-a - 1.5, -b * 0.5], [-a * 0.7, -b - 2.9], [0, -b - 3.9], [a * 0.7, -b - 2.9], [a + 1.5, -b * 0.5], [a + 1.6, 0.8, 0]],
        ovalKnots(0, -b - 6.9, 4.4, 4.1),
      ];
    case "curly": {
      const R = a + 4.8, k: Knot[] = [];
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2 + 0.2;
        const r = R + (i % 2 ? -0.7 : 1.4);
        k.push([r * Math.cos(t) * 1.04, -b * 0.2 + r * Math.sin(t) * 0.96, 0.8]);
      }
      return [k];
    }
    case "bucket":
      return [
        [[-a - 1.2, -2.6, 0], [-a - 1, -b * 0.6], [-a * 0.6, -b - 1.8], [0, -b - 2.7], [a * 0.6, -b - 1.8], [a + 1, -b * 0.6], [a + 1.2, -2.6, 0]],
        [[-a - 1.5, -4.2, 0], [-a - 7, 2.1, 0.3], [-a - 6, 4.3, 0.3], [a + 6, 4.3, 0.3], [a + 7, 2.1, 0.3], [a + 1.5, -4.2, 0]],
      ];
  }
}

/** The shoulder line, one side going up to the neck; r 0–1 lifts the shoulder with its arm */
const shoulderKnots = (o: number, sw: number, nw: number, r: number): Knot[] => [
  [o * (sw - 0.6 + 0.4 * r), -145.5 - 5 * r],
  [o * (sw - 6 - 2 * r), -156.5 - 4 * r],
  [o * (nw + 8.5), -162.6 - 1.4 * r],
  [o * (nw + 1.2), -167.6],
  [o * nw, -179],
];

/** Back down to `bottom` (legs when they may show) */
function torso(sw: number, nw: number, rL: number, rR: number, bottom: number, legs: boolean): Knot[] {
  const hw = 17 + 4.4 * (sw / 27);
  const side = (o: number, r: number): Knot[] => [
    ...(legs
      ? [[o * (hw - 7.2), 0, 0.3], [o * (hw - 9), -5], [o * (hw - 7.2), -24], [o * (hw - 6.6), -40], [o * (hw - 3.4), -66]] as Knot[]
      : [[o * (sw - 6.5), bottom, 0]] as Knot[]),
    ...(bottom > -80 ? [[o * (sw - 5.6), -92] as Knot] : []),
    [o * (sw - 8.6), -108],
    [o * (sw - 4 + 2.5 * r), -131 - 6 * r],
    ...shoulderKnots(o, sw, nw, r),
  ];
  const crotch: Knot[] = legs ? [[-4, 0, 0.3], [-4.6, -6], [-3.4, -40], [0, -93, 0.4], [3.4, -40], [4.6, -6], [4, 0, 0.3]] : [];
  return [...side(1, rR), ...side(-1, rL).reverse(), ...crotch];
}

/** The shoulders alone, tapering in under the arms, so the rim along the back fades out */
function yoke(sw: number, nw: number, rL: number, rR: number): Knot[] {
  const side = (o: number, r: number): Knot[] => [[o * (sw - 14), -118, 0.6], [o * (sw - 4.8 + 2.5 * r), -133 - 6 * r], ...shoulderKnots(o, sw, nw, r)];
  return [...side(1, rR), ...side(-1, rL).reverse()];
}

// Hands point up from the wrist (0, 0), the thumb on the −x side: the back of the hand faces the camera.
// A finger: base x, base y, lean (degrees towards +x), length, width.
type Fd = [number, number, number, number, number];
function fingerKnots([bx, by, ang, len, w]: Fd): Knot[] {
  const ux = Math.sin(ang * RAD), uy = -Math.cos(ang * RAD), nx = -uy, ny = ux;
  const at = (side: number, along: number): Knot => [bx + nx * side + ux * along, by + ny * side + uy * along];
  return [at(w / 2, 0), at(w * 0.47, len - w * 0.5), at(0, len), at(-w * 0.47, len - w * 0.5), at(-w / 2, 0)];
}
const OPEN: Fd[] = [[3.3, -7.8, 9, 5.4, 2.5], [1.25, -8.8, 3, 7, 2.7], [-0.9, -9.2, -2, 7.8, 2.8], [-3, -8.6, -7, 7, 2.7]];
const THUMB: Fd = [-4.4, -3.8, -50, 5.8, 3];
/** An open hand, fingers spread, as one outline */
const OPEN_HAND: Knot[] = (() => {
  const k: Knot[] = [[3.3, 0.6, 0.7], [4.75, -4.4]];
  OPEN.forEach((fd, i) => {
    const fk = fingerKnots(fd);
    if (i > 0) {
      const p = k[k.length - 1], q = fk[0];
      k.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.9, 0.5]);
    }
    k.push(...fk);
  });
  return [...k, [-4.7, -6.4], ...fingerKnots(THUMB), [-3.4, 0.6, 0.7]];
})();
const FIST: Knot[] = [
  [-3.4, 0.6], [3.4, 0.6], [4.7, -4.4], [4.8, -9], [3.7, -11.6], [1.3, -12.4], [-1.2, -12.4], [-3.6, -11.6], [-5.1, -8.8],
  [-5.6, -5.2], [-4.4, -1.8],
];
/** A small hand: fingers together, thumb out */
const MITT: Knot[] = [[3.3, 0.6], [4.8, -5], [4.3, -11.6], [1.6, -14.6], [-1.6, -14.4], [-3.9, -11.4], [-4.6, -7.8], [-7.6, -9.2], [-7.4, -6.6], [-4.6, -2.6], [-3.4, 0.6]];
const RAISED: Record<CrowdHand, Fd[]> = {
  open: [], fist: [], point: [[-2.6, -10, -3, 8.6, 2.6]],
  horns: [[-2.8, -10, -9, 8, 2.5], [3.2, -9.4, 11, 6.6, 2.3]],
  peace: [[-2.8, -10, -15, 8.6, 2.5], [-0.2, -10.6, 7, 8.8, 2.6]],
};
/** The dark body of what a hand holds (part of the silhouette); the bright screen or flame is drawn on top */
const HELD_BODY: Record<CrowdLight, Knot[]> = {
  phone: [[-4.6, -11, 0.4], [5.2, -11, 0.4], [5.2, -28, 0.4], [-4.6, -28, 0.4]],
  wide: [[-8.2, -10.8, 0.4], [8.8, -10.8, 0.4], [8.8, -20.4, 0.4], [-8.2, -20.4, 0.4]],
  lighter: [[-1.4, -11, 0.2], [3, -11, 0.2], [3, -18.2, 0.2], [-1.4, -18.2, 0.2]],
};

/** Arm angles for `arms` 0 (hanging) … 0.55 (elbow out, forearm up: holding a light) … 1 (raised high) */
const ARM_KEYS: [number, number, number][] = [[0, 8, 3], [0.55, 108, 176], [1, 158, 170], [1.2, 174, 176]];
function armAngles(v: number): Pt {
  const x = Math.max(0, Math.min(1.2, v));
  for (let i = 1; i < ARM_KEYS.length; i++) {
    if (x <= ARM_KEYS[i][0]) {
      const [x0, a0, b0] = ARM_KEYS[i - 1], [x1, a1, b1] = ARM_KEYS[i];
      const k = (x - x0) / (x1 - x0);
      return [a0 + (a1 - a0) * k, b0 + (b1 - b0) * k];
    }
  }
  return [174, 176];
}

/**
 * One figure, feet at (X, Y), k px per unit (about 200 units to the top of the head); the back reaches down to
 * `bottom` (units, 0 = the feet). detail 0: far (no fingers or ears), 1: small hands and ears, 2: open hands with
 * fingers and the hair as its own shape.
 */
function figure(sp: Spec, po: Pose, X: number, Y: number, k: number, detail: number, bottom = 0, legs = false): Figure {
  const q = detail === 0 ? 1 : detail === 1 ? 4 : 10;
  const lc = Math.cos(po.lean * RAD), ls = Math.sin(po.lean * RAD);
  // body space: origin at the feet, y down; lean turns the body about the hips
  const tf: Tf = (x, y) => {
    const yy = y + 90;
    return [X + k * (x * lc - yy * ls), Y + k * (x * ls + yy * lc - 90)];
  };
  const sw = 27 * sp.build, nw = 5.6 * sp.neck;
  const raise = po.arms.map(([a1]) => clamp01((a1 - 30) / 120));
  const back = [blob(torso(sw, nw, raise[0], raise[1], bottom, legs), tf, q)];
  const top = [blob(yoke(sw, nw, raise[0], raise[1]), tf, q)];
  if (sp.hood && detail > 0) {
    const hood = blob([[-sw * 0.6, -155.5], [-nw - 5, -169], [0, -172.6], [nw + 5, -169], [sw * 0.6, -155.5], [0, -147]], tf, q);
    back.push(hood);
    top.push(hood);
  }

  // head: centre at (0, −185), turning about the neck at (0, −170)
  const hc = Math.cos(po.head * RAD), hs = Math.sin(po.head * RAD);
  const htf: Tf = (x, y) => {
    const yy = y - 15;
    return tf(x * hc - yy * hs, -170 + po.nod + x * hs + yy * hc);
  };
  const a = 11.4 * sp.headW, b = 14.2 * sp.headH;
  const upper: string[] = [blob(skull(a, b), htf, q)];
  if (EARS[sp.hair] && detail > 0) upper.push(blob(ear(1, a), htf, q), blob(ear(-1, a), htf, q));
  const hairs = hairShapes(sp.hair, a, b, sp.side, po.swing, detail).map((kn) => blob(kn, htf, q));
  upper.push(...hairs);

  // arms: shoulder → elbow → wrist on one smooth curve; the hand turns with the forearm
  let held: Held | null = null;
  const bw = Math.pow(sp.build, 0.6);
  ([[-1, 0], [1, 1]] as const).forEach(([o, i]) => {
    const [a1, a2] = po.arms[i];
    const j: Pt = [o * (sw - 8), -149.5 - 3 * raise[i]];
    const dir = (deg: number): Pt => [o * Math.sin(deg * RAD), Math.cos(deg * RAD)];
    const L1 = 31 * (0.94 + 0.06 * sp.build), L2 = 28.5;
    const e: Pt = [j[0] + L1 * dir(a1)[0], j[1] + L1 * dir(a1)[1]];
    const w: Pt = [e[0] + L2 * dir(a2)[0], e[1] + L2 * dir(a2)[1]];
    // a hanging arm faces sideways and down: it belongs with the back, out of the rim light
    const lit = a1 > 45 ? upper : back;
    lit.push(blob(limbKnots([j, e, w], [13.4 * bw, 9.9 * bw, 7.2 * bw], detail === 2 ? 3 : detail === 1 ? 2 : 1), tf, q));
    const phi = o * (180 - a2);
    const pc = Math.cos(phi * RAD), ps = Math.sin(phi * RAD);
    const hand: Tf = (x, y) => tf(w[0] + o * x * pc - y * ps, w[1] + o * x * ps + y * pc);
    const holds = po.hold && po.hold.side === o ? po.hold.kind : null;
    const kind = sp.hands[i];
    if (holds) lit.push(blob(detail ? FIST : ovalKnots(0, -5.2, 4.8, 6.4, 0, 6), hand, q), blob(HELD_BODY[holds], hand, q));
    else if (detail === 0) lit.push(blob(ovalKnots(0, -5.6, 4.8, 6.6, 0, 6), hand, q));
    else if (detail === 1 || a1 <= 45) lit.push(blob(kind === "open" || a1 <= 45 ? MITT : FIST, hand, q));
    else if (kind === "open") lit.push(blob(OPEN_HAND, hand, q));
    else lit.push(blob(FIST, hand, q), ...RAISED[kind].map((fd) => blob(fingerKnots(fd), hand, q)));
    if (holds) {
      const [hx, hy] = tf(w[0], w[1]);
      held = { x: hx, y: hy, rot: po.lean + phi, k, side: o, kind: holds };
    }
  });
  return { torso: back.join(""), yoke: top.join(""), upper: upper.join(""), hair: detail === 2 ? hairs.join("") : "", held };
}

const HAIRS: [CrowdHair, number][] = [
  ["short", 5], ["buzz", 1.4], ["long", 3], ["bob", 1.4], ["ponytail", 2], ["bun", 1.4], ["buns", 0.3], ["cap", 1.6],
  ["beanie", 0.9], ["curly", 1.5], ["bucket", 0.7],
];
const HAND_KINDS: [CrowdHand, number][] = [["open", 5], ["fist", 2], ["point", 1.2], ["horns", 1], ["peace", 0.8]];
function pick<T>(r: () => number, table: [T, number][]): T {
  let x = r() * table.reduce((t, [, w]) => t + w, 0);
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[0][0];
}
function specOf(r: () => number): Spec {
  const hair = pick(r, HAIRS);
  const slight = hair === "long" || hair === "bob" || hair === "ponytail" || hair === "bun" || hair === "buns";
  return {
    hair,
    build: slight ? 0.84 + r() * 0.16 : 0.94 + r() * 0.24,
    headW: 0.92 + r() * 0.14,
    headH: 0.94 + r() * 0.12,
    neck: slight ? 0.84 + r() * 0.14 : 0.98 + r() * 0.22,
    hood: hair !== "long" && hair !== "curly" && hair !== "bob" && r() < 0.24,
    hands: [pick(r, HAND_KINDS), pick(r, HAND_KINDS)],
    side: r() < 0.5 ? -1 : 1,
  };
}

/** The bright part of a held light: a phone screen or a flickering flame, with its glow */
const HeldLight: React.FC<{ h: Held; color: string; T: number; ph: number; glow?: string }> = ({ h, color, T, ph, glow }) => {
  const tr = `translate(${f(h.x)} ${f(h.y)}) rotate(${f(h.rot)}) scale(${f(h.side * h.k)} ${f(h.k)})`;
  if (h.kind === "lighter") {
    const fl = 1 + 0.13 * Math.sin(T * 19 + ph) + 0.07 * Math.sin(T * 31 + ph * 2);
    const lean = 4 * Math.sin(T * 7 + ph);
    return (
      <g transform={tr}>
        <circle cx={0.8} cy={-24} r={30} fill={glow ?? color} opacity={glow ? 0.9 : 0.3} filter={glow ? undefined : "url(#blur-10)"} />
        <g transform={`translate(0.8 -18.4) rotate(${f(lean)}) scale(1 ${f(fl)})`}>
          <path d="M0 0C3.4-1.8 3.6-6 0-12.4C-3.6-6-3.4-1.8 0 0Z" fill={mix(color, "#ff9a3c", 0.55)} />
          <path d="M0-.6C1.8-1.6 1.9-4 0-7.6C-1.9-4-1.8-1.6 0-.6Z" fill="#fff6dc" />
        </g>
      </g>
    );
  }
  const wide = h.kind === "wide";
  const [x0, y0, w, hh] = wide ? [-7.2, -19.4, 15, 7.6] : [-3.6, -27, 7.8, 15];
  return (
    <g transform={tr}>
      <circle cx={0.3} cy={wide ? -15.6 : -19.5} r={wide ? 32 : 30} fill={glow ?? color} opacity={glow ? 0.85 : 0.3} filter={glow ? undefined : "url(#blur-10)"} />
      <rect x={x0} y={y0} width={w} height={hh} rx={1.1} fill={mix(mix(color, "#ffffff", 0.55), Math.sin(ph * 3) > 0 ? "#b9d3ff" : "#fff1dc", 0.35)} />
      <rect x={x0} y={y0 + hh * 0.62} width={w} height={hh * 0.38} rx={1.1} fill={color} opacity={0.55} />
    </g>
  );
};

/**
 * A small figure seen from behind as a backlit silhouette (it reads from the front too): head and hair, shoulders,
 * two arms with hands. `arms` 0 = down, 0.55 = elbow out with the forearm up, 1 = raised high (`armL` / `armR` set
 * one side); `side` picks the hand that holds `light` (a phone, or a lighter with `lightKind`). `rim` (and `rim2` for
 * the right-hand side) draws a thin edge of stage light. `seed` picks hair, build and hands when they are not given.
 * Origin at the feet; ~200 px to the top of the head at s = 1.
 */
export const MiniPerson: React.FC<{
  x: number; y: number; s?: number; color?: string; rim?: string; arms?: number; side?: number; light?: string; bob?: number;
  rim2?: string; hair?: CrowdHair; hand?: CrowdHand; build?: number; seed?: number; lightKind?: CrowdLight;
  armL?: number; armR?: number; lean?: number; hairColor?: string;
}> = ({
  x, y, s = 1, color = "#0c1030", rim, arms = 0, side = 1, light, bob = 0, rim2, hair, hand, build, seed, lightKind = "phone",
  armL, armR, lean = 0, hairColor,
}) => {
  const base = seed !== undefined ? specOf(rng(seed)) : null;
  const sp: Spec = {
    hair: hair ?? base?.hair ?? "short", build: build ?? base?.build ?? 1, headW: base?.headW ?? 1, headH: base?.headH ?? 1,
    neck: base?.neck ?? 1, hood: base?.hood ?? false, hands: hand ? [hand, hand] : base?.hands ?? ["open", "open"], side: base?.side ?? side,
  };
  const po: Pose = {
    arms: [armAngles(armL ?? arms), armAngles(armR ?? arms)], lean, head: -lean * 0.5, nod: 0, swing: 0,
    hold: light ? { side: side > 0 ? 1 : -1, kind: lightKind } : undefined,
  };
  const detail = s < 0.45 ? 0 : s < 0.9 ? 1 : 2;
  const fig = figure(sp, po, x, y + bob, s, detail, 0, detail > 0);
  const d = Math.max(0.9, 2.2 * s);
  const r2 = rim2 ?? rim;
  const lit = fig.yoke + fig.upper;
  return (
    <g>
      {rim && <path d={lit} fill={rim} opacity={0.9} transform={`translate(${f(-0.55 * d)} ${f(-d)})`} />}
      {r2 && <path d={lit} fill={r2} opacity={0.9} transform={`translate(${f(0.55 * d)} ${f(-d)})`} />}
      <path d={fig.torso + fig.upper} fill={color} />
      {fig.hair && <path d={fig.hair} fill={hairColor ?? shade(color, 0.55)} />}
      {light && fig.held && <HeldLight h={fig.held} color={light} T={0} ph={0} />}
    </g>
  );
};

// ── the crowd ────────────────────────────────────────────────────────────────────────────────────────────────────

export type CrowdMode = "idle" | "handsUp" | "jump" | "lights";

/** Rows from far to near: scale, top of the heads, people across, detail, haze over the bodies */
const ROWS = [
  { s: 0.24, top: 712, n: 118, detail: 0, haze: 0.5 },
  { s: 0.32, top: 722, n: 90, detail: 0, haze: 0.42 },
  { s: 0.43, top: 737, n: 66, detail: 0, haze: 0.33 },
  { s: 0.58, top: 760, n: 49, detail: 1, haze: 0.23 },
  { s: 0.79, top: 795, n: 36, detail: 1, haze: 0.13 },
  { s: 1.08, top: 848, n: 26, detail: 2, haze: 0.05 },
  { s: 1.5, top: 925, n: 19, detail: 2, haze: 0 },
];

type Fan = {
  x: number; y: number; k: number; sp: Spec; lag: number; ph: number; style: number; up: number; spread: number;
  bend: number; hold: CrowdLight | null; holdSide: number; hop: number;
};

/** Row `ri + j` for a fractional j: scale and head line between two rows (past the ends, one more step out) */
function between(ri: number, j: number) {
  const at = (k: number) => {
    if (k < 0) return { s: ROWS[0].s * (ROWS[0].s / ROWS[1].s), top: ROWS[0].top - (ROWS[1].top - ROWS[0].top) * 0.7 };
    if (k >= ROWS.length) {
      const a = ROWS[ROWS.length - 2], b = ROWS[ROWS.length - 1];
      return { s: b.s * (b.s / a.s), top: b.top + (b.top - a.top) * 1.3 };
    }
    return ROWS[k];
  };
  const a = at(ri), b = at(ri + Math.sign(j)), t = Math.abs(j);
  return { s: a.s + (b.s - a.s) * t, top: a.top + (b.top - a.top) * t };
}

function buildRows(seed: number): Fan[][] {
  return ROWS.map((row, ri) => {
    const r = rng(seed * 31 + ri * 7 + 1);
    const span = 1920 + 120 * row.s;
    const step = span / row.n, off = r() * step * 0.5;
    const down = ri < 3 ? 0.22 : 0.1;
    return Array.from({ length: row.n }, (_, i) => {
      const size = 0.91 + r() * 0.17;
      const sp = specOf(r);
      const st = r(), holdR = r();
      const x = -60 * row.s + off + (i + 0.5 + (r() - 0.5) * 0.5) * step;
      // a crowd is not in rows: everyone stands a little nearer or further; even places step back, odd ones forward,
      // so neighbours are always in different layers
      const at = between(ri, (i % 2 ? 1 : -1) * r() * 0.46);
      // nor on a ruler-flat floor: the ground rises and falls a little across the stage
      const ground = (4 * Math.sin(x / 230 + ri * 1.3) + 2.5 * Math.sin(x / 97 + ri)) * Math.min(1, row.s * 2.5);
      return {
        x,
        y: at.top + 200 * at.s + ground,
        k: at.s * size,
        sp, lag: r() * 0.12, ph: r() * Math.PI * 2,
        style: st < down ? 3 : st < down + 0.25 ? 1 : st < down + 0.37 ? 2 : 0,
        up: 0.82 + r() * 0.28, spread: (r() - 0.35) * 22, bend: (r() - 0.5) * 26,
        hold: holdR < 0.5 ? "phone" : holdR < 0.62 ? "wide" : holdR < 0.8 ? "lighter" : null,
        holdSide: r() < 0.62 ? 1 : -1, hop: 0.75 + r() * 0.4,
      } as Fan;
    });
  });
}

type Grid = ReturnType<typeof useSong>["grid"];

/** A fan's pose at T (pure in T): arms, lean, head, and how far the body is lifted (units, up −) */
function poseOf(p: Fan, mode: CrowdMode, T: number, unison: number, grid: Grid): { po: Pose; dy: number } {
  const u = clamp01(unison);
  const t = T - p.lag * (1 - u);
  const ph = p.ph * (1 - u);
  // a hop after every beat: rises from 0, peaks ~0.09 s after it (1 on the bar's first beat, 0.6 on the others) and is
  // back at 0 before the next beat, so nothing jumps when it comes
  const beat = grid.beatPos(t), into = beat - Math.floor(beat);
  const settle = into < 0.7 ? 1 : 1 - (3 - 2 * ((into - 0.7) / 0.3)) * ((into - 0.7) / 0.3) ** 2;
  const kick = Math.max(0, (grid.pulse(t, 0.17) - grid.pulse(t, 0.055)) / 0.394) * settle;
  const vary = 1 - 0.8 * u;
  const spread = p.spread * vary, bend = p.bend * vary;
  const up = 1 + (p.up - 1) * vary;
  const raised = (v: number, extra = 0): Pt => {
    const [a1, a2] = armAngles(v);
    return [a1 + spread * clamp01(v) + extra, a2 + bend * clamp01(v) + extra];
  };
  const down = (o: number): Pt => [12 + 3 * Math.sin(o + ph), 6 + 2.5 * Math.sin(o * 2 + ph)];
  const blend = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const swing = Math.sin(Math.PI * beat * 0.5 + ph);
  if (mode === "idle") {
    const sway = Math.sin((Math.PI * 2 * beat) / 4 + ph);
    return { po: { arms: [down(0), down(1)], lean: 2.2 * sway, head: 3 * Math.sin((Math.PI * 2 * beat) / 4 + ph + 0.7), nod: 1.6 * kick, swing: sway }, dy: 0 };
  }
  if (mode === "lights") {
    const sway = Math.sin((Math.PI * 2 * beat) / 8 + ph);
    if (p.hold) {
      const arm = raised(0.55 + 0.25 * (p.up - 0.82), 13 * sway * p.holdSide);
      const other = down(2);
      const arms: [Pt, Pt] = p.holdSide > 0 ? [other, arm] : [arm, other];
      return { po: { arms, lean: 2.4 * sway, head: -2 * sway, nod: 0, swing: sway, hold: { side: p.holdSide, kind: p.hold } }, dy: 0 };
    }
    // no light: both hands up, swaying slowly with the song
    const a = raised(0.9);
    return { po: { arms: [[a[0] - 14 * sway, a[1] - 18 * sway], [a[0] + 14 * sway, a[1] + 18 * sway]], lean: 3 * sway, head: -2.5 * sway, nod: 0, swing: sway }, dy: 0 };
  }
  // handsUp and jump: arms pump on the beat (straighter, higher), bodies bounce or hop
  const pump = 9 * kick;
  const hop = mode === "jump" ? -34 * p.hop * kick : -6 * kick;
  const low = down(0);
  let arms: [Pt, Pt];
  if (p.style === 2 && mode === "handsUp") {
    const w = Math.sin(Math.PI * beat * 0.5 + ph) * vary;
    const a = raised(up);
    arms = [[a[0] - 16 * w, a[1] - 22 * w], [a[0] + 16 * w, a[1] + 22 * w]];
  } else {
    const a = raised(up, pump), b = raised(up * 0.97, pump * 0.8);
    const one = p.style === 1 && mode === "handsUp", none = p.style === 3;
    const main = none ? blend(low, a, u) : a, rest = none || one ? blend(down(1), b, u) : b;
    arms = p.holdSide > 0 ? [rest, main] : [main, rest];
  }
  return { po: { arms, lean: 1.5 * swing * vary, head: -2 * swing * vary, nod: 2 * kick, swing: swing * 0.6 - kick * 0.4 }, dy: hop };
}

/** A far light as path data: its screen (or flame) and a disc for its glow, in stage coordinates */
function farLight(h: Held): { screen: string; glow: string } {
  const c = Math.cos(h.rot * RAD), sn = Math.sin(h.rot * RAD);
  const at = (x: number, y: number) => {
    const X = h.side * h.k * x, Y = h.k * y;
    return [f(h.x + X * c - Y * sn), f(h.y + X * sn + Y * c)];
  };
  const [x0, y0, w, hh] = h.kind === "wide" ? [-7.2, -19.4, 15, 7.6] : h.kind === "phone" ? [-3.6, -27, 7.8, 15] : [-1.2, -29, 4, 10];
  const pts = [at(x0, y0), at(x0 + w, y0), at(x0 + w, y0 + hh), at(x0, y0 + hh)];
  if (h.side < 0) pts.reverse();
  const [gx, gy] = at(0.3, y0 + hh / 2), r = f(26 * h.k);
  return {
    screen: `M${pts.map((p) => p.join(" ")).join("L")}z`,
    glow: `M${f(gx - r)} ${gy}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0z`,
  };
}

/**
 * An audience from behind, rows from far to near filling the lower stage, backlit by the stage. Moves with the
 * beat: `handsUp` pumps raised arms, `jump` hops, `lights` sways phones and lighters slowly (ballads), `idle` sways
 * and nods. `unison` 0–1 lines everyone up. `cones` adds turning stage lights in the theme's star colours; the rims
 * along heads and arms take the colour of the beam that is on them. Pass `id` when two crowds share a stage.
 */
export const Crowd: React.FC<{ T: number; mode?: CrowdMode; unison?: number; cones?: boolean; color?: string; seed?: number; id?: string }> = ({
  T, mode = "handsUp", unison = 0, cones = true, color, seed = 40, id: idProp,
}) => {
  const { grid, theme } = useSong();
  const id = idProp ?? `crowd-${seed}`;
  const rows = useMemo(() => buildRows(seed), [seed]);
  const lights = theme.stars.slice(1).concat(theme.kinds.hot.glow);
  const body = color ?? mix(theme.bg, theme.kinds.mid.tint, 0.75);
  const wash = mix(mix(lights[1] ?? lights[0], theme.kinds.hot.glow, 0.5), lights[0], 0.22);
  const haze = mix(mix(lights[0], lights[1] ?? lights[0], 0.35), body, 0.5);
  const flash = 0.55 + 0.35 * grid.pulse(T);

  // stage lights: a lamp above the frame per colour, sweeping
  const beams = lights.map((c, i) => {
    const x = ((i + 0.5) / lights.length) * 1920, ang = 18 * Math.sin(T * 1.3 + i * 2.1);
    return { c, x, ang, k: cones ? flash : 0 };
  });
  const beamAt = (b: (typeof beams)[number], y: number) => {
    const a = b.ang * RAD, d = y + 40;
    return { cx: b.x - Math.tan(a) * d, hw: (0.205 * d) / Math.cos(a) };
  };

  // rim colour across a row: the stage's wash everywhere, plus the beams where they fall (stronger on their side)
  const K = 16;
  const rimStops = (y: number, o: number, depth: number) =>
    Array.from({ length: K + 1 }, (_, j) => {
      const x = (j / K) * 1920;
      let c = o < 0 ? lights[0] : lights[lights.length - 1], w = 0.6, sum = 0;
      for (const b of beams) {
        if (!b.k) continue;
        const { cx, hw } = beamAt(b, y);
        const I = b.k * Math.exp(-Math.pow((x - cx) / (hw * 0.8), 2));
        const facing = clamp01(0.5 - (o * (x - b.x)) / 500) * 0.6 + 0.4;
        const wi = I * facing * 1.6;
        if (wi <= 0.001) continue;
        w += wi;
        sum += wi;
        c = mix(c, b.c, wi / w);
      }
      c = mix(c, "#ffffff", clamp01(sum - 0.7) * 0.45);
      const base = 0.16 + 0.56 * (o < 0 ? 1 - x / 1920 : x / 1920);
      return { o: j / K, c, a: clamp01((base + 0.7 * sum) * depth) };
    });

  const glowP = `${id}-glow-p`, glowL = `${id}-glow-l`;
  const phoneLight = "#cfe6ff", flameLight = "#ffc46b";

  // every row: a wall of backs below the shoulders, then two interleaved layers of people, so neighbours overlap
  // with a rim between them; the haze over the bodies goes on last
  const drawn = rows.map((fans, ri) => {
    const row = ROWS[ri];
    const tone = mix(body, haze, row.haze);
    const wallY = row.top + 200 * row.s - 128 * row.s;
    const layers = [0, 1].map((L) => {
      const figs = fans.filter((_, i) => i % 2 === L).map((p) => {
        const { po, dy } = poseOf(p, mode, T, unison, grid);
        const Y = p.y + dy * p.k;
        return { p, fig: figure(p.sp, po, p.x, Y, p.k, row.detail, (1140 - Y) / p.k) };
      });
      return {
        figs,
        torso: figs.map((g) => g.fig.torso).join(""),
        yoke: figs.map((g) => g.fig.yoke).join(""),
        upper: figs.map((g) => g.fig.upper).join(""),
        hair: figs.map((g) => g.fig.hair).join(""),
        tone: L ? shade(tone, 0.86) : mix(tone, haze, 0.07),
      };
    });
    return { row, ri, tone, wallY, layers };
  });

  return (
    <g>
      <defs>
        {beams.map((b, i) => (
          <radialGradient key={i} id={`${id}-beam${i}`} cx={b.x} cy={-40} r={1150} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={b.c} stopOpacity={0.8} />
            <stop offset="0.55" stopColor={b.c} stopOpacity={0.3} />
            <stop offset="1" stopColor={b.c} stopOpacity={0.05} />
          </radialGradient>
        ))}
        {beams.map((b, i) => (
          <radialGradient key={`p${i}`} id={`${id}-pool${i}`}>
            <stop offset="0" stopColor={b.c} stopOpacity={0.75} />
            <stop offset="1" stopColor={b.c} stopOpacity={0} />
          </radialGradient>
        ))}
        <linearGradient id={`${id}-wash`} x1="0" y1="540" x2="0" y2="1080" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={wash} stopOpacity={0} />
          <stop offset="0.33" stopColor={wash} stopOpacity={0.5} />
          <stop offset="0.55" stopColor={wash} stopOpacity={0.22} />
          <stop offset="1" stopColor={wash} stopOpacity={0.1} />
        </linearGradient>
        <radialGradient id={glowP}>
          <stop offset="0" stopColor={phoneLight} stopOpacity={0.75} />
          <stop offset="0.3" stopColor={phoneLight} stopOpacity={0.24} />
          <stop offset="1" stopColor={phoneLight} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={glowL}>
          <stop offset="0" stopColor={flameLight} stopOpacity={0.6} />
          <stop offset="0.35" stopColor={flameLight} stopOpacity={0.2} />
          <stop offset="1" stopColor={flameLight} stopOpacity={0} />
        </radialGradient>
        {drawn.map(({ row, ri, tone, wallY, layers }) => {
          const depth = 0.45 + 0.55 * (ri / (ROWS.length - 1));
          const y0 = row.top + 52 * row.s;
          return (
            <React.Fragment key={ri}>
              {ri > 1 && [-1, 1].map((o) => (
                <linearGradient key={o} id={`${id}-rim${ri}${o < 0 ? "a" : "b"}`} x1="0" y1="0" x2="1920" y2="0" gradientUnits="userSpaceOnUse">
                  {rimStops(row.top, o, depth).map((s, j) => <stop key={j} offset={f(s.o)} stopColor={s.c} stopOpacity={f(s.a)} />)}
                </linearGradient>
              ))}
              {layers.map((l, L) => (
                <linearGradient key={L} id={`${id}-t${ri}${L}`} x1="0" y1={f(row.top + 40 * row.s)} x2="0" y2={f(row.top + 150 * row.s)} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor={l.tone} />
                  <stop offset="1" stopColor={tone} />
                </linearGradient>
              ))}
              <linearGradient id={`${id}-wall${ri}`} x1="0" y1={f(wallY)} x2="0" y2={f(wallY + 50 * row.s)} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={tone} stopOpacity={0} />
                <stop offset="1" stopColor={tone} />
              </linearGradient>
              {ri < ROWS.length - 1 && (
                <linearGradient id={`${id}-haze${ri}`} x1="0" y1={f(y0)} x2="0" y2={1080} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor={haze} stopOpacity={0} />
                  <stop offset={f(Math.min(1, (64 * row.s) / (1080 - y0)))} stopColor={haze} stopOpacity={f(row.haze * 0.9)} />
                  <stop offset="1" stopColor={haze} stopOpacity={f(row.haze)} />
                </linearGradient>
              )}
            </React.Fragment>
          );
        })}
        {drawn.map(({ ri, layers }) => layers.map((l, L) => <path key={`u${ri}${L}`} id={`${id}-u${ri}${L}`} d={l.upper} />))}
      </defs>

      {/* the stage's light in the haze behind the audience */}
      <rect x={0} y={540} width={1920} height={540} fill={`url(#${id}-wash)`} opacity={f(0.85 + 0.15 * grid.pulse(T))} />
      {beams.map((b, i) => b.k > 0 && (
        <g key={i} transform={`rotate(${f(b.ang)} ${b.x} -40)`}>
          <polygon points={`${b.x},-40 ${b.x - 236},1100 ${b.x + 236},1100`} fill={`url(#${id}-beam${i})`} opacity={f(0.32 * b.k)} />
          <polygon points={`${b.x},-40 ${b.x - 74},1100 ${b.x + 74},1100`} fill={`url(#${id}-beam${i})`} opacity={f(0.5 * b.k)} />
        </g>
      ))}
      {/* the lamps just above the frame: a flare where each beam comes in */}
      {beams.map((b, i) => {
        if (!b.k) return null;
        const x = b.x - Math.tan(b.ang * RAD) * 40;
        return (
          <g key={`src${i}`}>
            <ellipse cx={f(x)} cy={0} rx={70} ry={40} fill={`url(#${id}-pool${i})`} opacity={f(0.9 * b.k)} />
            <ellipse cx={f(x)} cy={0} rx={16} ry={9} fill={mix(b.c, "#ffffff", 0.7)} opacity={f(0.8 * b.k)} />
          </g>
        );
      })}
      {beams.map((b, i) => {
        if (!b.k) return null;
        const { cx, hw } = beamAt(b, 726);
        return <ellipse key={`pool${i}`} cx={f(cx)} cy={722} rx={f(hw * 1.2)} ry={54} fill={`url(#${id}-pool${i})`} opacity={f(0.6 * b.k)} />;
      })}

      {drawn.map(({ row, ri, wallY, layers }) => {
        const d = Math.max(0.9, 2.1 * row.s);
        const shiftA = `translate(${f(-0.55 * d)} ${f(-d)})`, shiftB = `translate(${f(0.55 * d)} ${f(-d)})`;
        const held = layers.flatMap((l) => l.figs.filter((g) => g.fig.held));
        let lit: React.ReactNode = null;
        if (row.detail === 0 && held.length) {
          // far lights as two paths: soft glows, then the screens and flames
          const far = held.map(({ fig }) => ({ kind: fig.held!.kind, ...farLight(fig.held!) }));
          lit = (
            <g>
              <path d={far.map((l) => l.glow).join("")} fill={phoneLight} opacity={0.3} filter="url(#blur-6)" />
              <path d={far.filter((l) => l.kind !== "lighter").map((l) => l.screen).join("")} fill={mix(phoneLight, "#ffffff", 0.5)} />
              <path d={far.filter((l) => l.kind === "lighter").map((l) => l.screen).join("")} fill={flameLight} />
            </g>
          );
        } else if (held.length) {
          lit = held.map(({ p, fig }, i) => (
            <HeldLight key={i} h={fig.held!} color={fig.held!.kind === "lighter" ? flameLight : phoneLight} T={T} ph={p.ph}
              glow={`url(#${fig.held!.kind === "lighter" ? glowL : glowP})`} />
          ));
        }
        return (
          <g key={ri}>
            <rect x={0} y={f(wallY)} width={1920} height={f(1080 - wallY)} fill={`url(#${id}-wall${ri})`} />
            {layers.map((l, L) => {
              const u = `#${id}-u${ri}${L}`;
              return (
                <g key={L}>
                  {ri > 1 && <g fill={`url(#${id}-rim${ri}a)`} transform={shiftA}><path d={l.yoke} /><use href={u} /></g>}
                  {ri > 1 && <g fill={`url(#${id}-rim${ri}b)`} transform={shiftB}><path d={l.yoke} /><use href={u} /></g>}
                  <g fill={`url(#${id}-t${ri}${L})`}><path d={l.torso} /><use href={u} /></g>
                  {l.hair && <path d={l.hair} fill={mix(l.tone, "#000000", 0.45)} />}
                </g>
              );
            })}
            {lit}
            {ri < ROWS.length - 1 && <rect x={0} y={f(row.top + 52 * row.s)} width={1920} height={f(1080 - row.top - 52 * row.s)} fill={`url(#${id}-haze${ri})`} />}
            {/* where a beam comes down into the audience, it lights the haze in front of the far rows */}
            {ri === 2 && beams.map((b, i) => {
              if (!b.k) return null;
              const { cx, hw } = beamAt(b, 770);
              return <ellipse key={`in${i}`} cx={f(cx)} cy={768} rx={f(hw * 0.95)} ry={46} fill={`url(#${id}-pool${i})`} opacity={f(0.32 * b.k)} />;
            })}
          </g>
        );
      })}
    </g>
  );
};
