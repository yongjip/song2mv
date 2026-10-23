import shutil
import subprocess

import pytest

from song2mv.errors import Song2mvError
from song2mv.timing.extract_lyrics import lyrics_tag
from song2mv.timing.lib import DEFAULT_CONFIG, lyric_lines, parse_lyrics
from song2mv.timing.to_lrc import to_lrc
from song2mv.timing.to_srt import to_srt

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


def test_a_section_name_around_a_known_one_takes_its_id_and_kind():
    sheet = "[Chorus]\na\n[Chorus]\nb\n[Final Pre-Chorus]\nc\n[Final Chorus]\nd\n[Chorus Reprise]\ne\n[Coda]\nf\n"
    assert [(r["id"], r["kind"]) for r in lyric_lines(sheet, {})] == [
        ("ch1-01", "hot"), ("ch2-01", "hot"), ("pc-01", "mid"), ("ch-01", "hot"), ("chb-01", "hot"), ("cod-01", "mid")]


def test_parenthesized_lines_are_stage_directions_unless_kept(tmp_path):
    assert "(sing it loud)" not in [r["text"] for r in parse(tmp_path)]
    kept = parse(tmp_path, keep_parenthesized_in=["Chorus"])
    assert "(sing it loud)" in [r["text"] for r in kept]


def test_tokens_without_letters_stay_in_the_text_but_are_not_words(tmp_path):
    lines = lyric_lines("[Verse]\nred light / green light\n- - -\nhold on – let go\n", {})
    assert [(r["text"], r["words"]) for r in lines] == [("red light / green light", ["red", "light", "green", "light"]),
                                                        ("hold on – let go", ["hold", "on", "let", "go"])]
    timed = [{"start": 10.0, "end": 12.0, "text": "red light / green light",
              "words": [{"w": w, "t": 10.0 + 0.4 * k} for k, w in enumerate(lines[0]["words"])]}]
    to_lrc(timed, str(tmp_path / "song.lrc"))
    to_lrc(timed, str(tmp_path / "song.words.lrc"), words=True)
    to_srt(timed, str(tmp_path / "song.srt"))
    assert "[00:10.00]red light green light\n" in (tmp_path / "song.lrc").read_text(encoding="utf-8")
    assert "<00:10.40>light <00:10.80>green" in (tmp_path / "song.words.lrc").read_text(encoding="utf-8")
    assert "\nred light green light\n" in (tmp_path / "song.srt").read_text(encoding="utf-8")


def test_section_kind_override(tmp_path):
    lines = parse(tmp_path, section_kinds={"br": "hot"})
    assert next(r for r in lines if r["section"] == "br")["kind"] == "hot"


def test_a_calm_section_as_loud_as_the_mid_sections_becomes_mid():
    from song2mv.timing.build_lyrics import loud_calm

    def song():
        spans = [("intro", "(instrumental)", "calm", 0, 8), ("in", "Intro", "calm", 8, 16), ("v1", "Verse 1", "mid", 16, 32),
                 ("ch1", "Chorus", "hot", 32, 48), ("br", "Bridge", "calm", 48, 56), ("ou", "Outro", "calm", 56, 64)]
        return {"sections": [{"id": i, "name": n, "kind": k, "start": a, "end": b} for i, n, k, a, b in spans],
                "lines": [{"id": f"{i}-01", "section": i, "kind": k} for i, _, k, _, _ in spans[1:]]}
    level = {"intro": -9.0, "in": -14.0, "v1": -10.0, "ch1": -7.0, "br": -11.5, "ou": -12.5}  # dB per 0.5 s
    loudness = [level[s["id"]] for s in song()["sections"] for _ in range(2 * (s["end"] - s["start"]))]
    lyrics = song()
    msgs = loud_calm(lyrics, loudness, {})
    assert [s["kind"] for s in lyrics["sections"]] == ["calm", "calm", "mid", "hot", "mid", "calm"]
    assert {r["section"]: r["kind"] for r in lyrics["lines"]}["br"] == "mid"
    assert msgs == ["br [Bridge] is about as loud as the mid sections (median -11.5 dB, theirs -10.0 dB): kind mid, "
                    "not calm; set section_kinds to keep it calm"]
    kept = song()  # a kind set in section_kinds stays, by id or by name
    assert loud_calm(kept, loudness, {"Bridge": "calm"}) == [] and kept["sections"][4]["kind"] == "calm"


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


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_the_lyrics_tag_is_read_when_the_audio_has_one(tmp_path):
    tagged, plain = tmp_path / "tagged.flac", tmp_path / "plain.flac"
    for path, meta in ((tagged, ["-metadata", "LYRICS=[Verse]\nhello there"]), (plain, [])):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", *meta,
                        str(path)], check=True)
    key, text = lyrics_tag(str(tagged))
    assert key.lower() == "lyrics" and [r["id"] for r in lyric_lines(text, DEFAULT_CONFIG)] == ["v-01"]
    assert lyrics_tag(str(plain)) is None


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


@pytest.mark.parametrize("swing", [None, [0.33, 0.83]])
@pytest.mark.parametrize("stretch, times", [
    ((41.5, 60.0), [41.483, 41.503]),
    ((10.0, 41.55), [41.54, 41.55]),
    ((41.49, 41.50), [41.483, 41.495, 41.503]),
])
def test_snapping_does_not_cross_off_grid_edges_or_move_their_unsnapped_words(swing, stretch, times):
    from song2mv.timing.build_lyrics import finish

    a, b = stretch
    grid = {**GRID, "phi": 0.025, "swing": swing, "off_grid": [{"from": a, "to": b}]}
    out = finish([line("v1-01", times)], grid, 4, 90.0)[0]
    actual = [w["t"] for w in out["words"]]
    assert actual == sorted(actual)
    for before, after in zip(times, actual):
        if a <= before < b:
            assert after == round(before, 3)
        else:
            assert (before < a) == (after < a) and (before < b) == (after < b)


@pytest.mark.parametrize("grid", [
    {**GRID, "phi": 0.101},
    {**GRID, "phi": 0.07, "swing": [0.33, 0.83]},
    {**GRID, "phi": 0.101, "beats": [0.101, 0.601, 1.101, 1.601]},
])
def test_snapping_an_interpolated_first_word_never_makes_its_time_negative(grid):
    from song2mv.timing.build_lyrics import finish

    out = finish([line("in-01", [None, 0.2, 0.4])], grid, 4, 2.0)[0]
    times = [w["t"] for w in out["words"]]
    assert times[0] == out["start"] == 0.0
    assert times == sorted(times)


def test_words_before_a_lines_first_timed_word_wait_for_the_line_before():
    from song2mv.timing.build_lyrics import finish

    # no run heard the first two words of v1-02; 0.3 s apart before "three" they would start before "two" of v1-01, and
    # the captions would switch to v1-02 before "two" lights up
    out = finish([line("v1-01", [10.0, 11.0]), line("v1-02", [None, None, 11.3, 11.8])], GRID, 0, 60.0)
    t = [w["t"] for w in out[1]["words"]]
    assert t == [11.125, 11.213, 11.3, 11.8]  # from a 16th note (0.125 s) after "two", evenly up to "three"
    roomy = finish([line("v1-01", [10.0, 10.5]), line("v1-02", [None, None, 12.0])], GRID, 0, 60.0)
    assert [w["t"] for w in roomy[1]["words"]] == [11.4, 11.7, 12.0]  # room enough: 0.3 s apart, as before
    # a backing line written after the line it comes before is not held back by it
    backing = finish([line("v1-01", [10.0, 11.0]), line("bk-01", [None, 9.5])], GRID, 0, 60.0)
    assert [w["t"] for w in backing[1]["words"]] == [9.2, 9.5]


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


def mv_for(**cfg):
    from song2mv.timing.build_lyrics import build

    grid = {"bpm": 120.0, "beat": 0.5, "phi": 0.0, "downbeat_mod4": 0, "bar0": 0.0}
    return build([line("v1-01", [1.0, 1.5])], grid, {"audio": "/songs/a.mp3", **cfg}, 30.0)[1]


def test_vignette_and_flashes_go_from_the_song_config_into_mv_json():
    assert list(mv_for()) == ["title", "subtitle", "audio", "audio_path", "duration", "grid", "sections", "lines",
                              "captions", "theme"]  # without the keys, mv.json is as before
    mv = mv_for(vignette=False, flashes=[[12.5, 0.4], [20, 1]])
    assert mv["vignette"] is False and mv["flashes"] == [[12.5, 0.4], [20, 1]]
    assert mv_for(flashes=[])["flashes"] == []


@pytest.mark.parametrize("cfg", [{"vignette": "off"}, {"flashes": False}, {"flashes": [12.5]}, {"flashes": [[1, 0.5, 2]]}])
def test_a_wrong_vignette_or_flashes_value_is_refused(cfg):
    with pytest.raises(Song2mvError, match=next(iter(cfg))):
        mv_for(**cfg)


def test_music_after_the_last_sung_line_gets_a_quiet_section_of_its_own():
    from song2mv.timing.build_lyrics import sections

    lines = [{"section": "v1", "section_name": "Verse 1", "kind": "mid", "start": 0.0, "end": 20.3},
             {"section": "ch1", "section_name": "Chorus", "kind": "hot", "start": 21.0, "end": 39.1}]
    grid = {"beat": 0.5, "bar0": 0.0}
    assert [(s["id"], s["kind"], s["start"], s["end"]) for s in sections(lines, grid, 60.0)] == [
        ("v1", "mid", 0.0, 20.0), ("ch1", "hot", 20.0, 40.0), ("outro", "calm", 40.0, 60.0)]
    assert [s["id"] for s in sections(lines, grid, 43.0)] == ["v1", "ch1"]


def test_the_onset_report_shows_each_word_at_the_time_it_keeps(tmp_path, capsys):
    # A pinned word at 0.90 s and a tone from 1.00 s: the report gives the word's own time, then the onset near it, so
    # a pin it keeps does not read as moved. Lines the runs timed are left out.
    import re

    import numpy as np

    pytest.importorskip("librosa")
    sf = pytest.importorskip("soundfile")
    from song2mv.timing.build_lyrics import onset_report

    sr = 22050
    t = np.arange(2 * sr) / sr
    sf.write(tmp_path / "a.wav", np.where(t >= 1.0, 0.3 * np.sin(2 * np.pi * 220 * t), 0.0), sr)
    onset_report([{"id": "hk1-07", "source": "manual", "words": [{"w": "Beep,", "t": 0.9}]},
                  {"id": "v1-01", "source": "asr", "words": [{"w": "la", "t": 1.2}]}], str(tmp_path / "a.wav"))
    out = capsys.readouterr().out
    assert "each word at the time it keeps" in out and "v1-01" not in out and "→" not in out
    assert re.search(r"hk1-07  \[manual\] Beep, 0\.90 \(onset (0\.9[5-9]|1\.0[0-4]), \+\d+ dB\)", out), out
