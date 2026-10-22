"""`song2mv sheet` on synthetic videos: each tile is the frame on screen at its song time, labelled without a font."""
import json
import math
import os
import shutil
import struct
import subprocess

import numpy as np
import pytest

from song2mv.check import font
from song2mv.check.sheet import GAP, layout, probe, sheet, sung_at
from song2mv.cli import main

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")

SONG = {
    "duration": 120.0,
    "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 6.0}, {"id": "ch1", "kind": "hot", "start": 6.0, "end": 120.0}],
    "lines": [
        {"id": "v1-01", "section": "v1", "text": "moving picture", "start": 1.0, "end": 4.0},
        {"id": "ch1-01", "section": "ch1", "text": "still picture", "start": 7.0, "end": 10.0},
    ],
}


def numbered(tmp_path, fps, frames, name="v.mp4", size=(64, 36)):
    """Frame k is one grey, 20 + 3k: a tile's grey says which frame it shows."""
    w, h = size
    raw = b"".join(np.full((h, w), 20 + 3 * k, np.uint8).tobytes() for k in range(frames))
    mp4 = tmp_path / name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", str(fps),
                    "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", str(mp4)], input=raw, check=True)
    return mp4


def read_png(path):
    """The sheet as ffmpeg decodes it: also proof that it is a PNG other programs read."""
    w, h = struct.unpack(">II", path.read_bytes()[16:24])
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3)


def shown(png, mp4, n, cols=4):
    """The frame number in each of the first n tiles."""
    img, lay = read_png(png), layout(probe(str(mp4)), cols, None)
    out = []
    for i in range(n):
        x = GAP + (i % cols) * (lay["tw"] + GAP) + lay["tw"] // 2
        y = GAP + (i // cols) * lay["row_h"] + lay["th"] // 2
        out.append(round((int(img[y, x, 0]) - 20) / 3))
    return out


def quiet(**kw):
    import contextlib
    import io

    with contextlib.redirect_stdout(io.StringIO()):
        return sheet(**kw)


@pytest.mark.parametrize("fps, t0", [(30, 0.0), (10, 92.0)])
def test_each_tile_is_the_frame_on_screen_at_its_song_time(tmp_path, fps, t0):
    mp4 = numbered(tmp_path, fps, 60)
    starts = [t0 + k / fps for k in (0, 1, 7, 22, 59)]  # a frame shows from its own start time
    between = [t0 + (k + 0.6) / fps for k in (3, 30)]
    png = tmp_path / "s.png"
    res = quiet(video=str(mp4), times=starts + between, t0=t0 if t0 else None, out=str(png))
    assert shown(png, mp4, 7) == [0, 1, 7, 22, 59, 3, 30]
    assert res["from"] == t0 and res["to"] == pytest.approx(t0 + 60 / fps)


def test_every_takes_the_middle_of_each_slot_and_labels_it_with_that_time(tmp_path):
    # ffmpeg's fps=1/S filter shows the picture from the end of each S-second slot but stamps it with the slot's start
    mp4 = numbered(tmp_path, 30, 60)
    png = tmp_path / "s.png"
    res = quiet(video=str(mp4), every=0.5, out=str(png))
    assert res["times"] == [0.25, 0.75, 1.25, 1.75]
    assert shown(png, mp4, 4) == [7, 22, 37, 52]


def test_a_time_just_after_the_last_frame_shows_it_and_one_outside_the_video_is_refused(tmp_path, capsys):
    mp4 = numbered(tmp_path, 10, 20)
    png = tmp_path / "s.png"
    quiet(video=str(mp4), times=[2.3], out=str(png))
    assert shown(png, mp4, 1) == [19]
    for when in ("2.6", "-0.1"):
        assert main(["sheet", str(mp4), "--times", f"1,{when}", "--json"]) == 2
        err = json.loads(capsys.readouterr().out)["error"]
        assert "outside the video" in err["message"] and "--from" in err["hint"]


def test_cuts_come_from_a_saved_check_result_with_its_from_and_song(tmp_path):
    from song2mv.check.score import score

    mp4 = tmp_path / "v.mp4"  # song time 92–98 moves, 98–104 holds one colour: one cut at 98
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=6",
                    "-f", "lavfi", "-i", "color=c=gray:size=320x180:rate=10:duration=6",
                    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", str(mp4)], check=True)
    song = dict(SONG, sections=[{"id": "v1", "kind": "mid", "start": 92.0, "end": 98.0},
                                {"id": "ch1", "kind": "hot", "start": 98.0, "end": 120.0}],
                lines=[dict(SONG["lines"][0], start=93.0, end=96.0), dict(SONG["lines"][1], start=98.2, end=102.0)])
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(song), encoding="utf-8")
    check = tmp_path / "check.json"
    check.write_text(json.dumps(score(str(mp4), str(mv), t0=92.0, quiet=True, report=False)), encoding="utf-8")
    res = quiet(video=str(mp4), cuts=str(check))
    assert json.loads(check.read_text())["cuts"] == [98.0]
    assert res["from"] == 92.0 and res["times"] == [92.3, 98.3] and res["song"] == os.path.abspath(mv)
    assert [sung_at(song, t) for t in res["times"]] == ["v1", "ch1-01"]
    assert list(res["outputs"]) == ["v-sheet.png"]


def test_labels_name_the_lines_sung_then_or_else_the_section():
    song = dict(SONG, lines=[*SONG["lines"], {"id": "ch1-02", "section": "ch1", "text": "pickup", "start": 9.5, "end": 12.0}])
    assert [sung_at(song, t) for t in (0.5, 1.0, 4.0, 9.7, 13.0)] == ["v1", "v1-01", "v1", "ch1-01 ch1-02", "ch1"]
    assert sung_at(song, 130.0) == ""


def test_the_cli_writes_a_png_next_to_the_video_and_prints_only_json(tmp_path, capfd):
    mp4 = numbered(tmp_path, 10, 30)
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(SONG), encoding="utf-8")
    assert main(["sheet", str(mp4), "--song", str(mv), "--every", "1", "--json"]) == 0
    out, _ = capfd.readouterr()
    res = json.loads(out)
    assert res["schema_version"] == 1 and res["command"] == "sheet" and res["ok"] is True
    png = tmp_path / "v-sheet.png"
    assert res["outputs"] == {"v-sheet.png": os.path.abspath(png)} and res["times"] == [0.5, 1.5, 2.5]
    img = read_png(png)
    lay = layout(probe(str(mp4)), 4, None)
    assert img.shape == (GAP + lay["row_h"], 1920, 3)
    strip = img[GAP + lay["th"]: GAP + lay["row_h"] - GAP, GAP: GAP + lay["tw"]]
    assert (strip == 255).all(axis=2).any() and (strip == (154, 160, 166)).all(axis=2).any()  # the time and the line


def test_frames_that_do_not_fit_one_page_go_on_more_pages(tmp_path):
    mp4 = numbered(tmp_path, 10, 40)
    lay = layout(probe(str(mp4)), 4, None)
    res = quiet(video=str(mp4), every=4 / (lay["per_page"] + 2), out=str(tmp_path / "new" / "s.png"))
    assert len(res["times"]) == lay["per_page"] + 2
    assert list(res["outputs"]) == ["s.png", "s-2.png"]
    assert read_png(tmp_path / "new" / "s-2.png").shape == (GAP + lay["row_h"], 1920, 3)


def test_crop_shows_one_region_scaled_to_the_tile_without_blurring_it(tmp_path):
    frame = np.zeros((36, 64), np.uint8)
    frame[10:26, 40:56] = 235
    mp4 = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "64x36", "-r", "10",
                    "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", str(mp4)], input=frame.tobytes() * 10,
                   check=True)
    png = tmp_path / "s.png"
    quiet(video=str(mp4), times=[0.5], crop=(40, 10, 16, 16), cols=3, out=str(png))
    lay = layout(probe(str(mp4)), 3, (40, 10, 16, 16))
    assert lay["th"] == lay["tw"] and math.isclose(lay["zoom"], lay["tw"] / 16)
    tile = read_png(png)[GAP: GAP + lay["th"], GAP: GAP + lay["tw"]]
    assert tile.min() > 225


@pytest.mark.parametrize("argv, says", [
    (["--every", "9"], "leaves no frame"),
    (["--every", "1", "--out", "s.jpg"], "PNG"),
    (["--cuts", "song.json"], "not the result of `song2mv check --json`"),
    (["--every", "1", "--crop", "70,0,10,10"], "outside"),
])
def test_bad_requests_say_what_to_change(tmp_path, capsys, monkeypatch, argv, says):
    monkeypatch.chdir(tmp_path)
    mp4 = numbered(tmp_path, 10, 30)
    (tmp_path / "song.json").write_text(json.dumps({"audio": "a.mp3"}), encoding="utf-8")
    assert main(["sheet", str(mp4), *argv, "--json"]) == 2
    assert says in json.loads(capsys.readouterr().out)["error"]["message"]


def test_one_way_to_pick_the_times_is_required(tmp_path, capsys):
    with pytest.raises(SystemExit) as e:
        main(["sheet", "v.mp4", "--json"])
    assert e.value.code == 2 and capsys.readouterr().out == ""


def test_the_label_font_has_every_printable_ascii_character():
    assert all(chr(c) in font.GLYPHS for c in range(32, 127))
    assert all(g.shape == (font.ROWS, font.COLS) for g in font.GLYPHS.values())
    img = np.zeros((30, 200, 3), np.uint8)
    end = font.draw(img, 2, 1, "12.50 s v1-03", (255, 255, 255), 2, 200)
    lit = np.argwhere(img[..., 0] == 255)
    assert end == 2 + 13 * font.ADVANCE * 2 and lit[:, 1].max() < 2 + font.width("12.50 s v1-03", 2)
    assert font.draw(img, 2, 1, "abcdef", (255, 255, 255), 2, 40) == 2 + 3 * font.ADVANCE * 2  # stops at the edge
