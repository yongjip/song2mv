import React, { useMemo } from "react";
import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { Song, SongContext, VERTICAL, VerticalCtx, WIDE, makeSongCtx, useFonts } from "./kit";
import { BAND_CY, BAND_SCALE } from "./LyricShort";
import { Scene, VerticalScene } from "./scenes";

/**
 * The song's Scene at each of `times` on one sheet, each frame labelled with its song time: many moments in one
 * render. `vertical` draws the 9:16 frame instead (the VerticalScene, or Scene in the short's band). Each frame is the
 * scene alone on the theme's background, without the frame's sky, captions or vignette. In a template copy:
 *   node render.mjs ../mv.json --composition Contact --props sheet.json      (sheet.json: {"times": [12, 33.1, 47.5]})
 * `crop: [x, y, w, h]`, in the frame's pixels (1920×1080, or 1080×1920 with `vertical`), shows only that region,
 * scaled to the tile's width: `cols` sets the zoom, and each label shows it. A whole frame shows the top of the
 * template's captions as a dashed line, and a 9:16 frame the safe box for text too (WIDE and VERTICAL in the kit): a
 * subject belongs above the line. A crop leaves them out, so they don't cross the details it is for.
 */
export type ContactProps = { song: Song; times: number[]; cols?: number; vertical?: boolean; crop?: [number, number, number, number] };

const GAP = 12;

/** The captions' top, and the 9:16 safe box, as dashed lines, 3 sheet px wide on a frame scaled by `k` */
const SafeLines: React.FC<{ k: number; vertical: boolean }> = ({ k, vertical }) => {
  const { w, h, safe, captions } = vertical ? VERTICAL : { ...WIDE, safe: null };
  const d = safe
    ? `M${safe.left} ${safe.top}H${safe.right}V${safe.bottom}H${safe.left}Z M${safe.left} ${captions.top}H${safe.right}`
    : `M0 ${captions.top}H${w}`;
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={3 / k} />
      <path d={d} fill="none" stroke="#fff" strokeWidth={1.5 / k} strokeDasharray={`${8 / k} ${6 / k}`} />
    </svg>
  );
};

function sheet({ times, cols, vertical, crop }: ContactProps) {
  const perRow = Math.max(1, Math.round(cols ?? (vertical ? 6 : 4)));
  const [w, h] = vertical ? [1080, 1920] : [1920, 1080];
  const [cx, cy, cw, ch] = crop ? [crop[0], crop[1], Math.max(1, crop[2]), Math.max(1, crop[3])] : [0, 0, w, h];
  const frameW = (1920 - GAP * (perRow + 1)) / perRow, k = frameW / cw, frameH = ch * k;
  const label = Math.round(Math.min(30, Math.max(18, frameW / 16)));
  const rowH = frameH + label * 1.5 + GAP;
  const rows = Math.max(1, Math.ceil(times.length / perRow));
  return { perRow, w, h, cx, cy, cw, ch, k, frameW, frameH, rowH, label, height: 2 * Math.ceil((GAP + rows * rowH) / 2) };
}

export const contactSize: CalculateMetadataFunction<ContactProps> = ({ props }) => ({ width: 1920, height: sheet(props).height });

export const ContactSheet: React.FC<ContactProps> = (props) => {
  const { song, times, vertical = false, crop } = props;
  const ctx = useMemo(() => makeSongCtx(song), [song]);
  useFonts(ctx.theme.font);
  const { perRow, w, h, cx, cy, cw, ch, k, frameW, frameH, rowH, label } = sheet(props);
  const clip = `inset(${[cy, w - cx - cw, h - cy - ch, cx].map((v) => `${Math.max(0, v)}px`).join(" ")})`;
  const frame = (T: number) => {
    if (!vertical) return <Scene T={T} />;
    if (VerticalScene) return <VerticalScene T={T} />;
    return (
      <div style={{ position: "absolute", left: "50%", top: BAND_CY, width: 1920, height: 1080, transform: `translate(-50%, -50%) scale(${BAND_SCALE})` }}>
        <Scene T={T} />
      </div>
    );
  };
  return (
    <SongContext.Provider value={ctx}>
      <VerticalCtx.Provider value={vertical}>
        <AbsoluteFill style={{ background: "#202124", fontFamily: ctx.theme.font, color: "#fff" }}>
          {times.map((T, i) => {
            const x = GAP + (i % perRow) * (frameW + GAP), y = GAP + Math.floor(i / perRow) * rowH;
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: "absolute", left: x, top: y, width: w, height: h,
                    transform: crop ? `scale(${k}) translate(${-cx}px, ${-cy}px)` : `scale(${k})`, transformOrigin: "0 0",
                    overflow: "hidden", clipPath: crop && clip, background: ctx.theme.bg,
                  }}
                >
                  {frame(T)}
                  {!crop && <SafeLines k={k} vertical={vertical} />}
                </div>
                <div style={{ position: "absolute", left: x, top: y + frameH + label * 0.2, fontSize: label, lineHeight: 1.1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {T.toFixed(2)} s{crop && ` · ${k.toFixed(2)}×`}
                </div>
              </React.Fragment>
            );
          })}
        </AbsoluteFill>
      </VerticalCtx.Provider>
    </SongContext.Provider>
  );
};
