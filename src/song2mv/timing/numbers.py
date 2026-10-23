"""Numbers written in digits, spelled out as they are sung. Whisper writes "세 시 이십 분" as "3시 20분" and "twenty
nine" as "29", and lib.align matches letters: spelled out in the lyric sheet's language, on both sides, the digits
can match the sheet's letters. Korean and English; other languages keep their digits."""
from __future__ import annotations

import re

_DIGIT = re.compile(r"[0-9]")
_THOUSANDS = re.compile(r"(?<=[0-9]),(?=[0-9]{3}(?![0-9]))")
_HANGUL = re.compile(r"[\uac00-\ud7a3]")
_ENGLISH = frozenset("the you and i to my me it is that your of be we on for with all im dont its".split())
LIMIT = 10**12  # longer numbers keep their digits

_KO = re.compile(r"(?<![0-9A-Za-z])[0-9]+(?![0-9A-Za-z])")  # not part of a Latin code such as B2B or 4K
_KO_DIGITS = "영일이삼사오육칠팔구"
_KO_ONES = ("", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉")
_KO_TENS = ("", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔")
_KO_NATIVE = re.compile("시간|시|살|개(?!월)|명|마리|잔|번(?!지)|사람|병|권|장|곡|배|달|가지|걸음")

_EN = re.compile(r"(?<![^\W_])([0-9]+)(st|nd|rd|th)?(?![^\W_])", re.IGNORECASE)
_EN_SMALL = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
             "seventeen eighteen nineteen").split()
_EN_TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
_EN_BIG = ((10**9, "billion"), (10**6, "million"), (1000, "thousand"), (100, "hundred"))
_EN_ORDINAL = (("one", "first"), ("two", "second"), ("three", "third"), ("five", "fifth"), ("eight", "eighth"),
               ("nine", "ninth"), ("twelve", "twelfth"))


def sheet_language(words: list[str]) -> str | None:
    """The language a lyric sheet's numbers are read in, from its normalised words: "ko" when at least half of them
    hold Hangul, "en" when at least a tenth are among the commonest English words (17–41 % in the JamendoLyrics
    English songs, at most 7 % in its German, Spanish and French ones), else None."""
    words = [w for w in words if w]
    if not words:
        return None
    if sum(bool(_HANGUL.search(w)) for w in words) >= 0.5 * len(words):
        return "ko"
    if sum(w in _ENGLISH for w in words) >= 0.1 * len(words):
        return "en"
    return None


def spoken(word: str, language: str | None) -> str:
    """`word` with its numbers spelled out as `language` reads them: "3시" → "세시", "40분에" → "사십분에",
    "29" → "twentynine", "21st" → "twentyfirst". A word without digits, or in another language, is returned as is."""
    if language not in ("ko", "en") or not _DIGIT.search(word):
        return word
    word = _THOUSANDS.sub("", word)
    if language == "ko":
        return _KO.sub(_korean, word)
    return _EN.sub(_english, word)


def _korean(m: re.Match) -> str:
    """Native numerals before a counter that takes them (세 시, 스무 살, 두 번째), Sino-Korean otherwise (이십 분, 유월)."""
    n, after = int(m.group()), m.string[m.end():]
    if n >= LIMIT:
        return m.group()
    if after.startswith("번째"):
        return "첫" if n == 1 else _ko_native(n)
    if after.startswith("월") and n in (6, 10):
        return "유" if n == 6 else "시"
    return _ko_native(n) if _KO_NATIVE.match(after) else _ko_sino(n)


def _ko_sino(n: int) -> str:
    if n == 0:
        return "영"
    out = ""
    for unit, name in ((10**8, "억"), (10**4, "만"), (1, "")):
        group = n // unit % 10**4
        if group:
            out += ("" if group == 1 and name == "만" else _ko_group(group)) + name
    return out


def _ko_group(n: int) -> str:
    out = ""
    for unit, name in ((1000, "천"), (100, "백"), (10, "십"), (1, "")):
        d = n // unit % 10
        if d:
            out += ("" if d == 1 and name else _KO_DIGITS[d]) + name
    return out


def _ko_native(n: int) -> str:
    """The form before a counter (한, 두, 스무); hundreds are Sino-Korean (백한 명)."""
    if n % 100 == 0:
        return _ko_sino(n)
    tens, ones = divmod(n % 100, 10)
    return (_ko_sino(n - n % 100) if n >= 100 else "") + ("스무" if n % 100 == 20 else _KO_TENS[tens] + _KO_ONES[ones])


def _english(m: re.Match) -> str:
    n = int(m.group(1))
    if n >= LIMIT:
        return m.group()
    return _en_ordinal(n) if m.group(2) else _en(n)


def _en(n: int) -> str:
    if n < 20:
        return _EN_SMALL[n]
    if n < 100:
        return _EN_TENS[n // 10] + (_EN_SMALL[n % 10] if n % 10 else "")
    unit, name = next(b for b in _EN_BIG if n >= b[0])
    return _en(n // unit) + name + (_en(n % unit) if n % unit else "")


def _en_ordinal(n: int) -> str:
    s = _en(n)
    for cardinal, ordinal in _EN_ORDINAL:
        if s.endswith(cardinal):
            return s[: -len(cardinal)] + ordinal
    return s[:-1] + "ieth" if s.endswith("y") else s + "th"
