import React from "react";
import {Img} from "remotion";
import type {FigurePoint} from "./figure-motion";

export type AtlasCell = {x:number;y:number;width:number;height:number};
export type AtlasSource = {src:string;width:number;height:number};
export type AtlasPiece = {cell:AtlasCell;pivot:FigurePoint};
export type AtlasBone = {cell:AtlasCell;start:FigurePoint;end:FigurePoint;width:number};

function validateCell(atlas:AtlasSource,cell:AtlasCell) {
  if(![atlas.width,atlas.height,cell.x,cell.y,cell.width,cell.height].every(Number.isFinite)||
    atlas.width<=0||atlas.height<=0||cell.width<=0||cell.height<=0||cell.x<0||cell.y<0||
    cell.x+cell.width>atlas.width||cell.y+cell.height>atlas.height)throw new RangeError("Atlas cell must fit finite positive image dimensions");
}
function validateAnchor(anchor:FigurePoint,cell:AtlasCell) {
  if(!anchor.every(Number.isFinite)||anchor[0]<cell.x||anchor[1]<cell.y||anchor[0]>cell.x+cell.width||anchor[1]>cell.y+cell.height)
    throw new RangeError("Atlas anchor must lie inside its cell");
}
function validateSize(width:number,height:number) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError("Atlas output dimensions must be finite and positive");
}

function AtlasCrop({atlas,cell}:{atlas:AtlasSource;cell:AtlasCell}) {
  return <svg x={cell.x} y={cell.y} width={cell.width} height={cell.height} viewBox={`${cell.x} ${cell.y} ${cell.width} ${cell.height}`} overflow="hidden">
    <foreignObject width={atlas.width} height={atlas.height}>
      <Img src={atlas.src} style={{display:"block",width:atlas.width,height:atlas.height}}/>
    </foreignObject>
  </svg>;
}
/** Crop at render time: original alpha pixels remain unchanged. pivot is an absolute atlas coordinate. */
export function AtlasSprite({atlas,piece,width,height}:{atlas:AtlasSource;piece:AtlasPiece;width:number;height:number}) {
  validateCell(atlas,piece.cell);validateAnchor(piece.pivot,piece.cell);validateSize(width,height);
  const sx=width/piece.cell.width,sy=height/piece.cell.height;
  return <g transform={`scale(${sx} ${sy}) translate(${-piece.pivot[0]} ${-piece.pivot[1]})`}><AtlasCrop atlas={atlas} cell={piece.cell}/></g>;
}
/** Maps two painted joint anchors onto local (0,0) and (0,length), independently of the image's initial angle. */
export function atlasBoneMatrix(bone:AtlasBone,length:number,width:number):readonly [number,number,number,number,number,number] {
  validateAnchor(bone.start,bone.cell);validateAnchor(bone.end,bone.cell);validateSize(width,length);validateSize(bone.width,1);
  const [ax,ay]=bone.start,[bx,by]=bone.end,dx=bx-ax,dy=by-ay,distance=Math.hypot(dx,dy);
  if(distance===0)throw new RangeError("Atlas bone anchors must be distinct");
  const across=width/bone.width,along=length/distance;
  const a=dy/distance*across,c=-dx/distance*across,b=dx/distance*along,d=dy/distance*along;
  return [a,b,c,d,-a*ax-c*ay,-b*ax-d*ay];
}
export function AtlasSegment({atlas,bone,length,width}:{atlas:AtlasSource;bone:AtlasBone;length:number;width:number}) {
  validateCell(atlas,bone.cell);
  const matrix=atlasBoneMatrix(bone,length,width);
  return <g transform={`matrix(${matrix.join(" ")})`}><AtlasCrop atlas={atlas} cell={bone.cell}/></g>;
}
