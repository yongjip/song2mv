import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { FPS, MvProps, Song } from "./kit";
import { ConceptBoard } from "./Concepts";
import { ContactSheet, contactSize } from "./Contact";
import { GALLERY_TILES, KitGallery } from "./Gallery";
import { LyricShort } from "./LyricShort";
import { LyricVideo } from "./LyricVideo";
import sample from "./sample-song.json";

/**
 * Two compositions over the same song config. Pass your own with
 *   node render.mjs ../work/my-song/mv.json --from 95 --to 111
 * (or `npx remotion render Lyric-16x9 out.mp4 --props=props.json` with {song, from, to, hold}).
 * Without props they show sample-song.json — placeholder lyrics, no audio.
 * Kit-Gallery shows the kit's people, places and objects (frame 0: all, frame k: tile k).
 * Concepts draws the components exported from scenes/concepts side by side at song time T (props: {song, T}).
 * Contact draws the song's Scene at many song times on one sheet, labelled (props: {song, times, cols, vertical}).
 */
const defaults: MvProps = { song: sample as Song, from: 0, to: null, hold: 0 };

const duration: CalculateMetadataFunction<MvProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(((props.to ?? props.song.duration) - props.from) * FPS)),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Lyric-16x9" component={LyricVideo} fps={FPS} width={1920} height={1080} durationInFrames={300}
      defaultProps={defaults} calculateMetadata={duration} />
    <Composition id="Lyric-9x16" component={LyricShort} fps={FPS} width={1080} height={1920} durationInFrames={300}
      defaultProps={defaults} calculateMetadata={duration} />
    <Composition id="Kit-Gallery" component={KitGallery} fps={FPS} width={1920} height={1080} durationInFrames={GALLERY_TILES + 1}
      defaultProps={{ T: 9.55 }} />
    <Composition id="Concepts" component={ConceptBoard} fps={FPS} width={1920} height={1080} durationInFrames={1}
      defaultProps={{ song: sample as Song, T: 30 }} />
    <Composition id="Contact" component={ContactSheet} fps={FPS} width={1920} height={1080} durationInFrames={1}
      defaultProps={{ song: sample as Song, times: [1, 3, 5, 7, 9, 11, 13, 15] }} calculateMetadata={contactSize} />
  </>
);
