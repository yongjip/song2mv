import React, { FC, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { Song, SongContext, makeSongCtx } from "./kit";
import * as concepts from "./scenes/concepts";

/**
 * Every component exported from scenes/concepts/index.ts, side by side at song time T, each labelled with its export
 * name: rough stills of the concepts to pick from. Each is drawn alone on the theme's background, without the
 * frame's sky, captions or vignette. In a template copy inside the work folder:
 *   npx remotion still src/index.ts Concepts concepts.png --props="{\"T\": 33.1, \"song\": $(cat ../mv.json)}"
 */
const GAP = 12;

export const ConceptBoard: React.FC<{ song: Song; T: number }> = ({ song, T }) => {
  const ctx = useMemo(() => makeSongCtx(song), [song]);
  const list = Object.entries(concepts)
    .filter(([, C]) => typeof C === "function")
    .sort(([a], [b]) => (a < b ? -1 : 1)) as [string, FC<{ T: number }>][];
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const rows = Math.ceil(list.length / cols);
  const w = (1920 - GAP * (cols + 1)) / cols, k = w / 1920, h = 1080 * k;
  const top = (1080 - rows * h - (rows - 1) * GAP) / 2;
  return (
    <SongContext.Provider value={ctx}>
      <AbsoluteFill style={{ background: "#202124", fontFamily: ctx.theme.font, color: "#fff" }}>
        {list.length === 0 && (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 700 }}>
            No concepts yet: export them from src/scenes/concepts/index.ts
          </AbsoluteFill>
        )}
        {list.map(([name, Concept], i) => {
          const row = Math.floor(i / cols), inRow = Math.min(cols, list.length - row * cols);
          const x = (1920 - inRow * w - (inRow - 1) * GAP) / 2 + (i % cols) * (w + GAP), y = top + row * (h + GAP);
          return (
            <React.Fragment key={name}>
              <div style={{ position: "absolute", left: x, top: y, width: 1920, height: 1080, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden", background: ctx.theme.bg }}>
                <Concept T={T} />
              </div>
              <div style={{ position: "absolute", left: x + 10, top: y + 8, padding: "4px 12px", borderRadius: 6, background: "rgba(4,5,11,0.7)", fontSize: 26, fontWeight: 700 }}>
                {name}
              </div>
            </React.Fragment>
          );
        })}
      </AbsoluteFill>
    </SongContext.Provider>
  );
};
