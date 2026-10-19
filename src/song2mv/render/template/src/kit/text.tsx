import React, { useContext } from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, outCubic } from "./math";
import { Line, VerticalCtx, useSong } from "./song";

/**
 * Text. One rule: text appears with a single pop and then holds still while it is read. No wobble, bob
 * or beat-shake on letters — a shaking word is hard to read, and in our tests viewers noticed it at once.
 * Let lights, particles and shapes carry the beat instead (backgrounds.tsx).
 */

type Align = "left" | "center" | "right";

/** "#rrggbb" + alpha → rgba(); anything else falls back to black */
const withAlpha = (c: string, a: number) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(0,0,0,${a})`;
};

/** Big word slammed in once at t (scale 1.3 → 1 in 0.16 s), then still until `until` */
export const Slam: React.FC<{
  T: number; t: number; text: string; x: number; y: number; size: number;
  color: string; glow: string; align?: Align; dim?: number; weight?: number; until?: number; stroke?: string;
}> = ({ T, t, text, x, y, size, color, glow, align = "center", dim = 1, weight = 900, until, stroke }) => {
  if (T < t || (until !== undefined && T >= until)) return null;
  const s = 1 + 0.3 * (1 - outCubic((T - t) / 0.16));
  const tx = align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, whiteSpace: "nowrap",
        transform: `translate(${tx}, -50%) scale(${s})`,
        transformOrigin: align === "left" ? "left center" : align === "right" ? "right center" : "center center",
        fontSize: size, fontWeight: weight, letterSpacing: "-0.035em", lineHeight: 1, color,
        opacity: clamp01((T - t) / 0.03) * dim,
        textShadow: `0 0 28px ${glow}, 0 0 90px ${glow}`,
        WebkitTextStroke: stroke ? `5px ${stroke}` : undefined,
      }}
    >
      {text}
    </div>
  );
};

/** Quiet text — fades in over 0.5 s and stays (intros, bridges) */
export const Quiet: React.FC<{ T: number; t: number; text: string; x: number; y: number; size: number; color?: string; until?: number; align?: Align }> = ({
  T, t, text, x, y, size, color = "#fff", until, align = "center",
}) => {
  if (T < t) return null;
  const o = clamp01((T - t) / 0.5) * (until !== undefined ? clamp01((until - T) / 0.5) : 1);
  if (o <= 0) return null;
  const tx = align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(${tx}, -50%)`, whiteSpace: "nowrap", fontSize: size, fontWeight: 600, letterSpacing: "0.02em", color, opacity: o, textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}>
      {text}
    </div>
  );
};

/** The line being sung at T among `lines`: the one that started last (backing vocals can overlap) */
export function liveLine(lines: Line[], T: number, lead = 0.12): Line | undefined {
  let best: Line | undefined;
  for (const l of lines) {
    if (T >= l.words[0].t - lead && T < l.end + 0.05 && (!best || l.words[0].t >= best.words[0].t)) best = l;
  }
  return best;
}

/** Rough rendered width in em: Hangul / CJK full width, Latin about half, spaces a third */
const emWidth = (s: string) =>
  [...s].reduce((a, ch) => a + (/\s/.test(ch) ? 0.3 : /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.62), 0);

/**
 * The whole current line, huge, in the middle of the stage — pops once when the line starts, then each
 * word lights up as it is sung (karaoke). Long lines wrap to two rows. Lines drawn here should be hidden
 * from <Captions>.
 */
export const BigLine: React.FC<{ T: number; lines: Line[]; y?: number; maxSize?: number }> = ({ T, lines, y = 500, maxSize = 180 }) => {
  const { theme } = useSong();
  const vertical = useContext(VerticalCtx);
  const line = liveLine(lines, T, 0.05);
  if (!line) return null;
  const t0 = line.words[0].t - 0.05;
  const maxW = vertical ? 1250 : 1700;
  const u = emWidth(line.text);
  const one = maxW / u;
  const size = one >= 110 ? Math.min(maxSize, one) : Math.min(maxSize * 0.85, (2 * maxW) / (u + 2));
  const s = 1 + 0.3 * (1 - outCubic((T - t0) / 0.16));
  return (
    <div
      style={{
        position: "absolute", left: 960, top: y, width: maxW, transform: `translate(-50%, -50%) scale(${s})`,
        textAlign: "center", wordBreak: "keep-all", fontSize: size, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1,
        opacity: clamp01((T - t0) / 0.03),
      }}
    >
      {line.words.map((w, i) => {
        const sung = T >= w.t;
        return (
          <span key={i} style={{
            color: sung ? theme.bigText : theme.unsung,
            textShadow: sung ? `0 0 28px ${theme.bigGlow}, 0 0 90px ${theme.bigGlow}` : "none",
            marginRight: i < line.words.length - 1 ? "0.25em" : 0,
          }}>
            {w.w}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Karaoke captions at the bottom: the current line, sung words bright. Fixed position. Lines in `hide`
 * (and in the song's captions.hide) are skipped — a scene draws them itself.
 */
export const Captions: React.FC<{ T: number; hide?: Set<string>; size?: number; bottom?: number; padX?: number; band?: boolean }> = ({
  T, hide, size = 62, bottom = 86, padX = 100, band = true,
}) => {
  const { song, theme } = useSong();
  const skip = new Set([...(song.captions?.hide ?? []), ...(hide ?? [])]);
  const line = liveLine(song.lines.filter((l) => !skip.has(l.id)), T);
  if (!line) return null;
  const from = song.captions?.from_word?.[line.id] ?? 0;
  const words = line.words.slice(from);
  if (!words.length || T < words[0].t - 0.12) return null;
  const whisper = (song.captions?.whisper ?? []).includes(line.id);
  return (
    <>
      {band && <AbsoluteFill style={{ background: `linear-gradient(to top, ${withAlpha(theme.bg, 0.82)} 0%, ${withAlpha(theme.bg, 0)} 27%)` }} />}
      <div
        style={{
          position: "absolute", left: padX, right: padX, bottom, textAlign: "center", wordBreak: "keep-all",
          fontSize: whisper ? Math.round(size * 0.7) : size, fontWeight: whisper ? 500 : 800,
          letterSpacing: whisper ? "0.3em" : "-0.01em", lineHeight: 1.2,
          opacity: clamp01((T - (words[0].t - 0.12)) / 0.08),
        }}
      >
        {words.map((w, i) => {
          const sung = T >= w.t;
          return (
            <span key={i} style={{
              color: sung ? theme.sung : theme.unsung,
              textShadow: sung ? `0 0 18px ${theme.sungGlow}` : "none",
              marginRight: i < words.length - 1 ? "0.3em" : 0,
            }}>
              {w.w}
            </span>
          );
        })}
      </div>
    </>
  );
};
