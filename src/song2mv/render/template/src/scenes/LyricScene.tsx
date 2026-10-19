import React, { useContext } from "react";
import { BigLine, Bokeh, Dust, GridFloor, Moon, Rays, Snow, Song, Svg, VerticalCtx, sectionLook, useSong } from "../kit";

/**
 * The default scene: a plain but beat-aware lyric video that works for any song.
 *   calm sections (intro, bridge, outro) — a low moon, rising embers, soft lights; lyrics as bottom captions
 *   mid sections (verses, pre-choruses) — a floor grid rolling in one line per beat; lyrics as bottom captions
 *   hot sections (choruses, hooks, drops) — turning rays that kick on the beat; the line itself huge in the middle
 *
 * This is the starting point, not the music video. Replace it with scenes made for the song
 * (see the song2mv skill, .claude/skills/song2mv/SKILL.md) and export them from scenes/index.ts.
 */

/** Line ids this scene draws itself — the bottom captions skip them */
export function linesDrawnByScene(song: Song): Set<string> {
  const hot = new Set(song.sections.filter((s) => s.kind === "hot").map((s) => s.id));
  return new Set(song.lines.filter((l) => hot.has(l.section)).map((l) => l.id));
}

export const LyricScene: React.FC<{ T: number }> = ({ T }) => {
  const ctx = useSong();
  const { song, theme, grid } = ctx;
  const { sec, glow } = sectionLook(ctx, T);
  const vertical = useContext(VerticalCtx);
  const hotLines = React.useMemo(() => {
    const ids = linesDrawnByScene(song);
    return song.lines.filter((l) => ids.has(l.id));
  }, [song]);

  if (sec.kind === "calm") {
    return (
      <Svg>
        <Moon T={T} color={theme.kinds.calm.glow} x={vertical ? 960 : 1380} />
        <Bokeh T={T} color={glow} n={10} opacity={2} />
        <Snow T={T} color={theme.kinds.calm.glow} n={80} speed={30} />
      </Svg>
    );
  }
  if (sec.kind === "mid") {
    return (
      <Svg>
        <Bokeh T={T} color={glow} n={10} opacity={1.6} />
        <GridFloor T={T} color={glow} />
        <Dust T={T} color={theme.stars[1] ?? glow} n={50} speed={55} scale={1.5} />
      </Svg>
    );
  }
  return (
    <>
      <Rays T={T} color={glow} opacity={0.16 + 0.22 * grid.pulse(T, 0.22)} />
      <Svg>
        <Dust T={T} color={theme.bigText} n={60} speed={140} up={false} />
      </Svg>
      <BigLine T={T} lines={hotLines} />
    </>
  );
};
