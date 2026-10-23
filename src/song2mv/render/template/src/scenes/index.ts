// The scenes the two frames (16:9 and 9:16) draw. Swap this export to use your own scenes:
//   Scene              — React component of the song time T, drawn on a 1920×1080 stage
//   linesDrawnByScene  — ids of lyric lines the scenes draw themselves, so the bottom captions skip them
//   VerticalScene      — a component of T that draws the whole 1080×1920 9:16 frame, instead of Scene in a band
//                        between the template's sky and title (kit/vertical.tsx lays it out); null keeps the band
// The starter (Starter.tsx) films kit worlds through planned shots that pass `song2mv check`. To start from it:
//   export { Starter as Scene, StarterTall as VerticalScene, linesDrawnByScene } from "./Starter";
export { LyricScene as Scene, VerticalScene, linesDrawnByScene } from "./LyricScene";
