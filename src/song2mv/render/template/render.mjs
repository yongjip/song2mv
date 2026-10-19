#!/usr/bin/env node
/**
 * Render a song config (mv.json from `song2mv sync`) with this template.
 *
 *   node render.mjs ../work/my-song/mv.json                         # whole song, 16:9
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect both
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect 9x16 --hold 2.5
 *   node render.mjs ../work/my-song/mv.json --still 98.5            # one PNG frame at song time 98.5 s
 *   node render.mjs ../work/my-song/mv.json --studio                # Remotion Studio with this song
 *
 * Options: --audio FILE (else: public/<audio>, the mv.json's audio_path, or next to mv.json; none → silent)
 *          --from S  --to S  --hold S  --aspect 16x9|9x16|both  --out DIR (default out/)  --name BASE
 *
 * The audio is never copied into this folder: a temporary public folder outside it holds a link to it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
const propsFile = path.join(tmp, "props.json");
fs.writeFileSync(propsFile, JSON.stringify({ song, from, to, hold }));

// Without a terminal (coding agents, CI) Remotion's per-frame progress lines are noise: keep warnings only.
const logLevel = process.env.SONG2MV_REMOTION_LOG || (process.stderr.isTTY ? "info" : "warn");
const remotion = (args) => {
  const r = spawnSync("npx", ["remotion", ...args, `--props=${propsFile}`, `--public-dir=${publicDir}`, `--log=${logLevel}`], { cwd: HERE, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

fs.mkdirSync(outDir, { recursive: true });
const range = from > 0 || to !== null ? `-${from}-${to ?? "end"}` : "";
if (flag("studio")) {
  remotion(["studio"]);
} else if (opt("still") !== undefined) {
  const t = Number(opt("still"));
  const frame = Math.max(0, Math.round((t - from) * 30));
  for (const id of aspects) remotion(["still", id, path.join(outDir, `${base}-${id.slice(6)}-${t}s.png`), `--frame=${frame}`]);
} else {
  for (const id of aspects) remotion(["render", id, path.join(outDir, `${base}-${id.slice(6)}${range}.mp4`)]);
}
fs.rmSync(tmp, { recursive: true, force: true });
