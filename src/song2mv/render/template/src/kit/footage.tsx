import React from "react";
import { OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS } from "./song";

/**
 * Frames rendered elsewhere (Blender, another engine) played at song time T, under the template's captions. `src` is
 * one video of song frames `first` … `last` in order, frame n being song time n / `fps` (Blender's frame n when it
 * renders round(T × 30)), imported from src/: `import frames from "./assets/frames.mp4"` (`song2mv render` bundles
 * src/ and serves no public/). Encode it at a constant `fps` without B-frames (the guide's step 4 has the command).
 *
 * At T it shows frame round(T × fps), holding `first` before it and `last` after, at any render fps (a draft runs at
 * 10) and whatever the render's `from` or `hold`. A Sequence shifted onto the frame does it, by a fraction of a frame
 * where the render's fps is not the video's; not Remotion's Freeze, which clamps its frame to the composition's
 * length: a 19.6 s short showed one frame throughout. Fills its parent (the stage, in a `Scene`); `style` adds to that.
 */
export const Footage: React.FC<{ src: string; T: number; first?: number; last: number; fps?: number; style?: React.CSSProperties }> = ({
  src, T, first = 0, last, fps = FPS, style,
}) => {
  const frame = useCurrentFrame();
  const { fps: renderFps } = useVideoConfig();
  const k = Math.min(last, Math.max(first, Math.round(T * fps))) - first;
  return (
    <Sequence from={frame - (k * renderFps) / fps} layout="none">
      <OffthreadVideo src={src} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }} />
    </Sequence>
  );
};
