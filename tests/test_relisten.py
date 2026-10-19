"""Which lines go on check_by_ear, and which hearing a re-listened gap takes when a line is heard more than once."""
import pytest

from song2mv.timing import lib, transcribe
from song2mv.timing.pipeline import check_by_ear
from song2mv.timing.reprompt import fill_gaps, pick_hearings

CFG = {"audio": "song.mp3", "language": "ko", "auto_reprompt": True, "reprompt": [], "manual": {},
       "whisper": {"model": "small", "runs": 3, "device": "cpu", "compute_type": "int8", "threads": 8, "beam_size": 5}}


def test_lines_only_one_run_placed_go_on_check_by_ear():
    lines = [{"id": "v1-01", "source": "asr", "runs_used": [1, 2, 3]},
             {"id": "v1-02", "source": "asr", "runs_used": [2]},     # one of three runs: can be seconds off
             {"id": "ch1-01", "source": "reprompt", "runs_used": []},
             {"id": "ch1-02", "source": "estimated", "runs_used": []},
             {"id": "ch1-03", "source": "manual", "runs_used": [2]}]  # pinned by hand already
    assert check_by_ear(lines, 3) == ["v1-02", "ch1-01", "ch1-02"]
    assert check_by_ear([{"id": "v1-03", "source": "asr", "runs_used": [1, 4]}], 5) == []  # two runs agree
    assert check_by_ear([{"id": "v1-04", "source": "asr", "runs_used": [1]}], 1) == []  # one run is all there is


def gap(heard, monkeypatch):
    """Re-listen the gaps in `lines` with whisper replaced by `heard` (both seeds hear the same)."""
    monkeypatch.setattr(transcribe, "decode", lambda path: [])
    monkeypatch.setattr(transcribe, "transcribe_array", lambda clip, w, language, offset=0.0, seed=None, prompt=None:
                        {"words": heard})


def word(t, s, e, p):
    return {"t": t, "s": s, "e": e, "p": p}


def test_a_shout_heard_twice_skips_the_hearing_stretched_over_music(tmp_path, monkeypatch):
    # the end of 천만닉스: the prompted model stretched "천만닉스!" over 5.6 s of music after the last sung line and
    # heard the closing shout at 283.1 s; taking the first hearing put the line 16 s early
    lines = [{"id": "ou-04", "text": "다시 부를 때까지", "words": ["다시", "부를", "때까지"], "wt": [263.3, 264.1, 264.8]},
             {"id": "ou-05", "text": "천만닉스!", "words": ["천만닉스!"], "wt": [None]}]
    gap([word("그대까지", 264.7, 265.46, 0.65), word("저", 265.46, 266.24, 0.12),
         word("천만닉스!", 266.24, 271.88, 0.53), word("천만닉스!", 283.14, 284.54, 0.97)], monkeypatch)
    lib.WARNINGS.clear()
    fill_gaps(lines, CFG, 289.56, str(tmp_path / "reprompt.json"))
    assert lines[1]["source"] == "reprompt" and 283.1 <= lines[1]["wt"][0] < 284.6
    assert any("ou-05" in w and "heard 2 times" in w and "took 283.1 s, not 266.2 s (stretched over 5.6 s)" in w
               for w in lib.WARNINGS)


def test_two_lines_with_the_same_text_take_one_hearing_each(tmp_path, monkeypatch):
    lines = [{"id": "br-08", "text": "꿈 하나", "words": ["꿈", "하나"], "wt": [246.8, 247.6]},
             {"id": "ou-01", "text": "천만닉스…", "words": ["천만닉스…"], "wt": [None]},
             {"id": "ou-02", "text": "천만닉스…", "words": ["천만닉스…"], "wt": [None]},
             {"id": "ou-03", "text": "먼 훗날", "words": ["먼", "훗날"], "wt": [257.1, 257.5]}]
    gap([word("천만닉스…", 253.72, 255.12, 0.6), word("천만닉스…", 255.12, 256.51, 0.9)], monkeypatch)
    lib.WARNINGS.clear()
    fill_gaps(lines, CFG, 289.56, str(tmp_path / "reprompt.json"))
    assert 253.7 <= lines[1]["wt"][0] < 255.1 <= lines[2]["wt"][0] < 256.6  # in lyric order, one hearing each
    assert lib.WARNINGS == []


def test_hearings_of_a_line_written_elsewhere_do_not_move_the_line(tmp_path, monkeypatch):
    # 천만닉스 post-chorus: four "HEY!" in po-02's gap; the last two belong to po-04, a "HEY! HEY!" written after po-03
    # but sung before it, and whisper timed them at zero length — po-02 keeps the first two
    lines = [{"id": "po-01", "text": "가자 가자", "words": ["가자", "가자"], "wt": [124.1, 124.6]},
             {"id": "po-02", "text": "HEY! HEY!", "words": ["HEY!", "HEY!"], "wt": [None, None]},
             {"id": "po-03", "text": "올라 올라", "words": ["올라", "올라"], "wt": [128.8, 129.1]}]
    gap([word("DETERMINESS", 124.06, 125.64, 0.1), word("HEY!", 125.64, 126.32, 0.1), word("HEY!", 126.7, 126.96, 0.5),
         word("HEY!", 127.76, 127.76, 0.9), word("HEY!", 128.38, 128.38, 0.9)], monkeypatch)
    lib.WARNINGS.clear()
    fill_gaps(lines, CFG, 289.56, str(tmp_path / "reprompt.json"))
    assert 125.6 <= lines[1]["wt"][0] < 126.3 and 126.7 <= lines[1]["wt"][1] < 127.0
    assert any("po-02" in w and "heard 3 times" in w and "zero length" in w for w in lib.WARNINGS)


@pytest.mark.parametrize("durations, kept", [
    ([0.5, 0.5, 0.5], [0, 1]),       # all believable: the earliest, in lyric order
    ([0.0, 0.5, 0.5], [1, 2]),       # a zero-length word spoils the first hearing
    ([0.5, 0.5, 0.0], [0, 1]),
    ([0.0, 0.0, 0.0], [0, 1]),       # nothing believable: still the earliest
])
def test_pick_hearings_prefers_believable_timing_then_the_earliest(durations, kept):
    # "HEY! HEY! HEY!" heard for a one-line "HEY! HEY!": two overlapping hearings
    words = [{"t": "HEY!", "s": 125.6 + n, "e": 125.6 + n + d} for n, d in enumerate(durations)]
    out, notes = pick_hearings(words, {7: "HEY! HEY!"})
    assert [words.index(w) for w in out] == kept and "heard 2 times" in notes[7]
