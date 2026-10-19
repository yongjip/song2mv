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
    "snap_per_beat": 4,         # snap times to 1/4 beat (16th notes); 0 = no snapping
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
    """Lyric sheet → lines. `[Section]` lines name the section; blank lines are ignored; a line that is
    entirely in parentheses is treated as a stage direction like "(Crowd Chant)" and skipped, unless its
    section is listed in keep_parenthesized_in (Suno also writes sung ad-libs that way).

    Line ids are "<section id>-<nn>", e.g. v1-03, ch2-01. A section name that repeats without a number
    ("Chorus" twice) is numbered by occurrence; a name that appears once keeps the bare short id ("br")."""
    raw = [r.strip() for r in open(path, encoding="utf-8-sig")]  # -sig: a BOM would hide the first [Section]
    names = [m.group(1) for r in raw if (m := re.fullmatch(r"\[(.+)\]", r))]
    totals = Counter(b for b, n in map(_section_base, names) if n is None)
    keep = set(cfg.get("keep_parenthesized_in") or [])
    ids_over = cfg.get("section_ids") or {}
    kinds_over = cfg.get("section_kinds") or {}

    lines, used, occ, counts = [], set(), Counter(), Counter()
    sec, sec_name = "s", ""
    for r in raw:
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
        lines.append({
            "id": f"{sec}-{counts[sec]:02d}", "section": sec, "section_name": sec_name,
            "kind": section_kind(sec, sec_name, kinds_over), "text": r, "words": words,
        })
    return lines


def align(lines: list[dict], asr_words: list[dict], only: set[int] | None = None) -> tuple[dict, dict]:
    """Match lyric characters to recognised characters (difflib, in order) and return
    ({(line, word): time of the word's first matched character}, {line: fraction of its characters matched}).

    Recognised words are spread evenly over their characters. Single-character matches are dropped —
    with a whole song of text they are mostly coincidence. `only` restricts the lyric side to some lines
    (used when re-listening to one gap)."""
    L, idx = [], []
    for li, ln in enumerate(lines):
        if only is not None and li not in only:
            continue
        for wi, w in enumerate(ln["words"]):
            for ch in norm(w):
                L.append(ch)
                idx.append((li, wi))
    R, Rt = [], []
    for w in asr_words:
        cs = norm(w["t"])
        for k, ch in enumerate(cs):
            R.append(ch)
            Rt.append(w["s"] + (w["e"] - w["s"]) * (k + 0.5) / len(cs))
    sm = difflib.SequenceMatcher(None, L, R, autojunk=False)
    first: dict = {}
    hits: Counter = Counter()
    for a, b, n in sm.get_matching_blocks():
        if n < 2:
            continue
        for k in range(n):
            key = idx[a + k]
            hits[key[0]] += 1
            first.setdefault(key, Rt[b + k])
    totals = Counter(li for li, _ in idx)
    return first, {li: hits[li] / totals[li] for li in totals}


def write_json(obj, path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
