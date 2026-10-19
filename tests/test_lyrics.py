from song2mv.timing.lib import DEFAULT_CONFIG, parse_lyrics

SHEET = """[Intro]
(Crowd chant)
Hey there

[Verse 1]
One two three
Four five six

[Chorus]
Sing it loud
(sing it loud)

[Chorus]
Sing it again

[Bridge]
Quiet now
"""


def parse(tmp_path, **cfg):
    p = tmp_path / "lyrics.txt"
    p.write_text(SHEET, encoding="utf-8")
    return parse_lyrics(str(p), {**DEFAULT_CONFIG, **cfg})


def test_section_ids_and_kinds(tmp_path):
    lines = parse(tmp_path)
    assert [r["id"] for r in lines] == ["in-01", "v1-01", "v1-02", "ch1-01", "ch2-01", "br-01"]
    kinds = {r["section"]: r["kind"] for r in lines}
    assert kinds == {"in": "calm", "v1": "mid", "ch1": "hot", "ch2": "hot", "br": "calm"}


def test_parenthesized_lines_are_stage_directions_unless_kept(tmp_path):
    assert "(sing it loud)" not in [r["text"] for r in parse(tmp_path)]
    kept = parse(tmp_path, keep_parenthesized_in=["Chorus"])
    assert "(sing it loud)" in [r["text"] for r in kept]


def test_section_kind_override(tmp_path):
    lines = parse(tmp_path, section_kinds={"br": "hot"})
    assert next(r for r in lines if r["section"] == "br")["kind"] == "hot"


def test_estimate_never_drops_a_line_without_room():
    # a line written after one it is sung before gets ~no room between its neighbours; it must still be placed
    from song2mv.timing.build_lyrics import estimate

    lines = [
        {"id": "po-03", "words": ["a", "b"], "wt": [128.8, 129.6]},
        {"id": "po-04", "words": ["HEY!", "HEY!"], "wt": [None, None]},
        {"id": "v2-01", "words": ["c"], "wt": [130.0]},
    ]
    estimate(lines, 200.0)
    assert all(t is not None for t in lines[1]["wt"])
    assert lines[1]["source"] == "estimated"


def test_a_bom_does_not_hide_the_first_section(tmp_path):
    p = tmp_path / "lyrics.txt"
    p.write_text(SHEET, encoding="utf-8-sig")  # Windows editors save a BOM
    assert [r["id"] for r in parse_lyrics(str(p), DEFAULT_CONFIG)][:2] == ["in-01", "v1-01"]


GRID = {"beat": 0.5, "phi": 0.0}


def line(id_, wt):
    return {"id": id_, "section": id_.split("-")[0], "section_name": "", "kind": "mid", "text": " ".join("w" * len(wt)),
            "words": ["w"] * len(wt), "wt": wt, "source": "asr"}


def test_a_line_ends_after_its_last_word_even_when_another_line_starts_inside_it():
    from song2mv.timing.build_lyrics import finish

    # v2-01 is still sung (last word 132.97) when a backing line starts at 131.29
    out = finish([line("v2-01", [130.5, 131.6, 132.97]), line("po-04", [131.29])], GRID, 4, 200.0)
    v2 = out[0]
    assert v2["end"] > v2["words"][-1]["t"] >= 132.9


def test_trailing_words_never_go_backwards():
    from song2mv.timing.build_lyrics import finish

    # the last two words have no time and the next line starts 0.1 s after the last placed word
    out = finish([line("v1-01", [9.0, 10.0, None, None]), line("v1-02", [10.1])], GRID, 0, 60.0)
    t = [w["t"] for w in out[0]["words"]]
    assert t == sorted(t) and t[0] == 9.0 and t[-1] > 10.0
    assert out[0]["end"] > t[-1]


def test_manual_times_out_of_order_are_kept_in_order_with_a_warning():
    from song2mv.timing import lib
    from song2mv.timing.build_lyrics import apply_manual, finish

    lib.WARNINGS.clear()
    lines = [line("ch1-01", [None, None, None])]
    apply_manual(lines, {"ch1-01": [98.5, 98.0, 99.0]})
    t = [w["t"] for w in finish(lines, GRID, 0, 200.0)[0]["words"]]
    assert t == [98.5, 98.5, 99.0]
    assert any("go backwards" in w for w in lib.WARNINGS)


def test_squeezed_lines_stay_inside_the_song():
    from song2mv.timing.build_lyrics import estimate, finish

    # the last placed word is at 29.8 in a 30 s song and two more lines have no time at all
    lines = [line("ou-01", [29.0, 29.8]), line("ou-02", [None, None]), line("ou-03", [None])]
    estimate(lines, 30.0)
    out = finish(lines, GRID, 4, 30.0)
    assert len(out) == 3
    assert all(w["t"] < 30.0 for r in out for w in r["words"])
    assert all(r["end"] <= 30.0 for r in out)
