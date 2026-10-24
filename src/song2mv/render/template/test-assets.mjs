import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { transformSync } = require("esbuild"),
  React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const reactURL = pathToFileURL(require.resolve("react")).href;
const plain = (file) =>
  `data:text/javascript;base64,${Buffer.from(
    transformSync(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
      loader: "ts", format: "esm", target: "es2022",
    }).code,
  ).toString("base64")}`;
const helpers = [
  ["./color", plain("src/kit/color.ts")],
  ["../math", plain("src/kit/math.ts")],
];
const compile = (file, replacements = []) => {
  let source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of [["react", reactURL], ...helpers, ...replacements]) {
    source = source.replaceAll(`from "${from}"`, `from "${to}"`);
  }
  const js = transformSync(source, {
    loader: "tsx", format: "esm", target: "es2022", jsx: "transform",
  }).code;
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
};
const bodyURL = compile("src/kit/portrait-body.tsx");
const body = await import(bodyURL);
const poster = await import(compile("src/kit/styles/poster.tsx", [["../portrait-body", bodyURL]]));
const { portraitMotion } = await import(compile("src/kit/portrait-motion.ts"));
const { PortraitCutout, portraitHeadTransform } = await import(compile("src/kit/portrait-cutout.tsx"));

let armCases = 0,
  anchorCases = 0,
  pathsChecked = 0;
for (const gesture of ["angles", "phone", "point", "smoke", "hold"]) {
  for (const side of [-1, 1])
    for (const angle of [-40, 0, 15, 70, 90, 105, 150, 180, 210]) {
      const { shoulder, elbow, wrist, handAngle } = body.solveArm(side, angle, gesture);
      assert.ok([...shoulder, ...elbow, ...wrist, handAngle].every(Number.isFinite));
      const upper = Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]);
      const lower = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
      assert.ok(
        upper >= 35 && upper <= 60 && lower >= 35 && lower <= 65,
        "Pose segments must stay within the short body proportions",
      );
      if (gesture === "angles" && angle >= 0 && angle <= 15) {
        assert.ok(
          side * elbow[0] > 62 && side * wrist[0] > 62,
          "A resting elbow/wrist must remain outside the torso instead of disappearing behind it",
        );
        assert.ok(
          elbow[1] > shoulder[1] + 30 && wrist[1] > elbow[1] + 30,
          "A resting arm must hang down rather than bend back into the shirt",
        );
      }
      if (gesture === "phone" && side === 1) {
        assert.ok(elbow[1] > shoulder[1], "Phone elbow must stay below the shoulder");
        assert.ok(wrist[1] > -260 && wrist[0] < elbow[0], "Phone wrist must stay below the ear and bend inward");
      }
      if (gesture === "hold") {
        assert.ok(
          side * wrist[0] >= 65 && side * wrist[0] <= 80 && wrist[1] > -125 && wrist[1] < -105,
          "Hands must support the lower book corners, not overlap its middle as sleeve clips",
        );
      }
      armCases++;
    }
}

const identity = [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const pointAt = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function svgTransform(value = "") {
  let matrix = identity;
  for (const [, kind, values] of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const v = values
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    assert.ok(v.every(Number.isFinite));
    let next;
    if (kind === "translate") next = [1, 0, 0, 1, v[0], v[1] ?? 0];
    else if (kind === "scale") next = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (kind === "rotate") {
      const a = (v[0] * Math.PI) / 180,
        x = v[1] ?? 0,
        y = v[2] ?? 0;
      const rotation = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      next = multiply(multiply([1, 0, 0, 1, x, y], rotation), [1, 0, 0, 1, -x, -y]);
    } else if (kind === "matrix" && v.length === 6) next = v;
    else assert.fail(`Unsupported SVG transform in the rendered asset: ${kind}`);
    matrix = multiply(matrix, next);
  }
  return matrix;
}
function renderedElements(props) {
  const markup = renderToStaticMarkup(React.createElement(body.PortraitBody, props));
  const stack = [{ tag: null, matrix: identity }],
    elements = [];
  for (const [, closing, tag, attributes, selfClosing] of markup.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    if (closing) {
      assert.equal(stack.pop().tag, tag);
      continue;
    }
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const matrix = multiply(stack.at(-1).matrix, svgTransform(attrs.transform));
    elements.push({ tag, attrs, matrix });
    if (!selfClosing) stack.push({ tag, matrix });
  }
  assert.equal(stack.length, 1);
  return elements;
}

// Recover the cigarette endpoint from the actual rendered SVG transform stack.
// A helper that omits a changed hand scale must fail this comparison.
for (const s of [0.55, 1, 1.5, 2])
  for (const lean of [-20, 0, 20]) {
    const props = { x: 600, y: 800, s, lean, gesture: "smoke" };
    const tips = renderedElements(props).filter((e) => e.tag === "circle" && e.attrs.fill === "#d8613d");
    assert.equal(tips.length, 1, "The rendered smoking hand must contain one cigarette ember");
    const ember = tips[0];
    const renderedTip = pointAt(ember.matrix, [Number(ember.attrs.cx), Number(ember.attrs.cy)]);
    const helperTip = body.portraitPropTip(props);
    assert.ok(
      Math.hypot(helperTip[0] - renderedTip[0], helperTip[1] - renderedTip[1]) < 0.002,
      "The smoke anchor must match the rendered cigarette, including hand scale and every ancestor transform",
    );
    anchorCases++;
  }
let phoneOrientationCases = 0,
  holdLayerCases = 0;
for (const s of [0.55, 1, 2]) {
  const props = { x: 600, y: 800, s, lean: 0, gesture: "phone" };
  const phones = renderedElements(props).filter((e) => e.attrs["data-part"] === "phone");
  assert.equal(phones.length, 1);
  const phone = phones[0],
    x = Number(phone.attrs.x ?? 0),
    y = Number(phone.attrs.y ?? 0);
  const top = pointAt(phone.matrix, [x, y]);
  const bottom = pointAt(phone.matrix, [x, y + Number(phone.attrs.height)]);
  assert.ok(
    Math.abs(top[0] - bottom[0]) < 1e-8 && bottom[1] > top[1],
    "The actual phone rectangle must be upright at neutral body lean",
  );
  phoneOrientationCases++;

  const elements = renderedElements({
    x: 600,
    y: 800,
    s,
    gesture: "hold",
    frontProp: React.createElement("g", { id: "held-object" }),
  });
  const marker = elements.findIndex((e) => e.attrs.id === "held-object");
  assert.ok(marker >= 0);
  const cuffs = elements.map((e, i) => [e, i]).filter(([e]) => e.attrs["data-part"] === "cuff");
  assert.equal(cuffs.length, 2);
  assert.ok(
    cuffs.every(([, i]) => i < marker),
    "Both cuffs must stay behind the held object",
  );
  const foreground = elements
    .slice(marker + 1)
    .filter((e) => /^(path|rect|circle|ellipse|line|polyline|polygon|image)$/.test(e.tag));
  assert.equal(foreground.length, 2);
  assert.ok(
    foreground.every((e) => e.attrs["data-part"] === "hold-thumb"),
    "Only the two small thumbs may appear in front of the held object",
  );
  assert.ok(
    foreground.every(
      (e) =>
        Math.hypot(e.matrix[0], e.matrix[1]) <= s * 0.8 + 1e-8 &&
        Math.hypot(e.matrix[2], e.matrix[3]) <= s * 0.8 + 1e-8,
    ),
    "Foreground grip marks must remain small",
  );
  holdLayerCases++;
}

const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const number = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
function inspect(Component, props) {
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  assert.doesNotMatch(markup, /(?:NaN|Infinity|undefined)/);
  for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
    for (const [, command, values] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
      const numbers = values.match(number) ?? [],
        n = arity[command.toUpperCase()];
      assert.ok(
        n === 0 ? numbers.length === 0 : numbers.length > 0 && numbers.length % n === 0,
        `${Component.name}: malformed SVG command ${command}${values}`,
      );
      assert.equal(values.replace(number, "").replace(/[\s,]/g, ""), "");
      assert.ok(numbers.every((v) => Number.isFinite(Number(v))));
    }
    pathsChecked++;
  }
  for (const [, key, value] of markup.matchAll(/\s(width|height|r|rx|ry)="([^"]*)"/g)) {
    assert.ok(Number(value) >= 0, `${Component.name}: negative ${key}`);
  }
}

for (const module of [poster, body])
  for (const [name, Component] of Object.entries(module)) {
    if (!/^[A-Z]/.test(name) || typeof Component !== "function") continue;
    for (const gesture of ["angles", "phone", "point", "smoke", "hold"]) {
      inspect(Component, {
        T: 98,
        x: 960,
        y: 770,
        w: 300,
        h: 400,
        lit: "red",
        tail: [-260, 150],
        gesture,
        shape: "point",
        skin: "#eac09f",
        step: 0.7,
      });
    }
  }
for (const h of [0, 0.01, 40, 90, 160, 300, 720]) inspect(poster.Building, { x: 100, y: 800, w: 200, h });
for (const write of [0, 0.25, 0.5, 1]) inspect(poster.Notebook, { x: 0, y: 0, write });
for (const fill of [0, 0.2, 1]) inspect(poster.Glass, { x: 0, y: 0, fill });
let motionCases = 0,
  plantedCases = 0,
  armSwingCases = 0;
for (const action of ["idle", "walk", "run", "phone", "hold", "wave", "point"]) {
  for (let i = 0; i <= 180; i++) {
    const t = i / 30,
      pose = portraitMotion(t, action);
    assert.ok(
      [
        pose.lean,
        pose.headAngle,
        pose.armL,
        pose.armR,
        pose.armSwing,
        pose.travel,
        ...Object.values(pose.feet).flatMap((f) => [f.x, f.lift]),
      ].every(Number.isFinite),
    );
    assert.ok(Object.values(pose.feet).every((f) => f.lift >= 0));
    if (action !== "walk" && action !== "run") {
      assert.equal(pose.travel, 0);
      assert.equal(pose.armSwing, 0, "Non-walking actions must not inherit the walking arm swing");
      assert.deepEqual(pose.feet, { left: { x: 0, lift: 0 }, right: { x: 0, lift: 0 } });
    } else {
      const next = portraitMotion(t + 0.001, action);
      assert.equal(pose.armL, 13);
      assert.equal(pose.armR, 13);
      assert.ok(Math.abs(pose.armSwing) <= (action === "walk" ? 7.5 : 13.5));
      const shifts = [-1, 1].map((side) => {
        const angle = side === -1 ? pose.armL : pose.armR;
        const neutral = body.solveArm(side, angle, "angles", 0);
        const moving = body.solveArm(side, angle, "angles", pose.armSwing);
        for (const joint of ["elbow", "wrist"])
          assert.equal(moving[joint][0], neutral[joint][0], "Walking must not fan both arms sideways");
        const dy = moving.wrist[1] - neutral.wrist[1];
        assert.ok(Math.abs(dy - side * pose.armSwing) < 1e-8);
        assert.ok(Math.abs(moving.elbow[1] - neutral.elbow[1] - dy * 0.5) < 1e-8);
        return dy;
      });
      assert.ok(
        Math.abs(shifts[0] + shifts[1]) < 1e-8,
        "Left and right wrists must travel vertically by equal, opposite amounts",
      );
      if (Math.abs(pose.armSwing) > 1e-6) {
        assert.ok(shifts[0] * shifts[1] < 0);
        armSwingCases++;
      }
      for (const side of ["left", "right"])
        if (pose.feet[side].lift === 0 && next.feet[side].lift === 0) {
          assert.ok(
            Math.abs(pose.travel + pose.feet[side].x - next.travel - next.feet[side].x) < 1e-8,
            "A stance foot must stay in place as the actor moves",
          );
          plantedCases++;
        }
    }
    motionCases++;
  }
}
let swingBoundCases = 0;
for (const action of ["walk", "run"])
  for (const energy of [0, 1, 1.5, 5]) {
    const maxSwing = action === "walk" ? 7.5 : 13.5;
    for (let i = 0; i <= 60; i++) {
      const pose = portraitMotion(i / 10, action, { energy });
      assert.equal(pose.armL, 13);
      assert.equal(pose.armR, 13);
      assert.ok(Math.abs(pose.armSwing) <= maxSwing + 1e-8);
      if (energy === 0) assert.equal(Math.abs(pose.armSwing), 0);
      swingBoundCases++;
    }
    const stopped = portraitMotion(2, action, { speed: 0, energy });
    assert.equal(stopped.armSwing, 0);
    assert.equal(stopped.armL, 13);
    assert.equal(stopped.armR, 13);
  }
for (const gesture of ["phone", "hold", "point", "smoke"])
  for (const side of [-1, 1]) {
    assert.deepEqual(
      body.solveArm(side, 15, gesture, 13.5),
      body.solveArm(side, 15, gesture, 0),
      "A fixed hand gesture must ignore walking armSwing",
    );
  }
for (const gesture of ["phone", "hold", "wave", "point"]) {
  assert.deepEqual(portraitMotion(4, gesture), portraitMotion(8, gesture));
}
const footPose = { left: { x: 9, lift: 0 }, right: { x: -8, lift: 12 } };
const bodyMarkup = (step) =>
  renderToStaticMarkup(React.createElement(body.PortraitBody, { x: 0, y: 0, feet: footPose, step }));
assert.equal(bodyMarkup(-1), bodyMarkup(1), "Explicit foot placement must override step");
const cutout = () =>
  React.createElement(
    PortraitCutout,
    { anchor: [320, 420], path: "M0 0H640V480H0Z" },
    React.createElement("image", { href: "portrait.png", width: 640, height: 640 }),
  );
const cutouts = renderToStaticMarkup(React.createElement("svg", null, cutout(), cutout()));
const ids = [...cutouts.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, 2);
assert.equal(new Set(ids).size, 2, "Independent image heads must not share a clipping id");
for (const id of ids) assert.ok(cutouts.includes(`clip-path="url(#${id})"`));
let headPoseCases = 0;
for (const neck of [[0, -235], [3, -233]]) for (const angle of [-8, 0, 9]) for (const pitch of [0, 8, 16, 30]) {
  const matrix = svgTransform(portraitHeadTransform({neck, angle, pitch}));
  const pivot = pointAt(matrix, neck);
  assert.ok(Math.hypot(pivot[0]-neck[0],pivot[1]-neck[1]) < 1e-8, "Head projection must preserve its calibrated neckline");
  assert.ok(Math.abs(Math.hypot(matrix[0],matrix[1])-1) < 1e-8, "Head projection must preserve horizontal scale");
  assert.ok(Math.hypot(matrix[2],matrix[3]) >= .866 && Math.hypot(matrix[2],matrix[3]) <= 1 + 1e-8);
  headPoseCases++;
}
for (const pose of [{neck:[NaN,-235]}, {neck:[0]}, {neck:[0,-235],angle:Infinity}, {neck:[0,-235],pitch:NaN}])
  assert.throws(()=>portraitHeadTransform(pose), RangeError, "Malformed head poses must fail before SVG emission");

console.log(
  JSON.stringify({
    ok: true,
    arm_cases: armCases,
    attachment_cases: anchorCases,
    svg_paths_checked: pathsChecked,
    motion_cases: motionCases,
    planted_foot_cases: plantedCases,
    counter_swing_cases: armSwingCases,
    swing_bound_cases: swingBoundCases,
    phone_orientation_cases: phoneOrientationCases,
    hold_layer_cases: holdLayerCases,
    cutout_ids: ids.length,
    head_pose_cases: headPoseCases,
  }),
);
