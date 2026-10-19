"""Pull the lyrics embedded in an audio file's tags into a text file. Suno writes them to a `lyrics-<lang>`
tag, `[Section]` lines included. Other files may use `lyrics` or `UNSYNCEDLYRICS`.

Usage: python -m song2mv.timing.extract_lyrics song.mp3 work/lyrics.txt
"""
from __future__ import annotations

import json
import os
import subprocess
import sys


def extract(audio: str, out: str) -> int:
    meta = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", audio],
        capture_output=True, text=True, check=True).stdout)
    tags = meta.get("format", {}).get("tags", {})
    key = next((k for k in tags if k.lower().startswith(("lyrics", "unsyncedlyrics"))), None)
    if key is None:
        raise SystemExit(f"no lyrics tag in {audio} (tags: {sorted(tags)}). Write the lyrics to a text file "
                         "and set \"lyrics\" in the song config.")
    text = tags[key].replace("\r\n", "\n").strip() + "\n"
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "w", encoding="utf-8").write(text)
    n = sum(1 for line in text.splitlines() if line.strip())
    print(f"  {key}: {n} lines → {out}")
    return n


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    extract(sys.argv[1], sys.argv[2])
