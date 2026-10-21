# song2mv

[![CI](https://github.com/yongjip/song2mv/actions/workflows/ci.yml/badge.svg)](https://github.com/yongjip/song2mv/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/yongjip/song2mv/blob/main/LICENSE)

**Song in, beat-synced lyric timing and a code-drawn music video out — built for coding agents.**

song2mv turns an audio file and its lyrics into synced lyrics (LRC, SRT, word-timed JSON) on the song's beat grid,
then into a lyric or music video drawn entirely in code. Each step is its own command, so a coding agent such as
Claude Code or Codex — or a person — can use just the part they need.

> **Alpha (0.x).** Commands, flags and file formats may change between releases; every JSON file carries a
> `schema_version` and every change is listed in [CHANGELOG.md](https://github.com/yongjip/song2mv/blob/main/CHANGELOG.md). `sync` and `beats` are the most
> tested parts. `check` and `render` are **experimental**.

| command | what it does | status |
| --- | --- | --- |
| `song2mv sync` | audio + lyrics → beat grid, word-timed lyrics, **LRC**, **SRT**, and `mv.json` for the video template | alpha |
| `song2mv beats` | audio → tempo and beat grid only (no lyrics, no speech recognition) | alpha |
| `song2mv click` | a stretch of the song with clicks on the beat grid and ticks on the lyric words, to check the timing by ear | alpha |
| `song2mv check` | measures a rendered video per sung line: frozen picture, empty screen, repeated chorus, cut rhythm | experimental |
| `song2mv render` | renders `mv.json` as a 16:9 and/or 9:16 lyric video with a [Remotion](https://www.remotion.dev) template | experimental |

## Install

song2mv is not on PyPI yet, so install it from GitHub with [uv](https://docs.astral.sh/uv/):

```bash
uv tool install --python 3.13 'song2mv[sync] @ git+https://github.com/yongjip/song2mv'
```

Or run it once without installing anything:

```bash
uvx --python 3.13 --from 'song2mv[sync] @ git+https://github.com/yongjip/song2mv' song2mv --help
```

Inside a virtual environment, `pip install 'song2mv[sync] @ git+https://github.com/yongjip/song2mv'` works too.

You also need **ffmpeg** (`brew install ffmpeg`, `apt install ffmpeg`). `render` also needs **Node 18+**.

**Python 3.10–3.14.** The `sync` extra needs faster-whisper, which has no Python 3.15 wheels yet, hence
`--python 3.13` above (Homebrew's `python3` may already be 3.15). `check`, `beats` and `render` also run on 3.15.

Install only what you use — the parts differ a lot in size:

| you run | install | adds roughly |
| --- | --- | --- |
| `check` | `song2mv` | numpy (35 MB) |
| `beats`, `click` | `song2mv[beats]` | librosa, scipy, numba (300 MB) |
| `sync` | `song2mv[sync]` | beats + faster-whisper (130 MB) + a whisper model on first run (small: 460 MB) |
| `render` | Node 18+ | Remotion and a headless Chrome on first render (570 MB) |

## Quick start

```bash
song2mv sync song.mp3 --lyrics lyrics.txt --language en        # → song2mv-work/song/
song2mv render song2mv-work/song/mv.json --from 60 --to 75 --aspect both
song2mv check song2mv-work/song/renders/song-16x9-60-75.mp4 --song song2mv-work/song/mv.json --from 60 --to 75
```

The work folder is relative to where you run it: run it outside your code repositories, or pass `--out`. If the
audio file has a lyrics tag (Suno writes one), `--lyrics` is optional. Want subtitles for CapCut, Premiere or
DaVinci Resolve? Stop after `sync` and import `song.srt` or `song.lrc`.

## With a coding agent

Open this repository (or your own project with song2mv installed) in Claude Code, Codex or another agent and ask,
for example: *"make a lyric video for ~/Music/my-song.mp3"* or *"give me word-timed LRC for this song"*.

- [`AGENTS.md`](https://github.com/yongjip/song2mv/blob/main/AGENTS.md) — the operating rules: which command to run when, what to check by ear, what never to
  commit. Codex reads it, and Claude Code reads it through `CLAUDE.md`, when this repository is open; elsewhere,
  point your agent to it.
- [`.claude/skills/song2mv/`](https://github.com/yongjip/song2mv/blob/main/.claude/skills/song2mv/SKILL.md) — the full music-video loop (timing → scene design →
  render → check → fix) as a Claude Code skill. Copy it to `~/.claude/skills/` to use it in any project.
- Every command takes `--json`: progress goes to stderr and stdout carries one JSON result. See
  [docs/contract.md](https://github.com/yongjip/song2mv/blob/main/docs/contract.md).

## `song2mv sync`

```bash
song2mv sync song.mp3 [--lyrics lyrics.txt] [--language ko] [--out DIR] [--runs 5] [--model medium] [--bpm 90]
song2mv sync DIR/song.json [--from grid] [--runs 5]   # rerun after editing song.json; options given here are saved
                                                     # to it, finished whisper runs are reused
```

| step | output | what happens |
| --- | --- | --- |
| lyrics | `lyrics.txt` | the lyric sheet (`[Verse]`, `[Chorus]` … lines name sections) |
| asr | `asr/runN.json` | faster-whisper, **several runs** with word timestamps; finished runs are reused |
| align | `merged.json` | each run aligned to the lyric sheet character by character, then merged per word |
| grid | `grid.json` | tempo, first beat, which beat starts a bar, and where the song leaves that grid |
| build | `lyrics.json`, `mv.json`, `song.lrc`, `song.words.lrc`, `song.srt` | gaps re-heard, manual values applied, times snapped to the beat grid |
| music | `music.json` | loudness curve and likely section boundaries, for scene design |

Why it works the way it does:

- **Whisper gives a different answer every run.** On a test song, two runs with the same file and settings found 342
  and 380 words, and one of them skipped 15 seconds (five sung lines). So run *k* uses seed *k* and a different
  lead-in silence, and the runs are merged in lyric space: per line, only runs that matched at least half of it
  count, outliers more than 1 s from the rest are dropped, and each word takes the median.
- **A chorus repeats word for word.** Matched to the sheet by difflib alone, a run that heard the second chorus
  better gave its audio to the sheet's first chorus, and the lines in between were left with none: on the
  JamendoLyrics benchmark that was nearly all of the large error. Each run is also aligned over the whole song, which
  keeps each copy on its own audio; where the two alignments disagree, the one that matched more of that stretch
  wins. A line the runs still place out of the sheet's order is merged again from the runs that kept the order, and
  goes on `check_by_ear`.
- **`librosa.beat.beat_track` can be off by a ratio** (it reported 123 BPM for a 90 BPM song with a dotted-8th
  rhythm). The grid is fitted to percussive onsets instead, and `auto` tempo prefers the candidate where most gaps
  between lyric lines are whole bars. The bar's first beat is the beat position with the strongest kick.
- **The grid has one tempo, and songs do not always keep one.** A live band drifts, jazz speeds up for a solo, a song
  slows down at the end, an AI-generated song can jump by a 16th note between sections. So tempo and phase are fitted
  again in windows of 4 bars, and where the music's beats are more than half a 16th note off the grid (a tempo
  change, a drift, or a beat that moved), `grid.json` lists the stretch under `off_grid`, the `--json` result says so
  under `warnings`, and lyric words there keep whisper's times instead of being snapped. The grid itself does not
  follow the change yet: beat effects in the video stay on the one tempo.
- **Shouts, chants and whispers are what whisper misses.** Lines no run placed are re-heard with just that stretch of
  audio and the expected words as the prompt. Those lines are marked `reprompt` and listed in the `--json` result
  under `check_by_ear`; pin anything wrong in `manual`. A line heard there more often than the lyric sheet has it
  takes the earliest hearing whose word timing is believable (whisper can stretch a word over seconds of music or
  time it at zero length), and `warnings` lists the other hearings.
- **A pin only constrains.** Pinning a line in `manual` splits the gap around it, and hearing the pieces again with
  shorter prompts moved lines that were right: on a test song, two pins sent the re-heard line after them 1.2 s
  early, into a pinned line. So a re-heard line keeps its time while it still fits between the pinned and placed
  lines around it, and only the lines a pin contradicts are heard again, in the window between the pins. Pin what
  is wrong; the lines you did not pin stay where they were.
- **One run is not enough.** A line only one of the runs placed can be seconds off, so it goes on `check_by_ear`
  too.

To hear whether the grid and timing are right, mix a click track over a stretch — a high click on the first beat
of each bar, a low click on the other beats and, with `--words`, a soft tick on every lyric word:

```bash
song2mv click song2mv-work/song --from 90 --to 110 --words    # → song2mv-work/song/click-90-110.wav
```

### Song config (`song.json`)

`sync` writes a minimal `song.json` (the audio, a title and the options you passed) into the work folder. Add or
change keys there and rerun `song2mv sync DIR/song.json`. Only `audio` is required; paths are relative to the file.
See [`examples/song.example.json`](https://github.com/yongjip/song2mv/blob/main/examples/song.example.json).

| key | default | meaning |
| --- | --- | --- |
| `audio` | — | the song file |
| `lyrics` | `null` | lyric sheet; `null` = the audio's lyrics tag |
| `title`, `subtitle` | file name, `""` | the title goes into the LRC and the video; the subtitle is drawn under it in 9:16 |
| `language` | `null` | whisper language code (`"en"`, `"ko"`, `"ja"` …). Set it — auto-detection hears only the first 30 s |
| `keep_parenthesized_in` | `[]` | sections, by their name in the lyric sheet (`"Chorus"`, `"Verse 1"`), where a line written entirely in `( )` is sung, not a stage direction. `"*"` = everywhere |
| `section_ids`, `section_kinds` | `{}` | override the short id (`"Verse 1"` → `v1`) or kind (`calm` / `mid` / `hot`) of a section |
| `bpm` | `"auto"` | a number forces the tempo |
| `downbeat_mod4` | `null` | force which beat index (mod 4) starts a bar |
| `snap_per_beat` | `4` | snap word times to 1/4 beat (16th notes); `3` = a triplet grid (8th-note triplets, for swing and shuffle), `2` = 8th notes, `0` = off. Never inside an `off_grid` stretch |
| `whisper` | small × 3, CPU int8 | `model`, `runs`, `device`, `compute_type`, `threads`, `beam_size` |
| `auto_reprompt` | `true` | re-hear gaps where no run found a line |
| `reprompt` | `[]` | extra windows found by ear: `[{"from": 17.5, "to": 30.5, "prompt": "the words sung there"}]` |
| `manual` | `{}` | `{"ch1-01": [98.5, 99.2]}` — word start times that override everything. A single number pins the first word. Re-heard lines around a pin keep their times while they fit between the pins |
| `end` | `null` | song end used after the last line; `null` = file length |
| `theme` | `{}` | copied into `mv.json` for the template (colours, font) |

Line ids are `<section>-<nn>`: `in-01`, `v1-03`, `pc2-01`, `ch1-05`, `br-02`, `ou-01`. A section name that appears
more than once without a number (`[Chorus]` twice) is numbered by occurrence (`ch1`, `ch2`); one that appears once
keeps the bare id (`ch-01` in a song with one chorus).

## `song2mv beats`

```bash
song2mv beats song.mp3 [--out song.grid.json] [--bpm 128] [--downbeat 0]
```

Tempo, first beat and bar start for cutting video to the beat — no lyrics needed. Without lyrics, `auto` tempo
picks the candidate with the strongest onset score, so check the result by ear or pass `--bpm`. Stretches where the
song leaves that one tempo are in `off_grid` (and `warnings`): don't cut to the grid there.

## `song2mv check` (experimental)

```bash
song2mv check video.mp4 --song mv.json [--from 92 --to 102] [--goals my-goals.json] [--src 'video/src/scenes/**/*.tsx']
```

| check | measures (per sung line, 10 fps, the area above the captions) |
| --- | --- |
| `motion.min` / `motion.max` | mean frame difference: nothing frozen for a whole line; verses not frantic |
| `coverage.min` / `coverage.median` | share of lit pixels: no empty black screens |
| `variation.repeats` | chorus 2 should not look like chorus 1 |
| `cuts.rhythm.<section>` / `cuts.max_gap` | uneven cut intervals inside verses; no long stretch without a cut |
| `text.min_font` | no font size under 36 px in scene sources (with `--src`) |

`--from` is the song time of the video's first frame; the measured stretch ends with the video unless `--to` ends it
earlier. Checks that cannot run on a stretch (no repeated section in it, too few cuts) are listed as skipped, not
passed. It works on any mp4 that follows the song's timing, not only on song2mv renders.

The default [goals](https://github.com/yongjip/song2mv/blob/main/src/song2mv/check/goals.json) are a starting point
measured on one video; your own goals file only needs the values you change. Passing is necessary, not proof of fun.

## `song2mv render` (experimental)

```bash
song2mv render mv.json                                        # whole song, 16:9, plain lyric video
song2mv render mv.json --from 95 --to 111 --aspect 9x16 --hold 2.5   # a hook cut whose first frame shows the payoff
song2mv render mv.json --still 98.5 --aspect both            # PNG frames to look at
song2mv render mv.json --template video/                     # your own copy of the template, for your own scenes
```

Out of the box you get a plain lyric video that follows the song's structure: calm sections with a low moon and
embers, mid sections with a floor grid rolling on the beat, hot sections with rays on the beat and the line itself
huge in the middle, lit word by word. Colours come from `theme` in the song config.

The real music video is your own scenes, with a look made for the song. Start from a concept: two or three ideas in
different art styles, a rough still of each, and pick one (the skill walks through it). With `--template DIR`, DIR gets
its own copy of the template: write the scenes in `DIR/src/scenes/`, reuse and change what fits the concept from the
kit in `DIR/src/kit/`, and draw the rest. Besides `useSong()`, beat-grid helpers, `Slam`, `BigLine` and karaoke
`Captions`, the kit holds:

- **people:** a posable person (standing, walking, running, lying), a crowd;
- **places:** a city, a street, a room, a bed, hills, the sea;
- **sky:** sky by time of day, sun, moon and clouds;
- **objects:** a phone with a chat, a clock, a heart, a car, a plane, lanterns;
- **camera:** one world filmed as shots that cut on bars and words, with a punch on hits;
- **effects:** rain, fireworks, confetti, hits (burst, sparkle, ring), flames, lightning and storms, tears, falling cash.
  Their colours and shapes are props, so they fit any art style;
- **recipes:** new assets combined from these parts in a few lines, such as a sleepless night in a storm;
- **style packs** (`kit/styles/`): drawing pieces that put any object in one art style. `paper` cuts outlines by hand
  and stacks them with shadows and grain; `pixel` draws sprites on a canvas of big pixels and turns type or any kit
  drawing into the same pixels. New assets and packs are welcome
  ([CONTRIBUTING.md](https://github.com/yongjip/song2mv/blob/main/CONTRIBUTING.md)).

The people, places and objects are drawn in one flat style. To see everything, run
`npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0` in DIR. Rules that held up: a scene is a pure
function of song time `T`; text pops once and then holds still while it is read; lay out on the 1920×1080 stage. For
9:16, a song can also export a `VerticalScene` that draws the whole 1080×1920 frame, instead of the stage shrunk into a
band.

Remotion is **not MIT**: it is free for individuals and companies with up to 3 employees; larger companies need a
company license ([remotion.dev/license](https://www.remotion.dev/license)). Only `render` uses it.

## How it compares

Other open-source projects turn songs into videos in four broad ways:

| kind of project | examples | what song2mv does differently |
| --- | --- | --- |
| AI-generated music videos | [AutoMV](https://github.com/multimodal-art-projection/AutoMV), [Deforum](https://github.com/deforum-art/deforum-stable-diffusion)-style audio-reactive animation | They generate the picture with image and video models, which needs paid APIs or a GPU. song2mv draws every frame in code: no model cost, the same input always gives the same frames, and the lyrics are timed against your lyric sheet rather than taken from a transcription. |
| Karaoke and synced-lyrics tools | [karaoke-gen](https://github.com/nomadkaraoke/karaoke-gen), [python-lyrics-transcriber](https://github.com/nomadkaraoke/python-lyrics-transcriber) | They have more lyric-sync tooling (online lyric lookup, a review UI, a choice of transcription engines) and karaoke formats. Their focus is the lyric display; song2mv also puts every word on the song's beat grid and every section on a bar line, so cuts and effects can follow the music. |
| Remotion lyric-video templates | [Lyrics-Video-Generator](https://github.com/c0ze/Lyrics-Video-Generator), [lyric-motion-studio](https://github.com/junksidetm/lyric-motion-studio) | They render timing you already have (an LRC or SRT file) or a forced alignment, in a fixed set of styles. song2mv makes the timing itself, and its template gives your own scenes beat-grid helpers and a scene kit. |
| Remotion skills for coding agents | [remotion-video-skill](https://github.com/wshuyi/remotion-video-skill), [remotion-dev/skills](https://github.com/remotion-dev/skills) | General video-making skills, without beat detection or lyric alignment. song2mv's skill works from measured timing, with `click` and `check` for what an agent cannot hear or watch. |

In short, song2mv is a timing layer — word-timed lyrics on the beat grid, as plain files — plus a code-drawn video
that an agent can measure and fix. `grid.json` and `lyrics.json` can drive cuts in other tools too, generative ones
included.

Where it is weaker today:

- Timing: on the JamendoLyrics benchmark (79 songs in English, German, Spanish and French), 87 % of a song's words
  land within 0.3 s of where people put them, on average; the best dedicated aligner reaches 94 %
  ([docs/benchmark.md](docs/benchmark.md)). Most wrong line starts are a line's first word alone, early or late by a
  fraction of a second, and lines whisper hears badly (vocalisations, shouts, chants) can still be far off and need
  a few `manual` values. Separating the vocals first, as karaoke tools do, made the timing worse on our Korean test
  song.
- No generated imagery: out of the box you get a plain lyric video, and anything richer is scene code that you or
  your agent write.
- No karaoke formats (CDG, karaoke ASS).
- `render` needs Node and Remotion (a company license above 3 employees) and downloads ~570 MB on first use.

## Roadmap

- A basic `render` without Node (Python + ffmpeg), so everyone gets a lyric video with no extra install.
- `check` measured against the song itself (music energy vs. motion, chorus vs. verse) instead of fixed numbers.
- An MCP server (`song2mv mcp`) for agents and apps without a terminal.
- A demo song and video we have the rights to publish.

## Rights

This repository contains no songs and no lyrics. Before you publish a video, make sure you may: the song's licence
(including an AI music service's plan terms) and the lyrics' copyright apply to the video too.

## License

MIT — see [LICENSE](https://github.com/yongjip/song2mv/blob/main/LICENSE). song2mv is developed with the help of coding agents (Claude Code, Codex).

---

**한국어 요약** — 노래 파일과 가사를 넣으면 박자에 맞춘 가사 타이밍(LRC·SRT·단어별 JSON)을 만들고, 코드로 그린
가사 영상·뮤직비디오까지 이어 주는 도구입니다. Claude Code·Codex 같은 코딩 에이전트가 쓰기 좋게 만들었고, 필요한
명령만 골라 쓸 수 있습니다. 지금은 알파(0.x)라 형식이 바뀔 수 있습니다.
