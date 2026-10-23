"""Numbers whisper writes in digits are spelled out before matching (numbers.spoken)."""
from pytest import approx

from song2mv.timing.align import merge_runs
from song2mv.timing.lib import align, norm
from song2mv.timing.numbers import sheet_language, spoken


def line(lid, text):
    return {"id": lid, "section": "v1", "section_name": "Verse 1", "kind": "mid", "text": text, "words": text.split()}


def run(*words, step=0.4):
    """A whisper run hearing `words` one after another from 10 s."""
    return {"words": [{"t": t, "s": round(10 + step * k, 2), "e": round(10 + step * (k + 1), 2), "p": 0.9}
                      for k, t in enumerate(words)]}


def test_korean_numbers_are_native_before_counters_that_take_them_and_sino_korean_otherwise():
    cases = {"3시": "세시", "12시에": "열두시에", "2시간": "두시간", "20살": "스무살", "21살": "스물한살", "1번": "한번",
             "4개": "네개", "101명": "백한명", "1번째": "첫번째", "2번째": "두번째", "40분은": "사십분은", "3개월": "삼개월",
             "1년": "일년", "6월": "유월", "10월": "시월", "11월": "십일월", "10만": "십만", "15000원": "만오천원",
             "1,000원": "천원", "0시": "영시", "3시20분": "세시이십분", "7.": "칠."}
    assert {w: spoken(w, "ko") for w in cases} == cases


def test_english_numbers_are_cardinals_and_ordinals():
    cases = {"1,": "one,", "13": "thirteen", "29": "twentynine", "100": "onehundred", "1,000": "onethousand",
             "1st": "first", "2nd": "second", "3rd": "third", "12th": "twelfth", "20th": "twentieth", "21st": "twentyfirst",
             "24/7": "twentyfour/seven"}
    assert {w: spoken(w, "en") for w in cases} == cases


def test_digits_inside_a_code_or_in_another_language_stay():
    assert spoken("B2B", "ko") == "B2B" and spoken("MP3", "en") == "MP3" and spoken("10am", "en") == "10am"
    assert spoken("10", "de") == "10" and spoken("10", None) == "10" and spoken("ten", "en") == "ten"


def test_the_sheet_says_which_language_its_numbers_are_read_in():
    def lang(text):
        return sheet_language([norm(w) for w in text.split()])
    assert lang("세 시 이십 분에 만나 hello") == "ko"
    assert lang("and you were there to hold my hand") == "en"
    assert lang("wir sind die neuen helden der nacht") is None and lang("") is None


def test_a_korean_time_heard_in_digits_matches_the_sheets_letters():
    sheet = [line("v1-01", "세 시 이십 분에 만나")]
    first, cov = align(sheet, run("3시", "20분에", "만나")["words"])
    assert cov[0] == 1.0
    assert [first[(0, k)] for k in range(5)] == approx([10.1, 10.3, 10.45, 10.65, 10.9])  # each number word has its own time
    merged = merge_runs(sheet, [run("3시", "20분에", "만나")] * 3)[0]
    assert merged["coverage"] == [1.0, 1.0, 1.0] and None not in merged["wt"]


def test_one_heard_as_1_starts_the_line_where_it_is_sung():
    sheet = [line("br-01", "so tell me now"), line("br-02", "one two three go")]
    # "1" is heard from where "now" ended, in the pause before the line: the first-word rule now cuts it to the run's
    # median word duration, 12.3–12.6 s, and "one" takes the time of its first letter
    words = [{"t": t, "s": s, "e": e, "p": 0.9} for t, s, e in
             [("so", 10.0, 10.3), ("tell", 10.3, 10.6), ("me", 10.6, 10.9), ("now", 10.9, 11.2),
              ("1,", 11.2, 12.6), ("2,", 12.6, 12.9), ("3", 12.9, 13.2), ("go", 13.2, 13.5)]]
    merged = merge_runs(sheet, [{"words": words}] * 3)[1]
    assert merged["coverage"] == [1.0, 1.0, 1.0]
    assert merged["wt"][:2] == [12.35, 12.65]


def test_a_number_written_in_digits_on_the_sheet_still_matches_the_same_digits():
    first, cov = align([line("v1-01", "call 911 for me")], run("call", "911", "for", "me")["words"])
    assert cov[0] == 1.0 and first[(0, 1)] == approx(10.412, abs=0.001)

