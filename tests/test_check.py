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
