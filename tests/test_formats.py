from song2mv.contract import SCHEMA_VERSION, stamp
from song2mv.timing.to_lrc import to_lrc
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
