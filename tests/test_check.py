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
    # and where: the stretch measured, the cuts in it, the part under the goal
    line = still["lines"][0]
    assert (line["from"], line["to"], line["cuts"]) == (7.0, 10.0, [])
    assert line["stretch"] == {"from": 7.0, "to": 10.0, "value": 0.0} and line["msg"].endswith("still throughout; no cut")
    assert res["results"]["coverage.median"]["goal"] == {"min": 0.08}
    assert set(res["skipped"]) >= {"variation.repeats", "text.min_font"}


@pytest.mark.parametrize("name, tail, goals", [
    ("motion.min", "tpad=stop_mode=clone:stop_duration=5", {"motion": {"min_per_line": 3.0}}),
    ("coverage.min", "tpad=stop_mode=add:stop_duration=5:color=black", {"coverage": {"min_per_line": 0.5}}),
])
def test_a_failing_line_says_which_part_of_it_misses_the_goal(tmp_path, name, tail, goals):
    # 0–3 s a moving test pattern, then 5 s of its last frame (2.9 s) held, or of black. The line is 1–7 s: the part
    # that misses the goal is the held one, not the whole line.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=3",
                    "-vf", tail, str(mp4)], check=True)
    song = write(tmp_path, "mv.json", {"duration": 8.0, "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 8.0}],
                                       "lines": [{"id": "v1-01", "section": "v1", "text": "la", "start": 1.0, "end": 7.0}]})
    res = score(str(mp4), str(song), str(write(tmp_path, "goals.json", goals)), quiet=True)
    (line,) = res["results"][name]["lines"]
    assert (line["from"], line["to"]) == (1.0, 7.0)
    assert line["stretch"] == {"from": 2.9 if name == "motion.min" else 3.0, "to": 7.0, "value": 0.0}
    assert line["cuts"] == ([3.0] if name == "coverage.min" else [])
    assert f"{line['stretch']['from']:.1f}–7.0 s" in line["msg"]


def test_a_frantic_line_says_where_its_motion_comes_from(tmp_path, capsys):
    # A dim, gently moving shot cut with a white flash on 2.0–2.5 and 3.0–3.5 s: four cuts make the line frantic, the
    # shot alone is calm. The line names the cuts, its biggest change, and its motion without the cuts.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    flash = "+".join(f"between(t,{a},{a + 0.5 - 1e-3})" for a in (2.0, 3.0))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-vf", f"lutyuv=y=val/5,drawbox=c=white:t=fill:enable='{flash}'", str(mp4)], check=True)
    res = score(str(mp4), str(write(tmp_path, "mv.json", SONG)), quiet=True)
    (line,) = res["results"]["motion.max"]["lines"]
    assert line["id"] == "v1-01" and line["value"] > 9.0 and (line["from"], line["to"]) == (1.0, 4.0)
    assert line["cuts"] == [2.0, 2.5, 3.0, 3.5] and line["peak"]["t"] in line["cuts"] and line["peak"]["value"] > 50
    assert line["without_cuts"] < 2.0
    assert line["msg"] == (f"1.0–4.0 s: {line['value']} (goal ≤ 9.0); biggest change at {line['peak']['t']:.1f} s "
                           f"({line['peak']['value']:.1f}, a cut); cuts at 2.0, 2.5, 3.0, 3.5; {line['without_cuts']} without the cuts")
    assert f"     v1-01    {line['msg']}" in capsys.readouterr().out  # the report prints it under the FAIL


@pytest.mark.parametrize("size, margin, warned", [("960x540", 0.1, True), ("960x540", 0.5, False), ("1920x1080", 0.1, False)])
def test_a_draft_names_the_lines_that_pass_a_motion_goal_by_less_than_its_full_render_can_differ(tmp_path, size, margin, warned):
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=10:duration=12", str(mp4)],
                   check=True)
    song = write(tmp_path, "mv.json", SONG)
    moving = next(r["motion"] for r in score(str(mp4), str(song), quiet=True)["per_line"] if r["id"] == "v1-01")
    goals = write(tmp_path, "goals.json", {"motion": {"max_per_line": round(moving + margin, 2)}})
    res = score(str(mp4), str(song), str(goals), quiet=True)
    assert res["results"]["motion.max"]["ok"]
    assert any("v1-01" in w and "may fail at full size" in w for w in res["warnings"]) is warned, res["warnings"]


@pytest.mark.parametrize("picture, whole", [("stripes", True), ("box", False)])
def test_a_frantic_line_without_a_cut_says_when_the_whole_frame_changes(tmp_path, picture, whole):
    # Fine stripes drifting half a pixel a frame change the whole frame, as a camera drift over fine detail does; a big
    # box swinging over flat grey changes one part of it. Both are frantic without a cut; only the stripes say so.
    import numpy as np

    from song2mv.check.score import score

    x = np.arange(320)
    frames = np.empty((60, 180, 320), np.uint8)
    for k in range(60):
        if picture == "stripes":
            frames[k] = 128 + 40 * np.sin(2 * np.pi * (x - 0.5 * k) / 6)
        else:
            left = 60 + 12 * abs(k % 20 - 10)
            frames[k] = 60
            frames[k, 10:150, left: left + 80] = 255
    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "320x180", "-r", "10", "-i", "-",
                    "-pix_fmt", "yuv420p", str(mp4)], input=frames.tobytes(), check=True)
    res = score(str(mp4), str(write(tmp_path, "mv.json", SONG)), quiet=True)
    (line,) = res["results"]["motion.max"]["lines"]
    assert line["id"] == "v1-01" and line["cuts"] == [] and line["value"] > 9.0
    assert line["msg"].endswith("no cut; the whole frame changes, as under a camera move over fine high-contrast detail") is whole


@pytest.mark.parametrize("box, goals, cuts", [
    ("c=white:t=fill:enable='between(t,2.0,2.05)+between(t,3.0,3.05)'", {}, [2.0, 3.0]),
    ("x=0:y=0:w=iw/2:h=ih:c=gray:t=fill:enable='between(t,1.9,1.95)',drawbox=c=white:t=fill:enable='gte(t,2.0)'",
     {"motion": {"max_per_line": 3.0}}, [1.9]),
])
def test_cut_frames_that_count_as_one_cut_are_still_left_out_of_the_motion_between_cuts(tmp_path, box, goals, cuts):
    # One-frame white flashes, or a change 0.1 s before a hard cut: cuts within 0.3 s are listed once, but every frame
    # of them is a cut in the peak and in the motion without the cuts, which stays the dim shot's own.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-vf", f"lutyuv=y=val/5,drawbox={box}", str(mp4)], check=True)
    res = score(str(mp4), str(write(tmp_path, "mv.json", SONG)), str(write(tmp_path, "goals.json", goals)), quiet=True)
    (line,) = res["results"]["motion.max"]["lines"]
    assert line["cuts"] == cuts and line["peak"]["value"] > 100 and ", a cut)" in line["msg"]
    assert line["without_cuts"] < 2.0


def test_a_cut_on_a_lines_first_word_opens_its_shot_and_is_not_motion_inside_it(tmp_path):
    # A dim shot cuts to a bright one at 2.0 s, the frame after the line's first word (1.93 s): the line is measured
    # from the cut on, as the shot it opens, and is not frantic from that one cut.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=2,lutyuv=y=val/5",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=4,negate",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    song = write(tmp_path, "mv.json", {"duration": 6.0, "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}],
                                       "lines": [{"id": "v1-01", "section": "v1", "text": "la", "start": 1.93, "end": 4.0}]})
    res = score(str(mp4), str(song), quiet=True)
    (row,) = res["per_line"]
    assert row["motion"] < 9.0 and not res["results"]["motion.max"]["lines"]


def test_a_cut_just_before_the_next_lines_first_word_is_that_lines_lead_in(tmp_path):
    # A dim shot cuts to a bright one at 2.0 s, 0.08 s before the next line's first word: the line before it is
    # measured up to the cut and is not frantic from the next line's lead-in.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=2,lutyuv=y=val/5",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=4,negate",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    song = write(tmp_path, "mv.json", {"duration": 6.0, "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}],
                                       "lines": [{"id": "v1-01", "section": "v1", "text": "la", "start": 1.0, "end": 2.0},
                                                 {"id": "v1-02", "section": "v1", "text": "la", "start": 2.08, "end": 4.0}]})
    res = score(str(mp4), str(song), quiet=True)
    motion = {r["id"]: r["motion"] for r in res["per_line"]}
    assert motion["v1-01"] < 9.0 and not res["results"]["motion.max"]["lines"]


def test_a_stretch_without_a_cut_counts_only_outside_exempt_sections(tmp_path):
    # 12 s of one moving shot: 4 s of it in a mid section, 8 s in a calm one, which may hold a shot for long.
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=12",
                    str(mp4)], check=True)
    sections = [{"id": "v1", "kind": "mid", "start": 0.0, "end": 4.0}, {"id": "ou", "kind": "calm", "start": 4.0, "end": 12.0}]
    song = write(tmp_path, "mv.json", {"duration": 12.0, "sections": sections,
                                       "lines": [{"id": "v1-01", "section": "v1", "text": "la", "start": 1.0, "end": 3.5}]})
    gap = score(str(mp4), str(song), quiet=True)["results"]["cuts.max_gap"]
    assert gap["ok"] and gap["value"] == 4.0


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


@pytest.mark.parametrize("offset, duration, limit", [(0.0, 4.0, "to"), (12.3, 4.05, "to"),
                                                   (0.0, 6.0, "to"), (0.0, 6.05, "to"), (0.0, 4.0, "song")])
def test_the_measured_range_matches_a_physically_trimmed_video(tmp_path, offset, duration, limit):
    from song2mv.check.score import score

    full = make_video(tmp_path)
    trimmed = tmp_path / "trimmed.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(full), "-t", str(duration),
                    "-c:v", "libx264", "-qp", "0", str(trimmed)], check=True)
    song = write(tmp_path, "mv.json", {
        "duration": offset + (duration if limit == "song" else 12.0),
        "sections": [{"id": "v1", "kind": "mid", "start": offset, "end": offset + 12.0}],
        "lines": [{"id": "v1-01", "section": "v1", "text": "la", "start": offset + 1.0, "end": offset + 3.5}],
    })
    kwargs = {"t0": offset, "t1": offset + duration if limit == "to" else None, "quiet": True, "report": False}
    actual = score(str(full), str(song), **kwargs)
    expected = score(str(trimmed), str(song), **kwargs)
    assert actual["to"] == pytest.approx(offset + duration)
    assert actual["cuts"] == ([offset + 6.0] if duration > 6.0 else [])
    for key in ("results", "per_line", "cuts", "skipped", "ok"):
        assert actual[key] == expected[key]


def test_cuts_after_to_do_not_count_towards_the_sections_rhythm(tmp_path):
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    "testsrc2=size=320x180:rate=10:duration=12",
                    "-vf", "drawbox=c=white:t=fill:enable='gte(t,5)*lt(mod(t,2),1)'", str(mp4)], check=True)
    song = write(tmp_path, "mv.json", {**SONG, "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 12.0}]})
    actual = score(str(mp4), str(song), t1=4.0, quiet=True, report=False)
    assert actual["cuts"] == []
    assert "cuts.rhythm.v1" not in actual["results"]
    assert actual["skipped"]["cuts.rhythm.v1"] == "0 cuts in this stretch of v1 (the rhythm needs 4)"


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
                     '<Slam T={T} t={4} text="HEY" x={960} y={400}\n  size={28} />\n'
                     '<comic.Balloon T={T} line={line} x={100} y={100} size={32} />\n', encoding="utf-8")
    res = score(str(make_video(tmp_path)), str(write(tmp_path, "mv.json", SONG)), src_glob=str(scenes / "**" / "*.tsx"),
                quiet=True)
    font = res["results"]["text.min_font"]
    assert font["ok"] is False and font["value"] == 24
    assert font["offenders"] == [f"{scene}:2 24px", f"{scene}:3 30px", f"{scene}:5 28px", f"{scene}:7 32px"]


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


def test_frames_are_measured_at_each_tenth_of_a_second(tmp_path):
    # A 30 fps video's frame 3k is the picture at k / 10 s, the frame a 10 fps draft of it has: both are measured on it.
    import numpy as np

    from song2mv.check.score import decode_gray

    mp4 = tmp_path / "v30.mp4"
    frames = b"".join(np.full((36, 64), 20 + 3 * k, np.uint8).tobytes() for k in range(60))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "64x36", "-r", "30",
                    "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", str(mp4)], input=frames, check=True)
    shown = [round((int(f[18, 32]) - 20) / 3) for f in decode_gray(str(mp4), 64, 36)]
    assert shown == list(range(0, 60, 3))
