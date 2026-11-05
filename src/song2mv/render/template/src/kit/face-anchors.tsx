import React from "react";

export type FaceSide = "left" | "right";
export type FacePoint = Readonly<{ x: number; y: number }>;
export type EyeAnchor = FacePoint & Readonly<{ projection: number }>;
export type EyeAnchors = Readonly<Record<FaceSide, EyeAnchor>>;
export type CheekStyle = Readonly<{
  offsets: Readonly<Record<FaceSide, FacePoint>>;
  rx: number;
  ry: number;
  fill: string;
}>;

export function cheekAnchors(eyes: EyeAnchors, style: CheekStyle) {
  const at = (side: FaceSide) => {
    const eye = eyes[side];
    const projection = Math.max(0, Math.min(1, eye.projection));
    return {
      cx: eye.x + style.offsets[side].x,
      cy: eye.y + style.offsets[side].y,
      rx: style.rx * projection,
      ry: style.ry,
      opacity: projection,
    };
  };
  return { left: at("left"), right: at("right") };
}

/** Sides name the character's anatomy, even when a head turns or is mirrored. */
export const AnchoredCheeks: React.FC<{ eyes: EyeAnchors; style: CheekStyle }> = ({ eyes, style }) => {
  const cheeks = cheekAnchors(eyes, style);
  return <g fill={style.fill} stroke="none">
    <ellipse data-cheek="left" {...cheeks.left} />
    <ellipse data-cheek="right" {...cheeks.right} />
  </g>;
};
