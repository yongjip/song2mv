import React, { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BeatGlow, Captions, Flash, MvProps, Sky, SongContext, VerticalCtx, Vignette, flashesOf, makeSongCtx, outCubic, sectionLook, span } from "./kit";
import { Scene, VerticalScene, linesDrawnByScene } from "./scenes";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const BAND_SCALE = 0.76;
export const BAND_CY = 670; // the band ends at y 1080, where the captions start

/**
 * 9:16 short (Reels, YouTube Shorts, TikTok). The full-screen sky and beat glow sit behind the 16:9
 * stage, shrunk to a band (top and bottom edges melted away); the song title is at the top and the
 * lyrics, larger, under the band. Text stays inside x 120–960, y 269–1248, the box clear of the app's
 * buttons and caption overlay on all three: Meta keeps the top 14 %, the bottom 35 % and 6 % at the
 * sides for its UI, YouTube Shorts the top 10 %, the bottom 25 % and the right 10 %, and TikTok, by
 * third-party measurements, the top 240, the bottom 660 and the right 120 px. The bottom 680 px hold
 * only sky. Scenes that read VerticalCtx can stack side-by-side layouts.
 * When scenes/index.ts exports a VerticalScene component (the default exports null), that component
 * draws the whole 1080×1920 frame instead, so the concept's own look reaches the edges: no band, sky,
 * beat glow, title or vignette. Only the captions of lines the scenes don't draw, the flashes and the
 * fade-out go on top. Its text keeps to the same box; its picture can fill the rest, the bottom too.
 * from / to / hold work as in LyricVideo; with hold > 0 the title is on from the first frame.
 */
export const LyricShort: React.FC<MvProps> = ({ song, from, hold }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const ctx = useMemo(() => makeSongCtx(song), [song]);
  const hide = useMemo(() => linesDrawnByScene(song), [song]);
  const T = Math.max(from + frame / fps, from + hold);
  const { tint, glow, strength } = sectionLook(ctx, T);
  const fade = (f: number) => interpolate(f, [durationInFrames - 24, durationInFrames - 1], [1, 0], clamp);
  const titleIn = hold > 0 ? 1 : outCubic(span(T, from + 0.2, from + 0.7));
  const flashes = useMemo(() => flashesOf(song).filter(([t]) => hold <= 0 || t < from - 1 || t > from + hold), [song, from, hold]);
  const { theme } = ctx;
  return (
    <SongContext.Provider value={ctx}>
      <VerticalCtx.Provider value={true}>
        <AbsoluteFill style={{ background: theme.bg, overflow: "hidden", fontFamily: theme.font }}>
          {song.audio && <Audio src={staticFile(song.audio)} trimBefore={Math.round(from * fps)} volume={fade} />}
          {VerticalScene ? (
            <VerticalScene T={T} />
          ) : (
            <>
              {/* full-screen sky: the 16:9 sky scaled up to cover the height */}
              <div style={{ position: "absolute", left: "50%", top: "50%", width: 1920, height: 1080, transform: "translate(-50%, -50%) scale(1.78)" }}>
                <Sky T={T} tint={tint} />
              </div>
              <BeatGlow T={T} color={glow} strength={strength} />
              {/* the stage band */}
              <div
                style={{
                  position: "absolute", left: "50%", top: BAND_CY, width: 1920, height: 1080,
                  transform: `translate(-50%, -50%) scale(${BAND_SCALE})`,
                  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 9%, #000 91%, transparent 100%)",
                  maskImage: "linear-gradient(to bottom, transparent 0%, #000 9%, #000 91%, transparent 100%)",
                }}
              >
                <Sky T={T} tint={tint} />
                <BeatGlow T={T} color={glow} strength={strength} />
                <Scene T={T} />
                {song.vignette !== false && <Vignette />}
              </div>
              {/* title (still) */}
              {song.title && (
                <div style={{ position: "absolute", left: 140, right: 140, top: 280, textAlign: "center", opacity: titleIn, transform: `translateY(${(1 - titleIn) * 14}px)` }}>
                  <div style={{ fontSize: 78, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, color: theme.title, textShadow: `0 0 28px ${theme.titleGlow}, 0 0 80px ${theme.titleGlow}` }}>{song.title}</div>
                  {song.subtitle && <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "0.22em", color: theme.subtitle, marginTop: 10 }}>{song.subtitle}</div>}
                </div>
              )}
            </>
          )}
          {/* lyrics the scenes don't draw, under the band, inside the safe box: up to two rows end at y 1240 */}
          <Captions T={T} hide={hide} size={66} bottom={680} padX={150} band={false} />
          <Flash T={T} flashes={flashes} />
          <AbsoluteFill style={{ background: "#000", opacity: 1 - fade(frame) }} />
        </AbsoluteFill>
      </VerticalCtx.Provider>
    </SongContext.Provider>
  );
};
