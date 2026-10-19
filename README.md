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
| grid | `grid.json` | tempo, first beat, which beat starts a bar |
| build | `lyrics.json`, `mv.json`, `song.lrc`, `song.words.lrc`, `song.srt` | gaps re-heard, manual values applied, times snapped to the beat grid |
| music | `music.json` | loudness curve and likely section boundaries, for scene design |

Why it works the way it does:

- **Whisper gives a different answer every run.** On a test song, two runs with the same file and settings found 342
  and 380 words, and one of them skipped 15 seconds (five sung lines). So run *k* uses seed *k* and a different
  lead-in silence, and the runs are merged in lyric space: per line, only runs that matched at least half of it
  count, outliers more than 1 s from the rest are dropped, and each word takes the median.
- **`librosa.beat.beat_track` can be off by a ratio** (it reported 123 BPM for a 90 BPM song with a dotted-8th
  rhythm). The grid is fitted to percussive onsets instead, and `auto` tempo prefers the candidate where most gaps
  between lyric lines are whole bars. The bar's first beat is the beat position with the strongest kick.
- **Shouts, chants and whispers are what whisper misses.** Lines no run placed are re-heard with just that stretch of
  audio and the expected words as the prompt. Those lines are marked `reprompt` and listed in the `--json` result
  under `check_by_ear`; pin anything wrong in `manual`.

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
| `snap_per_beat` | `4` | snap times to 1/4 beat (16th notes); `0` = off |
| `whisper` | small × 3, CPU int8 | `model`, `runs`, `device`, `compute_type`, `threads`, `beam_size` |
| `auto_reprompt` | `true` | re-hear gaps where no run found a line |
| `reprompt` | `[]` | extra windows found by ear: `[{"from": 17.5, "to": 30.5, "prompt": "the words sung there"}]` |
| `manual` | `{}` | `{"ch1-01": [98.5, 99.2]}` — word start times that override everything |
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
picks the candidate with the strongest onset score, so check the result by ear or pass `--bpm`.

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

The real music video is your own scenes. With `--template DIR`, DIR gets its own copy of the template; write scenes in
`DIR/src/scenes/` with the kit in `DIR/src/kit/` (`useSong()`, beat-grid helpers, backgrounds, `Slam`, `BigLine`,
karaoke `Captions`). Rules that held up: a scene is a pure function of song time `T`; text pops once and then holds
still while it is read; lay out on the 1920×1080 stage.

Remotion is **not MIT**: it is free for individuals and companies with up to 3 employees; larger companies need a
company license ([remotion.dev/license](https://www.remotion.dev/license)). Only `render` uses it.

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
