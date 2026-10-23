from song2mv.timing import lib
from song2mv.timing.lib import DEFAULT_CONFIG, lyric_lines, with_sections
from song2mv.timing.pipeline import propose_sections

CHORUS = ["Paper boats are sailing home", "Every lantern burning low", "Hold the rope and pull it in", "Here we go again"]
PRE = ["Counting tiles along the hall", "Waiting for the bell to call"]
VERSES = [
    ["Morning trains are running late", "Coffee spills across the plate", "Someone whistles out of tune", "Pigeons gather by noon"],
    ["Rain is drumming on the shed", "Grandma knits a scarf of red", "Neighbors argue over chess", "Nobody cleans the mess"],
]
BRIDGE = ["Quiet now the river sleeps", "Silver fish in shallow deeps"]
OUTRO = ["Goodnight to the harbor lights"]


def sheet(*blocks):
    return "\n".join(line for block in blocks for line in block) + "\n"


def sections(text):
    lines = lyric_lines(text, dict(DEFAULT_CONFIG))
    out = {}
    for r in lines:
        out.setdefault(r["section"], [r["section_name"], r["kind"], 0])[2] += 1
    return {k: tuple(v) for k, v in out.items()}


def test_a_sheet_without_sections_gets_them_from_its_repeated_lines():
    text = sheet(VERSES[0], CHORUS, VERSES[1], CHORUS, BRIDGE, CHORUS, OUTRO)
    assert sections(text) == {
        "v1": ("Verse 1", "mid", 4), "ch1": ("Chorus", "hot", 4), "v2": ("Verse 2", "mid", 4), "ch2": ("Chorus", "hot", 4),
        "br": ("Bridge", "calm", 2), "ch3": ("Chorus", "hot", 4), "ou": ("Outro", "calm", 1)}


def test_a_chorus_copy_with_a_line_changed_is_still_the_chorus():
    changed = CHORUS[:2] + ["Tie the knot and bring it in"] + CHORUS[3:]
    text = sheet(VERSES[0], CHORUS, VERSES[1], changed)
    assert [k for k, v in sections(text).items() if v[1] == "hot"] == ["ch1", "ch2"]
    assert sections(text)["ch2"][2] == 4


def test_lines_only_some_chorus_copies_have_before_it_are_a_pre_chorus():
    text = sheet(VERSES[0], PRE, CHORUS, VERSES[1], PRE, CHORUS, BRIDGE, CHORUS)
    got = sections(text)
    assert list(got) == ["v1", "pc1", "ch1", "v2", "pc2", "ch2", "br", "ch3"]
    assert got["pc1"] == ("Pre-Chorus", "mid", 2) and got["ch3"] == ("Chorus", "hot", 4)


def test_many_lines_after_the_last_chorus_are_a_verse_not_an_outro():
    text = sheet(CHORUS, VERSES[0], CHORUS, VERSES[1], BRIDGE, OUTRO)
    assert list(sections(text)) == ["ch1", "v1", "ch2", "v2"]


def test_a_sheet_without_repeats_or_with_sections_is_parsed_as_before():
    plain = sheet(VERSES[0], VERSES[1])
    assert with_sections(plain, DEFAULT_CONFIG) is None
    assert {r["section"] for r in lyric_lines(plain, dict(DEFAULT_CONFIG))} == {"s"}
    headed = "[Verse]\n" + sheet(VERSES[0], CHORUS, VERSES[1], CHORUS)
    assert with_sections(headed, DEFAULT_CONFIG) is None
    assert {r["section"] for r in lyric_lines(headed, dict(DEFAULT_CONFIG))} == {"v"}


def test_the_proposed_sheet_keeps_every_line_and_adds_the_section_lines():
    text = "(Intro beat)\n" + sheet(VERSES[0], CHORUS) + "\n" + sheet(VERSES[1], CHORUS)
    proposed = with_sections(text, DEFAULT_CONFIG)
    assert [r for r in proposed.splitlines() if r.strip() and not r.startswith("[")] == [r for r in text.splitlines() if r.strip()]
    assert [r for r in proposed.splitlines() if r.startswith("[")] == ["[Verse 1]", "[Chorus]", "[Verse 2]", "[Chorus]"]
    assert [r["text"] for r in lyric_lines(proposed, dict(DEFAULT_CONFIG))] == [r["text"] for r in lyric_lines(text, dict(DEFAULT_CONFIG))]


def test_sync_writes_the_proposal_and_keeps_one_edited_by_hand(tmp_path):
    text = sheet(VERSES[0], CHORUS, VERSES[1], CHORUS)
    proposed = with_sections(text, DEFAULT_CONFIG)
    lines = lyric_lines(proposed, dict(DEFAULT_CONFIG))
    path = tmp_path / "lyrics.sections.txt"
    lib.WARNINGS.clear()
    propose_sections(proposed, lines, str(path))
    assert path.read_text(encoding="utf-8") == proposed
    assert len(lib.WARNINGS) == 1 and "Verse 1 v1 (4), Chorus ch1 (4)" in lib.WARNINGS[0] and "--lyrics" in lib.WARNINGS[0]
    path.write_text("[Verse]\n" + text, encoding="utf-8")
    lib.WARNINGS.clear()
    propose_sections(proposed, lines, str(path))
    assert path.read_text(encoding="utf-8").startswith("[Verse]\n")
    assert len(lib.WARNINGS) == 2 and "was kept" in lib.WARNINGS[0]
