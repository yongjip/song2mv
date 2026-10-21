"""Pull the lyrics embedded in an audio file's tags into a text file. Suno writes them to a `lyrics-<lang>`
tag, `[Section]` lines included. Other files may use `lyrics` or `UNSYNCEDLYRICS`.

Usage: python -m song2mv.timing.extract_lyrics song.mp3 work/lyrics.txt
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

from ..errors import Song2mvError


def _tags(audio: str) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", audio],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise Song2mvError(f"ffprobe could not read {audio}: {(r.stderr.strip().splitlines() or ['?'])[-1]}")
    return json.loads(r.stdout or "{}").get("format", {}).get("tags", {})


def lyrics_tag(audio: str) -> tuple[str, str] | None:
    """(tag name, text) of the audio file's lyrics tag, or None when it has none."""
    tags = _tags(audio)
    key = next((k for k in tags if k.lower().startswith(("lyrics", "unsyncedlyrics"))), None)
    return (key, tags[key].replace("\r\n", "\n").lstrip("\ufeff").strip() + "\n") if key else None


def extract(audio: str, out: str) -> int:
    tag = lyrics_tag(audio)
    if tag is None:
        raise Song2mvError(f"no lyrics tag in {audio} (tags: {sorted(_tags(audio))})",
                           hint="write the lyrics to a text file and pass --lyrics FILE")
    key, text = tag
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "w", encoding="utf-8").write(text)
    n = sum(1 for line in text.splitlines() if line.strip())
    print(f"  {key}: {n} lines → {out}")
    return n


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    extract(sys.argv[1], sys.argv[2])
