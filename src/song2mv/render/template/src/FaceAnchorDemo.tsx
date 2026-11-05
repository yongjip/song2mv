import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { AnchoredCheeks, CheekStyle, EyeAnchors } from "./kit/face-anchors";
import { Comparison } from "./kit/comparison";

const style: CheekStyle = {
  offsets: { left: { x: 11, y: 29 }, right: { x: -11, y: 29 } },
  rx: 10, ry: 5, fill: "#dd8d91",
};

const eyesAt = (turn: number): EyeAnchors => ({
  left: { x: 25 + 18 * turn, y: -12, projection: Math.min(1, 1 + turn) },
  right: { x: -25 + 18 * turn, y: -12, projection: Math.min(1, 1 - turn) },
});

const Head: React.FC<{ T: number; anchored: boolean; id: string }> = ({ T, anchored, id }) => {
  const turn = Math.cos(Math.max(0, Math.min(3, T)) * Math.PI * 2 / 3);
  const eyes = eyesAt(turn);
  return <g stroke="#55483e" strokeWidth="3" strokeLinejoin="round">
    <defs><clipPath id={id}><ellipse rx="68" ry="78" /></clipPath></defs>
    <ellipse rx="68" ry="78" fill="#f2d7ab" />
    <g clipPath={`url(#${id})`}>
      {anchored ? <AnchoredCheeks eyes={eyes} style={style} /> :
        <ellipse cx={-35 * turn} cy="17" rx="10" ry="5" fill={style.fill} stroke="none" />}
      {Object.entries(eyes).map(([side, eye]) => <ellipse key={side} cx={eye.x} cy={eye.y}
        rx={4 * eye.projection} ry="6" fill="#55483e" stroke="none" />)}
      <path d={`M${turn * 21 - 4} 4q4 5 8 0`} fill="none" />
      <path d="M-11 31q11 10 22 0" fill="none" strokeLinecap="round" />
    </g>
  </g>;
};

export const FaceAnchorComparison: React.FC<{ T: number; id: string }> = ({ T, id }) => <Comparison T={T}
  viewBox={{ x: -100, y: -100, width: 200, height: 200 }}
  labels={["One moving mark", "Two attached cheeks"]}
  before={(t) => <Head T={t} anchored={false} id={`${id}-before`} />}
  after={(t) => <Head T={t} anchored id={`${id}-after`} />} />;

export const FaceAnchorDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <FaceAnchorComparison T={frame / fps} id="face-anchor-demo" />;
};
