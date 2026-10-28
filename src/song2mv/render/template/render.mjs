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
 *          and the JSON object in FILE, such as {"T": 33.1} for Concepts or {"times": [12, 33.1]} for Contact)
 *          --manifest FILE (append the path of every file written, one per line; else they are printed)
 *
 * The audio is never copied into this folder: a temporary public folder outside it holds a link to it.
 * Remotion mixes the audio to WAV and its ffmpeg writes the AAC: Remotion's own AAC starts 2048 samples late.
 * A finished video is capped at 8 Mbit/s (YouTube's figure for 1080p30): grain-heavy styles otherwise run near 14.
 * On a Mac, Chrome draws on the GPU (Remotion's --gl=angle, Metal): the style packs' filters render many times faster
 * and look the same. SONG2MV_GL=off draws in software, as on Linux and Windows; another value is passed to --gl.
 * On a Mac and Linux, Remotion's own Chrome keeps V8's debug checks, and one of them stops some scenes' renders after a
 * few hundred frames ("Page crashed!"). Renders use Google's build of the same Chrome instead, downloaded once into
 * node_modules/.song2mv-chrome (105–125 MB). SONG2MV_BROWSER=PATH renders with another Chrome.
 */
import { spawnSync } from "node:child_process";
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
// Google's Chrome hands Remotion each frame as a JPEG (Remotion's own shares raw pixels): at Remotion's default quality
// of 80 a final came out 36 % larger for its artifacts, at 100 it is as fast and within 8 % of a raw-pixel render
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
  if (process.env.SONG2MV_BROWSER) return process.env.SONG2MV_BROWSER;
  if (process.platform !== "darwin" && process.platform !== "linux") return null; // Remotion takes Google's build there
  const { ensureBrowser } = createRequire(cliPkg)("@remotion/renderer");
  // Remotion keeps a browser under the nearest package.json: this one keeps Google's apart from Remotion's own
  const home = path.join(HERE, "node_modules", ".song2mv-chrome");
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, "package.json"), "{}\n");
  const cwd = process.cwd();
  process.chdir(home);
  let shown = -1;
  try {
    const onProgress = ({ percent }) => {
      const p = Math.floor(percent * 10) * 10;
      if (p > shown) console.warn(`Downloading Chrome ${CHROME} ${(shown = p)}%`);
    };
    return (await ensureBrowser({ logLevel: "error", onBrowserDownload: () => ({ version: CHROME, onProgress }) })).path;
  } catch (e) {
    console.warn(`Google's Chrome ${CHROME} did not install (${e.message}): rendering with Remotion's, which can stop with "Page crashed!"`);
    return null;
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
const range = from > 0 || to !== null ? `-${from}-${to ?? "end"}` : "";
if (flag("studio")) {
  remotion(["studio"]);
} else if (opt("composition")) {
  const made = path.join(tmp, "still.png");
  remotion(["still", opt("composition"), made, "--frame=0"]);
  place(made, path.join(outDir, `${base}-${opt("composition")}.png`));
} else if (opt("still") !== undefined) {
  const t = Number(opt("still"));
  const frame = Math.max(0, Math.round((t - from) * FPS));
  for (const id of aspects) {
    const made = path.join(tmp, "still.png");
    remotion(["still", id, made, `--frame=${frame}`]);
    place(made, path.join(outDir, `${base}-${id.slice(6)}-${t}s.png`));
  }
} else {
  for (const id of aspects) {
    const made = path.join(tmp, "video.mp4");
    const wav = path.join(tmp, "audio.wav");
    remotion(["render", id, made, ...(draft ? DRAFT_VIDEO : FINAL_VIDEO), ...CAPTURE, ...(song.audio ? [`--separate-audio-to=${wav}`] : [])]);
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
}
cleanup();
