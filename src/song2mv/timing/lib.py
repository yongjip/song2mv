"""Shared pieces of the timing tools: song config, lyric parsing, text normalisation and
character-level alignment of lyrics against whisper word timestamps.

Every other module in this package imports this one.
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import subprocess
from collections import Counter

from ..errors import Song2mvError

# Warnings worth acting on (printed as they happen and returned in the --json result of the command).
WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"  ! {msg}")


def file_sha256(path: str) -> str:
    """Content hash of a file: work folders and caches are tied to the audio's content, not its name."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def asr_key(cfg: dict, audio_sha256: str) -> dict:
    """What a whisper result depends on. A cached run (or re-listened gap) is reused only when this matches."""
    w = cfg["whisper"]
    return {"audio_sha256": audio_sha256, "model": w["model"], "language": cfg.get("language"),
            "compute_type": w.get("compute_type"), "beam_size": w.get("beam_size", 5)}


def key_change(old: dict | None, new: dict) -> str:
    """Why a cached result no longer fits, in words."""
    if not old:
        return "made by an older song2mv"
    if old.get("audio_sha256") != new.get("audio_sha256"):
        return "the audio changed"
    diffs = [f"{k} {old.get(k)!r} → {new.get(k)!r}" for k in new if k != "audio_sha256" and old.get(k) != new.get(k)]
    return ", ".join(diffs) or "settings changed"

# Section names Suno and most lyric sheets use → short ids used in line ids ("ch1-03").
SECTION_IDS = {
    "intro": "in", "verse": "v", "pre-chorus": "pc", "prechorus": "pc", "build": "pc", "build-up": "pc",
    "chorus": "ch", "refrain": "rf", "hook": "hk", "post-chorus": "po", "postchorus": "po", "drop": "dr",
    "bridge": "br", "interlude": "it", "break": "bk", "breakdown": "bk", "rap": "rp", "instrumental": "ins",
    "outro": "ou", "ending": "ou", "spoken": "sp",
}
# How loud a section usually is. The template picks background, glow and lyric layout from this.
HOT = {"ch", "rf", "hk", "po", "dr"}
CALM = {"in", "br", "it", "bk", "ins", "ou", "sp"}

DEFAULT_CONFIG = {
    "title": "",
    "subtitle": "",
    "audio": None,
    "lyrics": None,             # None → read the lyrics tag embedded in the audio file (Suno writes one)
    "language": None,           # whisper language code, e.g. "ko", "en"; None = auto-detect
    "keep_parenthesized_in": [],  # section names where a line that is all "(...)" is sung, not a stage direction
    "section_ids": {},          # {"Verse 1": "v1"} or {"chorus": "ch"} overrides
    "section_kinds": {},        # {"ch1": "hot", "Bridge": "calm"} overrides
    "bpm": "auto",              # number, or "auto" (pick from beat candidates using lyric line spacing)
    "downbeat_mod4": None,      # which beat index (mod 4) starts a bar; None = loudest kick
    "snap_per_beat": 4,         # snap times to 1/4 beat (16th notes, swung when grid.json has swing); 0 = none
    "whisper": {"model": "small", "runs": 3, "device": "cpu", "compute_type": "int8", "threads": 8, "beam_size": 5},
    "auto_reprompt": True,      # re-listen to gaps where no run found a line, with that line as the prompt
    "reprompt": [],             # extra windows: [{"from": 17.5, "to": 30.5, "prompt": "expected words"}]
    "manual": {},               # {"ch1-01": [98.5, 99.2]} — word start times that beat everything else
    "end": None,                # song end used for the last line; None = audio duration
}


def load_config(path: str) -> dict:
    try:
        cfg = json.load(open(path, encoding="utf-8-sig"))
    except FileNotFoundError:
        raise Song2mvError(f"{path} not found") from None
    except json.JSONDecodeError as e:
        raise Song2mvError(f"{path} is not valid JSON: {e}") from None
    if not isinstance(cfg, dict) or ("lines" in cfg and "grid" in cfg):
        raise Song2mvError(f"{path} is not a song config (song.json)",
                           hint="sync takes an audio file or the song.json that an earlier sync wrote into its work folder")
    out = json.loads(json.dumps(DEFAULT_CONFIG))
    for k, v in cfg.items():
        if k == "whisper":
            out["whisper"].update(v)
        else:
            out[k] = v
    base = os.path.dirname(os.path.abspath(path))
    for k in ("audio", "lyrics"):
        if out.get(k) and not os.path.isabs(out[k]):
            out[k] = os.path.normpath(os.path.join(base, out[k]))
    if not out.get("audio"):
        raise Song2mvError(f"{path}: 'audio' is required")
    return out


def audio_duration(path: str) -> float:
    if not os.path.isfile(path):
        raise Song2mvError(f"audio file not found: {path}")
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        detail = (r.stderr.strip().splitlines() or ["no duration"])[-1]
        raise Song2mvError(f"ffprobe could not read {path}: {detail}") from None


def norm(s: str) -> str:
    """Letters and digits only, lower-cased. Unicode-aware, so Hangul, kana and CJK survive."""
    return re.sub(r"[\W_]+", "", s).lower()


def _section_base(name: str) -> tuple[str, str | None]:
    head = name.split(":")[0].strip()
    m = re.fullmatch(r"(.*?)[\s_-]*(\d+)?", head)
    base = re.sub(r"[\s_]+", "-", (m.group(1) if m else head).strip().lower())
    return base, (m.group(2) if m else None)


def section_kind(sec_id: str, name: str, overrides: dict) -> str:
    if sec_id in overrides:
        return overrides[sec_id]
    if name in overrides:
        return overrides[name]
    short = re.sub(r"\d+$", "", sec_id)
    return "hot" if short in HOT else "calm" if short in CALM else "mid"


def parse_lyrics(path: str, cfg: dict) -> list[dict]:
    """A lyric sheet file → lines (lyric_lines)."""
    return lyric_lines(open(path, encoding="utf-8-sig").read(), cfg)  # -sig: a BOM would hide the first [Section]


def lyric_lines(text: str, cfg: dict) -> list[dict]:
    """Lyric sheet → lines. `[Section]` lines name the section; blank lines are ignored; a line that is
    entirely in parentheses is treated as a stage direction like "(Crowd Chant)" and skipped, unless its
    section is listed in keep_parenthesized_in (Suno also writes sung ad-libs that way). A sheet without
    `[Section]` lines gets the ones with_sections proposes.

    Line ids are "<section id>-<nn>", e.g. v1-03, ch2-01. A section name that repeats without a number
    ("Chorus" twice) is numbered by occurrence; a name that appears once keeps the bare short id ("br")."""
    return _lines(with_sections(text, cfg) or text, cfg)


def has_sections(text: str) -> bool:
    return any(re.fullmatch(r"\[(.+)\]", r.strip()) for r in text.splitlines())


def with_sections(text: str, cfg: dict) -> str | None:
    """A lyric sheet without `[Section]` lines, with the ones sections.propose finds in its repeated lines, each before
    its section's first line. None when the sheet has some, or when no block of lines repeats."""
    if has_sections(text):
        return None
    from .sections import propose
    at: list[int] = []
    found = propose([norm(r["text"]) for r in _lines(text, cfg, at)])
    if not found:
        return None
    heads = {at[i]: name for name, i in found}
    out: list[str] = []
    for k, r in enumerate(text.splitlines()):
        if k in heads:
            if out and out[-1].strip():
                out.append("")
            out.append(f"[{heads[k]}]")
        out.append(r)
    return "\n".join(out) + "\n"


def _lines(text: str, cfg: dict, at: list[int] | None = None) -> list[dict]:
    """lyric_lines without proposing sections. `at` gets each line's index among the text's lines."""
    raw = [r.strip() for r in text.splitlines()]
    names = [m.group(1) for r in raw if (m := re.fullmatch(r"\[(.+)\]", r))]
    totals = Counter(b for b, n in map(_section_base, names) if n is None)
    keep = set(cfg.get("keep_parenthesized_in") or [])
    ids_over = cfg.get("section_ids") or {}
    kinds_over = cfg.get("section_kinds") or {}

    lines, used, occ, counts = [], set(), Counter(), Counter()
    sec, sec_name = "s", ""
    for k, r in enumerate(raw):
        if not r:
            continue
        m = re.fullmatch(r"\[(.+)\]", r)
        if m:
            sec_name = m.group(1)
            base, num = _section_base(sec_name)
            if sec_name in ids_over:
                sid = ids_over[sec_name]
            else:
                short = ids_over.get(base) or SECTION_IDS.get(base) or (re.sub(r"[^a-z0-9]", "", base)[:3] or "s")
                if num is not None:
                    sid = short + num
                else:
                    occ[base] += 1
                    sid = short + (str(occ[base]) if totals[base] > 1 else "")
            while sid in used:  # the same name twice with the same number
                sid += "b"
            used.add(sid)
            sec = sid
            continue
        if re.fullmatch(r"\(.+\)", r) and sec_name not in keep and "*" not in keep:
            continue
        words = r.split()
        if not any(norm(w) for w in words):
            continue
        counts[sec] += 1
        if at is not None:
            at.append(k)
        lines.append({
            "id": f"{sec}-{counts[sec]:02d}", "section": sec, "section_name": sec_name,
            "kind": section_kind(sec, sec_name, kinds_over), "text": r, "words": words,
        })
    return lines


# Matching the lyric sheet to a whisper run. difflib anchors on the longest common block first: when a chorus repeats
# word for word, that block can pair one copy in the sheet with the other copy in the run, and every match after it
# must then come later still (docs/benchmark.md). A global alignment by dynamic programming cannot do that, because it
# counts the matches of the whole song. Its scores are in letters: +1 for a matched letter.
GAP_OPEN = 1.25  # leaving a stretch of letters unmatched, on either side; GAP_EXTEND for each letter after the first
GAP_EXTEND = 0.05
MISMATCH = 1.0  # a letter aligned with a different one
BLOCK = 3  # where the two alignments disagree, the one with more letters in runs of at least BLOCK letters wins
LINE_GAP = 10.0  # matched letters of one lyric line further apart than this (seconds) are in two different places
MAX_CELLS = 40_000_000  # one byte of memory per cell; a longer sheet × run is matched by difflib alone


def _global_blocks(L: list[str], R: list[str]) -> list[tuple[int, int, int]]:
    """Runs of matched letters (a, b, n) on the best global alignment of L and R (affine gaps). On a tie, letters are
    left unmatched as late as possible, so text that one side has twice is matched to its first copy, as difflib does
    with equal blocks."""
    import numpy as np
    n, m = len(L), len(R)
    S = 20  # integer scores (1/20 letter) keep the traceback exact
    o, e, mis, neg = round(GAP_OPEN * S), round(GAP_EXTEND * S), round(MISMATCH * S), -(1 << 40)
    codes: dict[str, int] = {}
    Lc = np.array([codes.setdefault(c, len(codes)) for c in L], dtype=np.int64)
    Rc = np.array([codes.setdefault(c, len(codes)) for c in R], dtype=np.int64)
    # States: 0 = L[i-1] aligned with R[j-1], 1 = L[i-1] left unmatched, 2 = R[j-1] left unmatched. ptr[i, j] holds
    # the state each one came from: bits 0-1 for state 0, 2-3 for state 1, 4-5 for state 2.
    ptr = np.zeros((n + 1, m + 1), dtype=np.uint8)
    j = np.arange(m + 1, dtype=np.int64)
    edge = np.array([neg], dtype=np.int64)
    D, U, H = np.full(m + 1, neg, dtype=np.int64), np.full(m + 1, neg, dtype=np.int64), -o - (j - 1) * e
    D[0], H[0] = 0, neg
    ptr[0, 2:] = 2 << 4
    tie = np.array([1, 2, 0], dtype=np.uint8)  # on a tie: came from 1, then 2, then 0 (unmatched letters go late)
    for i in range(1, n + 1):
        c = np.stack([U, H, D])
        k = c.argmax(0)
        nD = np.concatenate([edge, c[k, j][:-1] + np.where(Rc == Lc[i - 1], S, -mis)])
        pD = np.concatenate([[0], tie[k][:-1]]).astype(np.uint8)
        c = np.stack([U - e, H - o, D - o])
        k = c.argmax(0)
        nU, pU = c[k, j], tie[k]
        nH = np.concatenate([edge, np.maximum.accumulate(np.maximum(nU, nD) - o + e * j)[:-1] - e * j[:-1]])
        c = np.stack([np.concatenate([edge, x[:-1]]) - d for x, d in ((nH, e), (nU, o), (nD, o))])
        pH = np.array([2, 1, 0], dtype=np.uint8)[c.argmax(0)]
        ptr[i] = pD | (pU << 2) | (pH << 4)
        D, U, H = nD, nU, np.maximum(nH, neg)
    state = max((1, 2, 0), key=lambda s: (D, U, H)[s][m])
    i, jj, pairs = n, m, []
    while i or jj:
        p = int(ptr[i, jj])
        if state == 0:
            if L[i - 1] == R[jj - 1]:
                pairs.append((i - 1, jj - 1))
            state, i, jj = p & 3, i - 1, jj - 1
        elif state == 1:
            state, i = (p >> 2) & 3, i - 1
        else:
            state, jj = (p >> 4) & 3, jj - 1
    blocks: list[list[int]] = []
    for a, b in reversed(pairs):
        if blocks and blocks[-1][0] + blocks[-1][2] == a and blocks[-1][1] + blocks[-1][2] == b:
            blocks[-1][2] += 1
        else:
            blocks.append([a, b, 1])
    return [(a, b, k) for a, b, k in blocks]


def _pairs(blocks) -> dict[tuple[int, int], int]:
    """Matched letters (lyric index, recognised index) → the length of their run; single letters are dropped."""
    return {(a + k, b + k): n for a, b, n in blocks if n >= 2 for k in range(n)}


def _prefer(greedy: dict, best: dict) -> list[tuple[int, int]]:
    """Two alignments of the same texts → one. Between the letters both matched the same way, each stretch takes the
    alignment with more letters there in runs of BLOCK or more, difflib's (`greedy`) on a tie. Both are in order, so
    the result is too."""
    import bisect
    common = sorted(greedy.keys() & best.keys())
    shared, at = set(common), [a for a, _ in common]
    parts: tuple[dict, dict] = ({}, {})
    for pairs, out in zip((greedy, best), parts):
        for p in pairs:
            if p not in shared:
                out.setdefault(bisect.bisect_left(at, p[0]), []).append(p)
    keep = list(common)
    g, d = parts
    for k in g.keys() | d.keys():
        x, y = g.get(k, []), d.get(k, [])
        keep += x if sum(greedy[p] >= BLOCK for p in x) >= sum(best[p] >= BLOCK for p in y) else y
    return sorted(keep)


def _one_place(pairs: list[tuple[int, int]], idx: list[tuple[int, int]], Rt: list[float]) -> list[tuple[int, int]]:
    """A lyric line is sung in one place. Where two of its matched letters lie more than LINE_GAP seconds apart in the
    run (two letters that happen to match a word 40 s away, or a phrase the run heard twice), only the stretch with the
    most letters is kept."""
    by_line: dict[int, list] = {}
    for p in pairs:
        by_line.setdefault(idx[p[0]][0], []).append(p)
    out = []
    for ps in by_line.values():
        parts = [[ps[0]]]
        for p, q in zip(ps, ps[1:]):
            if Rt[q[1]] - Rt[p[1]] > LINE_GAP:
                parts.append([])
            parts[-1].append(q)
        out += max(parts, key=len)
    return sorted(out)


def align(lines: list[dict], asr_words: list[dict], only: set[int] | None = None,
          word_index: bool = False, heard: set[int] | None = None,
          spans: dict[int, list[int]] | None = None) -> tuple[dict, dict]:
    """Match lyric characters to recognised characters, in order, and return
    ({(line, word): time of the word's first matched character}, {line: fraction of its characters matched}).
    With word_index the first dict holds the index in asr_words of that character's word instead of its time.
    `heard` gets the index in asr_words of every recognised word with a matched character, and `spans`, per line,
    the indices of the first and the last of them.

    Two alignments are made, difflib's and a global one (_global_blocks). Where they disagree, the one that matched more
    of that stretch is kept, difflib's on a tie: the global one takes over where difflib put a repeated chorus on its
    other copy and lost the lines in between, and nothing changes where difflib was fine. Recognised words are spread
    evenly over their characters. Single-character matches are dropped — with a whole song of text they are mostly
    coincidence. `only` restricts the lyric side to some lines (used when re-listening to one gap)."""
    L, idx = [], []
    for li, ln in enumerate(lines):
        if only is not None and li not in only:
            continue
        for wi, w in enumerate(ln["words"]):
            for ch in norm(w):
                L.append(ch)
                idx.append((li, wi))
    R, Rt, Rw = [], [], []
    for k, w in enumerate(asr_words):
        cs = norm(w["t"])
        for q, ch in enumerate(cs):
            R.append(ch)
            Rt.append(w["s"] + (w["e"] - w["s"]) * (q + 0.5) / len(cs))
            Rw.append(k)
    greedy = _pairs(difflib.SequenceMatcher(None, L, R, autojunk=False).get_matching_blocks())
    if L and R and len(L) * len(R) <= MAX_CELLS:
        pairs = _prefer(greedy, _pairs(_global_blocks(L, R)))
    else:
        pairs = sorted(greedy)
    first: dict = {}
    hits: Counter = Counter()
    for a, b in _one_place(pairs, idx, Rt):
        key = idx[a]
        hits[key[0]] += 1
        first.setdefault(key, Rw[b] if word_index else Rt[b])
        if heard is not None:
            heard.add(Rw[b])
        if spans is not None:
            spans.setdefault(key[0], [Rw[b], Rw[b]])[1] = Rw[b]
    totals = Counter(li for li, _ in idx)
    return first, {li: hits[li] / totals[li] for li in totals}


ORDER_SLACK = 2.0  # a line may start this long before the line above it: a backing vocal written after the line it precedes


def in_order(starts: list[float | None], slack: float = ORDER_SLACK) -> set[int]:
    """Indices of the longest chain of lines that keeps the lyric sheet's order, where each line starts no more than
    `slack` seconds before the one before it on the chain (a backing vocal can be written after the line it comes
    before). Lines without a start are not on it. A chorus placed on its other copy breaks the order."""
    at = {i: s for i, s in enumerate(starts) if s is not None}
    best: dict[int, int] = {}
    prev: dict[int, int | None] = {}
    for i in at:
        best[i], prev[i] = 1, None
        for h in at:
            if h >= i:
                break
            if at[i] >= at[h] - slack and best[h] + 1 > best[i]:
                best[i], prev[i] = best[h] + 1, h
    keep: set[int] = set()
    k = max(at, key=lambda i: best[i], default=None)
    while k is not None:
        keep.add(k)
        k = prev[k]
    return keep


def write_json(obj, path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
