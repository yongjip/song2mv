import React, {useId} from 'react';

type Point = {x: number; y: number};
const point = (x: number, y: number): Point => ({x, y});
const ink = '#302730';
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const mix = (a: Point, b: Point, t: number): Point => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

function section(y: number) {
  const t = clamp((y + 61) / 79, 0, 1);
  const width = y < -50 ? 25 + 10 * clamp((y + 61) / 11, 0, 1) : 35 + 1.7 * Math.sin(t * Math.PI) - 4 * t ** 3;
  const depth = 14 + 9 * Math.sin(Math.PI * (t * .83 + .08));
  return {width, depth};
}

function boundary(y: number, cosine: number, sine: number) {
  const {width, depth} = section(y);
  return Math.hypot(width * cosine, depth * sine);
}

function samplePolygon(vertices: Point[], subdivisions = 7) {
  const result: Point[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const next = vertices[(i + 1) % vertices.length];
    for (let j = 0; j < subdivisions; j++) result.push(mix(vertices[i], next, j / subdivisions));
  }
  return result;
}

function cubic(a: Point, b: Point, c: Point, d: Point, steps = 16) {
  return Array.from({length: steps}, (_, i) => {
    const t = i / (steps - 1), u = 1 - t;
    return point(u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y);
  });
}

function surface(yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const facing = (p: Point) => {
    const {width, depth} = section(p.y), u = clamp(p.x / width, -.995, .995);
    return Math.sqrt(1 - u * u) / depth * c - u / width * s;
  };
  const project = (p: Point, standOff = 0): Point => {
    const {width, depth} = section(p.y), x = clamp(p.x, -width * .995, width * .995);
    const z = depth * Math.sqrt(1 - (x / width) ** 2) + standOff;
    return point(x * c + z * s, p.y);
  };
  const visible = (vertices: Point[]) => {
    const result: Point[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length], fa = facing(a), fb = facing(b);
      if (fa >= 0) result.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        let lo = 0, hi = 1;
        for (let step = 0; step < 18; step++) {
          const mid = (lo + hi) / 2;
          if ((facing(mix(a, b, mid)) >= 0) === (fa >= 0)) lo = mid;
          else hi = mid;
        }
        result.push(mix(a, b, (lo + hi) / 2));
      }
    }
    return result;
  };
  const path = (vertices: Point[], standOff = 0) => {
    const points = visible(vertices).map(p => project(p, standOff));
    return points.length < 3 ? '' : points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join('') + 'Z';
  };
  return {c, s, path, project};
}

export function AntBodyViews({yaw,appearance='lead'}: {yaw: number;appearance?:'lead'|'guitarist'|'drummer'}) {
  if (!Number.isFinite(yaw)) throw new RangeError('Body view yaw must be finite');
  const id = useId(), view = surface(yaw), {c, s} = view;
  const top = boundary(-57, c, s), shoulder = boundary(-50, c, s), middle = boundary(-27, c, s), hem = boundary(14, c, s);
  const shape = `M${-top} -57Q${-top * .52} -64 0 -61Q${top * .57} -64 ${top} -57Q${shoulder + 3} -47 ${middle} -26L${hem} 13Q${hem * .55} 20 0 19Q${-hem * .55} 20 ${-hem} 13L${-middle} -26Q${-shoulder - 3} -47 ${-top} -57Z`;
  const frontShirt = view.path(samplePolygon([
    point(-17, -61), point(0, -53), point(17, -61), point(12, -41), point(6, -29),
    point(5, -9), point(7, 19), point(-7, 19), point(-5, -9), point(-6, -29), point(-12, -41),
  ]));
  const leftCollar = view.path(samplePolygon([point(-18, -61), point(6, -39), point(0, -31), point(-25, -52)]), .8);
  const rightCollar = view.path(samplePolygon([point(18, -61), point(-4, -41), point(2, -33), point(25, -52)]), 1.0);
  const leftLoop = cubic(point(-1, -27), point(-23, -39), point(-24, -20), point(-1, -25));
  const rightLoop = cubic(point(1, -27), point(21, -39), point(23, -20), point(1, -25));
  const leftTail = view.path(samplePolygon([point(-2, -26), point(-10, -4), point(-2, -6), point(3, -26)]), 1.5);
  const rightTail = view.path(samplePolygon([point(2, -26), point(9, -7), point(17, -10), point(7, -28)]), 1.6);
  const knot = view.path(samplePolygon([point(-3, -30), point(4, -30), point(6, -23), point(-3, -23)]), 2.4);
  const backAmount = clamp(-c * 2, 0, 1), backSeamX = -section(-18).depth * s;
  const highlightX = -middle * .67;
  return <g data-art="ant-body-views" data-view-yaw={yaw} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id={`${id}-vest`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor={appearance==='lead'?'#b77584':appearance==='guitarist'?'#73a5a1':'#c59c5d'}/><stop offset=".5" stopColor={appearance==='lead'?'#93586b':appearance==='guitarist'?'#497f80':'#9d7849'}/><stop offset="1" stopColor={appearance==='lead'?'#673d52':appearance==='guitarist'?'#32575e':'#71523e'}/>
      </linearGradient>
      <linearGradient id={`${id}-cream`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff4dc"/><stop offset=".6" stopColor="#f0ddba"/><stop offset="1" stopColor="#d2b58d"/>
      </linearGradient>
      <clipPath id={`${id}-body-clip`}><path d={shape}/></clipPath>
    </defs>
    <path d={shape} fill={`url(#${id}-vest)`} stroke={ink} strokeWidth={2.35}/>
    <g clipPath={`url(#${id}-body-clip)`}>
      <path d={`M${highlightX} -43Q${highlightX - 3} -20 ${highlightX - 1} 7`} fill="none" stroke="#d895a1" strokeWidth={1.55} opacity={.64}/>
      <path d={`M${middle * .65} -29Q${middle * .70} -9 ${hem * .64} 9`} fill="none" stroke="#522e42" strokeWidth={1.65} opacity={.58}/>
      <path d={`M${-hem - 2} 8Q0 18 ${hem + 2} 8V24H${-hem - 2}Z`} fill="#422d3e" opacity={.13}/>
      {frontShirt && <path d={frontShirt} fill={`url(#${id}-cream)`} stroke={ink} strokeWidth={1.7}/>}
      {leftCollar && <path d={leftCollar} fill="#fff1d7" stroke={ink} strokeWidth={1.9}/>}
      {rightCollar && <path d={rightCollar} fill="#e7ceaa" stroke={ink} strokeWidth={1.9}/>}
      <path d={`M${-hem + 4} 10Q0 18 ${hem - 4} 10`} fill="none" stroke="#e1acb6" strokeWidth={1.3} opacity={.7}/>
      <g opacity={backAmount} fill="none">
        <path d={`M${backSeamX} -53Q${backSeamX - 2} -15 ${backSeamX} 11`} stroke="#5d374d" strokeWidth={1.7}/>
        <path d={`M${backSeamX + 2.7} -48Q${backSeamX + 1} -16 ${backSeamX + 2} 7`} stroke="#bc8090" strokeWidth={1.1}/>
      </g>
    </g>
    <g fill={`url(#${id}-cream)`} stroke={ink} strokeWidth={1.65}>
      {leftTail && <path d={leftTail}/>}
      {rightTail && <path d={rightTail}/>}
      {view.path(leftLoop, 2) && <path d={view.path(leftLoop, 2)}/>}
      {view.path(rightLoop, 2) && <path d={view.path(rightLoop, 2)}/>}
      {knot && <path d={knot} fill="#fff0d3"/>}
    </g>
  </g>;
}
