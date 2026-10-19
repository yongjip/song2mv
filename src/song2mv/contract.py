"""The machine contract: every JSON file song2mv writes, and every `--json` result, carries
`schema_version`. Agents and scripts should check it. While song2mv is 0.x the formats may change;
any incompatible change bumps SCHEMA_VERSION and is listed in CHANGELOG.md. See docs/contract.md.
"""
from __future__ import annotations

import json

from .errors import Song2mvError

SCHEMA_VERSION = 1
MV_KEYS = ("duration", "grid", "sections", "lines")  # what render reads (lyrics.json has them too); check needs no grid


def stamp(obj: dict) -> dict:
    """Return `obj` with schema_version as its first key."""
    return {"schema_version": SCHEMA_VERSION, **{k: v for k, v in obj.items() if k != "schema_version"}}


def load_mv(path: str, keys: tuple[str, ...] = MV_KEYS) -> dict:
    """Read an mv.json for check or render, and say clearly when it is another song2mv file."""
    try:
        data = json.load(open(path, encoding="utf-8-sig"))
    except FileNotFoundError:
        raise Song2mvError(f"mv.json not found: {path}") from None
    except ValueError as e:
        raise Song2mvError(f"{path} is not valid JSON: {e}") from None
    hint = "pass the mv.json that `song2mv sync` wrote into its work folder"
    if not isinstance(data, dict):
        raise Song2mvError(f"{path} is not an mv.json", hint=hint)
    missing = [k for k in keys if k not in data]
    if missing:
        if "audio" in data and "lines" not in data:
            raise Song2mvError(f"{path} is a song config (song.json), not an mv.json", hint=hint)
        if "bpm" in data and "lines" not in data:
            raise Song2mvError(f"{path} is a beat grid (grid.json), not an mv.json", hint=hint)
        raise Song2mvError(f"{path} is not an mv.json (no {', '.join(missing)})", hint=hint)
    if not isinstance(data["duration"], (int, float)) or data["duration"] <= 0:
        raise Song2mvError(f"{path}: 'duration' must be the song length in seconds, got {data['duration']!r}", hint=hint)
    version = data.get("schema_version")
    if isinstance(version, int) and version > SCHEMA_VERSION:
        raise Song2mvError(f"{path} has schema_version {version}; this song2mv reads {SCHEMA_VERSION}",
                           hint="upgrade song2mv, or rerun `song2mv sync` with this version")
    return data
