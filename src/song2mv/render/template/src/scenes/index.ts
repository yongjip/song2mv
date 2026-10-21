import type { FC } from "react";

// The scenes the two frames (16:9 and 9:16) draw. Swap these exports to use your own scenes:
//   Scene              — React component of the song time T, drawn on a 1920×1080 stage
//   linesDrawnByScene  — ids of lyric lines the scenes draw themselves, so the bottom captions skip them
//   VerticalScene      — optional: a component of T that draws the whole 1080×1920 9:16 frame, instead of Scene
//                        in a band between the template's sky and title (kit/vertical.tsx lays it out); null keeps
//                        the band
export { LyricScene as Scene, linesDrawnByScene } from "./LyricScene";
export const VerticalScene: FC<{ T: number }> | null = null;
