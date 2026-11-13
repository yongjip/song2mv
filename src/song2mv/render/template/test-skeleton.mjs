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
const S = await load("src/kit/skeleton.tsx");

// an invented toddler, 81 cm, 4 heads tall
const B = {
  head: 0.205, neck: 0.02, chest: 0.25, shoulderHalf: 0.095, shoulderDrop: 0.035, hipHalf: 0.055,
  upperArm: 0.12, forearm: 0.1, hand: 0.068, thigh: 0.15, shin: 0.14, ankle: 0.045, foot: 0.125,
  armR: [0.034, 0.027, 0.022], legR: [0.05, 0.038, 0.029], chestR: [0.11, 0.085], hipR: [0.105, 0.08],
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cam = { eye: [0, 0.8, 3], at: [0, 0.5, 0], fov: 40 };
const stand = (yaw = 0, hands) => {
  const r = [-Math.cos(yaw), 0, Math.sin(yaw)];
  const side = (s, y) => [r[0] * s * 0.12, y, r[2] * s * 0.12];
  return { at: [0, 0, 0], yaw, hands: hands ?? { l: side(-1, 0.33), r: side(1, 0.33) },
    feet: { l: { at: [r[0] * -0.055, 0, r[2] * -0.055], yaw }, r: { at: [r[0] * 0.055, 0, r[2] * 0.055], yaw } } };
};

// bones keep their lengths whatever the target; one out of reach leaves the hand short, never a longer arm
for (const target of [[0.5, 0.6, 0.3], [0.05, 0.9, 0.2], [2, 2, 2], [0.1, 0.45, 0.05]]) {
  const s = S.pose3(B, { ...stand(), hands: { l: target, r: target } }, cam);
  for (const side of ["l", "r"]) {
    const a = s.world.arms[side];
    assert.ok(Math.abs(dist(a.shoulder, a.elbow) - B.upperArm) < 1e-6, "upper arm length");
    assert.ok(Math.abs(dist(a.elbow, a.wrist) - B.forearm) < 1e-6, "forearm length");
    const gap = dist(a.wrist, target);
    assert.ok(Math.abs(gap - a.short) < 2e-3 || gap < 2e-3, `short ${a.short} vs gap ${gap}`);
  }
}

// a part twice as far in front of the camera is drawn half as big
const ahead = (d) => S.project(S.add(cam.eye, S.mul(S.norm(S.sub(cam.at, cam.eye)), d)), cam);
assert.ok(Math.abs(ahead(2).k / ahead(4).k - 2) < 1e-9);

// view names say which way on screen a part faces: a figure turning to its own left faces screen right
for (const [yaw, view] of [[0, "front"], [Math.PI / 4, "q-right"], [-Math.PI / 4, "q-left"], [Math.PI / 2, "right"], [-Math.PI / 2, "left"], [Math.PI, "back"]]) {
  const s = S.pose3(B, stand(yaw), cam);
  assert.equal(s.torso.view, view, `torso at yaw ${yaw}`);
  assert.equal(s.head.view, view, `head at yaw ${yaw}`);
}
// a head pitched up at a camera above looks level at it; a level head seen from above shows its crown (down)
const high = { eye: [0, 1.6, 0.6], at: [0, 0.4, 0], fov: 50 };
assert.equal(S.pose3(B, { ...stand(), headPitch: 0.9 }, high).head.pitch, "level");
assert.equal(S.pose3(B, stand(), high).head.pitch, "down");
assert.equal(S.pose3(B, stand(), { eye: [0, 0.1, 1], at: [0, 0.6, 0], fov: 50 }).head.pitch, "up");

// an arm reaching at the camera is foreshortened; hanging, it is not
const reach = S.pose3(B, stand(0, { l: [0.1, 0.55, 0.3], r: [-0.1, 0.55, 0.3] }), { eye: [0, 0.55, 1.2], at: [0, 0.5, 0], fov: 40 });
assert.ok(reach.arm("l").foreRatio < 0.45, `reaching forearm ratio ${reach.arm("l").foreRatio}`);
assert.ok(S.pose3(B, stand(), cam).arm("l").foreRatio > 0.85);

// a bent wrist points the fingers where asked, whatever the forearm does
const bent = S.pose3(B, { ...stand(), fingers: { l: [0, 1, 0] } }, cam).world.arms.l.hand;
assert.ok(S.dot(S.mul(bent.u, -1), [0, 1, 0]) > 0.999, "fingers follow the wrist bend");
// a hand turns end-on ("tips") only within about 25 degrees of the line of sight: 35 degrees off it keeps its drawing
const pointing = (deg) => {
  const r = (deg * Math.PI) / 180, sh = S.pose3(B, stand(), cam).world.arms.l.shoulder;
  const toCam = S.norm(S.sub(cam.eye, sh)), side = S.norm(S.cross(toCam, [0, 1, 0]));
  const dir = S.norm(S.add(S.mul(toCam, Math.cos(r)), S.mul(side, Math.sin(r))));
  return S.pose3(B, { ...stand(), hands: { l: S.add(sh, S.mul(dir, 0.215)), r: [-0.12, 0.33, 0] } }, cam).arm("l").handView;
};
assert.equal(pointing(10), "tips");
assert.notEqual(pointing(35), "tips");

// a foot flat on the floor never shows its sole to a camera above the floor; tipped heel-up toward the camera it does
assert.notEqual(S.pose3(B, stand(), cam).leg("l").footView, "sole");
const kick = stand(Math.PI);
kick.feet.l = { at: [0.055, 0.12, -0.15], yaw: Math.PI, pitch: 1.4 };
assert.equal(S.pose3(B, kick, cam).leg("l").footView, "sole");
// a three-quarter foot is a side view, not a toe view
assert.match(S.pose3(B, stand(0.75), cam).leg("r").footView, /^(left|right)$/);

// a planted foot stays where it landed, also when it rolls onto its toe
const run = (t) => S.gait(t, { from: [0, 0, 0], dir: [0, 0, 1], dist: (t) => 1.2 * t, step: 0.38, stance: 0.4, halfWidth: 0.05, lift: 0.06, run: true });
for (let f = 1; f < 90; f++) for (const s of ["l", "r"]) {
  const a = run((f - 1) / 30)[s], b = run(f / 30)[s];
  if (a.phase === "plant" && b.phase === "plant") assert.ok(dist(a.at, b.at) < 1e-9, `planted foot slid at frame ${f}`);
}
// a stop: the last two footfalls land side by side and stay down
const stop = (t) => S.strides(t, { phase: (t) => Math.min(t * 3, 6), spot: (k) => [0, 0, 0.3 * Math.min(k, 5)], stance: (k) => (k >= 4 ? 1 : 0.4),
  flat: (k) => k >= 4, dir: [0, 0, 1], halfWidth: 0.05, lift: 0.06 });
const end = stop(3);
assert.equal(end.l.phase, "plant"); assert.equal(end.r.phase, "plant");
assert.ok(Math.abs(end.l.at[2] - end.r.at[2]) < 0.31 && end.l.at[1] === 0 && end.r.at[1] === 0 && end.l.pitch === 0 && end.r.pitch === 0);

// a torso drawn through rings keeps one outline as it turns: its width changes smoothly, never by a swap
const rings = [[0.24, 0.05, 0.045], [0.22, 0.094, 0.056], [0.15, 0.106, 0.085], [0.05, 0.12, 0.1], [-0.015, 0.106, 0.088]];
let last = null;
for (let i = 0; i <= 90; i++) {
  const s = S.pose3(B, stand((i / 90) * Math.PI), cam), h = S.hullOf(s.world.chest, rings, cam);
  const w = Math.max(...h.map((p) => p.x)) - Math.min(...h.map((p) => p.x));
  if (last !== null) assert.ok(Math.abs(w / last - 1) < 0.05, `torso width jumped at ${i}°`);
  last = w;
}

// a view holds: a one- or two-frame flicker across a bin's border is not shown; a change that lasts is, `hold` frames late
const flicker = (t) => (Math.round(t * 30) % 10 === 5 || Math.round(t * 30) === 16 ? "q-right" : Math.round(t * 30) >= 40 ? "right" : "front");
assert.equal(S.steady(5 / 30, 0, 30, flicker), "front");
assert.equal(S.steady(16 / 30, 0, 30, flicker), "front");
assert.equal(S.steady(41 / 30, 0, 30, flicker), "front");
assert.equal(S.steady(42 / 30, 0, 30, flicker), "right");
assert.equal(S.steady(80 / 30, 0, 30, flicker), "right");

// one outline: every outline is painted before any fill, so overlapping parts share their outer outline only
const svg = renderToStaticMarkup(React.createElement(S.OneOutline, { width: 2 },
  React.createElement(S.Fill, { d: "M0 0H10V10Z", fill: "#abc" }), React.createElement(S.Fill, { d: "M5 0H15V10Z", fill: "#def" }),
  React.createElement(S.Detail, null, React.createElement("path", { d: "M1 1L2 2", stroke: "#000" }))));
const order = [...svg.matchAll(/<path d="[^"]*" fill="([^"]*)"/g)].map((m) => m[1]);
assert.deepEqual(order, ["#2b2326", "#2b2326", "#abc", "#def"]);
assert.equal((svg.match(/M1 1L2 2/g) ?? []).length, 1);

// seeking: the same pose gives the same numbers
assert.equal(JSON.stringify(S.pose3(B, stand(0.3), cam).arm("r")), JSON.stringify(S.pose3(B, stand(0.3), cam).arm("r")));
console.log("skeleton: ok");
