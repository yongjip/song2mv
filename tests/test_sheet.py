"""What the whisper runs say about the lyric sheet as a whole: a line matched in two places (a repeat the sheet has
once), three words at one time, words they hear that no line has, a repeat sung differently, and where the sheet and
the audio's lyrics tag differ."""
from song2mv.timing.align import merge_runs, off_sheet, sheet_vs_tag, sung_differently
from song2mv.timing.pipeline import check_by_ear, stacked, stretched


def sheet(*sections):
    """Lyric lines from (section id, [line texts])."""
    out = []
    for sec, texts in sections:
        for k, text in enumerate(texts):
            out.append({"id": f"{sec}-{k + 1:02d}", "section": sec, "section_name": sec, "kind": "mid", "text": text,
                        "words": text.split()})
    return out


def sung(*parts, step=0.4):
    """Whisper words from (start time, text)."""
    out = []
    for t, text in parts:
        for k, w in enumerate(text.split()):
            out.append({"t": w, "s": round(t + step * k, 2), "e": round(t + step * k + step, 2), "p": 0.9})
    return out


def timed(lid, text, times, source="asr"):
    """A line as lyrics.json has it."""
    return {"id": lid, "source": source, "runs_used": [1, 2, 3], "start": times[0],
            "words": [{"w": w, "t": t} for w, t in zip(text.split(), times)]}


def final(merged):
    """Merged lines as lyrics.json would time them (no gaps to fill in these songs)."""
    return [timed(r["id"], r["text"], r["wt"]) for r in merged if all(t is not None for t in r["wt"])]


HOOK = ["back it up cut the wheel", "beep beep im parallel", "beep beep brooklyn wish me well"]


def even(lid, text, t0):
    return timed(lid, text, [round(t0 + 0.3 * k, 2) for k in range(len(text.split()))])


def test_a_line_matched_in_two_places_goes_on_check_by_ear():
    lines = [even("hk1-01", HOOK[0], 50.0), even("hk1-02", HOOK[1], 52.0),
             # the sheet has the couplet once and Suno sang it twice: "me well" took the second copy, 6 s later
             timed("hk1-03", HOOK[2], [63.9, 64.1, 64.2, 65.0, 70.9, 71.1]),
             even("v2-01", "round two got a little sweat on the brow", 72.2),
             # 2.5 s between two words is a held note or a breath: not listed
             timed("v2-02", "cabbie on the horn like he's taking a bow", [75.3, 75.6, 75.9, 76.2, 78.7, 79.0, 79.3, 79.6, 79.9]),
             timed("v2-03", "whole street holding breath", [80.0, 82.5, 85.0, 87.5]),  # no gap over 3 s, but 7.5 s
             timed("v2-04", HOOK[2], [90.0, 95.0, 95.3, 95.6, 95.9, 96.2], source="manual")]  # pinned by hand
    assert check_by_ear(lines, 3) == ["hk1-03", "v2-03"]
    why = stretched(lines)
    assert why["hk1-03"] == '5.9 s between "wish" and "me"' and why["v2-03"] == "4 words over 7.5 s"


def test_a_line_around_words_heard_off_the_sheet_goes_on_check_by_ear():
    lines = [even("v1-01", "one two three four five six", 10.0),
             timed("v1-02", "seven eight nine ten eleven twelve", [20.0, 20.3, 20.6, 23.4, 23.7, 24.0]),
             even("v1-03", "and so on and so forth", 30.0)]
    assert check_by_ear(lines, 3) == []  # 2.8 s between two words, 4 s for six: a breath, as far as the times go
    off = [{"from": 20.9, "to": 23.2, "runs": [1, 2], "words": "la la la la", "after": "v1-02"}]
    assert check_by_ear(lines, 3, off=off) == ["v1-02"]
    assert "20.9–23.2 s" in stretched(lines, off)["v1-02"]


def test_three_words_at_one_time_go_on_check_by_ear():
    lines = [timed("hk1-08", HOOK[2], [69.165, 69.488, 69.488, 70.254, 70.792, 71.121]),  # two words on one 16th: fast rap
             timed("hk2-08", HOOK[2], [121.977, 121.977, 121.977, 122.414, 122.952, 123.281]),  # the runs heard "Brooklyn" only
             timed("br-01", "ten nine eight now", [125.0, 125.05, 125.1, 125.2], source="manual")]  # pinned by hand
    assert check_by_ear(lines, 3) == ["hk2-08"]
    assert stacked(lines)["hk2-08"] == '"beep beep brooklyn" within 0.00 s at 121.98'


LINES = sheet(("in", ["yeah sunday on the block"]), ("hk1", HOOK), ("v2", ["round two got a little sweat on the brow"]))
COUPLET = "beep beep im parallel beep beep brooklyn wish me well"


def song(chant: bool, twice: bool = True):
    """A run that heard the hook's couplet twice (or once), and maybe a chant after the verse line."""
    return {"words": sung((1.0, "yeah sunday on the block"), (10.0, HOOK[0]), (12.6, COUPLET), *([(17.0, COUPLET)] if twice else []),
                          (22.0, "round two got a little sweat on the brow"),
                          *([(27.0, "hey hey hey ho hey hey hey ho")] if chant else []))}


def heard_off(runs, extra=()):
    heard: list[set[int]] = []
    merged = merge_runs(LINES, runs, heard)
    return off_sheet(runs, heard, final(merged) + list(extra))


def test_words_two_runs_hear_and_no_line_has_are_reported():
    off = heard_off([song(chant=True), song(chant=True), song(chant=False)])
    assert [(x["from"], x["to"], x["after"], x["runs"], x["words"]) for x in off] == [
        (17.0, 21.0, "hk1-03", [1, 2, 3], COUPLET), (27.0, 30.2, "v2-01", [1, 2], "hey hey hey ho hey hey hey ho")]


def test_one_run_alone_a_single_word_or_numbers_are_not_reported():
    lone = heard_off([song(chant=True), song(chant=False), song(chant=False)])
    assert [x["after"] for x in lone] == ["hk1-03"]  # the chant only one run heard is left out
    for extra in ("ohhhhh", "10 9 8 7 6 5"):  # one word held over 2 s; a count whisper wrote in digits
        run = song(chant=False)
        run["words"] += sung((32.0, extra), step=2.0 / len(extra.split()))
        assert [x["after"] for x in heard_off([run, run, run])] == ["hk1-03"]


def test_words_over_lines_the_sheet_has_there_are_not_reported():
    # no run matched an outro line, and re-listening timed it over the chant: the runs heard that line
    outro = timed("ou-01", "hey ho hey ho", [27.4, 28.2, 29.0, 29.8], source="reprompt")
    assert [x["after"] for x in heard_off([song(chant=True)] * 3, [outro])] == ["hk1-03"]


def test_a_repeat_the_runs_hear_alike_but_not_as_written_is_reported():
    hook = sheet(("hk1", [HOOK[1], HOOK[2], HOOK[1], HOOK[2]]))
    sung_as = "beep beep im parallel beep beep brooklyn wish me well back it back it up im parallel beep beep brooklyn wish me well"
    merged = merge_runs(hook, [{"words": sung((60.0, sung_as))}] * 3)
    assert sung_differently(merged) == [{"id": "hk1-03", "heard": "back it back it up im parallel", "runs": [1, 2, 3],
                                         "as_written": "hk1-01"}]
    # hk1-02 and hk1-04, misheard alike wherever they are sung, are whisper's doing: not reported
    misheard = "beep beep im parallel beep beep brooklyn which may well back it back it up im parallel beep beep brooklyn which may well"
    lone = merge_runs(hook, [{"words": sung((60.0, misheard))}] * 3)
    assert [x["id"] for x in sung_differently(lone)] == ["hk1-03"]
    two = merge_runs(hook, [{"words": sung((60.0, sung_as))}, {"words": sung((60.0, sung_as.replace("back it back it up", "honk honk")))}])
    assert sung_differently(two) == []  # the runs heard that line differently from each other
    # one run alone heard the other copy as written: two runs missed it, or misheard it as well
    missed = merge_runs(hook, [{"words": sung((60.0, sung_as))}] + [{"words": sung((61.6, sung_as.split(" ", 4)[4]))}] * 2)
    first = sung_as.replace("beep beep im parallel", "deep sleep im paralyzed", 1)
    once = merge_runs(hook, [{"words": sung((60.0, sung_as))}] + [{"words": sung((60.0, first))}] * 2)
    assert sung_differently(missed) == sung_differently(once) == []


def test_where_the_sheet_and_the_tag_differ_and_which_one_the_runs_support():
    runs = [song(chant=False)] * 3
    tag = sheet(("in", ["Yeah, Sunday on the block!"]), ("hk1", HOOK + HOOK[1:]),
                ("v2", ["round two got a little sweat on the brow"]))
    assert sheet_vs_tag(LINES, tag, runs) == [
        "the audio's lyrics tag repeats hk1-02–hk1-03 \"beep beep im parallel / beep beep brooklyn wish me well\", "
        "which the lyric sheet has once; the whisper runs support the tag here"]
    # the other way round: the sheet is right where the tag has a couplet twice that is sung once
    once = [song(chant=False, twice=False)] * 3
    assert sheet_vs_tag(LINES, tag, once) == [
        "the audio's lyrics tag repeats hk1-02–hk1-03 \"beep beep im parallel / beep beep brooklyn wish me well\", "
        "which the lyric sheet has once; the whisper runs support the sheet here"]
    changed = sheet(("in", ["yeah sunday on the block"]), ("hk1", [HOOK[0], "honk honk im parallel", HOOK[2]]),
                    ("v2", ["round two got a little sweat on the brow"]))
    assert sheet_vs_tag(changed, LINES, once) == [
        "the lyric sheet has hk1-02 \"honk honk im parallel\" where the audio's lyrics tag has \"beep beep im parallel\"; "
        "the whisper runs support the tag here"]
    assert sheet_vs_tag(LINES, sheet(("in", ["Yeah, Sunday on the block"]), ("hk1", HOOK),
                                     ("v2", ["Round two, got a little sweat on the brow"])), runs) == []
    words = "one two three four five six seven eight nine".split()
    many = sheet(("v1", [f"line {w}" for w in words]))
    other = sheet(("v1", [f"line {w}" if k % 2 else f"another {w}" for k, w in enumerate(words)]))
    msgs = sheet_vs_tag(many, other, runs)  # five places: three named, the rest counted
    assert len(msgs) == 4 and msgs[3].startswith("the lyric sheet and the audio's lyrics tag differ in 2 more places; in all 5,")
