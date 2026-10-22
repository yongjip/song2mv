"""Which lines go on check_by_ear, which hearing a re-listened gap takes when a line is heard more than once, and what
a pin in "manual" changes about re-heard lines."""
import json

import pytest

from song2mv.timing import lib, transcribe
from song2mv.timing.align import doubt, holes, merge_runs, report
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


def test_a_word_no_run_timed_between_words_far_apart_goes_on_check_by_ear(capsys):
    # no run heard "three", and "four" comes 3 s after "two": spread evenly, "three" lands 1.5 s after "two"
    sheet =[{"id": "v1-01", "section": "v1", "section_name": "Verse 1", "kind": "mid", "text": "one two three four",
              "words": ["one", "two", "three", "four"]}]

    def run(four):
        return {"words": [{"t": t, "s": s, "e": e, "p": 0.9} for t, s, e in
                          (("one", 10.0, 10.4), ("two", 10.5, 10.9), ("oops", 11.0, 11.3), ("four", four, four + 0.5))]}
    late = merge_runs(sheet, [run(13.5)] * 3)
    assert late[0]["wt"][2] is None and holes(late[0]["wt"]) == [(1, 3)]
    report(late, 3)
    assert '◀ no run timed "three", 3.0 s between the words around it' in capsys.readouterr().out
    assert holes(merge_runs(sheet, [run(11.6)] * 3)[0]["wt"]) == []  # 0.55 s per word: an even spread is a fair guess
    assert holes([None, 10.0, 13.0, None]) == []  # before the first timed word or after the last: not counted
    lines = [{"id": "v1-01", "source": "asr", "runs_used": [1, 2, 3]},
             {"id": "v1-02", "source": "asr", "runs_used": [1, 2, 3]},
             {"id": "v1-03", "source": "manual", "runs_used": [1, 2, 3]}]  # pinned by hand already
    assert check_by_ear(lines, 3, doubtful={"v1-01", "v1-03"}) == ["v1-01"]


def test_runs_that_disagree_on_a_line_put_it_on_check_by_ear(capsys):
    sheet = [{"id": "br-04", "section": "br", "section_name": "Bridge", "kind": "mid", "text": "one im in now shake my hand",
              "words": "one im in now shake my hand".split()}]

    def run(*words):
        return {"words": [{"t": t, "s": s, "e": round(s + 0.2, 2), "p": 0.9} for t, s in words]}
    rest = [("im", 133.3), ("in", 133.8), ("now", 134.0), ("shake", 134.4), ("my", 134.6), ("hand", 134.8)]
    # one run times "one" at 132.5, the other two hear "1" (no letters to match) and start the line at "im"
    first = merge_runs(sheet, [run(("one", 132.5), *rest), run(("1", 132.5), *rest), run(("1", 132.5), *rest)])[0]
    assert first["spread"] == 0.82 and doubt(first) == "runs disagree by 0.82 s"
    # two runs time "shake" 1.2 s apart: the median of two is their middle, where neither heard it
    late = [(w, t + 1.2 if w == "shake" else t) for w, t in rest]
    middle = merge_runs(sheet, [run(("one", 132.5), *rest), run(("one", 132.5), *late)])[0]
    assert middle["wt"][4] == 135.02 and doubt(middle) == 'no run times "shake" near 135.02: the nearest is 0.6 s away'
    report([middle], 2)
    assert '◀ no run times "shake" near 135.02' in capsys.readouterr().out
    agree = merge_runs(sheet, [run(("one", 132.5), *rest)] * 3)[0]
    assert doubt(agree) is None and agree["unsupported"] is None


def gap(heard, monkeypatch):
    """Re-listen the gaps in `lines` with whisper replaced by `heard` (both seeds hear the same)."""
    monkeypatch.setattr(transcribe, "decode", lambda path: [])
    monkeypatch.setattr(transcribe, "transcribe_array", lambda clip, w, language, offset=0.0, seed=None, prompt=None:
                        {"words": heard})


def word(t, s, e, p):
    return {"t": t, "s": s, "e": e, "p": p}


def test_a_shout_heard_twice_skips_the_hearing_stretched_over_music(tmp_path, monkeypatch):
    lines = [{"id": "ou-04", "text": "sing it again", "words": ["sing", "it", "again"], "wt": [263.3, 264.1, 264.8]},
             {"id": "ou-05", "text": "Bingo!", "words": ["Bingo!"], "wt": [None]}]
    gap([word("you", 264.7, 265.46, 0.65), word("there", 265.46, 266.24, 0.12),
         word("Bingo!", 266.24, 271.88, 0.53), word("Bingo!", 283.14, 284.54, 0.97)], monkeypatch)
    lib.WARNINGS.clear()
    fill_gaps(lines, CFG, 289.56, str(tmp_path / "reprompt.json"))
    assert lines[1]["source"] == "reprompt" and 283.1 <= lines[1]["wt"][0] < 284.6
    assert any("ou-05" in w and "heard 2 times" in w and "took 283.1 s, not 266.2 s (stretched over 5.6 s)" in w
               for w in lib.WARNINGS)


def test_two_lines_with_the_same_text_take_one_hearing_each(tmp_path, monkeypatch):
    lines = [{"id": "br-08", "text": "one dream", "words": ["one", "dream"], "wt": [246.8, 247.6]},
             {"id": "ou-01", "text": "Bingo…", "words": ["Bingo…"], "wt": [None]},
             {"id": "ou-02", "text": "Bingo…", "words": ["Bingo…"], "wt": [None]},
             {"id": "ou-03", "text": "far away", "words": ["far", "away"], "wt": [257.1, 257.5]}]
    gap([word("Bingo…", 253.72, 255.12, 0.6), word("Bingo…", 255.12, 256.51, 0.9)], monkeypatch)
    lib.WARNINGS.clear()
    fill_gaps(lines, CFG, 289.56, str(tmp_path / "reprompt.json"))
    assert 253.7 <= lines[1]["wt"][0] < 255.1 <= lines[2]["wt"][0] < 256.6  # in lyric order, one hearing each
    assert lib.WARNINGS == []


def test_hearings_of_a_line_written_elsewhere_do_not_move_the_line(tmp_path, monkeypatch):
    lines = [{"id": "po-01", "text": "go go", "words": ["go", "go"], "wt": [124.1, 124.6]},
             {"id": "po-02", "text": "HEY! HEY!", "words": ["HEY!", "HEY!"], "wt": [None, None]},
             {"id": "po-03", "text": "up up", "words": ["up", "up"], "wt": [128.8, 129.1]}]
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


# A gap of four lines no whisper run placed, before a line they did place. Heard as one window, the gap gives every
# line its time. Pinning lines in the middle splits that window.
SHEET = [("s-01", "boiling water noodles thrown", None),
         ("s-02", "red sauce spreads over the plate", None),
         ("s-03", "wrist snap turning radius", None),
         ("s-04", "salt sprinkled thickness set", None),
         ("s-05", "tomato explosion", [23.5, 24.1])]


def sheet():
    return [{"id": i, "text": t, "words": t.split(), "wt": list(wt) if wt else [None] * len(t.split())} for i, t, wt in SHEET]


def sung(n, start):
    """What whisper hears of line n: a word every 0.4 s from `start`."""
    return [word(w, start + 0.4 * k, start + 0.4 * k + 0.35, 0.9) for k, w in enumerate(SHEET[n][1].split())]


def listen(monkeypatch, heard=None):
    """Whisper hears `heard` in any window; without it, hearing anything fails the test. Returns the calls."""
    calls = []

    def transcribe_array(clip, w, language, offset=0.0, seed=None, prompt=None):
        if heard is None:
            raise AssertionError(f"listened again at {offset:.2f} s for {prompt!r}")
        calls.append((round(offset, 2), prompt))
        return {"words": heard}
    monkeypatch.setattr(transcribe, "decode", lambda path: [])
    monkeypatch.setattr(transcribe, "transcribe_array", transcribe_array)
    return calls


@pytest.mark.parametrize("older_file", [False, True])
def test_a_pin_keeps_the_re_heard_lines_that_still_fit_between_the_pins(older_file, tmp_path, monkeypatch):
    # Pinning s-02 and s-03 split the gap's window into one for s-01 and one for s-04. Both were heard again with
    # one-line prompts, and on a test song that moved s-01 0.3 s and s-04 1.2 s early, into the pinned s-03.
    out = str(tmp_path / "reprompt.json")
    listen(monkeypatch, sung(0, 12.1) + sung(1, 14.8) + sung(2, 17.6) + sung(3, 20.5))
    before = sheet()
    fill_gaps(before, CFG, 30.0, out)
    assert [r.get("source") for r in before] == ["reprompt"] * 4 + [None]
    if older_file:  # saved by a song2mv that did not keep which lines a hearing was for and which it timed
        saved = json.load(open(out, encoding="utf-8"))
        for h in saved:
            del h["lines"], h["placed"]
        json.dump(saved, open(out, "w", encoding="utf-8"))
    listen(monkeypatch)  # nothing may be heard again
    pins = {"s-02": [14.9, 15.3], "s-03": [17.7, 18.1, 18.5, 19.4], "s-05": [23.4]}
    pinned = sheet()
    fill_gaps(pinned, {**CFG, "manual": pins}, 30.0, out)
    assert pinned[0]["wt"] == before[0]["wt"] and pinned[3]["wt"] == before[3]["wt"]
    assert [r.get("source") for r in pinned] == ["reprompt", None, None, "reprompt", None]  # pins are applied later
    saved = json.load(open(out, encoding="utf-8"))
    assert [(h["lines"], h["placed"]) for h in saved] == [(["s-01", "s-02", "s-03", "s-04"], ["s-01", "s-04"])]
    # taking the pins out again gives every line its pin-free time back, still without listening again
    unpinned = sheet()
    fill_gaps(unpinned, CFG, 30.0, out)
    assert [r["wt"] for r in unpinned] == [r["wt"] for r in before]


def test_a_pin_re_hears_only_the_line_it_contradicts_and_only_between_the_pins(tmp_path, monkeypatch):
    out = str(tmp_path / "reprompt.json")
    # the pin-free hearing put s-04 on the second half of s-03
    listen(monkeypatch, sung(0, 12.1) + sung(1, 14.8) + sung(2, 17.6)[:2] + sung(3, 18.5))
    before = sheet()
    fill_gaps(before, CFG, 30.0, out)
    assert 18.5 <= before[3]["wt"][0] < 18.6
    calls = listen(monkeypatch, sung(3, 20.5))
    pinned = sheet()
    fill_gaps(pinned, {**CFG, "manual": {"s-03": [17.7, 18.1, 18.5, 19.4]}}, 30.0, out)
    # s-01 and s-02 still fit before the pin; s-04 does not fit after it and is heard again from the pin's last word
    # (19.4 s, less 0.1 s) to the start of s-05 (23.5 s, plus 0.3 s), with its own text as the prompt
    assert [r["wt"] for r in pinned[:2]] == [r["wt"] for r in before[:2]]
    assert calls == [(19.3, SHEET[3][1])] * 2
    assert pinned[3]["source"] == "reprompt" and 20.5 <= pinned[3]["wt"][0] < 20.6
    saved = json.load(open(out, encoding="utf-8"))
    assert [(h["range"], h["placed"]) for h in saved] == [([0.0, 23.8], ["s-01", "s-02"]), ([19.3, 23.8], ["s-04"])]
