#!/usr/bin/env node
/**
 * Render a song config (mv.json from `song2mv sync`) with this template.
 *
 *   node render.mjs ../work/my-song/mv.json                         # whole song, 16:9
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect both
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --aspect 9x16 --hold 2.5
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111 --draft   # 10 fps, for the render → check loop
 *   node render.mjs ../work/my-song/mv.json --still 98.5            # one PNG frame at song time 98.5 s
 *   node render.mjs ../work/my-song/mv.json --max-mb 200             # whole song, at most 200 MB (an upload limit)
 *   node render.mjs ../work/my-song/mv.json --composition Concepts --props concepts.json   # a PNG of Concepts
 *   node render.mjs src/sample-song.json --composition Kit-Gallery --frame 4   # the kit gallery's scene 4 (0: all)
 *   node render.mjs ../work/my-song/mv.json --studio                # Remotion Studio with this song
 *
 * `song2mv render` runs this for you with --out WORK/renders; the paths above are for running node directly.
 *
 * Options: --audio FILE (else: public/<audio>, the mv.json's audio_path, or next to mv.json; none → silent)
 *          --from S  --to S  --hold S  --aspect 16x9|9x16|both  --out DIR (default out/)  --name BASE
 *          --draft (10 fps, the rate `song2mv check` measures at, at half size: 960×540 or 540×960, written as
 *          BASE-…-draft.mp4; --still ignores it)
 *          --max-mb N (a finished video over N MB is encoded again, in two passes, to fit; the audio is kept)
 *          --composition ID --props FILE (a PNG of the composition's first frame, its props {song, from, to, hold}
 *          and the JSON object in FILE, such as {"T": 33.1} for Concepts or {"times": [12, 33.1]} for Contact;
 *          --frame N takes frame N, written as BASE-ID-N.png)
 *          --manifest FILE (append the path of every file written, one per line; else they are printed)
 *          --warnings FILE (append each fault the kit's arm() printed, `arm: WHO: FAULT at T s`, as first seen)
 *
 * The audio is never copied into this folder: a temporary public folder outside it holds a link to it.
 * Remotion mixes the audio to WAV and its ffmpeg writes the AAC: Remotion's own AAC starts 2048 samples late.
 * A finished video is capped at 8 Mbit/s (YouTube's figure for 1080p30): grain-heavy styles otherwise run near 14.
 * On a Mac, Chrome draws on the GPU (Remotion's --gl=angle, Metal): the style packs' filters render many times faster
 * and look the same. SONG2MV_GL=off draws in software, as on Linux and Windows; another value is passed to --gl.
 * On a Mac, Remotion's own Chrome keeps V8's debug checks, which stop some renders ("Page crashed!"): renders there use
 * Google's build of the same version, downloaded once into node_modules/.song2mv-chrome (docs/install.md).
 * A laptop that slept half an hour into a song stopped Chrome, and Remotion's recovery then waited forever. So a Mac
 * is kept awake while this renders, and a video renders in chunks of SONG2MV_CHUNK frames (900; 0: one piece), each a
 * Remotion run with a Chrome of its own, from one bundle: a chunk is rendered again after the computer slept, after
 * Chrome crashed, or when no frame has come for SONG2MV_STALL seconds (180; three tries but for sleep). The chunks
 * and their audio are joined without encoding them again.
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30; // src/kit/song.tsx
const DRAFT_FPS = 10;
// check measures at 320×180; below half size the paper pack's grain reads as motion
const DRAFT_VIDEO = ["--scale=0.5", "--crf=23", "--x264-preset=veryfast"];
const FINAL_VIDEO = ["--max-rate=8M", "--buffer-size=16M"];
// Google's Chrome hands over JPEG frames (Remotion's own, raw pixels): at the default 80 a final is 36 % larger
const CAPTURE = ["--jpeg-quality=100"];
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
let cli, cliPkg;
try {
  cliPkg = createRequire(import.meta.url).resolve("@remotion/cli/package.json");
  cli = path.join(path.dirname(cliPkg), JSON.parse(fs.readFileSync(cliPkg, "utf8")).bin.remotion);
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
const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  process.on(sig, () => {
    cleanup();
    process.exit(code);
  });
}
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
const run = (args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: HERE, stdio: "inherit" });
  if (r.status !== 0) {
    cleanup();
    process.exit(r.status ?? 1);
  }
};
async function unusedRenderPort() {
  const server = createServer();
  const listening = once(server, "listening");
  server.listen(0);
  await listening;
  const port = server.address().port;
  const closed = once(server, "close");
  server.close();
  await closed;
  return port;
}
// Remotion serves IPv4 but opens localhost; an IPv6-only Studio can own the same default port.
const rendererPort = flag("studio") ? [] : [`--port=${await unusedRenderPort()}`];
const gl = process.env.SONG2MV_GL || (process.platform === "darwin" ? "angle" : "off");
const glFlag = gl === "off" ? [] : [`--gl=${gl}`];

const CHROME = "157.0.8080.0"; // the version @remotion/renderer pins (TESTED_VERSION)
async function googleChrome() {
  if (process.platform !== "darwin") return null; // Remotion's Linux builds leave the checks out; Windows gets Google's
  const { ensureBrowser } = createRequire(cliPkg)("@remotion/renderer");
  // Remotion keeps a browser under the nearest package.json: this one keeps Google's apart from Remotion's own
  const home = path.join(HERE, "node_modules", ".song2mv-chrome");
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, "package.json"), "{}\n");
  const cwd = process.cwd();
  process.chdir(home);
  let said = false;
  const onProgress = () => said || (said = true, console.warn(`Downloading Chrome ${CHROME} (about 105 MB, once)`));
  try {
    return (await ensureBrowser({ logLevel: "error", onBrowserDownload: () => ({ version: CHROME, onProgress }) })).path;
  } finally {
    process.chdir(cwd);
  }
}
const browser = flag("studio") ? null : await googleChrome();
const browserFlag = browser ? [`--browser-executable=${browser}`] : [];
const remotion = (args) =>
  run([...args, ...rendererPort, ...glFlag, ...browserFlag, `--props=${propsFile}`, `--public-dir=${publicDir}`, `--log=${logLevel}`]);
const probe = (file, entries) =>
  spawnSync(process.execPath, [cli, "ffprobe", "-v", "error", ...entries, "-of", "csv=p=0", file], { cwd: HERE, encoding: "utf8" })
    .stdout.trim();
const maxMb = opt("max-mb") !== undefined ? Number(opt("max-mb")) : null;
const fit = (made, mb) => {
  if (fs.statSync(made).size <= mb * 1e6) return;
  const secs = Number(probe(made, ["-show_entries", "format=duration"]));
  const audioKbps = Math.round(Number(probe(made, ["-select_streams", "a:0", "-show_entries", "stream=bit_rate"]) || 0) / 1000);
  let videoKbps = Math.floor((mb * 8000 * 0.97) / secs) - audioKbps;
  const fitted = path.join(tmp, "fitted.mp4");
  for (let tries = 0; tries < 3; tries++) {  // two passes land within a few % on a song, further off on a few seconds
    if (videoKbps < 100) break;
    const x264 = ["-c:v", "libx264", "-preset", "medium", "-b:v", `${videoKbps}k`, "-passlogfile", path.join(tmp, "pass")];
    run(["ffmpeg", "-y", "-v", "error", "-i", made, "-map", "0:v", ...x264, "-pass", "1", "-an", "-f", "null", "-"]);
    run(["ffmpeg", "-y", "-v", "error", "-i", made, "-map", "0:v", "-map", "0:a?", ...x264, "-pass", "2", "-pix_fmt",
      "yuv420p", "-c:a", "copy", "-movflags", "+faststart", fitted]);
    const size = fs.statSync(fitted).size;
    if (size <= mb * 1e6) {
      fs.renameSync(fitted, made);
      console.warn(`--max-mb ${mb}: encoded again at ${videoKbps} kbit/s to fit`);
      return;
    }
    videoKbps = Math.floor((videoKbps - ((size - mb * 1e6) * 8) / secs / 1000) * 0.97);
  }
  cleanup();
  console.error(`--max-mb ${mb}: ${Math.round(secs)} s of video do not fit in ${mb} MB`);
  process.exit(1);
};

fs.mkdirSync(outDir, { recursive: true });
const wrote = (file) => (opt("manifest") ? fs.appendFileSync(opt("manifest"), file + "\n") : console.log(file));
const place = (made, file) => {
  if (!fs.existsSync(made)) {
    cleanup();
    console.error(`Remotion stopped without writing ${path.basename(file)}`);
    process.exit(1);
  }
  fs.copyFileSync(made, file);
  fs.rmSync(made, { force: true });
  wrote(file);
};
const CHUNK = Number(process.env.SONG2MV_CHUNK ?? 900);
const STALL = Number(process.env.SONG2MV_STALL ?? 180);
const TRIES = 3;

/** pid and everything it started, Chrome too (Remotion gives Chrome a process group of its own) */
function family(pid) {
  const kids = new Map();
  for (const row of (spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).stdout || "").split("\n")) {
    const [child, parent] = row.trim().split(/\s+/).map(Number);
    if (child) kids.set(parent, [...(kids.get(parent) || []), child]);
  }
  const all = [];
  for (const todo = [pid]; todo.length; ) {
    all.push(todo.pop());
    todo.push(...(kids.get(all.at(-1)) || []));
  }
  return all;
}

const arms = new Map();

/**
 * One Remotion run in the background. Its frame counts become the whole video's (`at` frames come before it); its
 * other lines pass through. It is stopped when the computer has slept (Chrome's tabs die with the GPU; the watch
 * timer then fires late, as nothing runs during sleep: Node's own clocks run on through it on a Mac) or when no
 * frame has come for STALL seconds awake: Ctrl-C, on which Remotion kills its Chrome and quits, then SIGKILL to all
 * it started if it is still there 10 s later. Resolves to { how: ok, slept, stalled, crashed (it failed after Chrome
 * crashed or a frame timed out) or failed, slept: seconds asleep }.
 */
function remotionRun(args, at, total) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: HERE, stdio: ["ignore", "pipe", "pipe"] });
    let quiet = 0, slept = 0, stalled = false, crashed = false, kill = null;
    const said = (line) => {
      const fault = /\b(arm: .+?)(?: at \d+(?:\.\d+)? s)?$/.exec(line.replace(/\x1b\[[0-9;]*m/g, ""));
      if (fault) return arms.has(fault[1]) || (arms.set(fault[1], fault[0]), console.warn(fault[0]));
      const m = /^(Rendered|Encoded) (\d+)\/\d+/.exec(line);
      crashed ||= /crashed|Target closed|Session closed|timed out/i.test(line);
      if (!m) return line && console.error(line);
      quiet = 0;
      if (process.stderr.isTTY) process.stderr.write(`\r${m[1]} ${at + Number(m[2])}/${total}  `);
      else console.error(`${m[1]} ${at + Number(m[2])}/${total}`);
    };
    for (const stream of [child.stdout, child.stderr]) {
      let rest = "";
      stream.setEncoding("utf8");
      stream.on("data", (d) => {
        const lines = (rest + d).split(/\r?\n|\r/);
        rest = lines.pop();
        lines.forEach(said);
      });
      stream.on("end", () => said(rest));
    }
    const stop = () => {
      const pids = family(child.pid);
      child.kill("SIGINT");
      kill = setTimeout(() => pids.forEach((p) => { try { process.kill(p, "SIGKILL"); } catch {} }), 10000);
    };
    const every = Math.max(100, Math.min(5000, STALL * 250));
    let tick = Date.now();
    const watch = setInterval(() => {
      const gap = Date.now() - tick;
      tick = Date.now();
      if (slept || stalled) return;
      if (gap > every + 10000) {
        slept = Math.round(gap / 1000);
        stop();
      } else if (STALL > 0 && (quiet += gap) > STALL * 1000) {
        stalled = true;
        stop();
      }
    }, every);
    child.on("close", (code) => {
      clearInterval(watch);
      clearTimeout(kill);
      if (process.stderr.isTTY) process.stderr.write("\n");
      const how = slept ? "slept" : stalled ? "stalled" : code === 0 ? "ok" : crashed ? "crashed" : "failed";
      resolve({ how, slept });
    });
  });
}

/** files joined end to end without encoding them again (videos of one encoder's settings, or WAVs) */
function join(files, out) {
  if (files.length === 1) return fs.renameSync(files[0], out);
  const list = path.join(tmp, "join.txt");
  fs.writeFileSync(list, files.map((f) => `file '${f}'\n`).join(""));
  run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
}

/** composition `id` from the bundle into `made` (video) and `wav` (its audio), CHUNK frames per Remotion run */
async function renderInChunks(bundle, id, made, wav, video) {
  const props = JSON.parse(fs.readFileSync(propsFile, "utf8"));
  const full = Math.round(((props.to ?? props.song.duration) - props.from) * FPS);
  const total = Math.max(1, Math.ceil((full * (props.fps ?? FPS)) / FPS)); // src/Root.tsx's durationInFrames
  const size = CHUNK > 0 ? CHUNK : total, n = Math.ceil(total / size);
  const videos = [], waves = [];
  for (let k = 0; k < n; k++) {
    const a = k * size, b = k === n - 1 ? "" : a + size - 1; // the last runs to the end, whatever its length
    const part = path.join(tmp, `chunk-${k}.mp4`), partWav = path.join(tmp, `chunk-${k}.wav`);
    const what = n > 1 ? `chunk ${k + 1}/${n} (frames ${a}–${b === "" ? total - 1 : b})` : "the render";
    for (let tries = 1; ; tries++) {
      const { how, slept } = await remotionRun(["render", bundle, id, part, ...(n > 1 ? [`--frames=${a}-${b}`] : []),
        ...video, ...(song.audio ? [`--separate-audio-to=${partWav}`] : ["--muted"]), ...rendererPort, ...glFlag,
        ...browserFlag, `--props=${propsFile}`, `--log=${logLevel}`], a, total);
      if (how === "ok" && fs.existsSync(part)) break;
      if (how === "slept") { // not the chunk's fault: as many of these as it takes
        console.warn(`the computer slept for ${slept} s during ${what} (a closed lid?): rendering it again`);
        tries--;
        continue;
      }
      const why = { stalled: `finished no frame for ${STALL} s`, crashed: "stopped after Chrome crashed", failed: "failed",
        ok: "wrote no video" }[how];
      if (how === "failed" || tries === TRIES) { // an error in the scenes fails the same way every time
        cleanup();
        console.error(`${what} ${why}${how === "failed" ? "" : ` ${TRIES} times`}: giving up`);
        process.exit(1);
      }
      console.warn(`${what} ${why}: rendering it again (try ${tries + 1} of ${TRIES})`);
    }
    videos.push(part);
    if (song.audio) waves.push(partWav);
  }
  join(videos, made);
  if (song.audio) join(waves, wav);
}

const range = from > 0 || to !== null ? `-${from}-${to ?? "end"}` : "";
if (flag("studio")) {
  remotion(["studio"]);
} else if (opt("composition")) {
  const id = opt("composition"), frame = Number(opt("frame", 0));
  const made = path.join(tmp, "still.png");
  remotion(["still", id, made, `--frame=${frame}`]);
  place(made, path.join(outDir, `${base}-${id}${frame ? `-${frame}` : ""}.png`));
} else if (opt("still") !== undefined) {
  const t = Number(opt("still"));
  const frame = Math.max(0, Math.round((t - from) * FPS));
  for (const id of aspects) {
    const made = path.join(tmp, "still.png");
    remotion(["still", id, made, `--frame=${frame}`]);
    place(made, path.join(outDir, `${base}-${id.slice(6)}-${t}s.png`));
  }
} else {
  if (process.platform === "darwin") {
    // keeps the Mac awake while this runs, and with the lid closed too while it is on power
    spawn("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref();
    if (/Battery Power/.test(spawnSync("pmset", ["-g", "batt"], { encoding: "utf8" }).stdout || ""))
      console.warn("on battery: closing the lid puts the Mac to sleep, which stops Chrome mid-render (render picks up " +
        "again once it wakes); plug in power to keep it rendering");
  }
  const bundle = path.join(tmp, "bundle");
  run(["bundle", `--out-dir=${bundle}`, `--public-dir=${publicDir}`, `--log=${logLevel}`]);
  for (const id of aspects) {
    const made = path.join(tmp, "video.mp4");
    const wav = path.join(tmp, "audio.wav");
    await renderInChunks(bundle, id, made, wav, [...(draft ? DRAFT_VIDEO : FINAL_VIDEO), ...(browser && !draft ? CAPTURE : [])]);
    if (fs.existsSync(made) && fs.existsSync(wav)) {
      const muxed = path.join(tmp, "muxed.mp4");
      run(["ffmpeg", "-y", "-v", "error", "-i", made, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", muxed]);
      fs.renameSync(muxed, made);
    }
    fs.rmSync(wav, { force: true });
    if (maxMb && !draft && fs.existsSync(made)) fit(made, maxMb);
    place(made, path.join(outDir, `${base}-${id.slice(6)}${range}${draft ? "-draft" : ""}.mp4`));
  }
  if (opt("warnings")) fs.appendFileSync(opt("warnings"), [...arms.values()].map((line) => line + "\n").join(""));
}
cleanup();
