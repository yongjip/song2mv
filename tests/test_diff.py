"""`song2mv diff` on synthetic videos that are the same but for white boxes drawn on known frames."""
import json
import shutil
import struct
import subprocess

import numpy as np
import pytest

from song2mv.check.diff import diff
from song2mv.check.sheet import GAP, layout, probe
from song2mv.cli import main
from song2mv.errors import Song2mvError

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")


def video(path, seconds=3, size="480x270", fps=10, draw=()):
    """A grey video, lossless, with drawbox filters (x, y, w, h, colour, frames) on top: frames is an expression in the
    frame number n."""
    boxes = [f"drawbox=x={x}:y={y}:w={w}:h={h}:color={c}:t=fill:enable='{n}'" for x, y, w, h, c, n in draw]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=gray:s={size}:r={fps}:d={seconds}",
                    "-vf", ",".join(["format=yuv444p", *boxes]), "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p",
                    str(path)], check=True)
    return path


def read_png(path):
    w, h = struct.unpack(">II", path.read_bytes()[16:24])
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3)


def quiet(**kw):
    import contextlib
    import io

    with contextlib.redirect_stdout(io.StringIO()):
        return diff(**kw)


def test_reports_each_changed_stretch_its_peak_and_box_and_shows_it_before_and_after(tmp_path, capsys):
    before = video(tmp_path / "before.mp4")
    after = video(tmp_path / "after.mp4", draw=[
        (40, 200, 4, 5, "white", "between(n,0,3)"),  # 20 pixels a frame, 80 in all: over 0.02 % of the frame
        (100, 60, 40, 30, "white", "between(n,10,14)"),
        (140, 60, 20, 30, "white", "eq(n,12)"),
        (300, 150, 20, 20, "white", "eq(n,20)+eq(n,22)"),
        (400, 200, 4, 4, "white", "eq(n,25)"),  # 16 pixels in all: under it
    ])
    out = tmp_path / "cmp"
    assert main(["diff", str(before), str(after), "--from", "92", "--out", str(out), "--json"]) == 0
    res = json.loads(capsys.readouterr().out)
    assert list(res)[0] == "schema_version"
    assert res["command"] == "diff" and res["ok"] and res["warnings"] == []
    assert (res["from"], res["to"], res["frames"], res["faint"]) == (92.0, 95.0, 30, 1)
    assert res["stretches"] == [
        {"from": 92.0, "to": 92.4, "peak": round(20 / (480 * 270), 5), "at": 92.05, "box": [40, 200, 4, 5], "lines": []},
        {"from": 93.0, "to": 93.5, "peak": round(1800 / (480 * 270), 5), "at": 93.25, "box": [100, 60, 60, 30], "lines": []},
        {"from": 94.0, "to": 94.3, "peak": round(400 / (480 * 270), 5), "at": 94.05, "box": [300, 150, 20, 20], "lines": []},
    ]
    assert list(res["outputs"]) == ["after-diff.png"]
    sheet = read_png(out / "after-diff.png")
    lay = layout(probe(str(after)), 2, None)
    for row, (x, y) in [(1, (130, 75)), (2, (310, 160))]:
        top = GAP + row * lay["row_h"] + round(y * lay["th"] / 270)
        left = GAP + round(x * lay["tw"] / 480)
        assert sheet[top, left].max() < 160  # before: grey
        assert sheet[top, left + lay["tw"] + GAP].min() > 220  # after: the white box


def test_changes_less_than_0_15_s_apart_make_one_stretch_that_ends_at_a_cut(tmp_path):
    cut = (0, 0, 480, 270, "blue", "gte(n,64)")  # both videos cut to another picture at frame 64
    before = video(tmp_path / "before.mp4", fps=30, draw=[cut])
    after = video(tmp_path / "after.mp4", fps=30, draw=[
        cut, (100, 60, 40, 30, "white", "eq(n,30)+eq(n,34)+eq(n,40)+between(n,60,68)")])
    res = quiet(before=str(before), after=str(after), out=str(tmp_path))
    assert [(s["from"], s["to"]) for s in res["stretches"]] == [(1.0, 1.167), (1.333, 1.367), (2.0, 2.133), (2.133, 2.3)]


def test_the_song_time_of_the_first_frame_comes_from_either_name_as_render_writes_it(tmp_path):
    before = video(tmp_path / "before.mp4")
    after = video(tmp_path / "song-16x9-92-95-draft.mp4", draw=[(100, 60, 40, 30, "white", "eq(n,10)")])
    res = quiet(before=str(before), after=str(after), out=str(tmp_path))
    assert res["from"] == 92.0 and res["stretches"][0]["from"] == 93.0
    other = video(tmp_path / "song-16x9-10-13-draft.mp4")
    with pytest.raises(Song2mvError, match="different song times"):
        quiet(before=str(other), after=str(after), out=str(tmp_path))


def test_the_box_is_in_the_videos_own_pixels(tmp_path):
    before = video(tmp_path / "before.mp4", size="960x540")
    after = video(tmp_path / "after.mp4", size="960x540", draw=[(200, 120, 80, 60, "white", "between(n,10,14)")])
    [s] = quiet(before=str(before), after=str(after), out=str(tmp_path))["stretches"]
    assert s["box"] == pytest.approx([200, 120, 80, 60], abs=2)


def test_identical_videos_change_nothing_and_write_no_sheet(tmp_path):
    before, after = video(tmp_path / "before.mp4"), video(tmp_path / "after.mp4")
    res = quiet(before=str(before), after=str(after), out=str(tmp_path / "cmp"))
    assert (res["stretches"], res["faint"], res["outputs"]) == ([], 0, {})
    assert not (tmp_path / "cmp").exists()


@pytest.mark.parametrize("other, why", [({"seconds": 4}, "differ in length"), ({"size": "320x180"}, "differ in size"),
                                        ({"fps": 30}, "differ in frame rate")])
def test_refuses_videos_rendered_with_other_settings(tmp_path, capsys, other, why):
    before, after = video(tmp_path / "before.mp4"), video(tmp_path / "after.mp4", **other)
    assert main(["diff", str(before), str(after), "--json"]) == 2
    res = json.loads(capsys.readouterr().out)
    assert not res["ok"] and res["error"]["kind"] == "input"
    assert why in res["error"]["message"] and "--draft" in res["error"]["hint"]
