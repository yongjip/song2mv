#!/usr/bin/env node
/**
 * Render a song config (mv.json from `song2mv sync`) with this template.
 *
 *   node render.mjs ../work/my-song/mv.json                         # whole song, 16:9
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect both
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect 9x16 --hold 2.5
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --draft   # 10 fps, for the render → check loop
 *   node render.mjs ../work/my-song/mv.json --still 98.5            # one PNG frame at song time 98.5 s
 *   node render.mjs ../work/my-song/mv.json --composition Concepts --props concepts.json   # a PNG of Concepts
 *   node render.mjs ../work/my-song/mv.json --studio                # Remotion Studio with this song
 *
 * `song2mv render` runs this for you with --out WORK/renders; the paths above are for running node directly.
 *
 * Options: --audio FILE (else: public/<audio>, the mv.json's audio_path, or next to mv.json; none → silent)
 *          --from S  --to S  --hold S  --aspect 16x9|9x16|both  --out DIR (default out/)  --name BASE
 *          --draft (10 fps, the rate `song2mv check` measures at, written as BASE-…-draft.mp4; --still ignores it)
 *          --composition ID --props FILE (a PNG of the composition's first frame, its props {song, from, to, hold}
 *          and the JSON object in FILE, such as {"T": 33.1} for Concepts or {"times": [12, 33.1]} for Contact)
 *          --manifest FILE (append the path of every file written, one per line; else they are printed)
 *
 * The audio is never copied into this folder: a temporary public folder outside it holds a link to it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30; // src/kit/song.tsx
const DRAFT_FPS = 10;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith("-")) {
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(1);
}
const songPath = path.resolve(argv[0]);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);

// Remotion's CLI runs in this node, not through npx: on Windows npx is npx.cmd, which node cannot start without a shell.
let cli;
try {
  const pkg = createRequire(import.meta.url).resolve("@remotion/cli/package.json");
  cli = path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, "utf8")).bin.remotion);
} catch {
  console.error(`Remotion is not installed in ${HERE}: run npm ci there (song2mv render does it for you)`);
  process.exit(1);
}

const song = JSON.parse(fs.readFileSync(songPath, "utf8"));
const from = Number(opt("from", 0));
const to = opt("to") !== undefined ? Number(opt("to")) : null;
const hold = Number(opt("hold", 0));
const aspects = { "16x9": ["Lyric-16x9"], "9x16": ["Lyric-9x16"], both: ["Lyric-16x9", "Lyric-9x16"] }[opt("aspect", "16x9")];
if (!aspects) throw new Error("--aspect must be 16x9, 9x16 or both");
const outDir = path.resolve(opt("out", path.join(HERE, "out")));
const base = opt("name", path.basename(path.dirname(songPath)) || "song");

// ── audio: find it, then expose it through a temporary public folder ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "song2mv-"));
const candidates = [
  opt("audio"),
  song.audio && path.join(HERE, "public", song.audio),
  song.audio_path,
  song.audio && path.join(path.dirname(songPath), song.audio),
].filter(Boolean);
const audio = candidates.map((p) => path.resolve(p)).find((p) => fs.existsSync(p));
const publicDir = path.join(tmp, "public");
fs.mkdirSync(publicDir);
if (audio) {
  const name = "song" + path.extname(audio);
  // the bundler does not follow symlinks; a hard link costs nothing, a copy is the fallback across volumes
  try {
    fs.linkSync(audio, path.join(publicDir, name));
  } catch {
    fs.copyFileSync(audio, path.join(publicDir, name));
  }
  song.audio = name;
} else {
  if (song.audio) console.warn(`audio "${song.audio}" not found — rendering without sound (pass --audio FILE)`);
  song.audio = null;
}
delete song.audio_path;
const extra = opt("props") ? JSON.parse(fs.readFileSync(path.resolve(opt("props")), "utf8")) : {};
const draft = flag("draft") && opt("still") === undefined && !opt("composition");
const propsFile = path.join(tmp, "props.json");
fs.writeFileSync(propsFile, JSON.stringify({ song, from, to, hold, ...(draft ? { fps: DRAFT_FPS } : {}), ...extra }));

// Without a terminal (coding agents, CI) Remotion's per-frame progress lines are noise: keep warnings only.
const logLevel = process.env.SONG2MV_REMOTION_LOG || (process.stderr.isTTY ? "info" : "warn");
const remotion = (args) => {
  const r = spawnSync(process.execPath, [cli, ...args, `--props=${propsFile}`, `--public-dir=${publicDir}`, `--log=${logLevel}`], { cwd: HERE, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

fs.mkdirSync(outDir, { recursive: true });
const wrote = (file) => (opt("manifest") ? fs.appendFileSync(opt("manifest"), file + "\n") : console.log(file));
const range = from > 0 || to !== null ? `-${from}-${to ?? "end"}` : "";
if (flag("studio")) {
  remotion(["studio"]);
} else if (opt("composition")) {
  const file = path.join(outDir, `${base}-${opt("composition")}.png`);
  remotion(["still", opt("composition"), file, "--frame=0"]);
  wrote(file);
} else if (opt("still") !== undefined) {
  const t = Number(opt("still"));
  const frame = Math.max(0, Math.round((t - from) * FPS));
  for (const id of aspects) {
    const file = path.join(outDir, `${base}-${id.slice(6)}-${t}s.png`);
    remotion(["still", id, file, `--frame=${frame}`]);
    wrote(file);
  }
} else {
  for (const id of aspects) {
    const file = path.join(outDir, `${base}-${id.slice(6)}${range}${draft ? "-draft" : ""}.mp4`);
    remotion(["render", id, file]);
    wrote(file);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
