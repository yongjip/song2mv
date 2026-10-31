"""The bundled template rendered through render.mjs: needs Node, ffmpeg and `npm ci` in the template (CI's template job)."""
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pytest

from song2mv.check.score import decode_gray, probe_size
from song2mv.render.runner import BUNDLED

pytestmark = pytest.mark.skipif(
    not (shutil.which("node") and shutil.which("ffmpeg") and os.path.isdir(os.path.join(BUNDLED, "node_modules", "@remotion", "cli"))),
    reason="needs node, ffmpeg and the template installed (npm ci in src/song2mv/render/template)")


@pytest.mark.parametrize("to", ["2.0333", "2.0667", "2.1"])
def test_check_measures_a_draft_on_as_many_frames_as_its_full_render(tmp_path, to):
    # check measures N frames at 30 fps at each tenth of a second, ceil(N / 3) of them: 21 of the 61 in 2.0333 s
    manifest = tmp_path / "wrote.txt"
    for extra in ([], ["--draft"]):
        subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", to,
                        "--out", str(tmp_path), "--manifest", str(manifest), *extra],
                       cwd=BUNDLED, check=True, capture_output=True)
    full, draft = manifest.read_text(encoding="utf-8").split()
    assert draft.endswith("-draft.mp4") and probe_size(draft) == (960, 540)
    assert len(decode_gray(draft, 64, 36)) == len(decode_gray(full, 64, 36)) == -(-round(float(to) * 30) // 3)


def click_track(tmp_path, sr: int = 48000):
    """3 s of silence with clicks at 1, 1.5 and 2.25 s: the samples, and the WAV they are written to"""
    x = np.zeros(3 * sr)
    for t in (1.0, 1.5, 2.25):
        i = round(t * sr)
        x[i:i + 48] = 0.9 * np.hanning(48) * np.sin(2 * np.pi * 3000 * np.arange(48) / sr)
    wav = tmp_path / "click.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    return x, wav


def test_the_rendered_audio_starts_with_the_picture(tmp_path):
    sr = 48000
    x, wav = click_track(tmp_path, sr)
    manifest = tmp_path / "wrote.txt"
    subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--audio", str(wav), "--from", "0",
                    "--to", "3", "--out", str(tmp_path), "--manifest", str(manifest)],
                   cwd=BUNDLED, check=True, capture_output=True)
    mp4 = manifest.read_text(encoding="utf-8").split()[0]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    y = np.frombuffer(raw, dtype="<i2").astype(float)
    n = min(len(x), len(y))
    c = np.fft.irfft(np.fft.rfft(y[:n], 2 * n) * np.conj(np.fft.rfft(x[:n], 2 * n)))
    lag = int(np.argmax(c))
    assert min(lag, 2 * n - lag) <= 2


def every_frame(mp4: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-fps_mode", "passthrough", "-vf", "scale=64:36,format=gray",
                          "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, 36, 64).astype(float)


def samples(mp4: str) -> np.ndarray:
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-f", "s16le", "-"], check=True,
                                        capture_output=True).stdout, dtype="<i2")


def test_a_video_rendered_in_chunks_matches_one_rendered_in_one_piece(tmp_path):
    _, wav = click_track(tmp_path)
    made = {}
    for chunk in ("0", "40"):  # 90 frames in one piece, and as 40 + 40 + 10
        manifest = tmp_path / f"wrote-{chunk}.txt"
        subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--audio", str(wav), "--from", "0",
                        "--to", "3", "--out", str(tmp_path / chunk), "--manifest", str(manifest)],
                       cwd=BUNDLED, check=True, capture_output=True, env={**os.environ, "SONG2MV_CHUNK": chunk})
        made[chunk] = manifest.read_text(encoding="utf-8").split()[0]
    one, chunks = every_frame(made["0"]), every_frame(made["40"])
    assert len(one) == len(chunks) == 90
    assert np.abs(one - chunks).mean(axis=(1, 2)).max() < 2  # encoded apart, so close rather than equal
    # the same samples, joins included, but for rounding in Remotion's mix (±1 of 32768, by the first click)
    assert np.abs(samples(made["0"]).astype(int) - samples(made["40"]).astype(int)).max() <= 1


def family(pid: int) -> list[int]:
    rows = [r.split() for r in subprocess.run(["ps", "-A", "-o", "pid=,ppid="], capture_output=True, text=True).stdout.splitlines()]
    tree, todo = [], [pid]
    while todo:
        tree.append(todo.pop())
        todo += [int(c) for c, parent in rows if int(parent) == tree[-1]]
    return tree


def test_a_chunk_is_rendered_again_after_the_computer_slept(tmp_path):
    # as sleep does, render.mjs, Remotion and Chrome all stop for 20 s mid-chunk; render.mjs's watch timer fires late
    p = subprocess.Popen(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", "3",
                          "--out", str(tmp_path)], cwd=BUNDLED, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    err = []
    for line in p.stderr:
        err.append(line)
        if line.startswith("Rendered"):
            frozen = family(p.pid)
            for pid in frozen:
                os.kill(pid, signal.SIGSTOP)
            time.sleep(20)
            for pid in frozen:
                os.kill(pid, signal.SIGCONT)
            break
    err += p.stderr.readlines()
    assert p.wait(timeout=300) == 0
    assert any(line.startswith("the computer slept for") and "rendering it again" in line for line in err)
    assert len(every_frame(str(next(tmp_path.glob("*.mp4"))))) == 90


def test_a_chunk_is_rendered_again_after_chromes_browser_process_died(tmp_path):
    # Remotion then waits forever for the frames the dead browser had, repeating its last count every 0.5 s
    p = subprocess.Popen(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", "3",
                          "--out", str(tmp_path)], cwd=BUNDLED, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
                         env={**os.environ, "SONG2MV_STALL": "10"})
    for line in p.stderr:
        if re.match(r"Rendered 3\d/90", line):
            break
    # -ww: pytest imports readline, which exports COLUMNS=80, and Linux's ps cuts its lines to that
    rows = [r.split(None, 1) for r in subprocess.run(["ps", "-ww", "-A", "-o", "pid=,args="], capture_output=True, text=True).stdout.splitlines()]
    args = {int(r[0]): r[1] for r in rows if len(r) == 2}
    mine = {pid: args.get(pid, "") for pid in family(p.pid)}
    # the browser process opens Chrome's start page; its tabs, GPU and utility processes have --type= instead
    browsers = [pid for pid, command in mine.items() if "chrome-headless-shell about:blank" in command]
    assert len(browsers) == 1, f"not one Chrome browser process among the render's processes: {mine}"
    os.kill(browsers[0], signal.SIGKILL)
    try:
        err = p.communicate(timeout=120)[1]
    except subprocess.TimeoutExpired:
        subprocess.run(["kill", "-KILL", *map(str, family(p.pid))], capture_output=True)
        raise
    assert p.returncode == 0, err
    assert len(every_frame(str(next(tmp_path.glob("*.mp4"))))) == 90


def test_a_chunk_that_shows_no_frame_is_rendered_again_then_given_up(tmp_path):
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", "1",
                        "--out", str(tmp_path)], cwd=BUNDLED, capture_output=True, text=True, timeout=300,
                       env={**os.environ, "SONG2MV_STALL": "0.001"})
    assert r.returncode == 1
    assert "rendering it again (try 3 of 3)" in r.stderr and "3 times: giving up" in r.stderr
    assert not list(tmp_path.glob("*.mp4"))


def test_a_render_does_not_connect_to_an_ipv6_only_studio_on_the_default_port(tmp_path):
    requests = []

    class ForeignStudio(ThreadingHTTPServer):
        address_family = socket.AF_INET6

        def server_bind(self):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            super().server_bind()

    class ForeignPage(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            self.send_error(503)

        def log_message(self, *args):
            pass

    try:
        studio = ForeignStudio(("::1", 3000), ForeignPage)
    except OSError as error:
        pytest.skip(f"needs a free IPv6 loopback port 3000: {error}")
    thread = threading.Thread(target=studio.serve_forever, daemon=True)
    thread.start()
    try:
        manifest = tmp_path / "wrote.txt"
        result = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", "0.1",
                                 "--out", str(tmp_path), "--manifest", str(manifest)],
                                cwd=BUNDLED, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stdout + result.stderr
        assert probe_size(manifest.read_text(encoding="utf-8").strip()) == (1920, 1080)
        assert not requests, "Rendering must not request a page from an unrelated IPv6-only Studio"
    finally:
        studio.shutdown()
        studio.server_close()
        thread.join()


def test_max_mb_encodes_a_finished_video_again_to_fit_and_keeps_its_sound(tmp_path):
    sr = 48000
    wav = tmp_path / "tone.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((0.3 * np.sin(2 * np.pi * 440 * np.arange(3 * sr) / sr) * 32767).astype("<i2").tobytes())
    manifest = tmp_path / "wrote.txt"
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--audio", str(wav), "--from", "0",
                        "--to", "3", "--out", str(tmp_path), "--manifest", str(manifest), "--max-mb", "0.2"],
                       cwd=BUNDLED, check=True, capture_output=True, text=True)
    mp4 = manifest.read_text(encoding="utf-8").split()[0]
    streams = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp4],
                             check=True, capture_output=True, text=True).stdout.replace(",", "").split()
    assert "encoded again" in r.stderr and os.path.getsize(mp4) <= 200_000 and streams == ["video", "audio"]


VERTICAL_SCENES = """
import React from "react";
import { Svg, Song, pixel, verticalView } from "../kit";

const SUBJECTS = [[1000, 600], [1900, 600], [1003, 597]];
const view = (i: number, x: number, y: number) =>
  i < 2 ? verticalView({ x, y, zoom: 2 }) : pixel.cameraAt(0, [{ t: 0, x, y, zoom: 2.4 }], { px: 8, vertical: true });

export const Scene: React.FC<{ T: number }> = () => null;
export const linesDrawnByScene = (_song: Song) => new Set<string>();
export const VerticalScene: React.FC<{ T: number }> = ({ T }) => {
  const [x, y] = SUBJECTS[Math.round(T)];
  return (
    <Svg w={1080} h={1920}>
      <g transform={view(Math.round(T), x, y).svg}>
        <rect x={0} y={0} width={1920} height={1080} fill="#203040" />
        <rect x={x - 5} y={y - 5} width={10} height={10} fill="#ff0000" />
      </g>
    </Svg>
  );
};
"""


def test_vertical_view_puts_the_subject_in_the_picture_area_and_keeps_the_frame_on_the_stage(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(VERTICAL_SCENES, encoding="utf-8")
    (tmp_path / "sheet.json").write_text('{"times": [0, 1, 2], "cols": 3, "vertical": true}', encoding="utf-8")
    subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Contact",
                    "--props", str(tmp_path / "sheet.json"), "--out", str(tmp_path), "--name", "v"],
                   cwd=template, check=True, capture_output=True)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp_path / "v-Contact.png"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(-1, 1920, 3).astype(int)
    red = (rgb[..., 0] > 200) & (rgb[..., 1] < 60) & (rgb[..., 2] < 60)
    gap, tile = 12, (1920 - 12 * 4) / 3
    scale = tile / 1080
    found = []
    for i in range(3):
        ys, xs = np.nonzero(red[:, round(gap + i * (tile + gap)):round(gap + i * (tile + gap) + tile)])
        found.append((xs.mean() / scale, (ys.mean() - gap) / scale))
    # the subject on the picture area's middle; at the stage's right edge the frame stops there; a pixel scene on 16 px blocks
    for (x, y), (ex, ey) in zip(found, [(540, 674.5), (1040, 674.5), (534, 682)]):
        assert abs(x - ex) < 3 and abs(y - ey) < 3, found


ARM_SCENES = """
import React from "react";
import { arm, Song } from "../kit";

export const Scene: React.FC<{ T: number }> = ({ T }) => {
  arm([0, 0], [T > 1.25 ? 150 : 60, 40], 50, 50, undefined, { holds: true, who: "probe right", T });
  arm([0, 0], [10, -20], 50, 50, [0, -1], { who: "probe left", T });
  console.warn("storyboard: the probe's board never cuts");
  return <rect width={1920} height={1080} fill="#203040" />;
};
export const VerticalScene = null;
export const linesDrawnByScene = (_song: Song) => new Set<string>();
"""


def _arm_template(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(ARM_SCENES, encoding="utf-8")
    return template


def test_each_kit_warning_is_listed_once_from_every_tab_and_chunk(tmp_path):
    seen = tmp_path / "warnings.txt"
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "0", "--to", "2", "--draft",
                        "--out", str(tmp_path), "--warnings", str(seen)],
                       cwd=_arm_template(tmp_path), env={**os.environ, "SONG2MV_CHUNK": "10"}, check=True, capture_output=True, text=True)
    arms = [line for line in seen.read_text(encoding="utf-8").splitlines() if line.startswith("arm:")]
    left, right = sorted(arms)
    assert re.fullmatch(r"arm: probe left: folded into a V, elbow up at 0\.\d0 s", left), left
    assert re.fullmatch(r"arm: probe right: out of reach at 1\.[3-9]0 s", right), right
    assert "storyboard: the probe's board never cuts" in seen.read_text(encoding="utf-8").splitlines()
    for said in ("probe left", "probe right", "probe's board"):
        assert r.stderr.count(said) == 1, r.stderr


WIDE_SCENES = """
import React from "react";
import { Board, Song, Storyboard } from "../kit";

const Dot: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <>
    <rect x={-200} y={-200} width={2320} height={1600} fill="#203040" />
    <rect x={x - 5} y={y - 5} width={10} height={10} fill="#ff0000" />
  </>
);
const BOARDS: Board[] = [
  { at: "v1", world: () => <Dot x={700} y={640} />, framings: [{ x: 700, y: 640, zoom: 1.5 }, { x: 960, y: 540 }], drift: 0 },
  { at: "ch", world: () => <Dot x={960} y={1150} />, framings: [{ x: 960, y: 540 }, { x: 600, y: 300, zoom: 2 }], drift: 0 },
];
export const Scene: React.FC<{ T: number }> = ({ T }) => <Storyboard T={T} boards={BOARDS} />;
export const VerticalScene = null;
export const linesDrawnByScene = (_song: Song) => new Set<string>();
"""


def test_a_storyboard_puts_a_framings_point_above_the_captions_in_16x9(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(WIDE_SCENES, encoding="utf-8")
    (tmp_path / "sheet.json").write_text('{"times": [0.5, 9.3], "cols": 2}', encoding="utf-8")
    subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Contact",
                    "--props", str(tmp_path / "sheet.json"), "--out", str(tmp_path), "--name", "w"],
                   cwd=template, check=True, capture_output=True)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp_path / "w-Contact.png"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(-1, 1920, 3).astype(int)
    red = (rgb[..., 0] > 200) & (rgb[..., 1] < 60) & (rgb[..., 2] < 60)
    gap, tile = 12, (1920 - 12 * 3) / 2
    scale = tile / 1920
    found = []
    for i in range(2):
        ys, xs = np.nonzero(red[:, round(gap + i * (tile + gap)):round(gap + i * (tile + gap) + tile)])
        found.append((xs.mean() / scale, (ys.mean() - gap) / scale))
    # the subject's middle in the middle of the picture above the captions (y 0–840); a wide shot runs on below the stage
    for (x, y), (ex, ey) in zip(found, [(960, 420), (960, 1030)]):
        assert abs(x - ex) < 4 and abs(y - ey) < 4, found


PIXEL_PROBE = """
import { cameraAt } from "%s";

const RUNS = {
  glide: [{ t: 0, x: 960, y: 540, zoom: 2 }, { t: 2, x: 700, y: 500, zoom: 1, glide: 1 }],
  drift: [{ t: 0, x: 960, y: 540, zoom: 1, to: { zoom: 1.8 } }, { t: 4, x: 960, y: 540 }],
};
const zooms = (shots: typeof RUNS.glide) => Array.from({ length: 81 }, (_, k) => k / 20)
  .map((T) => [T, cameraAt(T, shots, { px: 8 }).zoom, cameraAt(T, shots, { px: 8, vertical: true }).zoom]);
console.log(JSON.stringify({ glide: zooms(RUNS.glide), drift: zooms(RUNS.drift) }));
"""


def test_a_pixel_short_changes_zoom_when_its_16x9_version_does(tmp_path):
    probe = tmp_path / "probe.ts"
    probe.write_text(PIXEL_PROBE % os.path.join(BUNDLED, "src", "kit", "styles", "pixel"), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    runs = json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)
    # a glide from zoom 2 to 1 cuts on its shot's time in both frames; a drift in zoom shows in neither
    assert [(T, wide) for T, wide, _ in runs["glide"]] == [(T, 2 if T < 2 else 1) for T, _, _ in runs["glide"]]
    assert all(wide == tall for _, wide, tall in runs["glide"]), runs["glide"]
    assert {(wide, tall) for _, wide, tall in runs["drift"]} == {(1, 1)}, runs["drift"]


CAPTION_PROBE = """
import { captionLine } from "%s";
const L = (id: string, ts: number[], end: number) => ({ id, text: id, words: ts.map((t, i) => ({ w: "w" + i, t })), end });
const lines = [L("v1-16", [48.6, 49.4, 50.0, 50.6], 51.08), L("ch1-01", [50.775, 51.0, 51.4], 52.5),
  L("v2-01", [60.0, 60.5, 61.0, 61.5], 62.0), L("chant", [60.6], 60.9)] as any;
const at = (T: number) => captionLine(lines, T, new Set(["ch1-01", "chant"]))?.id ?? null;
console.log(JSON.stringify({ verse: at(50.5), pickup: at(50.7), chant: at(60.7), after: at(61.6) }));
"""


def test_a_caption_gives_way_to_a_scene_drawn_pickup_but_not_to_a_chant_over_it(tmp_path):
    probe = tmp_path / "probe.ts"
    probe.write_text(CAPTION_PROBE % os.path.join(BUNDLED, "src", "kit", "text"), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    seen = json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)
    assert seen == {"verse": "v1-16", "pickup": None, "chant": "v2-01", "after": "v2-01"}


def _song(bpm: float, beats: list[float] | None = None, swing: list[float] | None = None) -> dict:
    """A song for the planner: a calm intro, a dense verse (a line every 1.5 s), a hot chorus, a sparse verse (long
    lines every 4 s, one bar apart and a half), the chorus again and a calm outro; every line starts on a 16th"""
    beat = 60 / bpm
    grid = {"bpm": bpm, "beat": beat, "phi": 0.0, "downbeat_mod4": 0, "beats": beats, "swing": swing}
    t_of = (lambda b: float(np.interp(b, range(len(beats)), beats))) if beats else (lambda b: b * beat)
    secs, lines = [], []

    def section(sid: str, kind: str, bars: int, every: float, length: float) -> None:
        start = t_of(4 * sum(s["bars"] for s in secs))
        secs.append({"id": sid, "name": sid, "kind": kind, "start": start, "end": t_of(4 * (sum(s["bars"] for s in secs) + bars)), "bars": bars})
        n = 0
        b = 4 * sum(s["bars"] for s in secs[:-1]) + 1.75
        while b + length / beat < 4 * sum(s["bars"] for s in secs) and kind != "calm":
            t0 = t_of(b)
            words = [{"w": f"w{k}", "t": round(t_of(b + k * 0.5), 3)} for k in range(int(length / beat / 0.5))]
            lines.append({"id": f"{sid}-{n + 1:02d}", "section": sid, "text": " ".join(w["w"] for w in words), "start": round(t0, 3),
                          "end": round(t_of(b + length / beat), 3), "words": words})
            n += 1
            b += every / beat

    section("in", "calm", 4, 0, 0)
    section("v1", "mid", 12, 1.5, 1.4)
    section("ch1", "hot", 8, 2.0, 1.9)
    section("v2", "mid", 12, 4.0 * bpm / 120, 3.8 * bpm / 120)
    section("ch2", "hot", 8, 2.0, 1.9)
    section("ou", "calm", 4, 0, 0)
    for s in secs:
        del s["bars"]
    return {"title": "", "audio": None, "duration": secs[-1]["end"], "grid": grid, "sections": secs, "lines": lines}


PLAN_PROBE = """
import { makeSongCtx } from "KIT/song";
import { planShots } from "KIT/plan";
const song = SONG;
const ctx = makeSongCtx(song);
const g = ctx.grid;
const F = [{ x: 960, y: 540 }, { x: 700, y: 640, zoom: 2.2 }, { x: 1300, y: 420, zoom: 1.5, rotate: -3 }];
const near = (a: number, b: number) => Math.abs(a - b) < 2e-3;
const firsts = song.lines.map((l: any) => l.words[0].t);
const on = (t: number) => {
  const b = g.beatPos(t), n = Math.round(b);
  if (near(g.beatTime(n), t) && (((n - g.downbeat_mod4) % 4) + 4) % 4 === 0) return "bar";
  if (near(g.beatTime(n), t) && (((n - g.downbeat_mod4) % 2) + 2) % 2 === 0) return "half";
  const beat = g.beatTime(Math.floor(b) + 1) - g.beatTime(Math.floor(b));
  return firsts.some((w: number) => near(w - Math.min(0.15, beat / 4), t)) ? "lead" : "other";
};
const out = song.sections.map((s: any) => {
  const { shots, hits } = planShots(ctx, s.start, s.end, F);
  return { id: s.id, kind: s.kind, start: s.start, end: s.end, hits,
    shots: shots.slice(0, -1).map((x) => ({ t: x.t, framing: x.framing, on: on(x.t), drift: !!x.to })) };
});
console.log(JSON.stringify(out));
"""


def _plan(tmp_path, song: dict) -> list[dict]:
    probe = tmp_path / "probe.ts"
    probe.write_text(PLAN_PROBE.replace("KIT", os.path.join(BUNDLED, "src", "kit")).replace("SONG", json.dumps(song)), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    return json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)


def _drifting_beats(n: int) -> list[float]:
    t, out = 0.0, []
    for k in range(n):
        out.append(round(t, 4))
        t += 60 / (88 - 4 * k / n)
    return out


@pytest.mark.parametrize("song", [_song(120), _song(92), _song(88, _drifting_beats(400), [0.33, 0.83])], ids=["120", "92", "beat-map-swing"])
def test_planned_cuts_pass_checks_rules(tmp_path, song):
    plan = _plan(tmp_path, song)
    lines = sorted(song["lines"], key=lambda r: r["start"])
    for sec in plan:
        ts = [s["t"] for s in sec["shots"]]
        assert ts[0] == sec["start"] and all(s["drift"] for s in sec["shots"]), sec["id"]
        # every cut on a bar line (or the bar's middle) or a 16th before a line's first word
        assert all(s["on"] != "other" for s in sec["shots"][1:]), (sec["id"], sec["shots"])
        iv = np.diff(ts + [sec["end"]])
        if sec["kind"] != "calm":
            assert iv.max() <= 5.6, (sec["id"], ts)
        if sec["kind"] == "mid":
            cv = np.diff(ts).std() / np.diff(ts).mean()
            assert len(ts) < 4 or cv >= 0.4, (sec["id"], cv, ts)
            for k, r in enumerate(lines):
                if r["section"] != sec["id"]:
                    continue
                nxt = lines[k + 1]["start"] if k + 1 < len(lines) else sec["end"]
                end = max(min(r["end"], nxt), r["start"] + 1.5)
                inside = [t for t in ts if r["start"] + 0.1 < t < min(end, nxt - 0.2)]
                assert len(inside) <= (0 if min(end, nxt) - r["start"] < 1.8 else 1), (r["id"], inside)
        if sec["kind"] == "hot":
            assert sec["hits"] and all(any(abs(h - t) < 1e-6 for t in ts) for h in sec["hits"]), sec["id"]


def test_the_second_chorus_does_not_repeat_the_first_ones_shots(tmp_path):
    plan = {s["id"]: s for s in _plan(tmp_path, _song(120))}
    ch1, ch2 = plan["ch1"], plan["ch2"]

    def framing(sec, dt):
        return [s["framing"] for s in sec["shots"] if s["t"] <= sec["start"] + dt][-1]

    times = np.arange(0.25, ch1["end"] - ch1["start"], 0.5)
    assert all(framing(ch1, dt) != framing(ch2, dt) for dt in times)


BOARD_PROBE = """
import { linesDrawnBy } from "%s";
const L = (id: string, section: string, t: number) => ({ id, section, text: id, start: t, end: t + 1, words: [{ w: id, t }] });
const song = { title: "", audio: null, duration: 30, grid: { bpm: 120, beat: 0.5, phi: 0, downbeat_mod4: 0 },
  sections: [{ id: "v1", name: "v1", kind: "mid", start: 0, end: 10 }, { id: "ch1", name: "ch1", kind: "hot", start: 10, end: 30 }],
  lines: [L("v1-01", "v1", 2), L("v1-02", "v1", 6), L("ch1-01", "ch1", 11), L("ch1-02", "ch1", 15), L("ch1-03", "ch1", 20)] } as any;
const world = () => null;
const board = (at: string | number, big?: boolean) => ({ at, world, framings: [{ x: 960, y: 540 }], big });
const drawn = (b: any[]) => [...linesDrawnBy(song, b)].sort();
let unknown = "";
try { linesDrawnBy(song, [board("v1"), board("ch9")]); } catch (e) { unknown = String(e); }
console.log(JSON.stringify({ chorus: drawn([board("v1"), board("ch1", true)]), from_line: drawn([board("v1"), board("v1-02", true), board("ch1-03")]),
  at_time: drawn([board(0), board(14.5, true)]), unknown }));
"""


def test_boards_start_at_lines_sections_or_times_and_name_the_lines_they_draw(tmp_path):
    probe = tmp_path / "probe.ts"
    probe.write_text(BOARD_PROBE % os.path.join(BUNDLED, "src", "kit", "storyboard"), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    seen = json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)
    assert seen["chorus"] == ["ch1-01", "ch1-02", "ch1-03"]
    assert seen["from_line"] == ["ch1-01", "ch1-02", "v1-02"]
    assert seen["at_time"] == ["ch1-02", "ch1-03"]
    assert '"ch9"' in seen["unknown"]


def test_the_starter_draws_a_song_from_the_line_given_in_scenes_index(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    index = template / "src" / "scenes" / "index.ts"
    line = next(r.lstrip("/ ") for r in index.read_text(encoding="utf-8").splitlines() if '"./Starter"' in r)
    index.write_text(line + "\n", encoding="utf-8")
    for vertical in (False, True):
        (tmp_path / "sheet.json").write_text(json.dumps({"times": [2, 9, 14], "cols": 3, "vertical": vertical}), encoding="utf-8")
        name = f"starter{int(vertical)}"
        subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Contact",
                        "--props", str(tmp_path / "sheet.json"), "--out", str(tmp_path), "--name", name],
                       cwd=template, check=True, capture_output=True)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp_path / f"{name}-Contact.png"), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                             check=True, capture_output=True).stdout
        gray = np.frombuffer(raw, np.uint8).reshape(-1, 1920).astype(float)
        gap, tile = 12, (1920 - 12 * 4) / 3
        high = round(tile * (1920 / 1080 if vertical else 1080 / 1920))
        for i in range(3):
            frame = gray[gap:gap + high, round(gap + i * (tile + gap)):round(gap + i * (tile + gap) + tile)]
            assert frame.mean() > 25 and frame.std() > 20, (vertical, i, frame.mean(), frame.std())


BOARDS_PROBE = """
import { makeSongCtx } from "KIT/song";
import { planBoards, planShots } from "KIT/plan";
const song = SONG;
const ctx = makeSongCtx(song);
const F = [{ x: 960, y: 540 }, { x: 700, y: 640, zoom: 2.2 }, { x: 1300, y: 420, zoom: 1.5, rotate: -3 }];
const lead = (id: string) => song.lines.find((l: any) => l.id === id).words[0].t - 0.15;
const starts = KEYS.map((k: string) => (k.includes("-") ? lead(k) : song.sections.find((s: any) => s.id === k).start));
const plans = planBoards(ctx, starts.map((from: number, i: number) => ({
  from: i ? from : 0, to: starts[i + 1] ?? song.duration, framings: F, reorder: !KEYS[i].includes("-") })));
const shots = (p: any) => p.shots.slice(0, -1).map((s: any) => ({ t: s.t, framing: s.framing, to: s.to ?? null, x: s.x, y: s.y, zoom: s.zoom }));
console.log(JSON.stringify({
  boards: plans.map(shots),
  one: shots(planShots(ctx, 0, song.duration, F)), half: shots(planShots(ctx, 0, song.duration, F, { drift: 0.5 })),
}));
"""


def _verse_song(spacing: list[int]) -> dict:
    """At 100 BPM: verses of 2.2 s lines `spacing` beats apart (cycled), a hot chorus between them and a mid outro"""
    beat = 0.6
    secs, lines = [], []
    for sid, kind, bars in (("in", "calm", 2), ("v1", "mid", 12), ("ch1", "hot", 8), ("v2", "mid", 12), ("ou", "mid", 6)):
        b0 = 4 * sum(s["bars"] for s in secs)
        secs.append({"id": sid, "name": sid, "kind": kind, "start": b0 * beat, "end": (b0 + 4 * bars) * beat, "bars": bars})
        b, n = b0 + 0.75, 0
        while kind != "calm" and (b + 4) * beat <= (b0 + 4 * bars) * beat:
            words = [{"w": f"w{k}", "t": round(b * beat + k * 0.3, 3)} for k in range(7)]
            lines.append({"id": f"{sid}-{n + 1:02d}", "section": sid, "text": "", "start": round(b * beat, 3),
                          "end": round(b * beat + 2.2, 3), "words": words})
            b += spacing[n % len(spacing)]
            n += 1
    for s in secs:
        del s["bars"]
    grid = {"bpm": 100, "beat": beat, "phi": 0.0, "downbeat_mod4": 0}
    return {"title": "", "audio": None, "duration": secs[-1]["end"], "grid": grid, "sections": secs, "lines": lines}


def _boards(tmp_path, song: dict, keys: list[str]) -> dict:
    probe = tmp_path / "probe.ts"
    probe.write_text(BOARDS_PROBE.replace("KIT", os.path.join(BUNDLED, "src", "kit")).replace("SONG", json.dumps(song))
                     .replace("KEYS", json.dumps(keys)), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}"], check=True)
    return json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)


@pytest.mark.parametrize("spacing, whole", [([4, 4, 5, 4, 6, 4, 4], True), ([4], False)], ids=["uneven", "even"])
def test_boards_at_lines_are_cuts_of_one_plan_for_their_section(tmp_path, spacing, whole):
    # Boards every 2–3 lines of the verses: their starts are cuts their section's rhythm counts. Unevenly spaced, the
    # verses cut inside none of their 2.2 s lines; a bar apart, cut only where they meet, they would cut too evenly, and
    # the rhythm wins. A board at a line opens on its first framing in verse 2 too; the verses' section boards differ.
    song = _verse_song(spacing)
    keys = ["in", "v1", "v1-03", "v1-06", "v1-08", "ch1", "v2", "v2-04", "v2-06", "ou"]
    seen = _boards(tmp_path, song, keys)
    cuts = sorted(s["t"] for b in seen["boards"] for s in b)
    for sec in (s for s in song["sections"] if s["kind"] == "mid"):
        inside = [t for t in cuts if sec["start"] - 1e-6 <= t <= sec["end"] + 1e-6]
        iv = np.diff(inside)
        assert iv.std() / iv.mean() >= (0.37 if sec["id"] != "ou" else 0.35), (sec["id"], inside)
        split = [t for r in song["lines"] if r["section"] == sec["id"] for t in cuts if r["start"] + 0.1 < t < r["end"] - 0.2]
        assert sec["id"] == "ou" or (not split) == whole, (sec["id"], split)
    opens = {k: b[0]["framing"] for k, b in zip(keys, seen["boards"])}
    assert opens["v1-03"] == opens["v2-04"] == 0 and opens["v1"] != opens["v2"]


def test_drift_scales_every_shots_move_and_keeps_the_cuts(tmp_path):
    seen = _boards(tmp_path, _verse_song([4, 4, 5, 4, 6, 4, 4]), ["in"])
    one, half = seen["one"], seen["half"]
    assert [s["t"] for s in one] == [s["t"] for s in half] and [s["framing"] for s in one] == [s["framing"] for s in half]
    same = 0
    for a, b in zip(one, half):
        if a["to"] is None or set(a["to"]) != set(b["to"]) or any((a["to"][k] is None) != (b["to"][k] is None) for k in a["to"]):
            continue
        for k in ("x", "y"):
            if a["to"].get(k) is not None:
                assert abs((b["to"][k] - b[k]) - 0.5 * (a["to"][k] - a[k])) < 1e-6, (a, b)
        if a["to"].get("zoom") is not None:  # a push in to zoom·(1 + k), a pull out to zoom / (1 + k)
            k = [max(s["to"]["zoom"] / s["zoom"], s["zoom"] / s["to"]["zoom"]) - 1 for s in (a, b)]
            assert abs(k[1] - 0.5 * k[0]) < 1e-6, (a, b)
        same += 1
    assert same >= 10, same


def test_the_caption_band_stays_over_short_gaps_and_fades_round_long_ones(tmp_path):
    def line(i, t0, t1, ws=None, sec="v1"):
        ws = ws or [t0, (t0 + t1) / 2]
        return {"id": f"{sec}-0{i}", "section": sec, "text": "", "start": t0, "end": t1,
                "words": [{"w": "w", "t": t} for t in ws]}
    song = {"lines": [line(1, 1.0, 2.0), line(2, 2.7, 3.4), line(3, 6.0, 7.0), line(1, 7.3, 8.0, sec="ch1"),
                      line(4, 9.0, 10.0, [9.0, 9.5, 9.8])],
            "captions": {"hide": ["ch1-01"], "from_word": {"v1-04": 1}}}
    band = dict(zip(["on", "gap", "after", "gone", "before", "hidden", "late"], _probe(tmp_path, """
import { captionBand } from "KIT/text";
const song = SONG;
const skip = new Set(song.captions.hide);
console.log(JSON.stringify([1.5, 2.3, 3.7, 4.05, 5.6, 7.25, 9.0].map((T) => captionBand(song, T, skip))));
""", song)))
    assert band["on"] == 1 and band["gap"] > 0.95  # on through a line, barely dipping over a 0.53 s gap between two
    assert band["after"] > 0.99 and band["gone"] == 0  # full 0.25 s after the last word, gone 0.6 s after
    assert 0.5 < band["before"] < 1  # fading in before the next line
    assert band["hidden"] == 0  # off while the scene draws a line itself
    assert 0.3 < band["late"] < 0.9  # a line shown from its second word fades in for that word, not the first


OPENING_PROBE = """
import { makeSongCtx } from "KIT/song";
import { planBoards } from "KIT/plan";
const song = SONG;
const ctx = makeSongCtx(song);
const F = [{ x: 960, y: 540 }, { x: 700, y: 640, zoom: 2.2 }, { x: 1300, y: 420, zoom: 1.5, rotate: -3 }];
const keys = ["in", "v1-01", "v1-05", "ch1", "v2-01", "ou"];
const lead = (id: string) => song.lines.find((l: any) => l.id === id).words[0].t - 0.15;
const starts = keys.map((k) => (k.includes("-") ? lead(k) : song.sections.find((s: any) => s.id === k).start));
const plan = (patterns: Record<string, number[]>) => planBoards(ctx, starts.map((from: number, i: number) => ({
  from: i ? from : 0, to: starts[i + 1] ?? song.duration, framings: F, pattern: patterns[keys[i]] })));
const cuts = (plans: any[]) => plans.flatMap((p) => p.shots.slice(0, -1).map((s: any) => s.t)).sort((a: number, b: number) => a - b);
const set = plan({ "v2-01": [1, 3], "v1-05": [1, 1] });
console.log(JSON.stringify({ starts: Object.fromEntries(keys.map((k, i) => [k, starts[i]])), plain: cuts(plan({})), set: cuts(set),
  idle: set.map((p: any) => Boolean(p.idlePattern)) }));
"""


def test_a_section_opens_on_the_board_at_its_first_line_and_cuts_in_its_pattern(tmp_path):
    # Boards at the first lines of v1 and v2 start 0.3 s into their sections: the shot before runs on to them, where a
    # cut at the section's start too would make a 0.3 s shot that check counts as one cut with the board's (and the
    # plan would weigh a rhythm check never sees). v2 opens on its board, whose pattern sets v2's cuts; no section opens
    # on v1-05, whose pattern is idle.
    song = _verse_song([4, 4, 5, 4, 6, 4, 4])
    seen = _probe(tmp_path, OPENING_PROBE, song)
    secs = {s["id"]: s for s in song["sections"]}
    for cuts in (seen["plain"], seen["set"]):
        assert np.diff(cuts).min() >= 0.4, cuts
        for sid in ("v1", "v2"):
            assert min(t for t in cuts if t >= secs[sid]["start"] - 1e-6) == pytest.approx(seen["starts"][f"{sid}-01"]), (sid, cuts)
    v2 = [[t for t in cuts if secs["v2"]["start"] <= t < secs["v2"]["end"]] for cuts in (seen["plain"], seen["set"])]
    assert v2[0] != v2[1], v2
    assert seen["idle"] == [False, False, True, False, False, False]


def test_a_board_at_a_line_sung_into_a_section_opens_it(tmp_path):
    # The chorus's first line starts 0.45 s before the chorus: a board there cut at its start and again at the
    # chorus's, 0.6 s later, which check counts as one cut. The chorus now opens on the board's cut.
    song = _verse_song([4, 4, 5, 4, 6, 4, 4])
    ch1 = next(s for s in song["sections"] if s["id"] == "ch1")
    line = next(x for x in song["lines"] if x["id"] == "ch1-01")
    shift = ch1["start"] - 0.45 - line["words"][0]["t"]
    line.update(start=round(line["start"] + shift, 3), end=round(line["end"] + shift, 3),
                words=[{**w, "t": round(w["t"] + shift, 3)} for w in line["words"]])
    key = line["words"][0]["t"] - 0.15
    boards = [[s["t"] for s in b] for b in _boards(tmp_path, song, ["in", "v1", "ch1-01", "v2", "ou"])["boards"]]
    cuts = sorted(t for b in boards for t in b)
    assert [t for t in cuts if key - 1e-6 <= t < key + 0.9] == [pytest.approx(key)], cuts
    assert all(len(set(b)) == len(b) for b in boards) and boards[2][0] == pytest.approx(key), boards


STORYBOARD_WARNINGS_PROBE = """
import { makeSongCtx } from "KIT/song";
import { planStoryboard } from "KIT/storyboard";
const L = (id: string, section: string, t: number) => ({ id, section, text: id, start: t, end: t + 2, words: [{ w: id, t }] });
const S = (id: string, kind: string, start: number) => ({ id, name: id, kind, start, end: start + 16 });
const song = { title: "", audio: null, duration: 64, grid: { bpm: 120, beat: 0.5, phi: 0, downbeat_mod4: 0 },
  sections: [S("v1", "mid", 0), S("ch1", "hot", 16), S("v2", "mid", 32), S("ch2", "hot", 48)],
  lines: ["v1", "ch1", "v2", "ch2"].flatMap((s, k) => [1, 2, 3].map((n) => L(`${s}-0${n}`, s, 16 * k + 4 * n - 3.5))) } as any;
const world = () => null;
const A = { x: 960, y: 540 }, B = { x: 700, y: 640, zoom: 2.2 }, C = { x: 1300, y: 420, zoom: 1.6 };
const warned: string[] = [];
console.warn = (m: string) => { warned.push(m); };
planStoryboard(makeSongCtx(song), [
  { at: "v1", world, framings: [A, B] }, { at: "v1-02", world, framings: [A, B], pattern: [1, 1] },
  { at: "ch1", world, framings: [A, B] }, { at: "ch1-03", world, framings: [A, B] },
  { at: "v2", world, framings: [A, B] }, { at: "ch2", world, framings: [A, B] }, { at: "ch2-03", world, framings: [A, C] },
]);
console.log(JSON.stringify(warned));
"""


def test_the_storyboard_names_an_idle_pattern_and_copies_that_open_alike(tmp_path):
    warned = _probe(tmp_path, STORYBOARD_WARNINGS_PROBE, {})
    assert any("no section takes the pattern of the board at v1-02" in w for w in warned), warned
    alike = [w for w in warned if "open on the same framing" in w]
    assert len(alike) == 1 and "the boards at ch1-03 and ch2-03" in alike[0], warned


def test_a_storyboard_without_boards_draws_nothing(tmp_path):
    placed = _probe(tmp_path, """
import { makeSongCtx } from "KIT/song";
import { planStoryboard } from "KIT/storyboard";
console.log(JSON.stringify(planStoryboard(makeSongCtx(SONG), [])));
""", _verse_song([4]))
    assert placed == []


def test_a_limb_bends_toward_the_side_asked_on_either_side_of_the_body(tmp_path):
    out = _probe(tmp_path, """
import { limb } from "KIT/math";
const r = (v: number[]) => v.map((x) => Math.round(x * 10) / 10 + 0);
const a = limb([0, 0], [80, 0], 50, 50), b = limb([0, 0], [-80, 0], 50, 50), c = limb([0, 0], [200, 0], 50, 50);
const knee = limb([0, 0], [0, 80], 50, 50, [1, 0]), root = limb([0, 0], [0, 0], 50, 50);
const u = limb([0, 0], [60, 40], 54, 46);
const sweep = Array.from({ length: 41 }, (_, i) => limb([0, 0], [-10 + i * 0.5, 85], 50, 45).joint);
const steps = sweep.slice(1).map((j, i) => Math.hypot(j[0] - sweep[i][0], j[1] - sweep[i][1]));
console.log(JSON.stringify({ a: { joint: r(a.joint), end: r(a.end), bend: Math.round(a.bend) }, b: r(b.joint),
  c: { end: r(c.end), reach: c.reach, bend: Math.round(c.bend) }, knee: r(knee.joint), root: r(root.joint),
  upper: Math.hypot(u.joint[0], u.joint[1]), lower: Math.hypot(u.end[0] - u.joint[0], u.end[1] - u.joint[1]),
  step: Math.max(...steps) }));
""", {})
    assert out["a"] == {"joint": [40, 30], "end": [80, 0], "bend": 106}
    assert out["b"] == [-40, 30]  # reaching across the body, the elbow still hangs down
    assert out["c"] == {"end": [100, 0], "reach": 2, "bend": 180}
    assert out["knee"] == [30, 40]  # a knee bends the way the figure faces
    assert out["root"] == [0, 50]  # a hand at the shoulder folds the arm down, not into a point
    assert abs(out["upper"] - 54) < 1e-6 and abs(out["lower"] - 46) < 1e-6
    assert out["step"] < 2  # a hanging arm's elbow slides as the hand swings past straight down, never jumps


def test_an_arm_says_what_a_viewer_would_see_wrong_and_only_that(tmp_path):
    out = _probe(tmp_path, """
import { arm, toLocal, toStage } from "KIT/math";
const said: string[] = [];
console.warn = (m: string) => said.push(m);
const head = { c: [-5, -45] as [number, number], r: 25 };
const f = (t: number[], toward?: number[], o = {}) => arm([0, 0], t as [number, number], 50, 50, toward as [number, number], o).faults;
const far = arm([0, 0], [150, 0], 50, 50, undefined, { holds: true, who: "kid right", T: 1.5 });
arm([0, 0], [160, 0], 50, 50, undefined, { holds: true, who: "kid right", T: 2 });
const near = arm([0, 0], [96, 0], 50, 50);
arm([0, 0], [101, 0], 50, 50, undefined, { holds: true, T: 3 });
const at = { x: 700, y: 800, s: 1.6, flip: true };
console.log(JSON.stringify({
  natural: f([60, 40]), near: { faults: near.faults, end: Math.round(Math.hypot(...near.end)) },
  far: { faults: far.faults, end: Math.round(Math.hypot(...far.end)), reach: far.reach, bend: Math.round(far.bend) },
  edge: f([100, 0], undefined, { holds: true }), past: f([101, 0], undefined, { holds: true }), hanging: f([0, 150]),
  v: f([10, -20], [0, -1]), chin: f([10, -20]), squashed: f([0, 30]), tummy: f([0, 30], [1, 1]),
  head: f([-5, -50], [1, 1], { head }), cheek: f([12, -45], [1, 1], { head }), beside: f([30, -45], [1, 1], { head }),
  said, stage: toStage([30, -100], at), back: toLocal(toStage([30, -100], at), at) }));
""", {})
    assert out["natural"] == [] and out["near"] == {"faults": [], "end": 96}
    assert out["far"] == {"faults": ["out of reach"], "end": 100, "reach": 1.5, "bend": 180}  # as limb() draws it
    assert out["edge"] == [] and out["past"] == ["out of reach"] and out["hanging"] == []  # a hanging arm holds nothing
    assert out["v"] == ["folded into a V, elbow up"] and out["chin"] == []  # a hand at the chin folds the arm, elbow down
    assert out["squashed"] == ["squashed short"] and out["tummy"] == []  # straight below, toward [0, 1] slides the elbow onto the line
    assert out["head"] == out["cheek"] == ["hand on its own head"] and out["beside"] == []
    assert out["said"] == ["arm: kid right: out of reach at 1.50 s", "arm: unnamed: out of reach at 3.00 s"]  # silent without who and T
    assert out["stage"] == [652, 640] and [round(v, 6) for v in out["back"]] == [30, -100]


def test_paper_pieces_cost_no_filter_of_their_own_unless_lifted_high(tmp_path):
    # Every filter is a pass of its own for the GPU in every frame: 60 plain pieces drew 120 turbulence passes and as many
    # blurs, and a 2:34 video took 25 minutes to render
    node = os.path.join(BUNDLED, "node_modules")
    out = _probe(tmp_path, """
import * as React from "NODE/react";
import { renderToStaticMarkup } from "NODE/react-dom/server";
import * as paper from "KIT/styles/paper";
const h = React.createElement;
const html = (...c: any[]) => renderToStaticMarkup(h("svg", null, h(paper.Stack, { id: "t" }, ...c)));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const row = (n: number, lift: number) =>
  Array.from({ length: n }, (_, i) => h(paper.Cut, { key: i, d: paper.rect(i * 20, 0, 16, 16, i + 1), fill: "#c99e6e", lift }));
const stats = (s: string) => ({ filters: count(s, /<filter /g), noise: count(s, /<feTurbulence/g), blurs: count(s, /<feGaussianBlur/g) });
const glued = html(h(paper.Cut, { d: paper.rect(0, 0, 60, 60, 1), fill: "#fff", lift: 1 },
  h(paper.Cut, { d: paper.rect(10, 10, 20, 20, 2), fill: "#000", lift: 1 })));
const bare = renderToStaticMarkup(h("svg", null, h(paper.Cut, { d: paper.rect(0, 0, 60, 60, 1), fill: "#fff", lift: 2 })));
const wrapped = html(h(paper.Cut, { d: "", fill: "none", lift: 6 }, h("circle", { r: 30, fill: "#f80" })));
const grainless = renderToStaticMarkup(h("svg", null, h(paper.Stack, { id: "t", grain: 0 }, ...row(4, 2))));
console.log(JSON.stringify({ plain: stats(html(...row(60, 1.5))), low: stats(html(...row(60, 0.25))), high: stats(html(...row(3, 16))),
  glued: stats(glued), wrapped: stats(wrapped), bare: stats(bare), flat: stats(html(...row(5, 0))), grainless: stats(grainless) }));
""".replace("NODE", node), {})
    assert out["plain"] == {"filters": 1, "noise": 0, "blurs": 0}  # the stack's lit edge for the pieces that cannot be read, whatever it holds
    assert out["low"] == out["flat"] == out["plain"]
    assert out["high"] == {"filters": 4, "noise": 0, "blurs": 6}  # a blurred cast shadow and contact shadow per piece lifted past 12 px
    assert out["glued"] == out["plain"]  # a piece with a piece glued on casts its own outline's shadow, and the one glued on its own
    assert out["wrapped"] == {"filters": 2, "noise": 0, "blurs": 2}  # an empty outline with a drawing glued on shades the drawing: its shadow is a filter
    assert out["bare"] == {"filters": 0, "noise": 0, "blurs": 0}  # outside a stack: soft shadows only
    assert out["grainless"] == {"filters": 0, "noise": 0, "blurs": 0}


def test_the_lit_edge_of_a_piece_stays_on_the_piece_and_on_the_sides_that_face_the_light(tmp_path):
    node = os.path.join(BUNDLED, "node_modules")
    out = _probe(tmp_path, """
import * as React from "NODE/react";
import { renderToStaticMarkup } from "NODE/react-dom/server";
import * as paper from "KIT/styles/paper";
const h = React.createElement;
const marks = (d: string, at: number[][]) => {
  const s = renderToStaticMarkup(h("svg", null, h(paper.Stack, { id: "t" }, h(paper.Cut, { d, fill: "#eee", lift: 1 }))));
  const edge = /d="([^"]*)" fill="#ffffff"/.exec(s);
  const quads = (edge ? edge[1] : "").split("Z").filter((q) => q.trim()).map((q) => (q.match(/-?\\d+\\.?\\d*/g) ?? []).map(Number));
  const inQuad = (q: number[], x: number, y: number) => {
    let c = false;
    for (let i = 0, j = q.length / 2 - 1; i < q.length / 2; j = i++) {
      const [xi, yi, xj, yj] = [q[2 * i], q[2 * i + 1], q[2 * j], q[2 * j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const all = quads.flat();
  return { n: quads.length, lit: at.map(([x, y]) => quads.some((q) => inQuad(q, x, y))),
    within: Math.min(...all) >= -1e-6 && Math.max(...all.filter((_, i) => i % 2 === 0)) <= 100 + 1e-6
      && Math.max(...all.filter((_, i) => i % 2 === 1)) <= 80 + 1e-6 };
};
const sides = [[50, 0.9], [0.9, 40], [50, 79], [99, 40], [50, 40]];
const cut = `${paper.rect(0, 0, 100, 80, 1, 0)} ${paper.rect(30, 30, 40, 20, 2, 0)}`;
console.log(JSON.stringify({ plain: marks(paper.rect(0, 0, 100, 80, 1, 0), sides),
  hole: marks(cut, [...sides, [50, 50.9], [70.9, 40], [50, 29.1], [29.1, 40]]) }));
""".replace("NODE", node), {})
    assert out["plain"]["lit"] == [True, True, False, False, False]  # up and left only
    assert out["plain"]["within"]  # no strip pokes out past a corner
    assert out["hole"]["lit"] == [True, True, False, False, False, True, True, False, False]  # a hole's lower and right edges face up and left
    assert out["hole"]["within"]


def _probe(tmp_path, code: str, song: dict) -> object:
    probe = tmp_path / "probe.tsx"
    probe.write_text(code.replace("KIT", os.path.join(BUNDLED, "src", "kit")).replace("SCENES", os.path.join(BUNDLED, "src", "scenes"))
                     .replace("SONG", json.dumps(song)), encoding="utf-8")
    subprocess.run([os.path.join(BUNDLED, "node_modules", ".bin", "esbuild"), str(probe), "--bundle", "--platform=node",
                    "--format=esm", "--log-level=error", f"--outfile={tmp_path / 'probe.mjs'}",
                    "--banner:js=import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"], check=True)
    return json.loads(subprocess.run(["node", str(tmp_path / "probe.mjs")], check=True, capture_output=True, text=True).stdout)


def _alike(a: dict, b: dict) -> bool:
    za, zb = a["zoom"] or 1, b["zoom"] or 1
    return (max(za, zb) / min(za, zb) < 1.35 and np.hypot(a["x"] - b["x"], a["y"] - b["y"]) < 400 / min(za, zb)
            and abs((a["rotate"] or 0) - (b["rotate"] or 0)) < 4)


def test_the_9x16_frame_skips_a_tall_framing_too_alike_to_the_one_before_it(tmp_path):
    # tall framings 0 and 1 look at one place at nearly one zoom: a cut between them would not show
    shots = _probe(tmp_path, """
import { makeSongCtx } from "KIT/song";
import { planShots, refilm } from "KIT/plan";
const song = SONG;
const F = [{ x: 960, y: 540 }, { x: 700, y: 640, zoom: 2.2 }, { x: 1300, y: 420, zoom: 1.5, rotate: -3 }];
const TALL = [{ x: 960, y: 600 }, { x: 990, y: 620, zoom: 1.1 }, { x: 1300, y: 420, zoom: 1.6, rotate: -3 }];
const tall = refilm(planShots(makeSongCtx(song), 0, song.duration, F), TALL);
console.log(JSON.stringify(tall.shots.slice(0, -1).map((s) => ({ x: s.x, y: s.y, zoom: s.zoom, rotate: s.rotate }))));
""", _verse_song([4, 4, 5, 4, 6, 4, 4]))
    assert len(shots) > 10 and not any(_alike(a, b) for a, b in zip(shots, shots[1:])), shots


def test_a_board_at_the_same_line_of_every_copy_opens_as_a_sections_board_does(tmp_path):
    # v1-03 and v2-03 share their framings: copies of one board, so verse 2's opens on its second framing. v1-06 and
    # v2-06 have framings of their own: each opens on its first, as a board at a line does.
    opens = _probe(tmp_path, """
import { makeSongCtx } from "KIT/song";
import { planStoryboard } from "KIT/storyboard";
const song = SONG;
const F = [{ x: 960, y: 540 }, { x: 700, y: 640, zoom: 2.2 }, { x: 1300, y: 420, zoom: 1.5, rotate: -3 }];
const world = () => null;
const board = (at: string, framings = F) => ({ at, world, framings });
const boards = [board("in"), board("v1-03"), board("v1-06", [F[2], F[0]]), board("ch1"), board("v2-03"), board("v2-06", [F[1], F[2]])];
console.log(JSON.stringify(Object.fromEntries(planStoryboard(makeSongCtx(song), boards).map((p) => [p.board.at, p.plan.shots[0].framing]))));
""", _verse_song([4, 4, 5, 4, 6, 4, 4]))
    assert (opens["v1-03"], opens["v2-03"], opens["v1-06"], opens["v2-06"]) == (0, 1, 0, 0), opens


def test_the_starters_section_board_waits_for_a_line_sung_into_the_section(tmp_path):
    # pc1-02 counts in "one, two, three" past the chorus's first beat: the chorus's board starts at its first line
    song = _verse_song([4])
    ch = next(s for s in song["sections"] if s["id"] == "ch1")
    v1 = [r for r in song["lines"] if r["section"] == "v1"]
    v1[-1]["end"] = ch["start"] + 0.4
    first = {"id": "ch1-01", "section": "ch1", "text": "", "start": ch["start"] + 0.9, "end": ch["start"] + 3,
             "words": [{"w": "w0", "t": ch["start"] + 0.9}]}
    song["lines"].append(first)
    keys = _probe(tmp_path, """
import { boardsOf } from "SCENES/Starter";
console.log(JSON.stringify(boardsOf(SONG).map((b) => b.at)));
""", song)
    assert "ch1-01" in keys and "ch1" not in keys and "v2" in keys, keys


BOARD_SCENES = """
import React from "react";
import { Board, Song, Storyboard } from "../kit";

const Dot: React.FC = () => (
  <>
    <rect x={0} y={0} width={1920} height={1080} fill="#203040" />
    <rect x={955} y={145} width={10} height={10} fill="#ff0000" />
  </>
);
const BOARDS: Board[] = [
  { at: "v1", world: () => <Dot />, framings: [{ x: 960, y: 540 }, { x: 600, y: 300, zoom: 2 }], tall: [{ x: 960, y: 150 }], drift: 0 },
  // a close-up 1.33× the one before it, close by: too alike for a cut
  { at: "ch", world: () => <Dot />, framings: [{ x: 960, y: 540 }, { x: 700, y: 600, zoom: 1.8 }, { x: 720, y: 620, zoom: 2.4 }] },
];
export const Scene: React.FC<{ T: number }> = ({ T }) => <Storyboard T={T} boards={BOARDS} />;
export const VerticalScene: React.FC<{ T: number }> = ({ T }) => (
  <Storyboard T={T} boards={BOARDS} vertical world={T > 4 ? [0, -900, 1920, Infinity] : undefined} />
);
export const linesDrawnByScene = (_song: Song) => new Set<string>();
"""


def _board_template(tmp_path):
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(BOARD_SCENES, encoding="utf-8")
    return template


def test_a_storyboard_given_the_area_its_worlds_fill_frames_a_subject_above_the_stage_in_9x16(tmp_path):
    template = _board_template(tmp_path)
    (tmp_path / "sheet.json").write_text('{"times": [1, 6], "cols": 2, "vertical": true}', encoding="utf-8")
    subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Contact",
                    "--props", str(tmp_path / "sheet.json"), "--out", str(tmp_path), "--name", "v"],
                   cwd=template, check=True, capture_output=True)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp_path / "v-Contact.png"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(-1, 1920, 3).astype(int)
    red = (rgb[..., 0] > 200) & (rgb[..., 1] < 60) & (rgb[..., 2] < 60)
    gap, tile = 12, (1920 - 12 * 3) / 2
    ys = [np.nonzero(red[:, round(gap + i * (tile + gap)):round(gap + i * (tile + gap) + tile)])[0] for i in range(2)]
    stopped, framed = [(y.mean() - gap) * 1080 / tile for y in ys]
    # without `world` the frame stops at the stage's top edge and the subject sits high; with it, mid-picture
    assert stopped < 300 and abs(framed - 674.5) < 3, (stopped, framed)


def test_a_drafts_render_log_names_a_framing_the_planner_never_shows(tmp_path):
    template = _board_template(tmp_path)
    # a video renders its frames in several tabs, and the line comes once
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--from", "8", "--to", "10", "--draft",
                        "--out", str(tmp_path)], cwd=template, check=True, capture_output=True, text=True)
    named = [line for line in r.stdout.splitlines() + r.stderr.splitlines() if "never shows framing" in line]
    assert len(named) == 1 and "the board at ch never shows framing 2" in named[0] and "after framing 1" in named[0], named


FONT_SCENES = """
import React from "react";
import { AbsoluteFill } from "remotion";
import { Song, loadFont } from "../kit";
import face from "./face.ttf";

const FACE = loadFont("Song2mv Test Face", face, { fallback: "monospace" });
const Row: React.FC<{ y: number; family: string }> = ({ y, family }) => (
  <div style={{ position: "absolute", left: 40, top: y, fontFamily: family, fontSize: 120, color: "#fff", whiteSpace: "nowrap" }}>
    Hamburgefonstiv
  </div>
);
export const Scene: React.FC<{ T: number }> = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Row y={60} family={FACE} />
    <Row y={300} family="monospace" />
  </AbsoluteFill>
);
export const VerticalScene = null;
export const linesDrawnByScene = (_song: Song) => new Set<string>();
"""


def test_a_font_from_load_font_is_on_every_frame_of_a_render_longer_than_the_timeout(tmp_path):
    # A delayRender() at the top of a module loses its handle to Remotion's entry, and its timer then cancels a render
    # that lasts longer than the timeout (here 5 s). loadFont holds the first frame instead: the render finishes and the
    # text is in the font, not in its monospace fallback.
    import glob

    fonts = sorted(f for pattern in ("/usr/share/fonts/**/*.ttf", "/System/Library/Fonts/**/*.ttf", "/Library/Fonts/*.ttf")
                   for f in glob.glob(pattern, recursive=True) if "mono" not in os.path.basename(f).lower())
    if not fonts:
        pytest.skip("no TrueType font on this machine")
    template = tmp_path / "video"
    shutil.copytree(BUNDLED, template, ignore=shutil.ignore_patterns("node_modules", "out"))
    os.symlink(os.path.join(BUNDLED, "node_modules"), template / "node_modules")
    shutil.copy(fonts[0], template / "src" / "scenes" / "face.ttf")
    (template / "src" / "scenes" / "index.ts").unlink()
    (template / "src" / "scenes" / "index.tsx").write_text(FONT_SCENES, encoding="utf-8")
    song = json.loads((template / "src" / "sample-song.json").read_text(encoding="utf-8"))
    (tmp_path / "props.json").write_text(json.dumps({"song": {**song, "flashes": [], "vignette": False}, "from": 0, "to": 20, "hold": 0}),
                                         encoding="utf-8")
    pkg = json.loads((template / "node_modules" / "@remotion" / "cli" / "package.json").read_text(encoding="utf-8"))
    cli = template / "node_modules" / "@remotion" / "cli" / pkg["bin"]["remotion"]
    mp4 = tmp_path / "font.mp4"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    r = subprocess.run(["node", str(cli), "render", "Lyric-16x9", str(mp4), f"--props={tmp_path / 'props.json'}", f"--port={port}", "--timeout=7000",
                        "--scale=0.25", "--concurrency=2", "--log=error"], cwd=template, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
    frames = decode_gray(str(mp4), 480, 270)
    assert len(frames) == 200
    face, mono = frames[:, 15:50, :].astype(int), frames[:, 75:110, :].astype(int)
    assert np.abs(face - face[-1]).max() < 40 and np.abs(face[0] - mono[0]).mean() > 5


def _opened_with(tmp_path, **env) -> tuple[str, str]:
    """The --gl backend ("null": Chrome's own choice) and the Chrome Remotion opened for a still through render.mjs"""
    base = {k: v for k, v in os.environ.items() if k != "SONG2MV_GL"}
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--still", "1", "--out", str(tmp_path),
                        "--manifest", str(tmp_path / "wrote.txt")],
                       cwd=BUNDLED, capture_output=True, text=True, env={**base, "SONG2MV_REMOTION_LOG": "verbose", **env})
    opened = re.search(r"Opening browser: gl = ([\w-]+), executable = ([^,]+),", r.stdout + r.stderr)
    assert r.returncode == 0 and opened, r.stdout[-2000:] + r.stderr[-2000:]
    return opened.group(1), opened.group(2)


def test_a_render_draws_on_the_gpu_on_a_mac_unless_turned_off(tmp_path):
    assert _opened_with(tmp_path)[0] == ("angle" if sys.platform == "darwin" else "null")
    assert _opened_with(tmp_path, SONG2MV_GL="off")[0] == "null"


def test_a_render_opens_googles_build_of_the_chrome_remotion_pins(tmp_path):
    # Remotion's own Mac build keeps V8's debug checks, one of which stopped whole-song renders ("Page crashed!")
    pins = open(os.path.join(BUNDLED, "node_modules", "@remotion", "renderer", "dist", "browser", "get-chrome-download-url.js"),
                encoding="utf-8").read()
    tested = re.search(r"TESTED_VERSION = '([\d.]+)'", pins)
    assert tested and f'const CHROME = "{tested.group(1)}"' in open(os.path.join(BUNDLED, "render.mjs"), encoding="utf-8").read()
    assert (os.sep + ".song2mv-chrome" + os.sep in _opened_with(tmp_path)[1]) == (sys.platform == "darwin")


def _gallery_tile(tmp_path, tile: int, gl: str) -> np.ndarray:
    """Tile `tile` of the kit gallery as the guide renders it, with SONG2MV_GL=gl ("off": in software)"""
    r = subprocess.run(["node", "render.mjs", os.path.join("src", "sample-song.json"), "--composition", "Kit-Gallery", "--frame", str(tile),
                        "--out", str(tmp_path), "--name", gl], cwd=BUNDLED, check=True, capture_output=True, text=True,
                       env={**os.environ, "SONG2MV_GL": gl})
    png = tmp_path / f"{gl}-Kit-Gallery-{tile}.png"
    assert r.stdout.strip().splitlines()[-1] == str(png) and probe_size(str(png)) == (1920, 1080)
    rgb = subprocess.run(["ffmpeg", "-v", "error", "-i", str(png), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(rgb, np.uint8).reshape(1080, 1920, 3).astype(np.int16)


def test_the_kit_gallery_renders_through_render_mjs(tmp_path):
    assert _gallery_tile(tmp_path, 4, "off").std() > 10


def _grain(rgb: np.ndarray, x: int, y: int, w: int, h: int) -> float:
    """The spread of the speckle in a flat patch: its grey levels less their 9×9 local mean"""
    g = rgb[y:y + h, x:x + w].mean(axis=2)
    pad = np.pad(g, 4, mode="reflect")
    mean = sum(pad[i:i + h, j:j + w] for i in range(9) for j in range(9)) / 81
    return float((g - mean).std())


def test_the_paper_tile_has_its_grain_at_the_strength_it_always_had(tmp_path):
    # the teal wall of tile 13: the filters drew a spread of 5.9 grey levels, and tiles of noise drawn once must match
    assert 4.5 < _grain(_gallery_tile(tmp_path, 13, "off"), 1500, 80, 300, 200) < 7.5


@pytest.mark.skipif(sys.platform != "darwin", reason="render.mjs draws on the GPU on a Mac only")
@pytest.mark.parametrize("tile", [30, 31], ids=["line", "paint"])
def test_the_line_and_paint_packs_look_the_same_on_the_gpu(tmp_path, tile):
    # Both trace edges from copies shifted by about a pixel; a shift on half a pixel rounded the other way on the GPU
    # and took line's inner lines (mean difference 2.27) and paint's pencil (2.09). Anti-aliasing alone stays under 1.
    gap = np.abs(_gallery_tile(tmp_path, tile, "off") - _gallery_tile(tmp_path, tile, "angle")).mean()
    assert gap < 1.5, gap
