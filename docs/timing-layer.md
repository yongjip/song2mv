# Use song2mv's timing in HyperFrames or Remotion

`song2mv sync` writes a song's timing as plain files: every word of your lyric sheet with its start (`lyrics.json`)
and the beat grid (`grid.json`). Another video tool can draw the video from them. This page maps them to
[HyperFrames](https://github.com/heygen-com/hyperframes) and to a Remotion project of your own.

On its own, HyperFrames times a song's words by transcribing it (`npx hyperframes transcribe`, whisper), which times
what the model hears, not your sheet. On one test song (English, 4:48), the `medium.en` model its caption guide names
for speech over music heard 95 % of the words as written, but put the two intro lines about 9 and 12 s early and
missed the first word of 4 of the 43 lines. song2mv starts from the sheet, so every line keeps its words, and it lists
the lines worth a listen in `check_by_ear`.

## 1. Sync

```sh
song2mv sync song.mp3 --lyrics lyrics.txt --language en --title "My Song" --out work --json
```

Read `check_by_ear` and `warnings` in the result as for any song ([AGENTS.md](../AGENTS.md)). Times are seconds from
the start of `song.mp3`: put that same file in the video, not a converted copy, which can be shifted by some tens of
milliseconds.

## 2. What the files hold

`lyrics.json` has `lines`, each with an `id` (`ch1-02`), `text`, `start`, `end` and `words: [{w, t}]`
([contract](contract.md)). A word has only a start: it lasts until the next word of its line, and the line's last word
until the line's `end`.

| song2mv | HyperFrames word | Remotion `Caption` |
| --- | --- | --- |
| `words[k].w` | `text` | `text`, after a space (`" light"`) |
| `words[k].t` | `start` | `startMs` and `timestampMs` (× 1000) |
| `words[k + 1].t`, or the line's `end` for its last word | `end` | `endMs` (× 1000) |
| the line's `id` and `k` | `id` (`ch1-02-w3`) | |
| the line's last word | | `pageBreakAfter: true` |

Lines are in the sheet's order, which is not always the order they are sung in, and they can overlap (a backing
vocal), so both snippets below sort them by `start`. Two words sung on one 16th note share a start, so the first has
no length: light a word from its start, not only between its start and end.

`grid.json` gives the beats. Beat *k* is at `phi + k * beat`, or at `beats[k]` when it has `beats` (a beat map, for a
song whose tempo moves). A bar starts on beat *k* when `k % 4 == downbeat_mod4`. `off_grid` lists the stretches where
that one-tempo grid does not fit the music; without a beat map its beats are off the music there, so put no cuts or
hits on them.

## 3. HyperFrames

1. `npx hyperframes init my-video --audio song.mp3 --skip-transcribe --non-interactive` makes a project with the song
   in it and an `<audio>` for it in `index.html`. Mark that tag as the music: `data-timeline-role="music"`.
2. In `my-video/`, run the script below with song2mv's work folder and that tag's `src`, then import the words:

   ```sh
   python3 song2mv_to_hyperframes.py ../work song.mp3
   npx hyperframes transcribe words.json
   ```

3. Caption them with a style from `npx hyperframes catalog --tag caption-style --json` (`npx hyperframes add NAME`) or
   a scene of your own, then `npx hyperframes check`, `snapshot` and `render` as usual.

```python
import json, math, sys
from pathlib import Path

work, audio = Path(sys.argv[1]), sys.argv[2]
lyrics = json.loads((work / "lyrics.json").read_text(encoding="utf-8"))
grid = json.loads((work / "grid.json").read_text(encoding="utf-8"))

words = []
for line in sorted(lyrics["lines"], key=lambda line: line["start"]):
    ends = [w["t"] for w in line["words"][1:]] + [line["end"]]
    for k, (word, end) in enumerate(zip(line["words"], ends)):
        words.append({"id": f"{line['id']}-w{k}", "text": word["w"], "start": word["t"], "end": end})
Path("words.json").write_text(json.dumps(words, indent=1))

if grid.get("beats"):
    beats = list(enumerate(grid["beats"]))
else:
    count = math.floor((grid["duration"] - grid["phi"]) / grid["beat"]) + 1
    beats = [(k, grid["phi"] + k * grid["beat"]) for k in range(count)]
    beats = [(k, t) for k, t in beats if not any(s["from"] <= t < s["to"] for s in grid["off_grid"])]
beat_file = Path("beats", audio + ".json")
beat_file.parent.mkdir(parents=True, exist_ok=True)
beat_file.write_text(json.dumps({"version": 1, "audio": audio, "beats": [
    {"time": round(t, 3), "strength": 1.0 if k % 4 == grid["downbeat_mod4"] else 0.5} for k, t in beats
]}, indent=1))
```

- `words.json` is the word list HyperFrames' captions work from, `[{id, text, start, end}]`. `npx hyperframes
  transcribe words.json` copies it to `transcript.json` and into the `const TRANSCRIPT = [...]` or
  `const script = [...]` array of each HTML file in the project. The ready-made caption styles keep their words in a
  `var` array (`TRANSCRIPT`, `WORDS` or `W`), which it skips: rename that array to `const TRANSCRIPT` and import
  again. For one caption group per lyric line, group the words by their id without its `-wN` ending; where lines
  overlap, a style that shows one group at a time must end each group where the next one starts.
- `beats/song.mp3.json` is HyperFrames' beat file for the `<audio>` whose `src` is `song.mp3`, which its Studio shows
  as the beat grid. Bar starts have strength 1, the other beats 0.5, and the beats in an `off_grid` stretch without a
  beat map are left out. A scene cannot read files while it renders: copy the beat times it needs into it, as a
  `const BEATS = [...]` array.
- song2mv's times count from the start of the song. Keep the music `<audio>` and the caption scene at
  `data-start="0"`, without a `data-media-start` trim; in a scene that starts later, subtract its `data-start` from
  every time you copy into it.
- After the timing changes (a `manual` pin, a new sheet), run both commands again. Do not run `npx hyperframes
  transcribe` on the song or `npx hyperframes beats` afterwards: they replace `transcript.json`, those arrays and the
  beat file with HyperFrames' own detection.

Tried with HyperFrames 0.8.214 on the whole test song: in the rendered video the captions lit on song2mv's word times
at every word checked, and a scene pulsing on `const BEATS` brightened on the first frame of each beat.

## 4. Remotion

To draw your own scenes on song2mv's own template, use `song2mv render mv.json --template DIR` (see the
[README](../README.md#song2mv-render-experimental)). In a Remotion project of your own, add `@remotion/captions` at
the project's Remotion version, copy `lyrics.json` and `grid.json` into `src/` and read them directly (with
`resolveJsonModule` in `tsconfig.json`):

```ts
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import lyrics from "./lyrics.json";
import grid from "./grid.json";

const lines = [...lyrics.lines].sort((a, b) => a.start - b.start);
const captions: Caption[] = lines.flatMap((line) =>
  line.words.map((word, k) => ({
    text: " " + word.w,
    startMs: word.t * 1000,
    endMs: (line.words[k + 1]?.t ?? line.end) * 1000,
    timestampMs: word.t * 1000,
    confidence: null,
    pageBreakAfter: k === line.words.length - 1,
  })),
);
export const { pages } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: Infinity });

type Grid = {
  phi: number;
  beat: number;
  duration: number;
  downbeat_mod4: number;
  off_grid: { from: number; to: number }[];
  beats?: number[] | null;
};
const g = grid as Grid;
const onGrid = (t: number) => !g.off_grid.some((s) => s.from <= t && t < s.to);
export const beats = g.beats
  ? g.beats.map((t, k) => ({ t, bar: k % 4 === g.downbeat_mod4 }))
  : Array.from({ length: Math.floor((g.duration - g.phi) / g.beat) + 1 }, (_, k) => ({
      t: g.phi + k * g.beat,
      bar: k % 4 === g.downbeat_mod4,
    })).filter((b) => onGrid(b.t));
```

That gives one page per lyric line, its tokens timed word by word, and the beats to cut on, as the Python script keeps
them. Play the same audio file from frame 0 (`<Audio src={staticFile("song.mp3")} />` with the file in `public/`) and
draw each page in a `<Sequence>` from frame `Math.round((page.startMs / 1000) * fps)`. A page lasts until the next
one starts, across an instrumental break too: end it after its last token's `toMs`, and skip a page shorter than a
frame (two lines that start together). Turn each time into a frame on its own, never by adding up rounded beat
lengths, which drift.
