"""Write SRT subtitles from lyrics.json lines: one cue per lyric line, from its start to its end.

Video editors (CapCut, Premiere, DaVinci Resolve, Final Cut) import SRT directly, so a song's timing can be used
without the render template. A cue never runs past the next line's start.
"""
from __future__ import annotations


def ts(t: float) -> str:
    ms = max(0, int(round(t * 1000)))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(lines: list[dict], out: str) -> int:
    rows = sorted(lines, key=lambda r: r["start"])
    cues = []
    for i, r in enumerate(rows):
        end = r["end"]
        if i + 1 < len(rows):
            end = min(end, rows[i + 1]["start"])
        end = max(end, r["start"] + 0.3)
        cues.append(f"{len(cues) + 1}\n{ts(r['start'])} --> {ts(end)}\n{r['text']}\n")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(cues))
    return len(cues)
