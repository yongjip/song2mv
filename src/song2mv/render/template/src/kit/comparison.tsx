import React from "react";

export type ComparisonProps = {
  T: number;
  before: (T: number) => React.ReactNode;
  after: (T: number) => React.ReactNode;
  viewBox: Readonly<{ x: number; y: number; width: number; height: number }>;
  labels?: readonly [string, string];
};

/** Both drawings receive the same song time, crop, and viewport size. */
export const Comparison: React.FC<ComparisonProps> = ({ T, before, after, viewBox, labels = ["Before", "After"] }) => {
  const box = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#f5efe2" />
    <path d="M960 0V1080" stroke="#c9bdad" strokeWidth="2" />
    {[0, 1].map((i) => <text key={i} x={480 + i * 960} y="70" textAnchor="middle"
      fill="#403c38" fontFamily="sans-serif" fontSize="36">{labels[i]}</text>)}
    <svg x="0" y="120" width="960" height="960" viewBox={box} overflow="hidden">{before(T)}</svg>
    <svg x="960" y="120" width="960" height="960" viewBox={box} overflow="hidden">{after(T)}</svg>
  </svg>;
};
