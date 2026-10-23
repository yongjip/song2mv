"""The bundled template rendered through render.mjs: needs Node, ffmpeg and `npm ci` in the template (CI's template job)."""
import json
import os
import shutil
import subprocess
import wave

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


def test_the_rendered_audio_starts_with_the_picture(tmp_path):
    sr = 48000
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

