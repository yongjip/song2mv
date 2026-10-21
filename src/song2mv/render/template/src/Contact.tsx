import React, { useMemo } from "react";
import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { Song, SongContext, VerticalCtx, makeSongCtx } from "./kit";
import { BAND_CY, BAND_SCALE } from "./LyricShort";
import { Scene, VerticalScene } from "./scenes";

/**
 * The song's Scene at each of `times` on one sheet, each frame labelled with its song time: many moments in one
 * render. `vertical` draws the 9:16 frame instead (the VerticalScene, or Scene in the short's band). Each frame is the
 * scene alone on the theme's background, without the frame's sky, captions or vignette. In a template copy:
 *   node render.mjs ../mv.json --composition Contact --props sheet.json      (sheet.json: {"times": [12, 33.1, 47.5]})
 */
export type ContactProps = { song: Song; times: number[]; cols?: number; vertical?: boolean };

const GAP = 12;

function sheet({ times, cols, vertical }: ContactProps) {
  const perRow = Math.max(1, Math.round(cols ?? (vertical ? 6 : 4)));
  const [w, h] = vertical ? [1080, 1920] : [1920, 1080];
  const frameW = (1920 - GAP * (perRow + 1)) / perRow, k = frameW / w, frameH = h * k;
  const label = Math.round(Math.min(30, Math.max(18, frameW / 16)));
  const rowH = frameH + label * 1.5 + GAP;
  const rows = Math.max(1, Math.ceil(times.length / perRow));
  return { perRow, w, h, k, frameW, rowH, label, height: 2 * Math.ceil((GAP + rows * rowH) / 2) };
}

export const contactSize: CalculateMetadataFunction<ContactProps> = ({ props }) => ({ width: 1920, height: sheet(props).height });

export const ContactSheet: React.FC<ContactProps> = (props) => {
  const { song, times, vertical = false } = props;
  const ctx = useMemo(() => makeSongCtx(song), [song]);
  const { perRow, w, h, k, frameW, rowH, label } = sheet(props);
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
                <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden", background: ctx.theme.bg }}>
                  {frame(T)}
                </div>
                <div style={{ position: "absolute", left: x, top: y + h * k + label * 0.2, fontSize: label, lineHeight: 1.1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {T.toFixed(2)} s
                </div>
              </React.Fragment>
            );
          })}
        </AbsoluteFill>
      </VerticalCtx.Provider>
    </SongContext.Provider>
  );
};
