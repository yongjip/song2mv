"""The first word of a lyric line: whisper leaves no gap between words, so it hears the pause before a line as part
of the line's first word, and merge_runs cuts that word to the run's median word duration."""
from song2mv.timing.align import merge_runs, trim_first_words


def line(lid, text):
    return {"id": lid, "section": "v1", "section_name": "Verse 1", "kind": "mid", "text": text, "words": text.split()}


LINES = [line("v1-01", "hold me now"), line("v1-02", "never let go")]


def heard(*words):
    """Whisper words (text, start, end)."""
    return [{"t": t, "s": s, "e": e, "p": 0.9} for t, s, e in words]


# "never" is sung from about 13.1 s, but whisper starts it where "now" ended, in the pause before the line. Word
# durations 0.25 0.3 0.4 | 2.4 0.3 0.9: the median is 0.35 s
RUN = heard(("hold", 10.05, 10.3), ("me", 10.3, 10.6), ("now", 10.6, 11.0),
            ("never", 11.0, 13.4), ("let", 13.4, 13.7), ("go", 13.7, 14.6))


def test_a_first_word_stretched_over_the_pause_before_it_is_cut_to_the_median_word_duration():
    out = trim_first_words(LINES, RUN)
    assert (out[3]["s"], out[3]["e"]) == (13.05, 13.4)  # its end is right, so it keeps it
    assert RUN[3]["s"] == 11.0  # the run stays as whisper heard it (asr/runN.json is a cache)
    merged = merge_runs(LINES, [{"words": RUN}])
    assert 13.05 < merged[1]["wt"][0] < 13.1  # the line starts where it is sung, not at 11.24


def test_a_first_word_of_normal_length_is_untouched():
    assert trim_first_words(LINES, RUN)[0] == RUN[0]  # "hold", 0.25 s


def test_later_words_are_untouched():
    out = trim_first_words(LINES, RUN)
    # "now" (0.4 s) and "go" (0.9 s, held at the end of the line) are longer than the median, but no line starts there
    assert [w for k, w in enumerate(out) if k != 3] == [w for k, w in enumerate(RUN) if k != 3]


def test_the_median_counts_at_most_0_7_s():
    slow = heard(("hold", 10.0, 11.0), ("me", 11.0, 12.0), ("now", 12.0, 13.0),
                 ("never", 13.0, 16.0), ("let", 16.0, 17.0), ("go", 17.0, 18.0))
    out = trim_first_words(LINES, slow)
    assert [(w["s"], w["e"]) for w in out] == [(10.3, 11.0), (11.0, 12.0), (12.0, 13.0), (15.3, 16.0), (16.0, 17.0), (17.0, 18.0)]


def test_a_first_word_timed_at_zero_length_leaves_the_word_before_it_alone():
    # whisper puts a word it is unsure of at zero length where the word before it ends; that word is not the line's,
    # so nothing is cut (looking the line's word up by its time would find "now")
    run = heard(("hold", 10.05, 10.3), ("me", 10.3, 10.6), ("now", 10.6, 12.0),
                ("never", 12.0, 12.0), ("let", 12.0, 12.3), ("go", 12.3, 12.6))
    assert trim_first_words(LINES, run) == run
