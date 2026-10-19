"""Write an LRC file from lyrics.json (or mv.json): one `[mm:ss.xx]line` per lyric line. Before a gap
of more than 4 s an empty timestamp clears the screen during the instrumental (some players drop it).
--words also writes word timestamps in the enhanced-LRC form `[mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word`.

Usage: python -m song2mv.timing.to_lrc work/lyrics.json work/song.lrc [--words]
"""
from __future__ import annotations

import json
import sys


def ts(t: float, angle=False) -> str:
    t = max(0.0, t)
    m = int(t // 60)
    s = t - 60 * m
    return f"<{m:02d}:{s:05.2f}>" if angle else f"[{m:02d}:{s:05.2f}]"


def to_lrc(lines: list[dict], out: str, words=False, meta: dict | None = None) -> int:
    rows = sorted(lines, key=lambda r: r["start"])
    lrc = [f"[{k}:{v}]" for k, v in (meta or {}).items() if v]
    for i, r in enumerate(rows):
        body = " ".join(ts(w["t"], True) + w["w"] for w in r["words"]) if words else r["text"]
        lrc.append(ts(r["start"]) + body)
        nxt = rows[i + 1]["start"] if i + 1 < len(rows) else None
        if nxt is None or nxt - r["end"] > 4.0:
            lrc.append(ts(r["end"] + 0.6))
    open(out, "w", encoding="utf-8").write("\n".join(lrc) + "\n")
    return len(rows)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--words"]
    if len(args) != 2:
        sys.exit(__doc__)
    data = json.load(open(args[0], encoding="utf-8"))
    n = to_lrc(data["lines"], args[1], words="--words" in sys.argv, meta={"ti": data.get("title")})
    print(f"{n} lines → {args[1]}")
