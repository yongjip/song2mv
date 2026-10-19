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
