import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { transformSync } = require("esbuild"),
  React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const reactURL = pathToFileURL(require.resolve("react")).href;
const templateDirectory = fileURLToPath(new URL(".", import.meta.url));
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
function compile(file, replacements = [], rewrite = (source) => source) {
  let source = rewrite(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
  for (const [from, to] of [["react", reactURL], ...helpers, ...replacements]) {
    source = source.replaceAll(`from "${from}"`, `from "${to}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(
    transformSync(source, {
      loader: "tsx", format: "esm", target: "es2022", jsx: "transform",
    }).code,
  ).toString("base64")}`;
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
const at = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function near(actual, expected, tolerance, message) {
  assert.ok(
    distance(actual, expected) <= tolerance,
    `${message}: ${actual.map((v) => v.toFixed(4))} versus ${expected.map((v) => v.toFixed(4))}`,
  );
}
function transform(value = "") {
  let matrix = identity;
  let consumed = "";
  for (const [match, kind, values] of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    consumed += match;
    const v = values
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    assert.ok(v.every(Number.isFinite), "Every rendered transform must be finite");
    let next;
    if (kind === "translate" && v.length >= 1 && v.length <= 2) next = [1, 0, 0, 1, v[0], v[1] ?? 0];
    else if (kind === "scale" && v.length >= 1 && v.length <= 2) next = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (kind === "rotate" && (v.length === 1 || v.length === 3)) {
      const a = (v[0] * Math.PI) / 180,
        x = v[1] ?? 0,
        y = v[2] ?? 0;
      next = multiply(multiply([1, 0, 0, 1, x, y], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [
        1,
        0,
        0,
        1,
        -x,
        -y,
      ]);
    } else if (kind === "matrix" && v.length === 6) next = v;
    else assert.fail(`Unsupported rendered transform: ${kind}(${values})`);
    matrix = multiply(matrix, next);
  }
  assert.equal(value.replace(/\s/g, ""), consumed.replace(/\s/g, ""), "Do not silently ignore transform syntax");
  return matrix;
}
function elementsFrom(markup) {
  assert.doesNotMatch(markup, /(?:NaN|Infinity|undefined)/, "Rendered SVG must contain finite values");
  const root = { tag: null, matrix: identity, children: [] },
    stack = [root],
    elements = [];
  for (const match of markup.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attributes, selfClosing] = match;
    if (closing) {
      const element = stack.pop();
      assert.equal(element.tag, tag, "Rendered elements must remain nested correctly");
      element.end = match.index + match[0].length;
      continue;
    }
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const parent = stack.at(-1);
    const element = {
      tag,
      attrs,
      parent,
      children: [],
      matrix: multiply(parent.matrix, transform(attrs.transform)),
      order: elements.length,
      start: match.index,
      openingEnd: match.index + match[0].length,
    };
    parent.children.push(element);
    elements.push(element);
    if (selfClosing) element.end = element.openingEnd;
    else stack.push(element);
  }
  assert.equal(stack.length, 1);
  return elements;
}
function part(elements, name) {
  const matches = elements.filter((e) => e.attrs["data-part"] === name);
  assert.equal(matches.length, 1, `Expected one actual rendered ${name}, got ${matches.length}`);
  return matches[0];
}
function numberAttr(element, key, fallback = 0) {
  const value = Number(element.attrs[key] ?? fallback);
  assert.ok(Number.isFinite(value), `${element.tag}.${key} must be finite`);
  return value;
}
function circleCentre(element) {
  assert.equal(element.tag, "circle");
  return at(element.matrix, [numberAttr(element, "cx"), numberAttr(element, "cy")]);
}
function rectCorners(element) {
  assert.equal(element.tag, "rect", "Phone contract is measured from the actual case rectangle");
  const x = numberAttr(element, "x"),
    y = numberAttr(element, "y");
  const w = numberAttr(element, "width"),
    h = numberAttr(element, "height");
  assert.ok(w > 0 && h > 0, "An interaction prop must have positive dimensions");
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map((p) => at(element.matrix, p));
}

const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const numberPattern = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
function pathCommands(element) {
  assert.equal(element.tag, "path");
  const commands = [];
  let cursor = [0, 0],
    origin = [0, 0];
  for (const [, letter, values] of element.attrs.d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const nums = (values.match(numberPattern) ?? []).map(Number),
      command = letter.toUpperCase(),
      count = arity[command];
    assert.ok(nums.every(Number.isFinite));
    assert.equal(values.replace(numberPattern, "").replace(/[\s,]/g, ""), "", "No unknown path syntax");
    assert.ok(
      count === 0 ? nums.length === 0 : nums.length > 0 && nums.length % count === 0,
      `Malformed rendered ${element.attrs["data-part"] ?? "path"}: ${letter}${values}`,
    );
    if (!count) {
      commands.push({ command, start: cursor, end: origin, values: [] });
      cursor = origin;
    }
    for (let i = 0; i < nums.length; i += count || 1) {
      const v = nums.slice(i, i + count),
        relative = letter !== command;
      let end;
      if (command === "H") end = [relative ? cursor[0] + v[0] : v[0], cursor[1]];
      else if (command === "V") end = [cursor[0], relative ? cursor[1] + v[0] : v[0]];
      else {
        const pair = v.slice(-2);
        end = relative ? [cursor[0] + pair[0], cursor[1] + pair[1]] : pair;
      }
      commands.push({ command: i > 0 && command === "M" ? "L" : command, start: cursor, end, values: v });
      if (command === "M" && i === 0) origin = end;
      cursor = end;
    }
  }
  return commands;
}
function endpoint(element) {
  const commands = pathCommands(element).filter((c) => c.command !== "Z");
  assert.ok(commands.length > 0);
  return at(element.matrix, commands.at(-1).end);
}
function localScale(element) {
  const x = Math.hypot(element.matrix[0], element.matrix[1]);
  const y = Math.hypot(element.matrix[2], element.matrix[3]);
  assert.ok(Math.abs(x - y) < 1e-8, "Tests expect uniform world scale");
  return x;
}
function inverse(m) {
  const determinant = m[0] * m[3] - m[1] * m[2];
  assert.ok(Math.abs(determinant) > 1e-12, "Rendered scale cannot collapse an interaction");
  return [
    m[3] / determinant,
    -m[1] / determinant,
    -m[2] / determinant,
    m[0] / determinant,
    (m[2] * m[5] - m[3] * m[4]) / determinant,
    (m[1] * m[4] - m[0] * m[5]) / determinant,
  ];
}
function descendant(element, ancestor) {
  for (let parent = element.parent; parent; parent = parent.parent) if (parent === ancestor) return true;
  return false;
}
function capsule(element) {
  const commands = pathCommands(element);
  assert.equal(
    commands
      .slice(0, 5)
      .map((c) => c.command)
      .join(""),
    "MLALA",
    "Measure the actual sleeve's two rounded caps, not metadata anchors",
  );
  return {
    start: at(element.matrix, midpoint(commands[0].end, commands[3].end)),
    end: at(element.matrix, midpoint(commands[1].end, commands[2].end)),
  };
}
function palmBase(element) {
  const commands = pathCommands(element);
  assert.equal(commands[0].command, "M");
  assert.ok(["L", "H"].includes(commands[1].command));
  return at(element.matrix, midpoint(commands[0].end, commands[1].end));
}
function validatePathGeometry(elements) {
  for (const element of elements) {
    if (element.tag === "path") pathCommands(element);
    for (const key of ["width", "height", "r", "rx", "ry"])
      if (key in element.attrs) {
        assert.ok(numberAttr(element, key) >= 0, `Rendered ${element.tag}.${key} cannot be negative`);
      }
  }
}
function mutatePart(markup, name, change) {
  const element = part(elementsFrom(markup), name);
  const opening = markup.slice(element.start, element.openingEnd);
  const modified = change(opening);
  assert.notEqual(modified, opening, `Mutation must change the actual rendered ${name}`);
  return markup.slice(0, element.start) + modified + markup.slice(element.openingEnd);
}
function shiftPart(markup, name, dx, dy) {
  return mutatePart(markup, name, (opening) =>
    opening.includes("transform=")
      ? opening.replace(/transform="([^"]*)"/, `transform="$1 translate(${dx} ${dy})"`)
      : opening.replace(/\/?>(?=$)/, ` transform="translate(${dx} ${dy})"$&`),
  );
}
function movePartBefore(markup, name, before) {
  const elements = elementsFrom(markup),
    element = part(elements, name),
    destination = part(elements, before);
  assert.equal(element.parent, destination.parent, "Layer mutations must preserve the actual inherited transform");
  assert.ok(element.start > destination.start, "This mutation moves a later sibling behind an earlier one");
  return (
    markup.slice(0, destination.start) +
    markup.slice(element.start, element.end) +
    markup.slice(destination.start, element.start) +
    markup.slice(element.end)
  );
}

function assertTypeContracts() {
  const source = `
    import React from "react";
    import {PortraitInteraction} from "../src/kit/portrait-interaction";
    import {PortraitHand} from "../src/kit/portrait-body";
    const profile = {neck:[0,-235] as [number,number], ear:[51,-326.5] as [number,number]};
    const base = {action:"phone" as const, time:0, profile, x:0, y:0, renderHead:(_angle:number)=>null};
    const validPhone = <PortraitInteraction {...base}/>;
    const validWrite = <PortraitInteraction {...base} action="write" progress={.5}/>;
    const validHeadTouch = <PortraitInteraction {...base} action="head-touch" profile={{...profile,temple:[40,-345]}}/>;
    const handPhone = <PortraitHand shape="grip" skin="#eac09f" prop="phone"/>;
    // @ts-expect-error Actions own their arm poses.
    const invalidArm = <PortraitInteraction {...base} armL={90}/>;
    // @ts-expect-error An action cannot be combined with a contradictory gesture.
    const invalidGesture = <PortraitInteraction {...base} gesture="smoke"/>;
    // @ts-expect-error The interaction owns and layers its prop.
    const invalidProp = <PortraitInteraction {...base} frontProp={<path/>}/>;
    // @ts-expect-error Only supported interactions enter this component.
    const invalidAction = <PortraitInteraction {...base} action="walk"/>;
    // @ts-expect-error Contact requires both neck and ear anchors.
    const invalidProfile = <PortraitInteraction {...base} profile={{neck:[0,-235]}}/>;
    // @ts-expect-error Optional temple coordinates remain a numeric landmark tuple.
    const invalidTemple = <PortraitInteraction {...base} action="head-touch" profile={{...profile,temple:"head"}}/>;
  `;
  const probeDirectory = fs.mkdtempSync(new URL(".interaction-contract-", import.meta.url));
  try {
    fs.writeFileSync(path.join(probeDirectory, "contract.tsx"), source);
    const configPath = path.join(probeDirectory, "tsconfig.json");
    fs.writeFileSync(configPath, JSON.stringify({
      extends: "../tsconfig.json", files: ["contract.tsx"], include: [],
    }));
    const packagePath = require.resolve("typescript/package.json");
    const cli = path.join(path.dirname(packagePath), JSON.parse(fs.readFileSync(packagePath, "utf8")).bin.tsc);
    const result = spawnSync(process.execPath, [cli, "--project", configPath, "--noEmit", "--pretty", "false"], {
      cwd: templateDirectory, encoding: "utf8",
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    fs.rmSync(probeDirectory, { recursive: true, force: true });
  }
  return 6;
}

const bodyURL = compile("src/kit/portrait-body.tsx");
const posterURL = compile("src/kit/styles/poster.tsx", [["../portrait-body", bodyURL]]);
const interactionURL = compile("src/kit/portrait-interaction.tsx", [
  ["./portrait-body", bodyURL],
  ["./styles/poster", posterURL],
]);
const { PortraitInteraction, resolveInteraction } = await import(interactionURL);
const profiles = {
  narrow: { neck: [0, -235], ear: [51, -326.5] },
  wide: { neck: [0, -235], ear: [67.6, -314.5] },
};
const headProfiles = {
  narrow: { ...profiles.narrow, temple: [40, -345] },
  wide: { ...profiles.wide, temple: [53, -353] },
};
const renderCase = (props, Component = PortraitInteraction) =>
  renderToStaticMarkup(
    React.createElement(
      "svg",
      null,
      React.createElement(
        "g",
        { transform: props.wrapper ?? "translate(-37 59) rotate(17 600 800) scale(.83)" },
        React.createElement(Component, {
          ...props,
          renderHead: (angle) =>
            React.createElement(
              "g",
              {
                "data-part": "test-head",
                transform: `rotate(${angle} ${props.profile.neck.join(" ")})`,
              },
              React.createElement("circle", {
                "data-part": "test-head-pivot",
                cx: props.profile.neck[0],
                cy: props.profile.neck[1],
                r: 1,
              }),
              React.createElement("circle", {
                "data-part": "test-ear",
                cx: props.profile.ear[0],
                cy: props.profile.ear[1],
                r: 2,
              }),
              props.profile.temple &&
                React.createElement("circle", {
                  "data-part": "test-temple",
                  cx: props.profile.temple[0],
                  cy: props.profile.temple[1],
                  r: 2,
                }),
            ),
        }),
      ),
    ),
  );

const armRanges = {
  phone: { upper: [], lower: [] },
  write: { upper: [], lower: [] },
  "head-touch": { upper: [], lower: [] },
};
let renderedCases = 0,
  contactCases = 0,
  layerCases = 0,
  continuousSamples = 0;
function assertHeadArmLengths(upper, lower) {
  assert.ok(
    upper >= 24 && upper <= 80,
    "Head-touch physical upper sleeve must not collapse below 24 or stretch above 80 body units",
  );
  assert.ok(
    lower >= 30 && lower <= 90,
    "Head-touch physical lower sleeve must not collapse below 30 or stretch above 90 body units",
  );
}
function validateArms(elements, action, pose) {
  const rigs = {};
  for (const side of ["left", "right"]) {
    const upper = part(elements, `arm-upper-${side}`),
      lower = part(elements, `arm-lower-${side}`);
    const a = capsule(upper),
      b = capsule(lower),
      scale = localScale(upper);
    near(a.end, b.start, 0.003 * scale, `${action} ${side}: actual sleeve caps must share their elbow`);
    const localA = at(inverse(upper.matrix), a.start),
      localB = at(inverse(upper.matrix), a.end);
    if (action !== "head-touch" || side === "left") {
      assert.ok(localB[1] > localA[1], `${action} ${side}: the elbow must stay below the shoulder`);
    }
    const upperLength = distance(a.start, a.end) / scale,
      lowerLength = distance(b.start, b.end) / scale;
    assert.ok(upperLength > 0 && lowerLength > 0, "Sleeves must not collapse");
    near(
      a.start,
      at(upper.matrix, pose.arms[side].shoulder),
      0.003 * scale,
      "Rendered shoulder must match the resolved joint",
    );
    near(a.end, at(upper.matrix, pose.arms[side].elbow), 0.003 * scale, "Rendered elbow must match the resolved joint");
    near(b.end, at(lower.matrix, pose.arms[side].wrist), 0.003 * scale, "Rendered wrist must match the resolved joint");
    if (action === "phone" && side === "right") {
      assert.ok(
        upperLength >= 32 && upperLength <= 65 && lowerLength >= 35 && lowerLength <= 76,
        "Phone sleeves must stay within the reachable-profile bounds",
      );
    }
    if (action === "head-touch" && side === "right") assertHeadArmLengths(upperLength, lowerLength);
    if (side === "right") {
      armRanges[action].upper.push(upperLength);
      armRanges[action].lower.push(lowerLength);
    }
    const back = elements.filter((e) => e.attrs["data-part"] === `arm-lower-${side}-back`);
    for (const duplicate of back) {
      const geometry = capsule(duplicate);
      near(geometry.start, b.start, 0.003 * scale, "Occluded and foreground sleeves must share elbow geometry");
      near(geometry.end, b.end, 0.003 * scale, "Occluded and foreground sleeves must share wrist geometry");
    }
    const cuffs = elements.filter((e) => e.attrs["data-part"] === "cuff" && e.attrs["data-side"] === side);
    assert.equal(cuffs.length, 1, `One actual cuff per ${side} arm`);
    near(at(cuffs[0].matrix, [0, 0]), b.end, 0.003 * scale, "Cuff origin must remain at the rendered sleeve endpoint");
    rigs[side] = { ...b, scale, cuff: cuffs[0], lower, upper };
  }
  return rigs;
}
function validateLayers(elements, action) {
  const left = elements.find((e) => e.attrs["data-part"] === "cuff" && e.attrs["data-side"] === "left");
  const right = elements.find((e) => e.attrs["data-part"] === "cuff" && e.attrs["data-side"] === "right");
  assert.ok(left && right, "Both physical cuffs must be rendered");
  if (action === "phone") {
    assert.ok(part(elements, "phone-palm").order < part(elements, "phone").order, "Phone palm must be behind the case");
    assert.ok(
      part(elements, "phone").order < part(elements, "phone-grip").order,
      "Phone grip must be in front of the case",
    );
  } else if (action === "head-touch") {
    const head = part(elements, "test-head"),
      forearm = part(elements, "arm-lower-right"),
      hand = part(elements, "head-touch-hand");
    assert.ok(head.order < forearm.order, "Head-touch forearm must stay in front of the portrait");
    assert.ok(
      forearm.order < right.order && right.order < hand.order,
      "Head-touch hand must stay in front of the forearm and cuff",
    );
    assert.ok(head.order < hand.order, "Head-touch fingers must remain visible in front of the portrait");
  } else {
    const book = part(elements, "notebook"),
      forearm = part(elements, "arm-lower-right"),
      grip = part(elements, "writing-grip");
    assert.ok(left.order < book.order, "Left support cuff must stay behind the notebook");
    assert.ok(part(elements, "support-palm").order < book.order, "Supporting palm must stay behind the notebook");
    assert.ok(book.order < forearm.order, "Writing forearm must be in front of the notebook, not hidden behind it");
    assert.ok(
      forearm.order < right.order && right.order < grip.order,
      "Writing forearm/cuff must be behind the writing grip",
    );
    assert.ok(
      book.order < part(elements, "support-grip").order,
      "Small support thumb must stay in front of the book edge",
    );
    assert.ok(
      part(elements, "writing-ink").order < part(elements, "writing-palm").order,
      "Ink must be behind the writing hand",
    );
    assert.ok(
      part(elements, "writing-palm").order < part(elements, "pen").order,
      "The pen must cross the palm visibly",
    );
    assert.ok(part(elements, "pen").order < grip.order, "The fingers must close in front of the pen");
  }
}
function validatePhone(elements, rigs) {
  const phone = part(elements, "phone"),
    corners = rectCorners(phone),
    scale = localScale(phone);
  const caseX = numberAttr(phone, "x"),
    caseY = numberAttr(phone, "y");
  const caseRight = caseX + numberAttr(phone, "width"),
    caseBottom = caseY + numberAttr(phone, "height");
  const ear = circleCentre(part(elements, "test-ear"));
  near(
    ear,
    at(phone.matrix, [4, 8]),
    0.005 * scale,
    "Actual phone earpiece area must meet the independently rotated portrait ear",
  );
  near(
    rigs.right.end,
    palmBase(part(elements, "phone-palm")),
    0.003 * scale,
    "Phone wrist must meet the actual palm base",
  );
  const grip = part(elements, "phone-grip"),
    commands = pathCommands(grip);
  const points = commands.map((c) => at(inverse(phone.matrix), at(grip.matrix, c.end)));
  assert.ok(
    points.some(
      ([x, y]) => x > caseX && x < caseRight && y > caseY + numberAttr(phone, "height") * 0.5 && y < caseBottom,
    ),
    "Actual gripping fingers must overlap the lower physical phone case",
  );
  assert.ok(
    points.some(([x, y]) => x > caseRight && y >= caseY && y <= caseBottom),
    "The phone grip must straddle the actual case right edge",
  );
  const lowestFinger = Math.max(...points.map(([, y]) => y));
  assert.ok(
    lowestFinger >= caseBottom - 3 && lowestFinger <= caseBottom + 4,
    "The gripping fingers must reach the actual lower case corner",
  );
  near(
    at(grip.matrix, [24, 55]),
    at(phone.matrix, [24, 55]),
    0.003 * scale,
    "Phone and grip cannot use independent drifting transforms",
  );
  const head = part(elements, "test-head"),
    neck = circleCentre(part(elements, "test-head-pivot"));
  const localEar = at(inverse(head.matrix), ear),
    localNeck = at(inverse(head.matrix), neck);
  assert.ok(distance(localEar, localNeck) > 30, "Fixture head must expose a meaningful ear offset");
  assert.ok(
    distance(corners[0], corners[1]) < distance(corners[0], corners[3]),
    "Held phone remains portrait-oriented",
  );
  assert.equal(
    elements.filter((e) => e.attrs["data-part"] === "pen").length,
    0,
    "Phone action must not retain a writing pen",
  );
}
function validateWriting(elements, rigs, progress) {
  const ink = part(elements, "writing-ink"),
    tip = part(elements, "pen-tip"),
    pen = part(elements, "pen");
  const commands = pathCommands(tip);
  assert.deepEqual(
    commands.slice(0, 3).map((c) => c.command),
    ["M", "L", "L"],
  );
  const actualTip = at(tip.matrix, commands[1].end),
    scale = localScale(ink);
  near(
    actualTip,
    endpoint(ink),
    0.003 * scale,
    "Actual pen triangle apex must meet the last visible ink-path endpoint",
  );
  const inkCommands = pathCommands(ink);
  assert.equal(
    inkCommands.filter((c) => c.command === "M").length,
    1,
    "Writing is one continuous stroke with no hidden pen-up jumps",
  );
  assert.ok(
    inkCommands.every((c) => c.command === "M" || c.command === "L"),
    "Arc-length traversal is validated against the actual polyline",
  );
  assert.equal(Number(ink.attrs.opacity), progress <= 0 ? 0 : 1, "Zero progress must not leave an ink dot");
  const grip = part(elements, "writing-grip");
  near(
    at(grip.matrix, [0, 0]),
    at(pen.matrix, [0, -13]),
    0.003 * scale,
    "Actual fingers must meet the rendered pen shaft",
  );
  near(
    rigs.right.end,
    palmBase(part(elements, "writing-palm")),
    0.003 * scale,
    "Writing sleeve endpoint must meet the actual palm base",
  );
  const support = part(elements, "support-palm");
  near(rigs.left.end, at(support.matrix, [0, 0]), 0.003 * scale, "The left sleeve and supporting palm must meet");
  const book = part(elements, "notebook");
  const cover = elements.find((e) => e.tag === "path" && descendant(e, book));
  assert.ok(cover, "The notebook must contain a physical cover path");
  const coverPath = pathCommands(cover),
    lowerLeft = coverPath.find((c) => c.command === "Q" && c.end[0] === -240 && c.end[1] === 151)?.end;
  assert.ok(lowerLeft, "Measure the actual cover's lower-left corner");
  assert.ok(
    distance(rigs.left.end, at(cover.matrix, lowerLeft)) / scale < 6,
    "Left wrist must support the lower-left book corner rather than float beside it",
  );
  const thumb = part(elements, "support-grip");
  const thumbPoints = pathCommands(thumb).map((c) => at(inverse(cover.matrix), at(thumb.matrix, c.end)));
  assert.ok(
    thumbPoints.some(([x, y]) => x >= -240 && x <= -200 && y >= 95 && y <= 155),
    "Support thumb must overlap the actual cover corner",
  );
  for (const command of inkCommands) {
    const onPage = at(inverse(cover.matrix), at(ink.matrix, command.end));
    assert.ok(
      onPage[0] > 20 && onPage[0] < 220 && onPage[1] > -130 && onPage[1] < 125,
      "Ink must remain on the right notebook page",
    );
  }
  assert.equal(
    elements.filter((e) => e.attrs["data-part"] === "phone").length,
    0,
    "Writing action must not retain a phone",
  );
}
function fingerGeometry(elements, name) {
  const shape = part(elements, `head-touch-${name}`),
    commands = pathCommands(shape);
  assert.equal(commands.at(-1).command, "Z", "Open fingers remain distinct closed, filled silhouettes");
  const tip = commands.find((c) => c.command === "Q");
  assert.ok(tip, `The actual ${name} finger needs its rounded distal contour`);
  // These are vertices of the painted contour, not invisible contact markers.
  const base = midpoint(commands[0].end, commands.at(-2).end);
  const width = distance(commands[0].end, commands.at(-2).end);
  assert.ok(width > 0, "A finger base cannot collapse");
  assert.ok(
    distance(base, tip.end) > width * 2,
    "Open fingers must extend beyond their base, not collapse into a clenched hand",
  );
  return { shape, base: at(shape.matrix, base), tip: at(shape.matrix, tip.end), width };
}
function headGeometry(elements) {
  const hand = part(elements, "head-touch-hand"),
    palm = part(elements, "head-touch-palm");
  const fingers = ["index", "middle", "ring"].map((name) => fingerGeometry(elements, name));
  const thumb = part(elements, "head-touch-thumb");
  assert.equal(thumb.tag, "path", "The thumb must be a painted silhouette, not an ellipse marker");
  pathCommands(thumb);
  for (const shape of [palm, thumb, ...fingers.map((f) => f.shape)]) {
    assert.ok(descendant(shape, hand), "The entire painted hand must share its wrist transform");
    for (let ancestor = shape; ancestor && ancestor !== hand.parent; ancestor = ancestor.parent) {
      assert.notEqual(ancestor.attrs?.fill, "none", "Head-touch contact cannot be represented by an unpainted outline");
      if (ancestor.attrs?.opacity !== undefined)
        assert.ok(Number(ancestor.attrs.opacity) > 0, "Contact shapes must remain visible");
    }
  }
  const scale = localScale(palm),
    wrist = palmBase(palm),
    lower = capsule(part(elements, "arm-lower-right"));
  const distal = fingers.reduce((sum, f) => [sum[0] + f.base[0] / 3, sum[1] + f.base[1] / 3], [0, 0]);
  const forearm = [lower.end[0] - lower.start[0], lower.end[1] - lower.start[1]];
  const palmDirection = [distal[0] - wrist[0], distal[1] - wrist[1]];
  const cosine =
    (forearm[0] * palmDirection[0] + forearm[1] * palmDirection[1]) /
    Math.hypot(...forearm) /
    Math.hypot(...palmDirection);
  assert.ok(Number.isFinite(cosine), "The actual forearm and palm must expose nonzero directions");
  const wristAngle = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
  for (let i = 0; i < fingers.length; i++)
    for (let j = i + 1; j < fingers.length; j++) {
      assert.ok(
        distance(fingers[i].tip, fingers[j].tip) / scale > 4,
        "The actual open fingertips must remain separately positioned",
      );
    }
  return {
    hand,
    palm,
    fingers,
    wrist,
    distal,
    wristAngle,
    scale,
    contact: fingers[0].tip,
    temple: circleCentre(part(elements, "test-temple")),
  };
}
function validateHeadTouch(elements, rigs, props) {
  const geometry = headGeometry(elements),
    { scale, wrist, wristAngle, contact, temple } = geometry;
  near(rigs.right.end, wrist, 0.003 * scale, "Head-touch sleeve endpoint must meet the actual palm base");
  assert.ok(
    wristAngle <= 65,
    `Head-touch palm must continue the actual forearm rather than fold backwards (${wristAngle.toFixed(2)} degrees)`,
  );
  if (props.time >= 0.55) {
    near(
      contact,
      temple,
      0.005 * scale,
      "Actual head-touch fingertip must meet the independently calibrated, rotated portrait temple",
    );
  }
  const head = part(elements, "test-head"),
    pivot = circleCentre(part(elements, "test-head-pivot"));
  near(
    pivot,
    at(head.parent.matrix, props.profile.neck),
    1e-8,
    "The original portrait callback must rotate around its calibrated neck pivot",
  );
  const actualTemple = part(elements, "test-temple");
  near(
    [numberAttr(actualTemple, "cx"), numberAttr(actualTemple, "cy")],
    props.profile.temple,
    1e-8,
    "The head callback must retain the independently calibrated temple coordinates",
  );
  assert.equal(
    elements.filter((e) => ["phone", "pen", "notebook"].includes(e.attrs["data-part"])).length,
    0,
    "Head-touch must not retain an unrelated prop",
  );
  return geometry;
}
function validateMarkup(markup, props, record = true) {
  const elements = elementsFrom(markup);
  validatePathGeometry(elements);
  const pose = resolveInteraction(props);
  const finite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value), "Every resolved geometry number must be finite");
    else if (value && typeof value === "object") Object.values(value).forEach(finite);
  };
  finite(pose);
  const rigs = validateArms(elements, props.action, pose);
  validateLayers(elements, props.action);
  if (props.action === "phone") validatePhone(elements, rigs);
  else if (props.action === "head-touch") validateHeadTouch(elements, rigs, props);
  else validateWriting(elements, rigs, Math.max(0, Math.min(1, props.progress ?? 0)));
  if (record) {
    renderedCases++;
    layerCases++;
    if (props.action !== "head-touch" || props.time >= 0.55) contactCases++;
  }
  return elements;
}

let preparationSamples = 0;
function writingInBookCoordinates(props) {
  const elements = validateMarkup(renderCase(props), props, false),
    book = part(elements, "notebook");
  const cover = elements.find((e) => e.tag === "path" && descendant(e, book));
  const bookInverse = inverse(cover.matrix),
    ink = part(elements, "writing-ink"),
    tip = part(elements, "pen-tip");
  const local = (point) => at(bookInverse, point);
  const bodyInverse = inverse(part(elements, "arm-upper-left").matrix);
  return {
    origin: at(bodyInverse, at(cover.matrix, [0, 0])),
    ink: pathCommands(ink).map((c) => local(at(ink.matrix, c.end))),
    tip: local(at(tip.matrix, pathCommands(tip)[1].end)),
    leftPalm: local(at(part(elements, "support-palm").matrix, [0, 0])),
    rightPalm: local(palmBase(part(elements, "writing-palm"))),
  };
}
for (const profile of Object.values(profiles))
  for (const progress of [0, 0.5, 1]) {
    const props = { action: "write", profile, x: 600, y: 800, s: 1.8, progress };
    const ready = writingInBookCoordinates({ ...props, time: 0.6 });
    const start = writingInBookCoordinates({ ...props, time: 0 });
    near(
      start.origin,
      [ready.origin[0], ready.origin[1] + 24],
      1e-8,
      "Preparation must lift the actual book by 24 body-local units",
    );
    let previousHeight = Infinity;
    for (const time of [-1, 0, 0.15, 0.3, 0.45, 0.6, 1]) {
      const frame = writingInBookCoordinates({ ...props, time });
      assert.ok(
        frame.origin[1] <= previousHeight + 1e-8,
        "The book preparation cannot reverse or overshoot its upward motion",
      );
      assert.ok(frame.origin[1] >= ready.origin[1] - 1e-8 && frame.origin[1] <= start.origin[1] + 1e-8);
      previousHeight = frame.origin[1];
      assert.equal(frame.ink.length, ready.ink.length, "Preparation cannot reveal new ink without writing progress");
      frame.ink.forEach((p, i) =>
        near(p, ready.ink[i], 1e-8, "Every existing ink point must move with the lifted book"),
      );
      for (const key of ["tip", "leftPalm", "rightPalm"])
        near(frame[key], ready[key], 0.004, `Preparation must keep ${key} fixed relative to the physical notebook`);
      preparationSamples++;
    }
  }

const times = [
  -1,
  0,
  0.15,
  0.25,
  0.3,
  0.45,
  0.6,
  1,
  Math.PI / 2 / 1.2,
  (3 * Math.PI) / 2 / 1.2,
  Math.PI / 2 / 0.9,
  (3 * Math.PI) / 2 / 0.9,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
  6,
];
const progresses = [0, 0.001, 0.125, 0.25, 0.5, 0.75, 0.999, 1];
for (const profile of Object.values(profiles))
  for (const s of [0.55, 1, 1.8])
    for (const time of times) {
      const phone = { action: "phone", time, profile, x: 600, y: 800, s };
      validateMarkup(renderCase(phone), phone);
      for (const progress of progresses) {
        const writing = { ...phone, action: "write", progress };
        validateMarkup(renderCase(writing), writing);
      }
    }

let profileGuardCases = 0,
  phoneCycleSamples = 0;
for (const profile of Object.values(profiles)) {
  for (let i = 0; i <= 180; i++) {
    const props = { action: "phone", profile, x: 0, y: 0, s: 1, time: ((i / 180) * 2 * Math.PI) / 1.2, wrapper: "" };
    validateMarkup(renderCase(props), props);
    phoneCycleSamples++;
  }
  for (const invalid of [
    { neck: [0, -235], ear: [200, -500] },
    { neck: [0, -180], ear: profile.ear },
    { neck: profile.neck, ear: [NaN, -315] },
    { neck: [0, -235], ear: [51, -200] },
    { neck: [0, -235], ear: [0, -280] },
  ]) {
    const props = { action: "phone", profile: invalid, x: 0, y: 0, time: 0 };
    assert.throws(() => resolveInteraction(props), RangeError, "Invalid or unreachable anchors must fail clearly");
    assert.throws(() => renderCase(props), RangeError, "A rejected profile cannot silently render stretched sleeves");
    profileGuardCases++;
  }
}

// Arc-length and prefix checks use the rendered final polyline as the reference,
// never the helper's computed tip or its path-building function.
for (const profile of Object.values(profiles)) {
  const base = { action: "write", profile, x: 0, y: 0, s: 1, time: 0, wrapper: "" };
  const finalInk = part(elementsFrom(renderCase({ ...base, progress: 1 })), "writing-ink");
  const finalPoints = pathCommands(finalInk).map((c) => c.end);
  const lengths = finalPoints.slice(1).map((point, i) => distance(point, finalPoints[i]));
  const total = lengths.reduce((a, b) => a + b, 0);
  assert.ok(total > 60, "The performance must create a visible line of writing");
  let previousTip;
  for (let i = 0; i <= 240; i++) {
    const progress = i / 240,
      markup = renderCase({ ...base, progress }),
      elements = validateMarkup(markup, { ...base, progress }, false);
    const ink = part(elements, "writing-ink"),
      commands = pathCommands(ink);
    const points = commands.map((c) => c.end),
      used = points.slice(1).reduce((sum, p, j) => sum + distance(p, points[j]), 0);
    assert.ok(Math.abs(used - total * progress) < 1e-8, "Visible ink must advance by continuous arc length");
    for (let j = 0; j < points.length - 1; j++)
      near(points[j], finalPoints[j], 1e-8, "Previously drawn ink must not move or be replaced");
    const tip = points.at(-1);
    if (previousTip)
      assert.ok(
        distance(previousTip, tip) <= total / 240 + 1e-8,
        "The nib cannot teleport between adjacent progress samples",
      );
    previousTip = tip;
    continuousSamples++;
  }
  for (const [input, clamped] of [
    [-2, 0],
    [2, 1],
    [NaN, 0],
  ]) {
    const actual = renderCase({ ...base, progress: input }),
      expected = renderCase({ ...base, progress: clamped });
    assert.equal(actual, expected, "Progress must clamp before generating contact geometry or ink");
  }
}

let headTouchCases = 0,
  headTouchGuardCases = 0,
  headTouchTemporalSamples = 0;
const headTouchStats = { maxWristAngle: 0, maxStep: 0, maxAccelerationStep: 0 };
const headTimes = [-1, 0, 0.001, 0.1, 0.275, 0.45, 0.549, 0.55, 0.551, 1, 6];
for (const profile of Object.values(headProfiles))
  for (const s of [0.55, 1, 1.8]) {
    for (const wrapper of [
      "translate(-37 59) rotate(17 600 800) scale(.83)",
      "translate(900 40) scale(-1 1) rotate(-11 400 700)",
    ]) {
      for (const time of headTimes) {
        const props = { action: "head-touch", profile, time, x: 600, y: 800, s, wrapper };
        validateMarkup(renderCase(props), props);
        headTouchCases++;
      }
    }
  }
for (const profile of Object.values(headProfiles)) {
  const badTemples = [
    undefined,
    null,
    [],
    [40],
    [40, -345, 0],
    new Array(2),
    [undefined, undefined],
    [40, NaN],
    [Infinity, -345],
    ["40", -345],
    [0, -345],
    [40, profile.ear[1] + 1],
    [400, -600],
    [40, -900],
  ];
  for (const temple of badTemples) {
    const props = { action: "head-touch", profile: { ...profile, temple }, time: 0, x: 0, y: 0 };
    assert.throws(
      () => resolveInteraction(props),
      RangeError,
      "Malformed or unreachable temples must fail before producing a pose",
    );
    assert.throws(
      () => renderCase(props),
      RangeError,
      "A rejected temple cannot silently render a detached or stretched hand",
    );
    headTouchGuardCases++;
  }
  for (const anchor of ["neck", "ear"])
    for (const value of [undefined, null, "bad", [], [40], new Array(2), [undefined, undefined], [0, -235, 3]]) {
      for (const action of ["phone", "write", "head-touch"]) {
        const props = { action, profile: { ...profile, [anchor]: value }, time: 0, x: 0, y: 0 };
        assert.throws(
          () => resolveInteraction(props),
          RangeError,
          "All action landmarks must contain exactly two finite coordinates",
        );
        assert.throws(() => renderCase(props), RangeError, "Malformed common landmarks must fail before SVG emission");
        headTouchGuardCases++;
      }
    }
}

function headFrame(props, Component) {
  return headFrameFromMarkup(renderCase(props, Component), props);
}
function headFrameFromMarkup(markup, props) {
  const elements = elementsFrom(markup),
    geometry = headGeometry(elements);
  const outer = multiply(
    transform(props.wrapper ?? "translate(-37 59) rotate(17 600 800) scale(.83)"),
    transform(`translate(${props.x} ${props.y}) scale(${props.s ?? 1})`),
  );
  const local = (point) => at(inverse(outer), point);
  const upper = capsule(part(elements, "arm-upper-right")),
    lower = capsule(part(elements, "arm-lower-right"));
  const bodyScale = localScale(part(elements, "test-head").parent);
  const upperLength = distance(upper.start, upper.end) / bodyScale,
    lowerLength = distance(lower.start, lower.end) / bodyScale;
  assertHeadArmLengths(upperLength, lowerLength);
  return {
    markup,
    wristAngle: geometry.wristAngle,
    upperLength,
    lowerLength,
    points: {
      wrist: local(geometry.wrist),
      contact: local(geometry.contact),
      temple: local(geometry.temple),
      elbow: local(lower.start),
      shoulder: local(upper.start),
      distal: local(geometry.distal),
      middle: local(geometry.fingers[1].tip),
      ring: local(geometry.fingers[2].tip),
    },
  };
}
function assertHeadTrajectory(base, Component = PortraitInteraction, record = false) {
  const rest = headFrame({ ...base, time: 0 }, Component),
    hold = headFrame({ ...base, time: 0.55 }, Component);
  for (const time of [-2, NaN, Infinity]) {
    assert.equal(
      headFrame({ ...base, time }, Component).markup,
      rest.markup,
      "Head-touch must have a stable clamped rest pose",
    );
  }
  for (const time of [0.551, 0.8, 1, 8]) {
    assert.equal(
      headFrame({ ...base, time }, Component).markup,
      hold.markup,
      "Head-touch must settle into a stable hold without idle drift",
    );
  }
  assert.ok(
    distance(rest.points.contact, rest.points.temple) > 100,
    "Approach begins with the hand genuinely away from the temple",
  );
  near(
    hold.points.contact,
    hold.points.temple,
    0.005,
    "The completed approach must end in actual painted fingertip contact",
  );
  assert.ok(
    distance(rest.points.temple, hold.points.temple) > 3,
    "The contact fixture must exercise real head rotation",
  );
  let previous, previousDelta;
  for (let i = 0; i <= 550; i++) {
    const frame = headFrame({ ...base, time: i / 1000 }, Component);
    assert.ok(
      frame.wristAngle <= 65,
      `Head-touch palm must continue the actual forearm through the approach (${frame.wristAngle.toFixed(2)} degrees)`,
    );
    if (previous) {
      const delta = Object.fromEntries(
        Object.entries(frame.points).map(([name, point]) => [
          name,
          [point[0] - previous.points[name][0], point[1] - previous.points[name][1]],
        ]),
      );
      const step = Math.max(...Object.values(delta).map((v) => Math.hypot(...v)));
      assert.ok(step < 1.2, "The actual head-touch hand and joints cannot jump between 1ms samples");
      if (previousDelta) {
        const acceleration = Math.max(...Object.entries(delta).map(([name, v]) => distance(v, previousDelta[name])));
        assert.ok(acceleration < 0.03, "The actual head-touch contour must not snap its velocity during approach");
        if (record) headTouchStats.maxAccelerationStep = Math.max(headTouchStats.maxAccelerationStep, acceleration);
      }
      previousDelta = delta;
      if (record) headTouchStats.maxStep = Math.max(headTouchStats.maxStep, step);
    }
    if (record) {
      headTouchStats.maxWristAngle = Math.max(headTouchStats.maxWristAngle, frame.wristAngle);
      armRanges["head-touch"].upper.push(frame.upperLength);
      armRanges["head-touch"].lower.push(frame.lowerLength);
      headTouchTemporalSamples++;
    }
    previous = frame;
  }
  const before = headFrame({ ...base, time: 0.55 - 1e-5 }, Component);
  for (const name of Object.keys(hold.points))
    near(before.points[name], hold.points[name], 0.001, `The ${name} cannot jump across the approach/hold boundary`);
}
for (const [index, profile] of Object.values(headProfiles).entries()) {
  assertHeadTrajectory(
    {
      action: "head-touch",
      profile,
      x: 137,
      y: 903,
      s: index === 0 ? 0.55 : 1.8,
      wrapper: index === 0 ? "translate(-9 50) rotate(19) scale(.83)" : "translate(700 80) scale(-1 1) rotate(-23)",
    },
    PortraitInteraction,
    true,
  );
}

const mutationChecks = [];
const phoneFixture = { action: "phone", time: 1, profile: profiles.narrow, x: 600, y: 800, s: 1 };
const phoneMarkup = renderCase(phoneFixture);
assert.throws(() => validateMarkup(shiftPart(phoneMarkup, "phone", 15, 0), phoneFixture, false), /phone earpiece area/);
mutationChecks.push("phone-case-detached-from-ear");
assert.throws(
  () => validateMarkup(shiftPart(phoneMarkup, "phone-palm", 12, 0), phoneFixture, false),
  /actual palm base/,
);
mutationChecks.push("phone-wrist-detached-from-palm");
for (const [width, height, name, expectedFailure] of [
  [27, 90, "taller-phone-case-below-gripping-fingers", /reach the actual lower case corner/],
]) {
  const changed = mutatePart(phoneMarkup, "phone", (opening) =>
    opening.replace(/width="[^"]+"/, `width="${width}"`).replace(/height="[^"]+"/, `height="${height}"`),
  );
  assert.throws(() => validateMarkup(changed, phoneFixture, false), expectedFailure);
  mutationChecks.push(name);
}
const largeCaseBodyURL = compile("src/kit/portrait-body.tsx", [], (source) => {
  const before = '<rect data-part="phone" width={27} height={63}';
  assert.ok(source.includes(before), "Dimension mutation must alter the shared phone primitive itself");
  return source.replace(before, '<rect data-part="phone" width={40} height={90}');
});
const largeCasePosterURL = compile("src/kit/styles/poster.tsx", [["../portrait-body", largeCaseBodyURL]]);
const largeCaseInteractionURL = compile("src/kit/portrait-interaction.tsx", [
  ["./portrait-body", largeCaseBodyURL],
  ["./styles/poster", largeCasePosterURL],
]);
const { PortraitInteraction: OversizedPhone } = await import(largeCaseInteractionURL);
assert.throws(
  () => validateMarkup(renderCase(phoneFixture, OversizedPhone), phoneFixture, false),
  /straddle the actual case right edge/,
);
mutationChecks.push("enlarged-shared-phone-case-no-longer-gripped");
function assertHandPhone(module) {
  const skin = "#eac09f";
  const markup = renderToStaticMarkup(React.createElement(module.PortraitHand, { shape: "grip", skin, prop: "phone" }));
  const elements = elementsFrom(markup),
    phone = part(elements, "phone");
  validatePathGeometry(elements);
  rectCorners(phone);
  const primitive = renderToStaticMarkup(React.createElement(module.PortraitPhone, { color: phone.attrs.fill }));
  assert.ok(
    markup.includes(primitive),
    "A phone in PortraitHand must be the shared phone drawing",
  );
  const fingers = elements.filter((e) => e.tag === "path" && e.attrs.fill === skin);
  assert.ok(
    fingers.length > 0 && fingers.every((e) => e.order > phone.order),
    "A phone in PortraitHand must stay behind the gripping hand",
  );
  const emptyHand = renderToStaticMarkup(React.createElement(module.PortraitHand, { shape: "grip", skin }));
  assert.equal(
    elementsFrom(emptyHand).filter((e) => e.attrs["data-part"] === "phone").length,
    0,
    "Restoring compatibility must not add a phone to ordinary hands",
  );
}
assertHandPhone(await import(bodyURL));
assertHandPhone(await import(largeCaseBodyURL));
const handPhoneCases = 2;
const writeFixture = { action: "write", time: 1, progress: 0.63, profile: profiles.wide, x: 600, y: 800, s: 1.8 };
const writeMarkup = renderCase(writeFixture);
assert.throws(
  () => validateMarkup(shiftPart(writeMarkup, "pen-tip", 8, 0), writeFixture, false),
  /last visible ink-path endpoint/,
);
mutationChecks.push("nib-detached-from-ink");
assert.throws(
  () => validateMarkup(shiftPart(writeMarkup, "writing-ink", 0, 7), writeFixture, false),
  /last visible ink-path endpoint/,
);
mutationChecks.push("ink-drawn-away-from-nib");
assert.throws(
  () => validateMarkup(shiftPart(writeMarkup, "support-palm", 12, 0), writeFixture, false),
  /left sleeve and supporting palm/,
);
mutationChecks.push("support-hand-detached-from-sleeve");
assert.throws(
  () => validateMarkup(shiftPart(writeMarkup, "notebook", 0, 12), writeFixture, false),
  /lower-left book corner/,
);
mutationChecks.push("notebook-moves-without-supporting-hand");

const hiddenForearmURL = compile(
  "src/kit/portrait-interaction.tsx",
  [
    ["./portrait-body", bodyURL],
    ["./styles/poster", posterURL],
  ],
  (source) => {
    const before = 'overObjectArms: { right: pose.action === "write" }';
    assert.ok(source.includes(before), "Mutation must alter the actual writing-layer switch");
    return source.replace(before, "overObjectArms: { right: false }");
  },
);
const { PortraitInteraction: HiddenWritingForearm } = await import(hiddenForearmURL);
assert.throws(
  () => validateMarkup(renderCase(writeFixture, HiddenWritingForearm), writeFixture, false),
  /Writing forearm must be in front of the notebook/,
);
mutationChecks.push("writing-forearm-hidden-behind-notebook");

const headFixture = { action: "head-touch", time: 0.55, profile: headProfiles.narrow, x: 600, y: 800, s: 1.8 };
const headMarkup = renderCase(headFixture);
function mutateSleeveLength(markup, name, factor) {
  const element = part(elementsFrom(markup), name),
    commands = pathCommands(element);
  const start = midpoint(commands[0].end, commands[3].end),
    end = midpoint(commands[1].end, commands[2].end);
  const length = distance(start, end),
    axis = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const move = (point) => {
    const along = ((point[0] - start[0]) * axis[0] + (point[1] - start[1]) * axis[1]) * (factor - 1);
    return [point[0] + along * axis[0], point[1] + along * axis[1]];
  };
  const d = commands
    .map((c) => {
      if (c.command === "Z") return "Z";
      assert.ok(["M", "L", "A"].includes(c.command), "Mutate the actual rounded sleeve capsule");
      return c.command + (c.command === "A" ? [...c.values.slice(0, 5), ...move(c.end)] : move(c.end)).join(" ");
    })
    .join(" ");
  return mutatePart(markup, name, (opening) => opening.replace(/ d="[^"]+"/, ` d="${d}"`));
}
for (const [segment, factor, condition] of [
  ["upper", 0.3, "collapsed"],
  ["upper", 2, "stretched"],
  ["lower", 0.25, "collapsed"],
  ["lower", 2, "stretched"],
]) {
  const changed = mutateSleeveLength(headMarkup, `arm-${segment}-right`, factor);
  assert.throws(
    () => headFrameFromMarkup(changed, headFixture),
    new RegExp(`Head-touch physical ${segment} sleeve must not collapse`),
  );
  mutationChecks.push(`head-touch-${segment}-sleeve-${condition}`);
}
assert.throws(
  () => validateMarkup(shiftPart(headMarkup, "head-touch-index", 8, 0), headFixture, false),
  /calibrated, rotated portrait temple/,
);
mutationChecks.push("head-fingertip-detached-from-temple");
assert.throws(
  () => validateMarkup(shiftPart(headMarkup, "head-touch-palm", 12, 0), headFixture, false),
  /actual palm base/,
);
mutationChecks.push("head-touch-palm-detached-from-cuff");
assert.throws(
  () => validateMarkup(shiftPart(headMarkup, "arm-lower-right", 12, 0), headFixture, false),
  /share their elbow/,
);
mutationChecks.push("head-touch-sleeve-detached-at-elbow");
const clenchedMiddle = mutatePart(headMarkup, "head-touch-middle", (opening) =>
  opening.replace(/ d="[^"]+"/, ' d="M-3 23L-2 24L1 25Q2 26 4 25Q7 24 5 23L3 23L3 23Z"'),
);
assert.throws(() => validateMarkup(clenchedMiddle, headFixture, false), /Open fingers must extend beyond their base/);
mutationChecks.push("head-touch-finger-collapsed-into-fist");
assert.throws(
  () => validateMarkup(movePartBefore(headMarkup, "head-touch-hand", "test-head"), headFixture, false),
  /Head-touch hand must stay in front/,
);
mutationChecks.push("head-touch-hand-hidden-behind-portrait");
const frozenHead = mutatePart(headMarkup, "test-head", (opening) =>
  opening.replace(/transform="[^"]+"/, `transform="rotate(0 ${headFixture.profile.neck.join(" ")})"`),
);
assert.throws(() => validateMarkup(frozenHead, headFixture, false), /calibrated, rotated portrait temple/);
mutationChecks.push("head-touch-does-not-follow-original-head-rotation");
const reversedWristURL = compile(
  "src/kit/portrait-interaction.tsx",
  [
    ["./portrait-body", bodyURL],
    ["./styles/poster", posterURL],
  ],
  (source) => {
    const before = "const handAngle = right.sleeveAngle + wristTurn * approach;";
    assert.ok(source.includes(before), "Wrist mutation must replace the actual hand-orientation rule");
    return source.replace(before, "const handAngle = rest.handAngle + (heldAngle - rest.handAngle) * approach;");
  },
);
const { PortraitInteraction: ReversedWrist } = await import(reversedWristURL);
assert.throws(
  () => assertHeadTrajectory({ ...headFixture, x: 0, y: 0, s: 1, wrapper: "" }, ReversedWrist),
  /continue the actual forearm through the approach/,
);
mutationChecks.push("head-touch-original-backwards-wrist-regression");
const jumpingHandURL = compile(
  "src/kit/portrait-interaction.tsx",
  [
    ["./portrait-body", bodyURL],
    ["./styles/poster", posterURL],
  ],
  (source) => {
    const before = "approach = q * q * (3 - 2 * q)";
    assert.ok(source.includes(before), "Timing mutation must replace the actual approach interpolation");
    return source.replace(before, "approach = q < 1 ? 0 : 1");
  },
);
const { PortraitInteraction: JumpingHand } = await import(jumpingHandURL);
assert.throws(
  () => assertHeadTrajectory({ ...headFixture, x: 0, y: 0, s: 1, wrapper: "" }, JumpingHand),
  /cannot jump between 1ms samples/,
);
mutationChecks.push("head-touch-teleports-directly-into-hold");

const typeContracts = assertTypeContracts();
const ranges = Object.fromEntries(
  Object.entries(armRanges).map(([action, segments]) => [
    action,
    Object.fromEntries(
      Object.entries(segments).map(([segment, values]) => [
        segment,
        {
          min: Number(Math.min(...values).toFixed(3)),
          max: Number(Math.max(...values).toFixed(3)),
        },
      ]),
    ),
  ]),
);
console.log(
  JSON.stringify({
    ok: true,
    rendered_cases: renderedCases,
    contact_cases: contactCases,
    layer_cases: layerCases,
    continuous_writing_samples: continuousSamples,
    preparation_samples: preparationSamples,
    phone_cycle_samples: phoneCycleSamples,
    profile_guard_cases: profileGuardCases,
    head_touch_cases: headTouchCases,
    head_touch_guard_cases: headTouchGuardCases,
    head_touch_temporal_samples: headTouchTemporalSamples,
    head_touch_measured_motion: Object.fromEntries(
      Object.entries(headTouchStats).map(([key, value]) => [key, Number(value.toFixed(6))]),
    ),
    head_touch_arm_safety_bounds: { upper: [24, 80], lower: [30, 90] },
    type_rejection_cases: typeContracts,
    hand_phone_cases: handPhoneCases,
    mutation_checks: mutationChecks,
    measured_right_arm_lengths: ranges,
    limitations: [
      "Geometry and rendering-order contracts do not judge portrait artwork or acting quality.",
      "Open-finger contours, contact, and wrist direction do not establish that viewers read the pose as a relaxed head touch.",
      "Arms use stylized variable segment lengths; the measured ranges are reported rather than presented as fixed-length IK.",
      "Writing is one continuous stroke; this suite does not certify a multi-stroke pen-up state machine.",
    ],
  }),
);
