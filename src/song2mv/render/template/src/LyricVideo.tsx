import React, { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BeatGlow, Captions, FPS, Flash, MvProps, Sky, SongContext, Vignette, flashesOf, makeSongCtx, sectionLook, span } from "./kit";
import { Scene, linesDrawnByScene } from "./scenes";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * 16:9 lyric video. `from` / `to` pick a stretch of the song in seconds (to = null → the end).
 * A video that stops before the song ends fades picture and sound out over its last 0.8 s.
 *
 * hold (seconds) — for hook cuts: the sound starts at `from` right away, but the picture stays frozen
 * on the moment `from + hold` for the first `hold` seconds and then runs on seamlessly. The first
 * frame then already shows the payoff (a fully revealed line). Flashes inside the hold are dropped so
 * the first frame is not washed white.
 */
export const LyricVideo: React.FC<MvProps> = ({ song, from, to, hold }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ctx = useMemo(() => makeSongCtx(song), [song]);
  const hide = useMemo(() => linesDrawnByScene(song), [song]);
  const end = to ?? song.duration;
  const T = Math.max(from + frame / fps, from + hold);
  const { tint, glow, strength } = sectionLook(ctx, T);
  const toEnd = end >= song.duration - 0.05;
  // counted in frames at FPS, also in a draft (fewer fps), whose frames are then the full render's at the same times
  const frames = Math.round((end - from) * FPS);
  const fade = (f: number) => (toEnd ? 1 : interpolate((f * FPS) / fps, [frames - 0.8 * FPS, frames - 1], [1, 0], clamp));
  const flashes = useMemo(() => flashesOf(song).filter(([t]) => hold <= 0 || t < from - 1 || t > from + hold), [song, from, hold]);
  return (
    <SongContext.Provider value={ctx}>
      <AbsoluteFill style={{ background: ctx.theme.bg, overflow: "hidden", fontFamily: ctx.theme.font }}>
        {song.audio && <Audio src={staticFile(song.audio)} trimBefore={Math.round(from * fps)} volume={fade} />}
        <Sky T={T} tint={tint} opacity={span(T, 0, 1.2)} />
        <BeatGlow T={T} color={glow} strength={strength} />
        <Scene T={T} />
        {song.vignette !== false && <Vignette />}
        <Captions T={T} hide={hide} />
        <Flash T={T} flashes={flashes} />
        {!toEnd && <AbsoluteFill style={{ background: "#000", opacity: 1 - fade(frame) }} />}
      </AbsoluteFill>
    </SongContext.Provider>
  );
};
