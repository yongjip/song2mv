"""Sections for a lyric sheet without `[Section]` lines, proposed from the lines that repeat.

The block of lines sung most often again is the chorus. Lines of the block that only some of its copies have, before
(after) the lines all of them have, are a pre-chorus (post-chorus); the lines between copies are verses. The stretch
before the last chorus is a bridge when it comes after two choruses and is shorter than the verses before it; the
lines after the last chorus are the outro unless there are more of them than in a verse.
"""
from __future__ import annotations

import difflib
import statistics

ALIKE = 0.8  # two lines are the same line when their letters match this well (difflib ratio)
BRIDGE = 8  # lines in a bridge, at most
CORE = 4  # lines all copies of the chorus have, at least, before a pre-chorus or post-chorus is split off


def _alike(a: str, b: str) -> bool:
    if a == b:
        return bool(a)
    if not a or not b or 3 * min(len(a), len(b)) < 2 * max(len(a), len(b)):
        return False
    m = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return m.quick_ratio() >= ALIKE and m.ratio() >= ALIKE


def _blocks(same: list[list[bool]]) -> set[tuple[int, int]]:
    """(start, length) of every stretch of lines that is sung again further on: a diagonal of `same` that matches at
    least two lines and never misses two in a row, ending on a match and not reaching its own copy."""
    n = len(same)
    out = set()
    for d in range(1, n):
        for a in range(n - d):
            if not same[a][a + d] or (a and same[a - 1][a - 1 + d]):
                continue
            k, last, hits = 0, 0, 0
            while a + k + d < n and k < d and k - last <= 2:
                if same[a + k][a + k + d]:
                    last, hits = k, hits + 1
                k += 1
            if hits >= 2:
                out.add((a, last + 1))
    return out


def _copies(same: list[list[bool]], a: int, n: int) -> list[tuple[int, int, list[int]]]:
    """Copies of lines a…a+n-1 that do not overlap: (start, end, the block's lines it matches), the block itself
    included. A copy matches at least half of the block's lines (two at least), or its first two, and spans the lines
    it matches."""
    found = []
    for p in range(len(same) - 1):
        ks = list(range(n)) if p == a else [k for k in range(n) if p + k < len(same) and same[a + k][p + k]]
        if len(ks) >= max(2, (n + 1) // 2) or ks[:2] == [0, 1]:
            found.append((p != a, -len(ks), p + ks[0], p + ks[-1] + 1, ks))
    out: list[tuple[int, int, list[int]]] = []
    used: set[int] = set()
    for _, _, s, e, ks in sorted(found):
        if used.isdisjoint(range(s, e)):
            out.append((s, e, ks))
            used.update(range(s, e))
    return sorted(out)


def _chorus(texts: list[str], same: list[list[bool]]) -> tuple[int, list[tuple[int, int, list[int]]]] | None:
    """The block of at least two different lines whose copies match the most lines, and its copies."""
    best, key = None, None
    for a, n in _blocks(same):
        if len(set(texts[a:a + n])) < 2:
            continue
        copies = _copies(same, a, n)
        k = (sum(len(ks) for _, _, ks in copies), n, -a)
        if len(copies) >= 2 and (key is None or k > key):
            best, key = (n, copies), k
    return best


def propose(texts: list[str]) -> list[tuple[str, int]] | None:
    """Section names, each with the index of its first line, for the sung lines `texts` (lib.norm), or None when no
    block of lines repeats."""
    n = len(texts)
    same = [[False] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            same[i][j] = same[j][i] = _alike(texts[i], texts[j])
    found = _chorus(texts, same)
    if not found:
        return None
    size, copies = found
    count = [sum(k in ks for _, _, ks in copies) for k in range(size)]
    core = [k for k in range(size) if count[k] == max(count)]
    lo, hi = (core[0], core[-1] + 1) if core[-1] + 1 - core[0] >= CORE else (0, size)
    spans = []
    for s, e, ks in copies:
        a, b = max(s, s - ks[0] + lo), min(e, s - ks[0] + hi)
        if a >= b:
            a, b = s, e
        if a - s >= 2:
            spans.append(("Pre-Chorus", s, a))
        else:
            a = s
        if e - b >= 2:
            spans += [("Chorus", a, b), ("Post-Chorus", b, e)]
        else:
            spans.append(("Chorus", a, e))
    gaps, at = [], 0
    for _, s, e in spans:
        if s > at:
            gaps.append((at, s))
        at = e
    lengths = [b - a for a, b in gaps]
    named = [(name, s) for name, s, _ in spans]
    for i, (a, b) in enumerate(gaps):
        before = sum(name == "Chorus" and s < a for name, s, _ in spans)
        bridge = 0 < i == len(gaps) - 1 and before >= 2 and b - a <= min(BRIDGE, statistics.median(lengths[:i]) - 1)
        named.append(("Bridge" if bridge else "Verse", a))
    if at < n:
        named.append(("Outro" if n - at <= (statistics.median(lengths) if lengths else 4) else "Verse", at))
    out, verse = [], 0
    for name, s in sorted(named, key=lambda x: x[1]):
        if name == "Verse":
            verse += 1
            name = f"Verse {verse}"
        out.append((name, s))
    return out
