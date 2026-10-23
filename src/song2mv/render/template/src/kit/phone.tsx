import React from "react";
import { mix, shade } from "./color";
import { clamp01, lerp, outCubic, span } from "./math";
import { useSong } from "./song";

/**
 * A smartphone seen from the front, for songs about messages, calls and waiting for a reply. Use inside <Svg> on the
 * 1920×1080 stage; about 380 × 780 px at s = 1, origin at its centre.
 *
 * - `messages` appear at their times `t` as chat bubbles stacked from the bottom (older ones move up and leave the
 *   top of the screen): `me` on the right in the accent colour, the other side on the left. A bubble pops in once
 *   and then holds still — text never wobbles.
 * - `typing` lists [from, to] spans when the other side is typing (three dots in a bubble).
 * - `call` turns the screen into an incoming call from time t (name, a pulsing answer button).
 * - `clock` is the time in the status bar; `title` the contact's name at the top of the chat.
 * - `dark` (the default) or light UI; `accent` (default: the theme's bigGlow) colours `me` bubbles and the bar
 *   buttons, with dark text on a light accent. The screen lights its surroundings.
 *
 * Text uses the theme's font (body 30 px at s = 1). Messages wrap like a chat app's, in balanced lines (Korean at
 * spaces, as keep-all); "\n" starts a new line. `id` prefixes the SVG ids: give each phone on a stage its own.
 */
export type Message = { t: number; text: string; me?: boolean };

// ── geometry (phone units, origin at the centre) ─────────────
/** body, corner radius, metal band, bezel (band + black glass) */
const W = 380, H = 780, R = 60, BAND = 3, BEZ = 13;
/** the screen, concentric with the body's corners */
const SW = W - 2 * BEZ, SH = H - 2 * BEZ, SR = R - BEZ;
/** screen bands: status bar and header from the top, the input bar (with the home indicator) from the bottom */
const STATUS = 50, HEADER = 88, INPUT = 100;
const CHAT_H = SH - STATUS - HEADER - INPUT;

// ── chat text and bubbles ────────────────────────────────────
/** body text: the brief asks for about 30–34 px at s = 1, so it still reads at s = 0.6 */
const FONT = 30, LH = 38, WEIGHT = 500;
const PAD_X = 18, PAD_Y = 12, RADIUS = 24, TAIL_R = 6;
/** bubbles keep this far from the screen's sides and may take this share of the width between */
const SIDE = 14, WIDEST = 0.82;
const TEXT_MAX = (SW - 2 * SIDE) * WIDEST - 2 * PAD_X;
/** space above a bubble: after one from the same side, after the other side; and under the last one */
const GAP_SAME = 6, GAP_OTHER = 16, BOTTOM = 16;
/** the typing bubble: 21 px padding round a row of 14 px dots */
const TYPING_H = 56;

/** a time that never comes (span() of Infinity is NaN) */
const NEVER = 1e9;

const isHex = (c: string | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

/** a mild spring: rises to about 1.03 and settles at 1 — one pop, no wobble */
const pop = (x: number) => {
  const t = clamp01(x) - 1;
  return 1 + 2.1 * t * t * t + 1.1 * t * t;
};

// ── measuring text with the theme's font, to break lines like a chat app does ──
let measurer: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** Rendered width of `s` in px: canvas measureText in the real font; a rough em estimate where there is no canvas */
function textWidth(s: string, font: string): number {
  const key = `${font}|${s}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (measurer === undefined) measurer = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  let w: number;
  if (measurer) measurer.font = font;
  if (measurer && measurer.font.includes(`${FONT}px`)) {
    w = measurer.measureText(s).width;
  } else {
    w = FONT * [...s].reduce((a, ch) => a + (/\s/.test(ch) ? 0.28 : /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 0.95 : 0.56), 0);
  }
  widths.set(key, w);
  return w;
}

/**
 * Words split at spaces (Korean words stay whole, as with word-break: keep-all). A word wider than `max` is cut into
 * pieces of about equal width, so a long link or a shout doesn't leave one letter alone on the last line.
 */
function words(text: string, font: string, max: number): string[] {
  const out: string[] = [];
  for (const w of text.trim().split(/\s+/)) {
    if (!w) continue;
    const ww = textWidth(w, font);
    if (ww <= max) { out.push(w); continue; }
    const each = ww / Math.ceil(ww / max);
    let cur = "";
    for (const ch of [...w]) {
      if (cur && textWidth(cur + ch, font) > each + FONT * 0.3) { out.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) out.push(cur);
  }
  return out;
}
function greedy(ws: string[], font: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of ws) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, font) > max) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
/**
 * Lines of a message: as few as at the full width, but balanced (the narrowest width that keeps that count).
 * A "\n" in the text starts a new line.
 */
function breakLines(text: string, font: string): string[] {
  return text.split("\n").flatMap((part) => balance(part, font));
}
function balance(text: string, font: string): string[] {
  const ws = words(text, font, TEXT_MAX);
  const lines = greedy(ws, font, TEXT_MAX);
  if (lines.length < 2) return lines.length ? lines : [""];
  let lo = TEXT_MAX / lines.length, hi = TEXT_MAX;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (ws.some((w) => textWidth(w, font) > mid) || greedy(ws, font, mid).length > lines.length) lo = mid; else hi = mid;
  }
  return greedy(ws, font, hi);
}

/** relative luminance of "#rrggbb" (WCAG) */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Screen colours for dark and light mode. `me` bubbles take the accent; a light accent gets dark text */
function palette(dark: boolean, accent: string) {
  const light = luminance(accent) > 0.4;
  const me = { top: mix(accent, "#ffffff", 0.16), bottom: shade(accent, 0.88), ink: light ? "#141629" : "#ffffff" };
  /** the accent on the bars (back, call and video): darker in light mode when the accent itself is light */
  const key = !dark && light ? shade(accent, 0.62) : accent;
  return dark
    ? {
      dark, me, key, top: "#171c45", bottom: "#0b0e28", bar: "#13173a", line: "rgba(170,180,255,0.09)",
      ink: "#f3f4ff", them: "#2a305f", themInk: "#eef0ff", dot: "#b3b9ec",
      field: "#1f2452", fieldInk: "#7a81b6", icon: "#c3c8ef",
      glow: mix("#5468ff", accent, 0.2),
    }
    : {
      dark, me, key, top: "#f7f8fd", bottom: "#eceef8", bar: "#ffffff", line: "rgba(20,24,60,0.08)",
      ink: "#12142a", them: "#e4e6f1", themInk: "#14162b", dot: "#8d91ad",
      field: "#eceef6", fieldInk: "#9a9eb8", icon: "#4a4f75",
      glow: mix("#dfe6ff", accent, 0.12),
    };
}
type Pal = ReturnType<typeof palette>;

// ── icons (24-unit boxes), drawn for this phone ─────────────
const HANDSET =
  "M6.5 2.8C7.4 2.5 8.3 2.9 8.7 3.8L10.2 7.3C10.6 8.1 10.3 9.1 9.6 9.6L8.2 10.6C9.2 12.8 11.2 14.8 13.4 15.8L14.4 14.4" +
  "C14.9 13.7 15.9 13.4 16.7 13.8L20.2 15.3C21.1 15.7 21.5 16.6 21.2 17.5L20.6 19.4C20.2 20.6 19.1 21.4 17.8 21.3" +
  "C10 20.6 3.4 14 2.7 6.2C2.6 4.9 3.4 3.8 4.6 3.4Z";

const Icon: React.FC<{ size: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ size, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "none", ...style }}>{children}</svg>
);

/** Status bar: clock on the left, signal, wi-fi and battery on the right (the camera sits between them) */
const StatusBar: React.FC<{ clock: string; ink: string }> = ({ clock, ink }) => (
  <div style={{
    position: "absolute", left: 0, right: 0, top: 0, height: STATUS, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "4px 30px 0 34px", color: ink, zIndex: 5,
  }}>
    <div style={{ fontSize: 21, fontWeight: 650, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{clock}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={22} height={15} viewBox="0 0 22 15" style={{ display: "block" }}>
        {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 5.6} y={10 - i * 3.3} width={3.8} height={5 + i * 3.3} rx={1.1} fill={ink} />)}
      </svg>
      <svg width={21} height={15} viewBox="0 0 21 15" style={{ display: "block" }}>
        <path d="M10.5 14.6L7.4 11.3A4.5 4.5 0 0 1 13.6 11.3Z" fill={ink} />
        <path d="M4.7 8.4A8.3 8.3 0 0 1 16.3 8.4M1.6 5.2A12.6 12.6 0 0 1 19.4 5.2" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
      </svg>
      <svg width={30} height={15} viewBox="0 0 30 15" style={{ display: "block" }}>
        <rect x={1} y={1} width={24} height={13} rx={4} fill="none" stroke={ink} strokeOpacity={0.45} strokeWidth={1.6} />
        <rect x={3.2} y={3.2} width={15} height={8.6} rx={2.2} fill={ink} />
        <path d="M27 5.2C28.4 5.6 28.9 6.4 28.9 7.5S28.4 9.4 27 9.8Z" fill={ink} fillOpacity={0.45} />
      </svg>
    </div>
  </div>
);

/** Round avatar with the contact's initial (a person glyph when there is no name) */
const Avatar: React.FC<{ name: string; d: number }> = ({ name, d }) => {
  const initial = [...name.trim()][0]?.toUpperCase() ?? "";
  return (
    <div style={{
      width: d, height: d, borderRadius: d / 2, flex: "none", position: "relative",
      background: "linear-gradient(140deg, #ffd36b 0%, #ff8f8f 52%, #ff5fd2 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#ffffff", fontSize: d * 0.46, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em",
    }}>
      {initial || (
        <svg width={d * 0.6} height={d * 0.6} viewBox="0 0 24 24"><circle cx={12} cy={8.5} r={4.6} fill="#fff" /><path d="M3.5 22C4.5 16.5 8 14.4 12 14.4S19.5 16.5 20.5 22Z" fill="#fff" /></svg>
      )}
    </div>
  );
};

/** Chat header: back, avatar (with an online dot), name, call and video buttons. Its bar runs up under the status bar */
const Header: React.FC<{ title: string; pal: Pal }> = ({ title, pal }) => (
  <div style={{
    position: "absolute", left: 0, right: 0, top: 0, height: STATUS + HEADER, boxSizing: "border-box", display: "flex", alignItems: "center",
    gap: 12, padding: `${STATUS}px 20px 0 12px`, background: pal.bar, borderBottom: `1.5px solid ${pal.line}`, zIndex: 2,
  }}>
    <Icon size={30}><path d="M15 4.5L7.5 12L15 19.5" fill="none" stroke={pal.key} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></Icon>
    <div style={{ position: "relative", flex: "none" }}>
      <Avatar name={title} d={52} />
      <div style={{ position: "absolute", right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8, background: "#34d17b", boxShadow: `0 0 0 3px ${pal.bar}` }} />
    </div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 27, fontWeight: 700, color: pal.ink, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {title}
    </div>
    <Icon size={30}><path d={HANDSET} fill={pal.key} /></Icon>
    <Icon size={32} style={{ marginLeft: 6 }}>
      <rect x={2.5} y={6} width={13.5} height={12} rx={3} fill={pal.key} />
      <path d="M17.5 10.2L21.6 7.6V16.4L17.5 13.8Z" fill={pal.key} strokeLinejoin="round" stroke={pal.key} strokeWidth={1.2} />
    </Icon>
  </div>
);

/** Input bar: add, an empty message field with an emoji button, the microphone; the home indicator under it */
const InputBar: React.FC<{ pal: Pal }> = ({ pal }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: INPUT, background: pal.bar, borderTop: `1.5px solid ${pal.line}`, zIndex: 2 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 0 14px" }}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: pal.field, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Icon size={26}><path d="M12 5.5V18.5M5.5 12H18.5" stroke={pal.icon} strokeWidth={2.6} strokeLinecap="round" /></Icon>
      </div>
      <div style={{ flex: 1, height: 48, borderRadius: 24, background: pal.field, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px" }}>
        <Icon size={28}>
          <circle cx={12} cy={12} r={8.6} fill="none" stroke={pal.fieldInk} strokeWidth={1.9} />
          <circle cx={9.2} cy={10.2} r={1.25} fill={pal.fieldInk} /><circle cx={14.8} cy={10.2} r={1.25} fill={pal.fieldInk} />
          <path d="M8.6 13.8C9.6 15.6 14.4 15.6 15.4 13.8" fill="none" stroke={pal.fieldInk} strokeWidth={1.9} strokeLinecap="round" />
        </Icon>
      </div>
      <Icon size={30}>
        <rect x={8.6} y={2.8} width={6.8} height={12} rx={3.4} fill={pal.icon} />
        <path d="M5.6 11.2A6.4 6.4 0 0 0 18.4 11.2M12 17.6V21" fill="none" stroke={pal.icon} strokeWidth={2.1} strokeLinecap="round" />
      </Icon>
    </div>
    <div style={{ position: "absolute", left: "50%", bottom: 9, width: 128, height: 5, marginLeft: -64, borderRadius: 3, background: pal.ink, opacity: 0.6 }} />
  </div>
);

/**
 * The hook at the bottom corner of the last bubble in a group, on the sender's side. Drawn under the bubble (which
 * covers its inner part), so only the curl outside the bubble shows; the box's origin is the bubble's corner.
 */
const Tail: React.FC<{ me: boolean; color: string; opacity: number }> = ({ me, color, opacity }) => (
  <svg width={26} height={26} viewBox="-16 -25 26 26" style={{
    position: "absolute", bottom: -1, [me ? "right" : "left"]: -10, opacity, transform: me ? undefined : "scaleX(-1)", display: "block",
  }}>
    <path d="M-16 0H4.6C6.6 0 8.2 -0.3 9.2 -1.2C3.6 -3.6 0.6 -10.2 0.2 -24H-16Z" fill={color} />
  </svg>
);

/** Three dots that rise and brighten one after another, about 1.4 times a second */
const Dots: React.FC<{ T: number; t: number; color: string }> = ({ T, t, color }) => (
  <div style={{ display: "flex", gap: 8, height: 14, alignItems: "center" }}>
    {[0, 1, 2].map((i) => {
      const b = Math.max(0, Math.sin(2 * Math.PI * ((T - t) * 1.4 - i * 0.17)));
      return <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: color, opacity: 0.42 + 0.58 * b, transform: `translateY(${(-4.5 * b).toFixed(2)}px)` }} />;
    })}
  </div>
);

/** A chat item laid out: its lines (none for the typing bubble), size, the gap above it and when it comes and goes */
type Item = {
  key: string; me: boolean; lines: string[] | null; h: number; gap: number;
  t: number; until: number; tailUntil: number;
};

/** One bubble at `bottom` px above the chat's floor, popping in from its sender-side corner */
const Bubble: React.FC<{ T: number; it: Item; bottom: number; pal: Pal; k: number }> = ({ T, it, bottom, pal, k }) => {
  const leave = 1 - outCubic(span(T, it.until, it.until + 0.22));
  // the pop never reaches over the bubble above: its height stays inside the slot that has opened so far
  const sc = Math.min(0.35 + 0.65 * pop(span(T, it.t, it.t + 0.34)), (k * (it.h + it.gap)) / it.h) * (0.6 + 0.4 * leave);
  const o = clamp01((T - it.t) / 0.08) * clamp01(leave * 1.5);
  const tail = 1 - span(T, it.tailUntil, it.tailUntil + 0.15);
  const fill = it.me ? pal.me.bottom : pal.them;
  return (
    <div style={{
      position: "absolute", bottom, [it.me ? "right" : "left"]: SIDE, opacity: o,
      transform: `scale(${sc.toFixed(4)})`, transformOrigin: it.me ? "100% 100%" : "0% 100%",
    }}>
      {tail > 0 && <Tail me={it.me} color={fill} opacity={tail} />}
      <div style={{
        position: "relative", boxSizing: "border-box", minHeight: it.h,
        padding: it.lines ? `${PAD_Y}px ${PAD_X}px` : "21px 22px",
        borderRadius: RADIUS,
        [it.me ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: lerp(RADIUS, TAIL_R, tail),
        background: it.me ? `linear-gradient(172deg, ${pal.me.top} 0%, ${pal.me.bottom} 100%)` : pal.them,
        color: it.me ? pal.me.ink : pal.themInk,
        fontSize: FONT, lineHeight: `${LH}px`, fontWeight: WEIGHT, whiteSpace: "pre",
      }}>
        {it.lines ? it.lines.join("\n") : <Dots T={T} t={it.t} color={pal.dot} />}
      </div>
    </div>
  );
};

/** The incoming-call screen: the caller's avatar with rings going out, the name, decline and a pulsing answer */
const CallScreen: React.FC<{ T: number; t: number; name: string; ring: number }> = ({ T, t, name, ring }) => {
  const bg = outCubic(span(T, t, t + 0.18));
  const inAt = (d: number, dur = 0.35) => span(T, t + d, t + d + dur);
  const avatar = inAt(0.14), title = inAt(0.22), buttons = inAt(0.3);
  const btn = (d: number, children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ width: d, height: d, borderRadius: d / 2, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", ...style }}>{children}</div>
  );
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 4, opacity: bg,
      background: "radial-gradient(120% 62% at 50% 24%, #4a3486 0%, #251f5e 42%, #0e1030 100%)",
    }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 140, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 136, height: 136, opacity: clamp01(avatar * 4), transform: `scale(${(0.6 + 0.4 * pop(avatar)).toFixed(4)})` }}>
          {[0, 0.5].map((d, i) => {
            const p = (ring + d) % 1;
            return <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px solid rgba(255,214,240,0.55)", transform: `scale(${(1.08 + 0.62 * p).toFixed(4)})`, opacity: 0.8 * (1 - p) * Math.min(1, p * 6) }} />;
          })}
          <Avatar name={name} d={136} />
        </div>
      </div>
      <div style={{
        position: "absolute", left: 24, right: 24, top: 304, textAlign: "center", color: "#ffffff", fontSize: 40, fontWeight: 700,
        letterSpacing: "-0.02em", lineHeight: 1.15, wordBreak: "keep-all", overflowWrap: "anywhere",
        opacity: clamp01(title * 4), transform: `scale(${(0.8 + 0.2 * pop(title)).toFixed(4)})`,
      }}>
        {name}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 100, opacity: clamp01(buttons * 3), transform: `translateY(${(24 * (1 - outCubic(buttons))).toFixed(2)}px)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 64px", marginBottom: 40 }}>
          {btn(58, <Icon size={28}><circle cx={12} cy={13} r={7.6} fill="none" stroke="#fff" strokeWidth={2} /><path d="M12 9.2V13.2L14.6 14.8M4.6 5.6L7.4 3.4M19.4 5.6L16.6 3.4" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" /></Icon>, { background: "rgba(255,255,255,0.14)" })}
          {btn(58, <Icon size={28}><path d="M4 6.5C4 5.1 5.1 4 6.5 4H17.5C18.9 4 20 5.1 20 6.5V14.5C20 15.9 18.9 17 17.5 17H10.5L6.6 20.2C6.2 20.5 5.6 20.2 5.6 19.7V17H6.5C5.1 17 4 15.9 4 14.5Z" fill="#fff" /></Icon>, { background: "rgba(255,255,255,0.14)" })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 50px" }}>
          {btn(86, <Icon size={44} style={{ transform: "rotate(135deg)" }}><path d={HANDSET} fill="#ffffff" /></Icon>, { background: "#ff3b5c" })}
          <div style={{ position: "relative", width: 86, height: 86 }}>
            <div style={{ position: "absolute", inset: -26, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(47,210,124,0.45), rgba(47,210,124,0))", opacity: 0.6 + 0.4 * (1 - ring) }} />
            {[0, 0.5].map((d, i) => {
              const p = (ring + d) % 1;
              return <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid #4ae29a", transform: `scale(${(1 + 0.55 * p).toFixed(4)})`, opacity: 0.7 * (1 - p) * Math.min(1, p * 6) }} />;
            })}
            {btn(86, <Icon size={44}><path d={HANDSET} fill="#ffffff" /></Icon>, {
              position: "absolute", inset: 0, background: "#2fd27c", transform: `scale(${(1 + 0.06 * Math.exp(-ring * 9)).toFixed(4)})`,
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const Phone: React.FC<{
  T: number; x: number; y: number; s?: number; tilt?: number; title?: string; clock?: string;
  messages?: Message[]; typing?: [number, number][]; call?: { t: number; name: string };
  dark?: boolean; accent?: string; id?: string;
}> = ({ T, x, y, s = 1, tilt = 0, title = "", clock = "11:47", messages = [], typing = [], call, dark = true, accent, id = "phone" }) => {
  const { theme, grid } = useSong();
  const acc = isHex(accent) ? accent : isHex(theme.bigGlow) ? theme.bigGlow : "#ff3355";
  const pal = palette(dark, acc);
  const font = `${WEIGHT} ${FONT}px ${theme.font}`;

  // ── the chat: messages that have arrived, then the typing bubble while the other side is typing
  const all = [...messages].sort((a, b) => a.t - b.t);
  const items: Item[] = [];
  all.forEach((m, i) => {
    if (T < m.t) return;
    const me = !!m.me, prev = all[i - 1], next = all[i + 1];
    const lines = breakLines(m.text, font);
    items.push({
      key: `m${i}`, me, lines, h: lines.length * LH + 2 * PAD_Y,
      gap: !prev ? 0 : !!prev.me === me ? GAP_SAME : GAP_OTHER, t: m.t, until: NEVER,
      // the tail moves to the next bubble from the same side when that one arrives
      tailUntil: next && !!next.me === me ? next.t : NEVER,
    });
  });
  for (const [from, to] of typing) {
    // the dots go when the reply they were typing arrives, or at the end of the span
    const reply = all.find((m) => !m.me && m.t > from && m.t <= to);
    const end = reply ? reply.t : to;
    if (T < from || T >= end + 0.25) continue;
    const before = all.filter((m) => m.t <= T);
    items.push({ key: `typing${from}`, me: false, lines: null, h: TYPING_H, gap: before.length ? GAP_OTHER : 0, t: from, until: end, tailUntil: NEVER });
  }
  // stack from the floor up: each item takes its height plus the gap above it, growing in as it arrives
  const slots = items.map((it) => ({ it, k: outCubic(span(T, it.t, it.t + 0.3)) * (1 - outCubic(span(T, it.until, it.until + 0.22))) }));
  let floor = BOTTOM;
  const placed = slots.slice().reverse().map(({ it, k }) => {
    const p = { it, k, bottom: floor };
    floor += k * (it.h + it.gap);
    return p;
  });

  // ── the call: it rings every two beats of the song
  const inCall = !!call && T >= call.t;
  const rb = grid.beatPos(T) / 2;
  const ring = rb - Math.floor(rb);
  const callK = call ? outCubic(span(T, call.t, call.t + 0.3)) : 0;
  const glowK = 0.85 + 0.25 * callK * Math.exp(-ring * 4);

  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={pal.glow} stopOpacity={0.5} />
          <stop offset="0.45" stopColor={pal.glow} stopOpacity={0.22} />
          <stop offset="0.75" stopColor={pal.glow} stopOpacity={0.06} />
          <stop offset="1" stopColor={pal.glow} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a5076" />
          <stop offset="0.45" stopColor="#2a2e4a" />
          <stop offset="1" stopColor="#171a2d" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9d0ff" stopOpacity={0.75} />
          <stop offset="0.35" stopColor="#c9d0ff" stopOpacity={0.12} />
          <stop offset="0.7" stopColor={pal.glow} stopOpacity={0} />
          <stop offset="1" stopColor={pal.glow} stopOpacity={0.35} />
        </linearGradient>
        <clipPath id={`${id}-screen`}><rect x={-SW / 2} y={-SH / 2} width={SW} height={SH} rx={SR} /></clipPath>
      </defs>

      {/* the screen's light on everything around it */}
      <ellipse cx={0} cy={0} rx={W * 1.25} ry={H * 0.86} fill={`url(#${id}-glow)`} opacity={glowK} />
      <g transform="scale(3)" opacity={0.55 * glowK}>
        <rect x={-W / 6} y={-H / 6} width={W / 3} height={H / 3} rx={R / 3} fill={pal.glow} filter="url(#blur-14)" />
      </g>

      {/* ringing: two short arcs round each top corner light up one after the other with every ring, drifting out */}
      {inCall && [-1, 1].map((side) =>
        [0, 1].map((j) => {
          const p = clamp01(ring * 2.2 - j * 0.28);
          const r = R + 17 + j * 15 + 7 * p;
          const cx = side * (W / 2 - R), cy = -H / 2 + R;
          const a0 = side > 0 ? -72 : -108, a1 = side > 0 ? -18 : -162;
          const pt = (a: number) => `${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`;
          return (
            <path key={`${side}${j}`} d={`M${pt(a0)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${side > 0 ? 1 : 0} ${pt(a1)}`} fill="none"
              stroke={mix(pal.glow, "#ffffff", 0.7)} strokeWidth={4} strokeLinecap="round" opacity={callK * 0.85 * Math.sin(Math.PI * p)} />
          );
        }),
      )}

      {/* side keys: volume on the left, power on the right */}
      <rect x={-W / 2 - 3.5} y={-H / 2 + 150} width={8} height={56} rx={3} fill="#2a2e4a" />
      <rect x={-W / 2 - 3.5} y={-H / 2 + 222} width={8} height={56} rx={3} fill="#2a2e4a" />
      <rect x={W / 2 - 4.5} y={-H / 2 + 190} width={8} height={92} rx={3} fill="#22253d" />

      {/* body: metal band with a rim of light, then the black glass */}
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={R} fill={`url(#${id}-frame)`} />
      <rect x={-W / 2 + 0.9} y={-H / 2 + 0.9} width={W - 1.8} height={H - 1.8} rx={R - 0.9} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.8} />
      <rect x={-W / 2 + BAND} y={-H / 2 + BAND} width={W - 2 * BAND} height={H - 2 * BAND} rx={R - BAND} fill="#05060e" />

      {/* the screen */}
      <foreignObject x={-SW / 2} y={-SH / 2} width={SW} height={SH}>
        <div style={{
          width: SW, height: SH, borderRadius: SR, overflow: "hidden", position: "relative",
          background: `linear-gradient(180deg, ${pal.top} 0%, ${pal.bottom} 100%)`,
          fontFamily: theme.font, WebkitFontSmoothing: "antialiased",
        }}>
          <StatusBar clock={clock} ink={inCall && callK > 0.5 ? "#ffffff" : pal.ink} />
          <Header title={title} pal={pal} />
          <div style={{
            position: "absolute", left: 0, right: 0, top: STATUS + HEADER, height: CHAT_H, overflow: "hidden",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0px, #000 40px)", maskImage: "linear-gradient(180deg, transparent 0px, #000 40px)",
          }}>
            {placed.map(({ it, k, bottom }) => <Bubble key={it.key} T={T} it={it} bottom={bottom} pal={pal} k={k} />)}
          </div>
          <InputBar pal={pal} />
          {inCall && call && <CallScreen T={T} t={call.t} name={call.name} ring={ring} />}
        </div>
      </foreignObject>

      {/* glass: two faint diagonal streaks of reflected light, as on the kit's windows */}
      <path clipPath={`url(#${id}-screen)`} fill="#ffffff" opacity={0.035}
        d={`M${-SW / 2 + SW * 0.38} ${-SH / 2}H${-SW / 2 + SW * 0.58}L${-SW / 2} ${-SH / 2 + SH * 0.46}V${-SH / 2 + SH * 0.32}Z` +
          `M${-SW / 2 + SW * 0.74} ${-SH / 2}H${-SW / 2 + SW * 0.8}L${-SW / 2} ${-SH / 2 + SH * 0.72}V${-SH / 2 + SH * 0.65}Z`} />

      {/* the camera, punched through the screen */}
      <circle cx={0} cy={-SH / 2 + STATUS / 2 + 2} r={10.5} fill="#04050b" />
      <circle cx={-2.6} cy={-SH / 2 + STATUS / 2 - 0.6} r={3} fill="#2b3360" opacity={0.9} />
    </g>
  );
};
