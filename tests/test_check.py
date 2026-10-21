"""`song2mv check` on a synthetic video: runs end to end and returns the machine contract."""
import json
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")

SONG = {
    "duration": 12.0,
    "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}, {"id": "ch1", "kind": "hot", "start": 6.0, "end": 12.0}],
    "lines": [
        {"id": "v1-01", "section": "v1", "text": "moving picture", "start": 1.0, "end": 4.0},
        {"id": "ch1-01", "section": "ch1", "text": "still picture", "start": 7.0, "end": 10.0},
    ],
}


def make_video(tmp_path):
    """0–6 s: a moving test pattern; 6–12 s: one frozen colour."""
    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-f", "lavfi", "-i", "color=c=gray:size=320x180:rate=10:duration=6",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    return mp4


def write(tmp_path, name, data):
    p = tmp_path / name
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_check_flags_a_still_line(tmp_path):
    from song2mv.check.score import score

    mp4 = make_video(tmp_path)
    song = write(tmp_path, "mv.json", SONG)
    res = score(str(mp4), str(song), quiet=True)
    assert res["schema_version"] == 1 and res["command"] == "check"
    moving = {r["id"]: r["motion"] for r in res["per_line"]}
    assert moving["v1-01"] > moving["ch1-01"]
    still = res["results"]["motion.min"]
    assert still["ok"] is False and "ch1-01" in still["msg"]
    # machine-readable: how many lines fail (goal: none), and each with its own number and goal
    assert still["value"] == 1 and still["goal"] == {"max": 0}
    assert [x["id"] for x in still["lines"]] == ["ch1-01"] and still["lines"][0]["goal"] == {"min": 0.6}
    assert abs(still["lines"][0]["value"] - moving["ch1-01"]) < 0.01
    assert res["results"]["coverage.median"]["goal"] == {"min": 0.08}
    assert set(res["skipped"]) >= {"variation.repeats", "text.min_font"}


def test_without_to_the_stretch_ends_with_the_video(tmp_path):
    # the video covers 12 s of a 60 s song: the 48 s after it are not "a stretch without a cut"
    from song2mv.check.score import score

    mp4 = make_video(tmp_path)
    song = write(tmp_path, "mv.json", {**SONG, "duration": 60.0,
                                       "sections": [SONG["sections"][0], {**SONG["sections"][1], "end": 60.0}]})
    goals = write(tmp_path, "goals.json", {"cuts": {"max_gap_sec": 8.0}})  # only the value that changes
    res = score(str(mp4), str(song), str(goals), quiet=True)
    assert res["to"] == 12.0
    gap = res["results"]["cuts.max_gap"]
    assert gap["ok"] is True and gap["value"] <= 8.0 and gap["goal"] == {"max": 8.0}


def test_a_stretch_without_sung_lines_is_an_error(tmp_path, capsys):
    from song2mv.cli import main

    mp4 = make_video(tmp_path)
    song = write(tmp_path, "mv.json", SONG)
    assert main(["check", str(mp4), "--song", str(song), "--from", "30", "--json"]) == 2
    err = json.loads(capsys.readouterr().out)["error"]
    assert "no sung line" in err["message"] and "--from" in err["hint"]


def test_to_before_from_is_an_error(tmp_path, capsys):
    from song2mv.cli import main

    song = write(tmp_path, "mv.json", SONG)
    assert main(["check", str(make_video(tmp_path)), "--song", str(song), "--from", "5", "--to", "2", "--json"]) == 2
    assert "--to after it" in json.loads(capsys.readouterr().out)["error"]["message"]


def test_check_says_when_it_was_given_another_song2mv_file(tmp_path, capsys):
    from song2mv.cli import main

    mp4 = make_video(tmp_path)
    cfg = write(tmp_path, "song.json", {"audio": "song.mp3", "language": "en"})
    assert main(["check", str(mp4), "--song", str(cfg), "--json"]) == 2
    assert "song config (song.json), not an mv.json" in json.loads(capsys.readouterr().out)["error"]["message"]


COUNT_IN = {
    "duration": 12.0,
    "grid": {"beat": 0.5},
    "sections": [{"id": "pc1", "kind": "mid", "start": 0.0, "end": 6.0}, {"id": "ch1", "kind": "hot", "start": 6.0, "end": 12.0}],
    "lines": [
        {"id": "pc1-04", "section": "pc1", "text": "one, two, three", "start": 4.8, "end": 6.8},
        {"id": "ch1-01", "section": "ch1", "text": "the chorus", "start": 7.0, "end": 10.0},
    ],
}


@pytest.mark.parametrize("cut, blamed", [(6.0, False), (5.7, False), (5.2, True)])
def test_the_hit_that_opens_a_section_is_not_blamed_on_the_line_sung_into_it(tmp_path, cut, blamed):
    # The count runs past the chorus downbeat (6.0 s); the picture cuts from a dim, gently moving shot to a bright one.
    # On the downbeat or up to a beat before it (a scene on a drifting tempo hears the downbeat early) the cut is the
    # chorus's hit; 0.8 s before it, it is the count's own cut.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", f"testsrc2=size=320x180:rate=10:duration={cut},lutyuv=y=val/5",
                    "-f", "lavfi", "-i", f"color=c=white:size=320x180:rate=10:duration={12 - cut}",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    res = score(str(mp4), str(write(tmp_path, "mv.json", COUNT_IN)), quiet=True)
    assert res["cuts"] == [cut]
    frantic = res["results"]["motion.max"]
    assert [x["id"] for x in frantic["lines"]] == (["pc1-04"] if blamed else [])
    assert next(r for r in res["per_line"] if r["id"] == "pc1-04")["motion"] > 0.6  # its own shot still moves


REPEATS = {
    "duration": 18.0,
    "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}, {"id": "ch1", "kind": "hot", "start": 6.0, "end": 9.0},
                 {"id": "v2", "kind": "mid", "start": 9.0, "end": 15.0}, {"id": "ch2", "kind": "hot", "start": 15.0, "end": 18.0}],
    "lines": [{"id": f"{sec}-0{n}", "section": sec, "text": "la la la", "start": t, "end": t + 2.5}
              for sec, n, t in (("v1", 1, 0.0), ("v1", 2, 3.0), ("ch1", 1, 6.0), ("v2", 1, 9.0), ("v2", 2, 12.0), ("ch2", 1, 15.0))],
}


@pytest.mark.parametrize("kind, passes", [("hot", False), ("mid", True)])
def test_a_chorus_line_that_repeats_its_picture_fails_even_when_the_mean_passes(tmp_path, kind, passes):
    # Verse 2 is a flat colour (correlation 0 with verse 1's lines); chorus 2 is chorus 1's picture again (about 1).
    # The mean over the three pairs passes; in a hot section the copied pair fails on its own.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=3",
                    "-f", "lavfi", "-i", "color=c=gray:size=320x180:rate=10:duration=6",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=3",
                    "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    sections = [{**s, "kind": kind} if s["id"].startswith("ch") else s for s in REPEATS["sections"]]
    res = score(str(mp4), str(write(tmp_path, "mv.json", {**REPEATS, "sections": sections})), quiet=True)
    rep = res["results"]["variation.repeats"]
    (worst, corr), *rest = rep["pairs"]
    assert worst == "ch1-01~ch2-01" and corr > 0.9 and len(rest) == 2  # worst first, also in the message
    assert f"worst first {rep['pairs']}" in rep["msg"]
    mean = (corr + sum(c for _, c in rest)) / 3
    assert mean < 0.55 and rep["goal"] == {"max": 0.55}
    assert rep["ok"] is passes and rep["value"] == (pytest.approx(mean, abs=0.01) if passes else corr)


def test_the_font_lint_reads_font_sizes_not_size_props(tmp_path):
    from song2mv.check.score import score

    scenes = tmp_path / "video" / "src" / "scenes"
    scenes.mkdir(parents=True)
    scene = scenes / "Scene.tsx"
    scene.write_text('<Hit T={T} t={2} x={960} y={540} size={20} />\n'
                     '<div style={{ fontSize: 24, padding: 8 }}>small</div>\n'
                     '<text x={10} y={20} fontSize={30}>small</text>\n'
                     '<text fontSize="48">big</text>\n'
                     '<Slam T={T} t={4} text="HEY" x={960} y={400}\n  size={28} />\n', encoding="utf-8")
    res = score(str(make_video(tmp_path)), str(write(tmp_path, "mv.json", SONG)), src_glob=str(scenes / "**" / "*.tsx"),
                quiet=True)
    font = res["results"]["text.min_font"]
    assert font["ok"] is False and font["value"] == 24
    assert font["offenders"] == [f"{scene}:2 24px", f"{scene}:3 30px", f"{scene}:5 28px"]


def test_in_9x16_the_caption_rows_are_not_picture_even_with_a_vertical_scene(tmp_path):
    # The template draws the captions of lines the scenes don't draw at y 1080-1240 of 1920, over a VerticalScene too,
    # and a VerticalScene keeps its own text in the safe box (y 269-1248). Only those rows move here: the line is still.
    from song2mv.check.score import score

    mp4 = tmp_path / "short.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=0x303030:size=360x640:rate=10:duration=8",
                    "-f", "lavfi", "-i", "testsrc2=size=280x40:rate=10:duration=8",
                    "-filter_complex", "[0:v][1:v]overlay=40:372[v]", "-map", "[v]", str(mp4)], check=True)
    scenes = tmp_path / "video" / "src" / "scenes"
    scenes.mkdir(parents=True)
    (scenes / "index.ts").write_text('export { Wide as Scene, Tall as VerticalScene, linesDrawnByScene } from "./Tall";\n')
    (scenes / "Tall.tsx").write_text("export const Wide = () => null;\nexport const Tall = () => null;\n"
                                     "export const linesDrawnByScene = () => new Set<string>();\n")
    song = write(tmp_path, "mv.json", {"duration": 8.0, "sections": [{"id": "ch1", "kind": "hot", "start": 0.0, "end": 8.0}],
                                       "lines": [{"id": "ch1-01", "section": "ch1", "text": "sung", "start": 2.0, "end": 6.0}]})
    res = score(str(mp4), str(song), src_glob=str(scenes / "**" / "*.tsx"), quiet=True)
    assert res["per_line"][0]["motion"] < 0.1 and res["results"]["motion.min"]["ok"] is False


def test_json_prints_the_json_and_nothing_else(tmp_path, capfd):
    # `song2mv check ... --json > out.json 2>&1` gives valid JSON: no table, and nothing from ffmpeg
    from song2mv.cli import main

    mp4 = make_video(tmp_path)
    song = write(tmp_path, "mv.json", SONG)
    assert main(["check", str(mp4), "--song", str(song), "--json"]) == 1  # the frozen chorus line fails
    out, err = capfd.readouterr()
    assert err == "" and json.loads(out)["command"] == "check"
    assert main(["check", str(mp4), "--song", str(song)]) == 1
    assert "passed (song time" in capfd.readouterr().out  # without --json, the table is for people
