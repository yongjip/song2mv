import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, inOut, lerp } from "./math";

/**
 * A camera for one world filmed as shots. Draw the world once, at its own coordinates on the stage, and let the
 * camera frame it: a shot looks at a point with a zoom and a roll, cuts to the next shot at a song time (a bar or a
 * word), may drift during the shot (a slow push, pan or roll) and may glide instead of cutting. On hits the frame
 * punches in and settles.
 *
 *   const { grid } = useSong();
 *   <Camera T={T} hits={[grid.bar(4)]} shots={[
 *     { t: grid.bar(0), x: 960, y: 540, to: { zoom: 1.08 } },             // wide, pushing in slowly
 *     { t: grid.bar(2), x: 700, y: 620, zoom: 2.4 },                       // cut to a close-up on the bar
 *     { t: line.words[3].t, x: 1300, y: 400, zoom: 1.6, rotate: -6 },      // cut on a word, rolled
 *     { t: grid.bar(6), x: 960, y: 540, glide: 1.2 },                      // glide back out
 *   ]}>
 *     <Svg>…the world…</Svg>
 *   </Camera>
 *
 * Keep text outside the camera: a punch or a roll would move it while it is read. When a shot rolls or zooms out
 * (zoom < 1), draw the world past the stage's edges, or the frame shows its border. Everything is a pure function of
 * T, so a render can start anywhere in the song.
 */

export type Shot = {
  /** when the shot starts (a cut), in song time: put cuts on bars (`grid.bar(k)`) or on a word's `t` */
  t: number;
  /** the stage point at the middle of the frame */
  x: number;
  y: number;
  /** 1 frames a stage's worth of the world, 2 half as much (twice as close). Default 1 */
  zoom?: number;
  /** roll in degrees, + turns the picture clockwise. Default 0 */
  rotate?: number;
  /** where the shot has drifted to by the next cut (at a constant speed); values left out hold still */
  to?: { x?: number; y?: number; zoom?: number; rotate?: number };
  /** seconds to glide (ease) from where the previous shot was, instead of a hard cut. Default 0 */
  glide?: number;
};

export type CameraView = {
  /** the stage point at the middle of the frame, the zoom (with the punch) and the roll at T */
  x: number; y: number; zoom: number; rotate: number;
  /** index of the shot on screen (in time order) */
  shot: number;
  /** the camera as an SVG transform, for <g transform={…}> inside an <Svg> */
  svg: string;
  /** the camera as a CSS transform (transform-origin 0 0), what <Camera> uses */
  css: string;
};

type Frame = { x: number; y: number; zoom: number; rotate: number };

/** How long the last shot's drift (`to`) takes, in seconds: it has no next cut to end at */
const LAST_SHOT = 4;
/** How fast a punch settles (s) */
const PUNCH_TAU = 0.13;

/** zoom moves in equal ratios (1 → 2 → 4 feels even), not in equal steps */
const zlerp = (a: number, b: number, k: number) => a * Math.pow(b / a, k);

/** Shot i of `shots` (sorted) at time T, its drift included, without the glide */
function frameOf(shots: Shot[], i: number, T: number): Frame {
  const s = shots[i];
  const z = Math.max(0.05, s.zoom ?? 1), r = s.rotate ?? 0;
  if (!s.to) return { x: s.x, y: s.y, zoom: z, rotate: r };
  const end = i + 1 < shots.length ? shots[i + 1].t : s.t + LAST_SHOT;
  const k = clamp01((T - s.t) / Math.max(1e-3, end - s.t));
  return {
    x: lerp(s.x, s.to.x ?? s.x, k),
    y: lerp(s.y, s.to.y ?? s.y, k),
    zoom: zlerp(z, Math.max(0.05, s.to.zoom ?? z), k),
    rotate: lerp(r, s.to.rotate ?? r, k),
  };
}

/**
 * Where the camera is at T: the shot on screen, its drift, a glide from the previous shot, and the punch of the
 * latest hit. `hits` are song times (a kick, a slam, a word); `punch` is how far a hit zooms in (0.05 = 5 %);
 * `w` × `h` is the frame (1920 × 1080; 1080 × 1920 for a VerticalScene). Use it to place things by the camera, or
 * to film inside an <Svg> with <g transform={cameraAt(…).svg}>.
 */
export function cameraAt(
  T: number, shots: Shot[], o: { hits?: number[]; punch?: number; w?: number; h?: number } = {},
): CameraView {
  const { hits = [], punch = 0.05, w = 1920, h = 1080 } = o;
  const list = [...shots].sort((a, b) => a.t - b.t);
  let i = 0;
  while (i + 1 < list.length && list[i + 1].t <= T) i++;
  let f: Frame = list.length ? frameOf(list, i, T) : { x: w / 2, y: h / 2, zoom: 1, rotate: 0 };
  const g = list[i]?.glide ?? 0;
  if (g > 0 && i > 0 && T < list[i].t + g) {
    const from = frameOf(list, i - 1, list[i].t);
    const k = inOut((T - list[i].t) / g);
    f = { x: lerp(from.x, f.x, k), y: lerp(from.y, f.y, k), zoom: zlerp(from.zoom, f.zoom, k), rotate: lerp(from.rotate, f.rotate, k) };
  }
  // a punch jumps in on the hit's frame and settles; the latest hit wins
  let kick = 0;
  for (const t of hits) if (T >= t && T < t + 1) kick = Math.max(kick, Math.exp(-(T - t) / PUNCH_TAU));
  const zoom = f.zoom * (1 + punch * kick);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const [cx, cy, x, y, z, rot] = [w / 2, h / 2, f.x, f.y, zoom, f.rotate].map(r);
  return {
    x, y, zoom: z, rotate: rot, shot: i,
    svg: `translate(${cx} ${cy}) rotate(${rot}) scale(${z}) translate(${-x} ${-y})`,
    css: `translate(${cx}px, ${cy}px) rotate(${rot}deg) scale(${z}) translate(${-x}px, ${-y}px)`,
  };
}

/**
 * Films its children (any layers: <Svg>, full-stage backgrounds) through the shots; see the top of this file.
 * `hits` punch the frame in by `punch` (0.05 = 5 %); `w` × `h` is the frame size, 1920 × 1080 by default.
 */
export const Camera: React.FC<{
  T: number; shots: Shot[]; hits?: number[]; punch?: number; w?: number; h?: number; children: React.ReactNode;
}> = ({ T, shots, hits, punch, w, h, children }) => {
  const cam = cameraAt(T, shots, { hits, punch, w, h });
  return <AbsoluteFill style={{ transform: cam.css, transformOrigin: "0 0" }}>{children}</AbsoluteFill>;
};
