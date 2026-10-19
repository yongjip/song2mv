import re

from song2mv.contract import SCHEMA_VERSION, stamp
from song2mv.timing.to_lrc import to_lrc
from song2mv.timing.to_lrc import ts as lrc_ts
from song2mv.timing.to_srt import to_srt

LINES = [
    {"start": 10.0, "end": 12.5, "text": "first line", "words": [{"w": "first", "t": 10.0}, {"w": "line", "t": 10.6}]},
    {"start": 12.0, "end": 14.0, "text": "second line", "words": [{"w": "second", "t": 12.0}, {"w": "line", "t": 12.8}]},
    {"start": 25.0, "end": 27.0, "text": "after a gap", "words": [{"w": "after", "t": 25.0}, {"w": "a", "t": 25.4}, {"w": "gap", "t": 25.7}]},
]


def test_lrc_lines_and_gap_clear(tmp_path):
    out = tmp_path / "song.lrc"
    assert to_lrc(LINES, str(out), meta={"ti": "Song"}) == 3
    rows = out.read_text(encoding="utf-8").splitlines()
    assert rows[0] == "[ti:Song]"
    assert rows[1] == "[00:10.00]first line"
    # a gap over 4 s before the next line gets an empty timestamp that clears the screen
    assert "[00:14.60]" in rows


def test_lrc_word_stamps(tmp_path):
    out = tmp_path / "song.words.lrc"
    to_lrc(LINES, str(out), words=True)
    assert "[00:10.00]<00:10.00>first <00:10.60>line" in out.read_text(encoding="utf-8")


def test_srt_cues_do_not_overlap(tmp_path):
    out = tmp_path / "song.srt"
    assert to_srt(LINES, str(out)) == 3
    text = out.read_text(encoding="utf-8")
    assert "1\n00:00:10,000 --> 00:00:12,000\nfirst line\n" in text  # cut at the next line's start
    assert "3\n00:00:25,000 --> 00:00:27,000\nafter a gap\n" in text


def test_stamp_puts_schema_version_first():
    d = stamp({"a": 1, "schema_version": 999})
    assert list(d)[0] == "schema_version" and d["schema_version"] == SCHEMA_VERSION and d["a"] == 1


def test_lrc_time_rounds_up_into_the_next_minute():
    assert lrc_ts(59.996) == "[01:00.00]" and lrc_ts(59.994) == "[00:59.99]"
    assert lrc_ts(125.5, angle=True) == "<02:05.50>" and lrc_ts(-1) == "[00:00.00]"


def test_lrc_does_not_clear_the_screen_while_an_earlier_line_is_still_sung(tmp_path):
    out = tmp_path / "song.lrc"
    lines = [{"start": 10.0, "end": 20.0, "text": "long line", "words": []},
             {"start": 12.0, "end": 13.0, "text": "backing", "words": []},
             {"start": 30.0, "end": 31.0, "text": "next", "words": []}]
    to_lrc(lines, str(out))
    rows = out.read_text(encoding="utf-8").splitlines()
    assert rows == ["[00:10.00]long line", "[00:12.00]backing", "[00:20.60]", "[00:30.00]next", "[00:31.60]"]


def srt_times(text):
    def sec(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000
    stamps = re.findall(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)", text)
    return [(sec(*m[:4]), sec(*m[4:])) for m in stamps]


def test_srt_lines_that_start_together_share_a_cue_and_no_cue_overlaps(tmp_path):
    out = tmp_path / "song.srt"
    lines = [{"start": 130.803, "end": 131.5, "text": "HEY!", "words": []},
             {"start": 130.97, "end": 133.2, "text": "a line under it", "words": []},
             {"start": 133.0, "end": 135.0, "text": "next", "words": []}]
    assert to_srt(lines, str(out)) == 2
    text = out.read_text(encoding="utf-8")
    assert "00:02:10,803 --> 00:02:13,000\nHEY!\na line under it\n" in text
    times = srt_times(text)
    assert all(a[1] <= b[0] for a, b in zip(times, times[1:])) and all(e > s for s, e in times)
