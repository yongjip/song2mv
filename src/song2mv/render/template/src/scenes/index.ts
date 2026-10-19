// The scene both frames (16:9 and 9:16) draw. Swap these two exports to use your own scenes:
//   Scene              — React component of the song time T, drawn on a 1920×1080 stage
//   linesDrawnByScene  — ids of lyric lines the scene draws itself, so the bottom captions skip them
export { LyricScene as Scene, linesDrawnByScene } from "./LyricScene";
