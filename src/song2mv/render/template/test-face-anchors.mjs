import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { transformSync } = require("esbuild");
const reactURL = pathToFileURL(require.resolve("react")).href;
const load = async (file) => {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8").replaceAll('from "react"', `from "${reactURL}"`);
  const js = transformSync(source, { loader: "tsx", format: "esm", target: "es2022", jsx: "transform" }).code;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};
const { AnchoredCheeks } = await load("src/kit/face-anchors.tsx");
const { Comparison } = await load("src/kit/comparison.tsx");
const style = { offsets: { left: { x: 8, y: 26 }, right: { x: -8, y: 26 } }, rx: 8, ry: 3.5, fill: "pink" };
const ellipses = (svg) => [...svg.matchAll(/<ellipse ([^>]+)>/g)].map((match) =>
  Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));

for (let i = 0; i <= 144; i++) {
  const turn = Math.cos(i / 144 * Math.PI * 2);
  const eyes = {
    left: { x: 18 * turn + 25, y: -12, projection: Math.max(0, Math.min(1, 1 + turn)) },
    right: { x: 18 * turn - 25, y: -12, projection: Math.max(0, Math.min(1, 1 - turn)) },
  };
  const svg = renderToStaticMarkup(React.createElement(AnchoredCheeks, { eyes, style }));
  const marks = ellipses(svg);
  assert.equal(marks.length, 2);
  for (const side of ["left", "right"]) {
    const mark = marks.find((m) => m["data-cheek"] === side);
    assert.ok(mark, "Each anatomical side must keep its own mark through a forward and reverse turn");
    assert.ok(Math.abs(Number(mark.cx) - eyes[side].x - style.offsets[side].x) < 1e-9);
    assert.equal(Number(mark.cy), 14, "The cheek must stay below the same eye");
    assert.equal(Number(mark.rx), 8 * eyes[side].projection);
    assert.equal(Number(mark.opacity), eyes[side].projection);
    assert.ok(!svg.includes("NaN"));
  }
}
const hidden = ellipses(renderToStaticMarkup(React.createElement(AnchoredCheeks, {
  eyes: { left: { x: 1, y: 2, projection: -1 }, right: { x: 3, y: 4, projection: 2 } }, style,
})));
assert.equal(hidden[0].opacity, "0");
assert.equal(hidden[0].rx, "0");
assert.equal(hidden[1].opacity, "1");
const seen = [];
const svg = renderToStaticMarkup(React.createElement(Comparison, {
  T: 1.25, viewBox: { x: -20, y: -30, width: 40, height: 60 },
  labels: ["Control <A>", "Candidate & B"],
  before: (T) => { seen.push(T); return React.createElement("circle", { r: 2 }); },
  after: (T) => { seen.push(T); return React.createElement("rect", { width: 2, height: 2 }); },
}));
assert.deepEqual(seen, [1.25, 1.25]);
assert.equal((svg.match(/viewBox="-20 -30 40 60"/g) ?? []).length, 2);
assert.equal((svg.match(/width="960" height="960"/g) ?? []).length, 2);
assert.ok(svg.includes("Control &lt;A&gt;") && svg.includes("Candidate &amp; B"));
process.stdout.write("Face anchors: 145 turn poses, hidden sides, and synchronized comparison passed\n");
