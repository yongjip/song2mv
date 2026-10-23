import React, { useContext } from "react";
import { mix, shade } from "./color";
import { clamp01, lerp, rng } from "./math";
import { DEFAULT_THEME, SongContext } from "./song";

/**
 * Weather and celebration over the whole stage. Use inside <Svg> on the 1920×1080 stage, usually in front of the
 * scene. Everything is a pure function of T (and of the burst times you pass), so put bursts on the beat with
 * `grid.bar(k)` or a line's word times.
 */

type Pt = [number, number];
const RAD = Math.PI / 180;
const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** A repeatable number in [0, 1) for a few integers: per-cycle choices that stay pure functions of T */
const hash = (a: number, b = 0, c = 0) =>
  rng((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0)();
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
/** mix() that leaves colours it cannot read (rgb(), names) as they are */
const tint = (a: string, b: string, k: number) => (isHex(a) && isHex(b) ? mix(a, b, k) : a);
/** The song's theme, or the default one outside a song (a still, a test) */
const useTheme = () => useContext(SongContext)?.theme ?? DEFAULT_THEME;

/** A comet streak through pts (head first): w wide at the head, narrowing to w1 at the tail, with a rounded nose */
function streak(pts: Pt[], w: number, w1 = 0): string {
  const K = pts.length;
  if (K < 2) return "";
  const L: Pt[] = [], R: Pt[] = [];
  let hx = 0, hy = 0;
  for (let j = 0; j < K; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(K - 1, j + 1)];
    let dx = a[0] - b[0], dy = a[1] - b[1];
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return "";
    dx /= d;
    dy /= d;
    if (j === 0) [hx, hy] = [dx, dy];
    const hw = (w + (w1 - w) * (j / (K - 1))) / 2;
    L.push([pts[j][0] - dy * hw, pts[j][1] + dx * hw]);
    R.push([pts[j][0] + dy * hw, pts[j][1] - dx * hw]);
  }
  const nose: Pt = [pts[0][0] + hx * w * 0.95, pts[0][1] + hy * w * 0.95];
  let s = `M${n1(L[K - 1][0])} ${n1(L[K - 1][1])}`;
  for (let j = K - 2; j >= 0; j--) s += `L${n1(L[j][0])} ${n1(L[j][1])}`;
  s += `Q${n1(nose[0])} ${n1(nose[1])} ${n1(R[0][0])} ${n1(R[0][1])}`;
  for (let j = 1; j < K; j++) s += `L${n1(R[j][0])} ${n1(R[j][1])}`;
  return `${s}Z`;
}

/** A filled circle as path data, so many of them share one element */
const disc = (x: number, y: number, r: number) =>
  `M${n1(x - r)} ${n1(y)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0Z`;

/** A flat ring (an ellipse outline) as path data, drawn with a stroke */
const ring = (x: number, y: number, rx: number, ry: number) =>
  `M${n1(x - rx)} ${n1(y)}a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-2 * rx)} 0`;

// ── rain ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Depth bands of the rain, far to near: upper depth, drop width, streak alpha, the brighter head's alpha */
const RAIN_BANDS = [
  { z: 0.32, w: 0.9, a: 0.16, head: 0.13 },
  { z: 0.6, w: 1.3, a: 0.23, head: 0.24 },
  { z: 0.84, w: 1.9, a: 0.29, head: 0.33 },
  { z: 1.01, w: 3.2, a: 0.27, head: 0.17 },
];
/** How long a splash lasts (s) */
const SPLASH = 0.32;
/**
 * Streak brightness steps. A drop's brightness comes from the sheet of rain it is in (heavier sheets sweep across
 * with the wind) and from its height: rain is lit from below by the street and the windows, so it is brighter low
 * in the frame than high up against the sky.
 */
const SHEETS = [0.62, 0.86, 1.1, 1.4];

/**
 * Rain falling at `angle` degrees from vertical; `strength` 0–1 scales how much. With `ground` (a y), drops splash
 * there. Nearer drops are longer, brighter and faster.
 * Four depth bands of thin streaks, spread evenly (no holes, no clumps), the nearest out of focus. Streaks catch
 * the light where the scene behind them is lit (lamps, signs, windows) and fade into the dark elsewhere; they are
 * brighter low in the frame, lit by the street. `speed` is how fast the nearest drops fall, in px/s (far ones fall
 * slower on screen); `n` is the number of drops at full strength; the wind swings the angle a little and sweeps
 * heavier sheets across. With `ground`, drops land in a band around it (near ones lower), each throwing a crown of
 * droplets and a faint ripple, and spray hangs over the ground; without it they fall through the bottom edge.
 * Fade rain in and out with `strength`, not with an opacity group around it: the light-catching pass blends with
 * whatever is drawn behind it, and an opacity group would hide that from it.
 */
export const Rain: React.FC<{
  T: number; n?: number; angle?: number; speed?: number; color?: string; strength?: number; ground?: number; seed?: number; id?: string;
}> = ({ T, n = 700, angle = 8, speed = 2300, color, strength = 1, ground, seed = 7, id = "rain" }) => {
  const k = clamp01(strength);
  if (k <= 0) return null;
  const spd = Math.max(60, speed);
  const col = color ?? "#d4e0ff";
  const haze = tint(col, "#7d88c6", 0.45);
  const gust = 1.6;
  const ang = (angle + gust * Math.sin(T * 0.43 + seed)) * RAD;
  const top = -30;
  const H = 1160;
  const spanA = H * Math.tan((angle - gust - 1) * RAD), spanB = H * Math.tan((angle + gust + 1) * RAD);
  const lo = -60 + Math.min(0, spanA, spanB), hi = 1980 + Math.max(0, spanA, spanB);
  const land = (z: number) => (ground === undefined ? 1080 + 140 : ground + (z - 0.62) * 46);

  const body = RAIN_BANDS.map(() => SHEETS.map(() => [] as string[]));
  const heads = RAIN_BANDS.map(() => SHEETS.map(() => [] as string[]));
  const ca = Math.cos(ang), sa0 = Math.sin(ang);
  // splashes, by age: droplets (filled streaks), ripples (stroked rings), impact glints
  const spl = [[], [], []] as string[][];
  const rip = [[], [], []] as string[][];
  const glint: string[] = [];

  const r = rng(seed);
  const drops = Array.from({ length: n }, () => {
    const z = Math.pow(r(), 1.6);
    return { z, ph: r(), lj: r(), th: r(), aj: r(), band: RAIN_BANDS.findIndex((b) => z < b.z), col: 0, cols: 1 };
  });
  // each band spreads its drops evenly over the stage: every drop owns a column (it wanders a little from one fall
  // to the next), neighbouring columns fall out of step, and the whole band shares one period (a faster drop just
  // waits longer between falls), so the spacing holds at every T: the rain has neither holes nor clumps
  const vOf = (z: number) => spd * (0.34 + 0.66 * z);
  const lenOf = (v: number, lj: number) => v * (0.038 + 0.02 * lj);
  const period = RAIN_BANDS.map((b, bi) => {
    const z0 = bi ? RAIN_BANDS[bi - 1].z : 0, v0 = vOf(z0);
    return (land(Math.min(1, b.z)) - top + lenOf(v0, 1)) / v0 + (ground === undefined ? 0.05 : SPLASH + 0.12);
  });
  RAIN_BANDS.forEach((_, bi) => {
    const mine = drops.filter((d) => d.band === bi);
    mine.forEach((d, j) => {
      d.col = j;
      d.cols = mine.length;
      d.ph = (j * 0.618034 + 0.2 * d.ph) % 1;
    });
  });
  for (let i = 0; i < n; i++) {
    const { z, ph, lj, th, aj, band, col, cols } = drops[i];
    if (th > k) continue;
    const v = vOf(z);
    const len = lenOf(v, lj);
    const w = RAIN_BANDS[band].w * (0.85 + 0.3 * lj);
    const a = ang + (aj - 0.5) * 1.6 * RAD;
    const tanA = Math.tan(a), cosA = Math.cos(a);
    const yEnd = land(z);
    const fall = (yEnd - top) / v;
    const pour = (len * cosA) / v;
    const P = period[band];
    const u = T / P + ph;
    const c = Math.floor(u);
    const tl = (u - c) * P;
    const xl = lo + ((col + 0.5 + 3 * (hash(i, c, seed) - 0.5)) / cols) * (hi - lo);
    if (tl < fall + pour) {
      const yh = top + v * tl;
      const hy = Math.min(yEnd, yh), ty = Math.min(yEnd, yh - len * cosA);
      if (hy - ty > 0.5 && hy > -4) {
        const hx = xl - (yEnd - hy) * tanA, tx = xl - (yEnd - ty) * tanA;
        if (Math.max(hx, tx) > -8 && Math.min(hx, tx) < 1928) {
          // across the rain: which sheet the drop is in
          const xp = hx * ca - hy * sa0;
          const sv = 0.5 + 0.5 * Math.sin(xp / 170 - T * 2.2 + 1.4 * Math.sin(xp / 530 + T * 0.6 + seed));
          const lift = 0.72 + 0.62 * clamp01((hy - 120) / 820);
          const f = (0.84 + 0.32 * sv) * lift;
          const sh = f < 0.74 ? 0 : f < 0.98 ? 1 : f < 1.24 ? 2 : 3;
          body[band][sh].push(streak([[hx, hy], [tx, ty]], w, 0.15));
          const fx = hx + (tx - hx) * 0.4, fy = hy + (ty - hy) * 0.4;
          heads[band][sh].push(streak([[hx, hy], [fx, fy]], w, w * 0.4));
        }
      }
    } else if (ground !== undefined && z > 0.2) {
      const sa = tl - fall - pour * 0.3;
      if (sa >= 0 && sa < SPLASH && xl > -30 && xl < 1950) {
        const sk = 0.4 + 1.1 * z;
        const age = sa < 0.06 ? 0 : sa < 0.15 ? 1 : 2;
        const nd = z > 0.55 ? 4 : 3;
        const g = 1900;
        for (let j = 0; j < nd; j++) {
          const a1 = ((j + 0.5) / nd - 0.5) * 120 * RAD + (hash(i, c, 40 + j) - 0.5) * 0.4;
          const sp = (110 + 90 * hash(i, c, 60 + j)) * sk * (j === 0 || j === nd - 1 ? 0.85 : 1.15);
          const vx = Math.sin(a1) * sp + tanA * 50 * sk, vy = -Math.cos(a1) * sp;
          const px = xl + vx * sa, py = yEnd + vy * sa + 0.5 * g * sa * sa;
          if (py > yEnd + 0.5) continue;
          const vyy = vy + g * sa;
          const bl = 0.022;
          spl[age].push(streak([[px, py], [px - vx * bl, py - vyy * bl]], 2.1 * sk * (1 - 0.35 * (sa / SPLASH)), 0.5 * sk));
        }
        const rx = sk * (4 + 40 * sa);
        if (z > 0.45) rip[age].push(ring(xl, yEnd + 1, rx, rx * 0.18));
        if (sa < 0.07) {
          const q = 1 - sa / 0.07, hw = 6 * sk, hh = 4.5 * sk * q;
          glint.push(`M${n1(xl - hw)} ${n1(yEnd)}Q${n1(xl)} ${n1(yEnd - hh)} ${n1(xl + hw)} ${n1(yEnd)}Q${n1(xl)} ${n1(yEnd + 1.6 * sk)} ${n1(xl - hw)} ${n1(yEnd)}Z`);
        }
      }
    }
  }

  const ka = 0.55 + 0.45 * k;
  const bandCol = (b: number) => tint(haze, col, b / (RAIN_BANDS.length - 1));
  const gy = ground ?? 1080;
  const tanW = Math.tan(ang);
  const puffs = ground === undefined ? [] : Array.from({ length: 6 }, (_, j) => {
    const rr = rng(seed * 13 + j);
    const w0 = 260 + 220 * rr(), x0 = rr() * 2400, sp = 18 + 22 * rr();
    const x = ((((x0 + sp * T + tanW * 60 * T) % 2400) + 2400) % 2400) - 240;
    return { x, w: w0, h: 30 + 26 * rr(), o: 0.5 + 0.5 * rr() };
  });
  // the same streaks once more, blended over the scene: they light up over lit things and vanish over dark ones
  const catchLight: React.CSSProperties = { mixBlendMode: "overlay" };
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-veil`} x1="0" y1="0" x2="0" y2="1080" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={haze} stopOpacity={0} />
          <stop offset={n2((gy / 1080) * 0.55)} stopColor={haze} stopOpacity={0.05} />
          <stop offset={n2(clamp01(gy / 1080))} stopColor={haze} stopOpacity={0.09} />
          <stop offset="1" stopColor={haze} stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id={`${id}-spray`} x1="0" y1={gy - 110} x2="0" y2={gy + 50} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={col} stopOpacity={0} />
          <stop offset="0.68" stopColor={col} stopOpacity={0.13} />
          <stop offset="1" stopColor={col} stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`${id}-puff`}>
          <stop offset="0" stopColor={col} stopOpacity={0.2} />
          <stop offset="1" stopColor={col} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={1920} height={1080} fill={`url(#${id}-veil)`} opacity={k} />
      {/* blended under the plain streaks, so they brighten the scene's lights only (and not the streaks themselves);
          no opacity on this group: an isolated group would blend against nothing */}
      <g fill="#ffffff">
        <path d={body[0].flat().join("")} style={catchLight} opacity={n2(0.35 * ka)} />
        <path d={body[1].flat().join("")} style={catchLight} opacity={n2(0.55 * ka)} />
        <path d={body[2].flat().join("")} style={catchLight} opacity={n2(0.75 * ka)} />
        <path d={heads[2].flat().join("")} style={catchLight} opacity={n2(0.6 * ka)} />
      </g>
      {RAIN_BANDS.map((b, bi) => bi < 3 && (
        <g key={bi} fill={bandCol(bi)}>
          {SHEETS.map((sk, si) => (
            <React.Fragment key={si}>
              <path d={body[bi][si].join("")} opacity={n2(b.a * ka * sk)} />
              <path d={heads[bi][si].join("")} opacity={n2(Math.min(1, b.head * ka * sk))} />
            </React.Fragment>
          ))}
        </g>
      ))}
      {ground !== undefined && (
        <g opacity={k}>
          <rect x={0} y={gy - 110} width={1920} height={160} fill={`url(#${id}-spray)`} />
          {puffs.map((p, j) => (
            <ellipse key={j} cx={n1(p.x)} cy={gy - 12} rx={n1(p.w)} ry={n1(p.h)} fill={`url(#${id}-puff)`} opacity={n2(p.o)} />
          ))}
          {[0, 1, 2].map((a) => (
            <path key={`r${a}`} d={rip[a].join("")} fill="none" stroke={col} strokeWidth={[1.3, 1, 0.7][a]} opacity={n2([0.32, 0.2, 0.1][a] * ka)} />
          ))}
          {[0, 1, 2].map((a) => (
            <path key={`s${a}`} d={spl[a].join("")} fill={col} opacity={n2([0.9, 0.72, 0.48][a] * ka)} />
          ))}
          <path d={glint.join("")} fill={col} opacity={n2(0.75 * ka)} />
        </g>
      )}
      <g fill={col} filter="url(#blur-2)">
        <path d={body[3].flat().join("")} opacity={n2(RAIN_BANDS[3].a * ka)} />
        <path d={heads[3].flat().join("")} opacity={n2(RAIN_BANDS[3].head * ka)} />
      </g>
    </g>
  );
};

// ── fireworks ────────────────────────────────────────────────────────────────────────────────────────────────────

/** One firework: it launches from below, bursts at (x, y) at time t and falls and fades over about two seconds */
export type Burst = {
  t: number; x: number; y: number; color?: string; size?: number; kind?: "peony" | "willow" | "ring";
  /** seconds the rocket climbs before t (default 1; 0 for a burst without a rocket) */
  rise?: number;
};

type Kind = NonNullable<Burst["kind"]>;
/**
 * Per kind: stars (outer shell, inner pistil), how fast they slow down (tau, s), how fast they sink once slow
 * (px/s), how long they burn (s) and when they start to fade (share of that), head width and shell radius at size 1
 */
const KINDS: Record<Kind, { n: number; inner: number; tau: number; sink: number; life: [number, number]; fadeAt: number; head: number; r: number }> = {
  peony: { n: 72, inner: 22, tau: 0.3, sink: 74, life: [2.1, 2.7], fadeAt: 0.36, head: 2.9, r: 190 },
  willow: { n: 58, inner: 0, tau: 0.24, sink: 125, life: [2.2, 2.8], fadeAt: 0.3, head: 2.1, r: 175 },
  ring: { n: 50, inner: 16, tau: 0.28, sink: 78, life: [2.0, 2.5], fadeAt: 0.36, head: 3.1, r: 180 },
};
/** Seconds of path behind a star that its trail shows: short at first (a hollow centre), longer as it droops */
const trailOf = (kind: Kind, a: number, inner: boolean) =>
  inner ? Math.min(0.5 * a, 0.08)
    : kind === "willow" ? Math.min(0.85 * a, 1.05)
      : kind === "ring" ? Math.max(0.05, Math.min(0.5 * a, 0.09 + 0.12 * a, 0.3 - 0.12 * Math.max(0, a - 1.2)))
        : Math.max(0.05, Math.min(0.6 * a, 0.15 + 0.22 * a, 0.4 - 0.25 * Math.max(0, a - 1.2)));
/** How fast a willow's glitter sinks after a star leaves it (px/s) */
const GLITTER_SINK = 42;

type Star = { dx: number; dy: number; sp: number; sk: number; life: number; inner: boolean; front: number; key: number };

/** Unit directions spread evenly over a sphere (golden spiral), turned at random so no pole faces the camera */
function sphere(N: number, r: () => number): [number, number, number][] {
  const a = r() * 6.283, b = Math.acos(2 * r() - 1), c = r() * 6.283;
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return Array.from({ length: N }, (_, j) => {
    const y = 1 - (2 * (j + 0.5)) / N, rr = Math.sqrt(1 - y * y), th = j * 2.39996 + (r() - 0.5) * 0.5;
    let p: [number, number, number] = [Math.cos(th) * rr, y, Math.sin(th) * rr];
    p = [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca, p[2]];
    p = [p[0], p[1] * cb - p[2] * sb, p[1] * sb + p[2] * cb];
    return [p[0] * cc - p[2] * sc, p[1], p[0] * sc + p[2] * cc];
  });
}

function starsOf(kind: Kind, seed: number): Star[] {
  const K = KINDS[kind];
  const r = rng(seed);
  const stars: Star[] = [];
  if (kind === "ring") {
    const tilt = (28 + 22 * r()) * RAD, turn = (r() - 0.5) * 50 * RAD;
    for (let j = 0; j < K.n; j++) {
      const th = (j / K.n) * 6.283 + (r() - 0.5) * 0.04;
      const x = Math.cos(th), y = Math.sin(th) * Math.cos(tilt), zf = Math.sin(th) * Math.sin(tilt);
      stars.push({
        dx: x * Math.cos(turn) - y * Math.sin(turn), dy: x * Math.sin(turn) + y * Math.cos(turn), sp: 0.98 + 0.04 * r(),
        sk: 0.9 + 0.2 * r(), life: lerp(K.life[0], K.life[1], r()), inner: false, front: zf, key: j,
      });
    }
  } else {
    sphere(K.n, r).forEach(([x, y, zf], j) =>
      stars.push({ dx: x, dy: y, sp: 0.9 + 0.16 * r(), sk: 0.85 + 0.3 * r(), life: lerp(K.life[0], K.life[1], r()), inner: false, front: zf, key: j }));
  }
  sphere(K.inner, r).forEach(([x, y, zf], j) =>
    stars.push({ dx: x, dy: y, sp: 0.36 + 0.1 * r(), sk: 0.8 + 0.4 * r(), life: lerp(0.95, 1.35, r()), inner: true, front: zf, key: 500 + j }));
  return stars;
}

/**
 * Fireworks: each burst with a rising rocket trail before t, a flash and sparks after it.
 * A rocket climbs from below the stage for `rise` seconds, slowing as it goes and shedding sparks; at t a white
 * flash lights the sky in the burst's colour and the stars fly out, slow down, sink and twinkle out. `peony` is a
 * round ball of comet stars around a pale core, `willow` droops in long glittering trails, `ring` is a tilted ring
 * around a small core. `size` scales the burst (1 ≈ 190 px radius); colours default to the theme's glow colours.
 */
export const Fireworks: React.FC<{ T: number; bursts: Burst[]; id?: string }> = ({ T, bursts, id = "fireworks" }) => {
  const theme = useTheme();
  const palette = [theme.kinds.hot.glow, theme.stars[1] ?? "#3fe6ff", theme.stars[2] ?? "#ff5fd2", theme.kinds.calm.glow];
  const live = bursts.map((b, bi) => ({ b, bi, a: T - b.t })).filter(({ b, a }) => a > -Math.max(0, b.rise ?? 1) && a < 3);
  if (!live.length) return null;

  const defs: React.ReactNode[] = [];
  const skies: React.ReactNode[] = [];
  const glows: React.ReactNode[] = [];
  const rockets: React.ReactNode[] = [];
  const sparks: React.ReactNode[] = [];
  const flashes: React.ReactNode[] = [];

  for (const { b, bi, a } of live) {
    const kind: Kind = b.kind ?? "peony";
    const K = KINDS[kind];
    const col = b.color ?? palette[bi % palette.length];
    const size = Math.max(0.1, b.size ?? 1);
    const R = K.r * size;
    const ws = Math.sqrt(size);
    const seed = (Math.round(b.t * 1000) * 31 + Math.round(b.x) * 7 + Math.round(b.y) * 3 + bi) >>> 0;
    const hot = tint(col, "#ffffff", 0.8), pale = tint(col, "#ffffff", 0.55), mid = tint(col, "#ffffff", 0.25);
    const rise = Math.max(0, b.rise ?? 1);
    const u = `${id}-${bi}`;

    // ── the rocket: a hot head on a short tapering trail, shedding sparks that fall and wink out
    if (rise > 0 && a < 0.45) {
      const hr = rng(seed + 5);
      const x0 = b.x + (hr() - 0.5) * 80, y0 = 1110, wob = hr() * 6.28;
      const path = (q: number): Pt => [lerp(x0, b.x, q) + 4 * Math.sin(q * 9 + wob) * (1 - q), lerp(y0, b.y, 1 - Math.pow(1 - q, 1.7))];
      const q = clamp01((a + rise) / rise);
      const warm = tint(col, "#ffd890", 0.75), gold = "#ffcf7a";
      const young: string[] = [], old: string[] = [];
      for (let j = 0; j < 46; j++) {
        const qj = (j + hash(seed, j, 1)) / 46;
        if (qj > q) break;
        const age = (q - qj) * rise + Math.max(0, a);
        if (age > 0.4) continue;
        if (hash(seed, j, Math.floor(age * 24)) > 0.8) continue;
        const [px, py] = path(qj);
        const [qx, qy] = path(Math.max(0, qj - 0.01));
        const vx = ((px - qx) / (0.01 * rise)) * 0.12 + (hash(seed, j, 2) - 0.5) * 70;
        const vy = ((py - qy) / (0.01 * rise)) * 0.12 + 30;
        const x = px + vx * age, y = py + vy * age + 210 * age * age;
        (age < 0.16 ? young : old).push(disc(x, y, (1.9 - 3.2 * age) * ws));
      }
      const pieces: React.ReactNode[] = [
        <path key="o" d={old.join("")} fill={gold} opacity={0.75} />,
        <path key="y" d={young.join("")} fill="#fff4d6" />,
      ];
      if (a < 0) {
        const tr: Pt[] = Array.from({ length: 8 }, (_, j) => path(Math.max(0, q - (0.17 * j) / 7)));
        const [hx, hy] = tr[0];
        pieces.push(
          <path key="t1" d={streak(tr, 4 * ws, 0)} fill={warm} opacity={0.55} />,
          <path key="t2" d={streak(tr.slice(0, 4), 3 * ws, 0.8 * ws)} fill="#fff1cf" opacity={0.85} />,
          <circle key="hg" cx={n1(hx)} cy={n1(hy)} r={n1(26 * ws)} fill={`url(#${u}-head)`} />,
          <circle key="h" cx={n1(hx)} cy={n1(hy)} r={n1(2.9 * ws)} fill="#fffbf0" />,
        );
        glows.push(<path key={`rg${bi}`} d={streak(tr, 10 * ws, 2)} fill={warm} opacity={0.35} />);
        defs.push(
          <radialGradient key={`hd${bi}`} id={`${u}-head`}>
            <stop offset="0" stopColor={warm} stopOpacity={0.8} />
            <stop offset="0.3" stopColor={warm} stopOpacity={0.25} />
            <stop offset="1" stopColor={warm} stopOpacity={0} />
          </radialGradient>,
        );
      }
      rockets.push(<g key={`rk${bi}`}>{pieces}</g>);
    }
    if (a < 0) continue;

    // ── the burst
    const stars = starsOf(kind, seed);
    const pos = (st: Star, s0: number): Pt => {
      const s = Math.max(0, s0);
      const tau = st.inner ? K.tau * 0.8 : K.tau;
      const e = 1 - Math.exp(-s / tau);
      const rr = R * st.sp * e;
      return [b.x + st.dx * rr + 8 * s, b.y + st.dy * rr + K.sink * st.sk * (s - tau * e)];
    };
    const levels = [0, 1, 2, 3].map(() => ({ a: [] as string[], b: [] as string[], c: [] as string[], head: [] as string[] }));
    const glowD: string[] = [];
    const glitter: string[] = [];
    let total = 0;
    for (const st of stars) {
      if (a > st.life) continue;
      const f0 = K.fadeAt * st.life;
      const fade = 1 - Math.pow(clamp01((a - f0) / (st.life - f0)), 1.5);
      const late = a > st.life * 0.6;
      const flick = late && kind !== "willow" && hash(seed, st.key, Math.floor(a * 18)) < 0.3 ? 0.25 : 1;
      const bright = fade * flick * (0.8 + 0.2 * st.front);
      total += fade;
      if (bright < 0.04) continue;
      const L = trailOf(kind, a, st.inner);
      const KP = kind === "willow" ? 10 : 7;
      const pts: Pt[] = Array.from({ length: KP }, (_, j) => {
        const back = (L * j) / (KP - 1);
        const [x, y] = pos(st, a - back);
        return [x, y + (kind === "willow" ? GLITTER_SINK * back : 0)];
      });
      const lv = levels[Math.min(3, Math.ceil(bright * 4) - 1)];
      const w = K.head * ws * (st.inner ? 0.72 : 1) * (0.7 + 0.3 * fade);
      lv.a.push(streak(pts, w * 1.15, 0));
      lv.b.push(streak(pts.slice(0, Math.ceil(KP * 0.55)), w, w * 0.3));
      lv.c.push(streak(pts.slice(0, Math.max(2, Math.ceil(KP * 0.25))), w * 0.8, w * 0.5));
      lv.head.push(disc(pts[0][0], pts[0][1], w * 0.62));
      if (!st.inner) glowD.push(streak(pts.slice(0, Math.ceil(KP * 0.6)), w * 4.2, w));
      if (kind === "willow") {
        // glitter twinkles along the trail, once the star has left the centre
        for (let j = 0; j < 6; j++) {
          const back = 0.12 + j * 0.15;
          if (back > L || a - back < 0.2) break;
          const g = (1 - j / 6) * fade;
          if (hash(seed, st.key * 13 + j, Math.floor(a * 12 + j * 0.5)) > 0.3 * g) continue;
          const [gx, gy] = pos(st, a - back);
          glitter.push(disc(gx, gy + GLITTER_SINK * back, (0.8 + 0.6 * g) * ws));
        }
      } else if (late && !st.inner && hash(seed, st.key, Math.floor(a * 9)) < 0.35) {
        // a crackle of white sparkles near the dying star
        glitter.push(disc(pts[0][0] + (hash(seed, st.key, 3) - 0.5) * 10, pts[0][1] + 6 + hash(seed, st.key, 4) * 8, 1.1 * ws));
      }
    }
    const share = total / stars.length;
    const c0: Pt = [b.x + 8 * a, b.y + K.sink * (a - K.tau * (1 - Math.exp(-a / K.tau)))];

    defs.push(
      <radialGradient key={`sk${bi}`} id={`${u}-sky`}>
        <stop offset="0" stopColor={pale} stopOpacity={0.4} />
        <stop offset="0.28" stopColor={col} stopOpacity={0.15} />
        <stop offset="0.62" stopColor={col} stopOpacity={0.045} />
        <stop offset="1" stopColor={col} stopOpacity={0} />
      </radialGradient>,
      <radialGradient key={`fl${bi}`} id={`${u}-flash`}>
        <stop offset="0" stopColor="#ffffff" stopOpacity={1} />
        <stop offset="0.22" stopColor={hot} stopOpacity={0.85} />
        <stop offset="0.55" stopColor={col} stopOpacity={0.25} />
        <stop offset="1" stopColor={col} stopOpacity={0} />
      </radialGradient>,
    );
    const flashK = Math.exp(-a / 0.15);
    skies.push(
      <circle key={`sky${bi}`} cx={n1(c0[0])} cy={n1(c0[1])} r={n1(R * 2.6)} fill={`url(#${u}-sky)`} opacity={n2(Math.min(1, 0.6 * flashK + 0.55 * share))} />,
    );
    glows.push(<path key={`gl${bi}`} d={glowD.join("")} fill={col} opacity={n2(0.42 * share)} />);
    // fresh stars burn white-hot, then show their colour
    const hotK = 1 - smooth(a / 0.4);
    const ca = tint(col, "#ffffff", 0.45 * hotK), cb = tint(mid, "#ffffff", 0.5 * hotK), cc = tint(pale, "#ffffff", 0.4 * hotK);
    sparks.push(
      <g key={`st${bi}`}>
        {levels.map((lv, li) => (
          <g key={li} opacity={(li + 1) / 4}>
            <path d={lv.a.join("")} fill={ca} opacity={kind === "willow" ? 0.6 : 0.45} />
            <path d={lv.b.join("")} fill={cb} opacity={0.6} />
            <path d={lv.c.join("")} fill={cc} opacity={0.85} />
            <path d={lv.head.join("")} fill={hot} />
          </g>
        ))}
        <path d={glitter.join("")} fill={hot} opacity={0.95} />
      </g>,
    );
    if (a < 0.3) {
      const q = a / 0.3;
      const gl = R * (0.55 + 0.6 * Math.pow(q, 0.4));
      const tw = 3.2 * ws;
      flashes.push(
        <g key={`fl${bi}`}>
          <circle cx={n1(b.x)} cy={n1(b.y)} r={n1(R * (0.16 + 0.38 * Math.sqrt(q)))} fill={`url(#${u}-flash)`} opacity={n2(Math.pow(1 - q, 1.6))} />
          <path
            d={`M${n1(b.x - gl)} ${n1(b.y)}L${n1(b.x)} ${n1(b.y - tw)}L${n1(b.x + gl)} ${n1(b.y)}L${n1(b.x)} ${n1(b.y + tw)}Z` +
              `M${n1(b.x)} ${n1(b.y - gl * 0.7)}L${n1(b.x + tw)} ${n1(b.y)}L${n1(b.x)} ${n1(b.y + gl * 0.7)}L${n1(b.x - tw)} ${n1(b.y)}Z`}
            fill="#ffffff" opacity={n2(Math.pow(1 - q, 2.2) * 0.9)} />
        </g>,
      );
    }
  }
  return (
    <g>
      <defs>{defs}</defs>
      {skies}
      <g filter="url(#blur-6)">{glows}</g>
      {rockets}
      {sparks}
      {flashes}
    </g>
  );
};

// ── confetti ─────────────────────────────────────────────────────────────────────────────────────────────────────

type M3 = number[];
const mul3 = (a: M3, b: M3): M3 =>
  [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
/** Rotation by th about the unit axis (x, y, z); x right, y down, z towards the viewer */
const rot3 = (x: number, y: number, z: number, th: number): M3 => {
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
};
const apply3 = (m: M3, v: number[]) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const unit3 = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return v.map((c) => c / l);
};
/** Key light on the paper: from the upper left, towards the viewer; and the half vector for its glint */
const LIGHT = unit3([-0.38, -0.62, 0.68]);
const HALF = unit3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

type Piece = {
  kind: "rect" | "dot" | "ribbon"; z: number; color: number; x0: number; v: number; sway: number; freq: number; ph: number;
  axis: number[]; spin: number; spin0: number; base: M3; w: number; h: number; wave: boolean; delay: number; y0: number; boost: number;
  twist: number; bend: number;
};

/** One side of a paper piece, lit: darker as it turns away from the light, a glint when it faces it */
function paper(c: string, n: number[], back: boolean): string {
  if (!isHex(c)) return c;
  const face = back ? shade(c, 0.8) : c;
  const d = Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const sp = Math.pow(Math.abs(n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 30);
  const lit = mix(shade(face, 0.66), mix(face, "#ffffff", 0.16), Math.pow(d, 0.75));
  return mix(lit, "#ffffff", 0.7 * sp);
}

/**
 * Confetti raining down from time `from`: paper pieces that tumble and flutter as they fall.
 * Rectangles, dots and twisted ribbons in `colors` (default: the theme's glow colours and a violet). Each piece turns
 * about its own axis in 3D, so it flips (narrows to a sliver, shows its darker back) and flashes when it faces the
 * light; it swings from side to side like a falling leaf, tilting into the swing. Near pieces are bigger, faster
 * and out of focus; far ones are smaller and fade into whatever is behind them (right by day and by night). At
 * `from` a first shower drops in from above, then the pieces keep coming. `n` is how many are in the air.
 */
export const Confetti: React.FC<{ T: number; from?: number; n?: number; colors?: string[]; seed?: number; id?: string }> = ({
  T, from = 0, n = 200, colors, seed = 3,
}) => {
  const theme = useTheme();
  const t0 = T - from;
  if (t0 < 0) return null;
  const pal = colors?.length ? colors : [theme.kinds.hot.glow, theme.stars[1] ?? "#3fe6ff", theme.stars[2] ?? "#ff5fd2", theme.kinds.calm.glow, "#8f7cff"];
  const r = rng(seed);
  const pieces: Piece[] = Array.from({ length: n }, () => {
    const kr = r();
    const kind: Piece["kind"] = kr < 0.64 ? "rect" : kr < 0.84 ? "dot" : "ribbon";
    const z = r();
    const a1 = r() * 6.283, az = (r() - 0.5) * 0.9;
    const axis = unit3([Math.cos(a1), Math.sin(a1), az]);
    const base = mul3(rot3(1, 0, 0, r() * 6.283), rot3(0, 1, 0, r() * 6.283));
    const wave = r() < 0.45;
    const w = kind === "rect" ? 17 + 10 * r() : kind === "dot" ? 12 + 6 * r() : 62 + 36 * r();
    const h = kind === "rect" ? w * (0.42 + 0.2 * r()) : kind === "dot" ? w : 7 + 2.5 * r();
    return {
      kind, z, color: Math.floor(r() * pal.length), x0: r(), v: (90 + 100 * r()) * (0.7 + 0.6 * z), sway: (18 + 40 * r()) * (0.7 + 0.6 * z),
      freq: 0.35 + 0.45 * r(), ph: r() * 6.283, axis, spin: (3 + 5 * r()) * (r() < 0.5 ? -1 : 1),
      spin0: r() * 6.283, base, w, h, wave, delay: wave ? 0.35 * r() : 0, y0: wave ? -30 - 300 * r() : -60, boost: wave ? 220 + 260 * r() : 0,
      twist: 0.35 + 0.45 * r(), bend: (r() - 0.5) * 0.5,
    };
  });
  // the stream pieces start at random times over one fall, so they arrive evenly
  pieces.forEach((p) => {
    if (!p.wave) p.delay = r() * (1220 / p.v);
  });
  const order = pieces.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z);
  const far: React.ReactNode[] = [], mid: React.ReactNode[] = [], near: React.ReactNode[] = [];
  const TOP = -60, BOTTOM = 1140;

  for (const { p, i } of order) {
    let t = t0 - p.delay;
    if (t < 0) continue;
    const sc = 0.5 + 0.75 * p.z;
    const wv = 2 * Math.PI * p.freq;
    // vertical: a falling leaf goes faster at the bottom of each swing
    const yAt = (s: number, y0: number, boost: number) =>
      y0 + p.v * s + boost * 0.6 * (1 - Math.exp(-s / 0.6)) - ((p.v * 0.28) / (2 * wv)) * (Math.sin(2 * (wv * s + p.ph)) - Math.sin(2 * p.ph));
    let y = yAt(t, p.y0, p.boost);
    let cyc = 0;
    if (y > BOTTOM) {
      // first fall done: find when it left, then loop from the top with a new place each time
      let lo = 0, hi = t;
      for (let it = 0; it < 22; it++) {
        const m = (lo + hi) / 2;
        if (yAt(m, p.y0, p.boost) > BOTTOM) hi = m;
        else lo = m;
      }
      const P = (BOTTOM - TOP) / p.v;
      const tt = t - hi;
      cyc = 1 + Math.floor(tt / P);
      t = tt - (cyc - 1) * P;
      y = yAt(t, TOP, 0);
    }
    const xr = cyc === 0 ? p.x0 : hash(i, cyc, seed);
    const x = -100 + xr * 2120 + p.sway * Math.sin(wv * t + p.ph) + 14 * t;
    const tiltZ = 0.5 * Math.cos(wv * t + p.ph) * (p.kind === "ribbon" ? 0.4 : 1);
    const spinAt = p.spin * (t + cyc * 7.3) + p.spin0;
    const R = mul3(rot3(0, 0, 1, tiltZ), mul3(rot3(p.axis[0], p.axis[1], p.axis[2], p.kind === "ribbon" ? spinAt * 0.45 : spinAt), p.base));
    const c = pal[p.color];
    const key = `${i}`;
    let el: React.ReactNode;
    if (p.kind === "ribbon") {
      // a strip with a slow twist along its length and a gentle S bend, so it shows a lit and a dark side
      const N = 14, Lr = p.w * sc, W = p.h * sc;
      const tw = (p.twist * 6.283) / Lr;
      const roll = p.spin * 0.5 * t;
      const quads: React.ReactNode[] = [];
      for (let j = 0; j < N; j++) {
        const s0 = -Lr / 2 + (Lr * j) / N - 0.5, s1 = -Lr / 2 + (Lr * (j + 1)) / N + 0.5;
        const corner = (s: number, side: number) => {
          const th = tw * s + roll;
          const bend = p.bend * Lr * Math.sin((Math.PI * 2 * s) / Lr + roll * 0.3);
          const v = apply3(R, [s, bend + side * (W / 2) * Math.cos(th), side * (W / 2) * Math.sin(th)]);
          return `${n1(x + v[0])} ${n1(y + v[1])}`;
        };
        const sm = (s0 + s1) / 2, thm = tw * sm + roll;
        const nrm = apply3(R, [0, -Math.sin(thm), Math.cos(thm)]);
        quads.push(<path key={j} d={`M${corner(s0, 1)}L${corner(s1, 1)}L${corner(s1, -1)}L${corner(s0, -1)}Z`} fill={paper(c, nrm, nrm[2] < 0)} />);
      }
      el = <g key={key}>{quads}</g>;
    } else {
      const nrm = [R[2], R[5], R[8]];
      const fill = paper(c, nrm, nrm[2] < 0);
      const m = `matrix(${n2(R[0])} ${n2(R[3])} ${n2(R[1])} ${n2(R[4])} ${n1(x)} ${n1(y)})`;
      el = p.kind === "rect"
        ? <rect key={key} x={n1((-p.w * sc) / 2)} y={n1((-p.h * sc) / 2)} width={n1(p.w * sc)} height={n1(p.h * sc)} rx={1.5} transform={m} fill={fill} />
        : <circle key={key} r={n1((p.w * sc) / 2)} transform={m} fill={fill} />;
    }
    (p.z > 0.86 ? near : p.z < 0.3 ? far : mid).push(el);
  }
  return (
    <g>
      {/* far pieces fade into whatever is behind them, so they sit back by day and by night */}
      <g opacity={0.68}>{far}</g>
      {mid}
      <g filter="url(#blur-2)">{near}</g>
    </g>
  );
};
