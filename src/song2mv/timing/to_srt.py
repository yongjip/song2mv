"""Write SRT subtitles from lyrics.json lines: one cue per lyric line, from its start to its end.

Video editors (CapCut, Premiere, DaVinci Resolve, Final Cut) import SRT directly, so a song's timing can be used
without the render template. Cues never overlap: a cue ends at the next cue's start, and lines that start within
MIN_CUE of each other (a backing vocal on top of a line) share one cue, one text line each.
"""
from __future__ import annotations

MIN_CUE = 0.3  # seconds


def ts(t: float) -> str:
    ms = max(0, int(round(t * 1000)))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(lines: list[dict], out: str) -> int:
    groups: list[list[dict]] = []
    for r in sorted(lines, key=lambda r: r["start"]):
        if groups and r["start"] - groups[-1][0]["start"] < MIN_CUE:
            groups[-1].append(r)
        else:
            groups.append([r])
    cues = []
    for i, g in enumerate(groups):
        start = g[0]["start"]
        end = max(max(r["end"] for r in g), start + MIN_CUE)
        if i + 1 < len(groups):
            end = min(end, groups[i + 1][0]["start"])  # at least MIN_CUE after start: groups start that far apart
        text = "\n".join(r["text"] for r in g)
        cues.append(f"{len(cues) + 1}\n{ts(start)} --> {ts(end)}\n{text}\n")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(cues))
    return len(cues)
