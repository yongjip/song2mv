"""Write an LRC file from lyrics.json (or mv.json): one `[mm:ss.xx]line` per lyric line, its sung words (a "/" or
"–" between them in the lyric sheet is left out, as in the video's captions). Before a gap of more than 4 s an empty
timestamp clears the screen during the instrumental (some players drop it).
--words also writes word timestamps in the enhanced-LRC form `[mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word`.

Usage: python -m song2mv.timing.to_lrc work/lyrics.json work/song.lrc [--words]
"""
from __future__ import annotations

import json
import sys


def ts(t: float, angle=False) -> str:
    cs = max(0, int(round(t * 100)))  # round once, to centiseconds: 59.996 is 01:00.00, not 00:60.00
    m, cs = divmod(cs, 6000)
    s = f"{m:02d}:{cs // 100:02d}.{cs % 100:02d}"
    return f"<{s}>" if angle else f"[{s}]"


def to_lrc(lines: list[dict], out: str, words=False, meta: dict | None = None) -> int:
    rows = sorted(lines, key=lambda r: r["start"])
    lrc = [f"[{k}:{v}]" for k, v in (meta or {}).items() if v]
    sung_until = 0.0  # a line that started earlier can still be sung (backing vocals)
    for i, r in enumerate(rows):
        body = " ".join(ts(w["t"], True) + w["w"] if words else w["w"] for w in r["words"])
        lrc.append(ts(r["start"]) + body)
        sung_until = max(sung_until, r["end"])
        nxt = rows[i + 1]["start"] if i + 1 < len(rows) else None
        if nxt is None or nxt - sung_until > 4.0:
            lrc.append(ts(sung_until + 0.6))
    open(out, "w", encoding="utf-8").write("\n".join(lrc) + "\n")
    return len(rows)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--words"]
    if len(args) != 2:
        sys.exit(__doc__)
    data = json.load(open(args[0], encoding="utf-8"))
    n = to_lrc(data["lines"], args[1], words="--words" in sys.argv, meta={"ti": data.get("title")})
    print(f"{n} lines → {args[1]}")
