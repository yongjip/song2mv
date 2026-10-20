"""A chorus that repeats word for word must not be placed on its other copy. difflib anchors on the longest common
block first, so the copy a run heard best can claim the other copy's lines (docs/benchmark.md: lines 65–84 s off);
the global alignment in lib.align and the lyric-order step in merge_runs keep each copy on its own audio."""
import pytest

from song2mv.timing import lib
from song2mv.timing.align import merge_runs
from song2mv.timing.pipeline import check_by_ear


def sheet(*sections):
    """Lyric lines from (section id, [line texts])."""
    out = []
    for sec, texts in sections:
        for k, text in enumerate(texts):
            out.append({"id": f"{sec}-{k + 1:02d}", "section": sec, "section_name": sec, "kind": "mid", "text": text,
                        "words": text.split()})
    return out


def sung(*parts):
    """Whisper words from (start time, text): 0.4 s per word."""
    out = []
    for t, text in parts:
        for k, w in enumerate(text.split()):
            out.append({"t": w, "s": round(t + 0.4 * k, 2), "e": round(t + 0.4 * k + 0.4, 2), "p": 0.9})
    return out


def starts(merged):
    return {r["id"]: (min(t for t in r["wt"] if t is not None) if any(t is not None for t in r["wt"]) else None)
            for r in merged}


def near(got: dict, want: dict) -> bool:
    """Same lines placed (None: unplaced), each within 0.3 s (a word's time is its first matched letter's)."""
    return got.keys() == want.keys() and all((g is None) == (w is None) and (g is None or abs(g - w) <= 0.3)
                                             for g, w in ((got[k], want[k]) for k in want))


CHORUS = ["so come with me tonight", "we don't have to be enemies", "keep it going like it's meant to be"]
LINES = sheet(("v1", ["one two three see you looking at me"]), ("ch1", CHORUS),
              ("v2", ["bet you think it's nothing", "till it drops all at once"]), ("ch2", CHORUS))
# Every run heard both choruses, the first one worse ("so now we don't…" for "we don't…", "leaping" for "keep it"), and
# an ad-lib before the second: the longest block shared with the sheet is the second chorus as sung, and difflib pairs
# it with the sheet's first copy, the earlier of two equal blocks.
RUN = sung((10, "one two three see you looking at me"),
           (20, "so come with me tonight"), (23, "so now we don't have to be enemy"), (26, "leaping going like it's meant to be"),
           (40, "bet you think it's nothing"), (43, "till it drops all at once"), (58, "yeah"),
           (60, "so come with me tonight"), (63, "we don't have to be enemies"), (66, "keep it going like it's meant to be"))
RIGHT = {"v1-01": 10.0, "ch1-01": 20.0, "ch1-02": 23.8, "ch1-03": 26.0, "v2-01": 40.0, "v2-02": 43.0,
         "ch2-01": 60.0, "ch2-02": 63.0, "ch2-03": 66.0}


def test_difflib_alone_puts_the_first_chorus_on_the_second_one(monkeypatch):
    monkeypatch.setattr(lib, "MAX_CELLS", 0)  # what sync did before: difflib only
    got = starts(merge_runs(LINES, [{"words": RUN}] * 3))
    assert near({k: got[k] for k in ("ch1-01", "ch1-03")}, {"ch1-01": 60.0, "ch1-03": 66.0})  # 40 s late
    assert got["v2-01"] is None and got["ch2-01"] is None  # and everything after it in the sheet has no audio left


def test_each_chorus_stays_on_its_own_audio():
    assert near(starts(merge_runs(LINES, [{"words": RUN}] * 3)), RIGHT)


BREATHE = ["you took your toll on me", "you're suffocating please", "but since i watched you leave"]


@pytest.mark.parametrize("difflib_only", [True, False])
def test_a_later_copy_that_reads_slightly_differently_is_not_placed_early(monkeypatch, difflib_only):
    # The sheet's first copy reads "i could not breathe", its second "i cannot breathe"; whisper heard "i cannot
    # breathe" both times, with an ad-lib after each. The longest block shared with the sheet is then the sheet's second
    # copy, and difflib pairs it with the earlier of the two sung copies: 60 s early, with no audio left for the lines
    # before it.
    lines = sheet(("v1", ["i could not breathe", *BREATHE]), ("ch", ["i can see"]), ("v2", ["you get jealous easily"]),
                  ("v3", ["i cannot breathe", *BREATHE]))
    run = sung((30, "i cannot breathe"), (33, BREATHE[0]), (36, BREATHE[1]), (39, BREATHE[2]), (44, "oh"), (45, "i can see"),
               (60, "you get jealous easily"), (88, "oh"), (90, "i cannot breathe"), (93, BREATHE[0]), (96, BREATHE[1]),
               (99, BREATHE[2]))
    if difflib_only:
        monkeypatch.setattr(lib, "MAX_CELLS", 0)
    got = starts(merge_runs(lines, [{"words": run}]))
    if difflib_only:  # what sync did before
        assert near({k: got[k] for k in ("v1-01", "v2-01", "v3-01")}, {"v1-01": None, "v2-01": None, "v3-01": 30.1})
    else:
        assert near(got, {"v1-01": 30.1, "v1-02": 33.1, "v1-03": 36.1, "v1-04": 39.1, "ch-01": 45.1, "v2-01": 60.1,
                          "v3-01": 90.1, "v3-02": 93.1, "v3-03": 96.1, "v3-04": 99.1})


def test_a_line_heard_fewer_times_than_the_sheet_has_it_goes_to_the_first_copies():
    # whisper missed the "oh" and the last repeat: as before, the first lines get what was heard
    lines = sheet(("ou", ["oh burn out man", "burn out man", "burn out man"]))
    run = sung((235, "burn out man"), (239, "burn out man"))
    assert near(starts(merge_runs(lines, [{"words": run}])), {"ou-01": 235.0, "ou-02": 239.0, "ou-03": None})


def test_a_line_runs_put_on_another_copy_is_merged_again_from_the_run_that_kept_the_order():
    # runs 1 and 2 heard only one chorus and no second verse, so the sheet's first chorus took that chorus (the sung
    # second one) and outvoted run 3, which heard everything. The chorus then starts after the second verse.
    lines = sheet(("v1", ["one two three see you looking at me"]), ("ch1", CHORUS[:1]),
                  ("v2", ["bet you think it's nothing", "till it drops all at once", "your heart oh my oh me"]),
                  ("ch2", CHORUS[:1]))
    partial = sung((10, "one two three see you looking at me"), (60, "so come with me tonight"))
    full = sung((10, "one two three see you looking at me"), (20, "so come with me tonight"),
                (40, "bet you think it's nothing"), (43, "till it drops all at once"), (46, "your heart oh my oh me"),
                (60, "so come with me tonight"))
    merged = merge_runs(lines, [{"words": partial}, {"words": partial}, {"words": full}])
    by_id = {r["id"]: r for r in merged}
    assert near(starts(merged), {"v1-01": 10.0, "ch1-01": 20.0, "v2-01": 40.0, "v2-02": 43.0, "v2-03": 46.0, "ch2-01": 60.0})
    assert by_id["ch1-01"]["runs_used"] == [3] and by_id["ch1-01"]["reordered"] == pytest.approx(60.0, abs=0.3)
    assert "reordered" not in by_id["v2-01"]


def test_a_line_with_letters_in_two_places_keeps_the_place_with_more():
    # "crever" shares "er" with "attraper" 40 s before the rest of its line: the line starts where it is sung
    lines = sheet(("v1", ["il ne te restera plus qu'à la rattraper"]), ("v2", ["tu sais t'aurais pas du crever la vie n'était pas terminée"]))
    run = sung((50, "il ne te restera plus qu'à l'attraper"), (95, "la vie n'était pas terminée"))
    first, _ = lib.align(lines, run)
    assert min(t for (li, _), t in first.items() if li == 1) == pytest.approx(95.0, abs=0.2)


def test_lines_out_of_the_lyric_order_go_on_check_by_ear():
    lines = [{"id": "v1-01", "source": "asr", "runs_used": [1, 2, 3], "start": 10.0},
             {"id": "ch1-01", "source": "asr", "runs_used": [1, 2, 3], "start": 75.0},  # its other copy, 60 s late
             {"id": "ch1-02", "source": "asr", "runs_used": [1, 2, 3], "start": 18.0},
             {"id": "ch1-03", "source": "asr", "runs_used": [1, 2, 3], "start": 21.0},
             {"id": "po-01", "source": "asr", "runs_used": [1, 2, 3], "start": 25.0},
             {"id": "po-02", "source": "asr", "runs_used": [1, 2, 3], "start": 24.0},  # a backing vocal sung 1 s early
             {"id": "po-03", "source": "manual", "runs_used": [], "start": 3.0}]  # pinned by hand: the user's call
    assert check_by_ear(lines, 3) == ["ch1-01"]
