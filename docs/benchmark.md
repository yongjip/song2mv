# Benchmark: lyric timing on JamendoLyrics

How close does `song2mv sync` put each word to where it is sung? Until now its accuracy had been measured on one
Korean song, against a reference that was itself mostly whisper output. This page measures it against people:
JamendoLyrics MultiLang, the standard lyrics-alignment benchmark, has 79 songs in four languages whose word start
and end times were annotated by hand.

Measured on 2026-10-20 with song2mv 0.1.0 at `d368734`, default settings. To reproduce, run
[`bench/jamendolyrics.py`](../bench/jamendolyrics.py) (see [Reproduce](#reproduce)).

## In short

- **Most words land close, but a few songs fail badly.** Across all 79 songs, the median word is 0.105 s from where
  people put it, and 78 % of words are within 0.3 s. The mean error is 2.7 s: 25 songs contain stretches of lines
  tens of seconds off, and those songs hold 94 % of the summed error. In the other 54 songs the mean error is
  0.26 s and 85 % of words are within 0.3 s.
- **Repeated sections cause the big failures.** When a chorus or verse comes back with the same words, two of three
  whisper runs can match one copy in the lyric sheet to the audio of another. The lines after it in the sheet
  then have too little song left: they go unplaced and are squeezed into the last seconds. 217 lines (6 %) start
  more than 10 s off. `check_by_ear` lists two thirds of them, but not the blocks that two or three runs agreed on.
- **Lines start a third of a second early.** Whisper leaves no gap between words, so the pause before a line
  becomes part of the line's first word. Measured per run, that word's start is a median 0.34 s early, while its
  end is only 0.07 s early. Half of all lines start more than 0.3 s off, mostly for this reason. A what-if shortens
  that one whisper word to the run's typical word length. Chosen on the English songs and checked unchanged on the
  59 others, it cuts wrong line starts from 50 % to 22 % and raises words within 0.3 s from 78 % to 83 %.
- **`check_by_ear` is precise but sees about half.** Two thirds of the lines it lists really start more than 0.3 s
  off. But it lists only 54 % of the lines that are more than 1 s off. A check on the lyric order would add 99
  lines, two thirds of them more than 1 s off.
- **Compared with dedicated aligners**, song2mv's share of words within 0.3 s, averaged per song (77 %), falls
  between older systems (59–73 %) and the best published one (94 %). Its average error per song (2.2 s, against
  0.18–1.11 s) is worse because of the repeated-section failures.
- **Snapping to the beat grid costs little at 0.3 s and more at 0.1 s.** Without snapping, 78.6 % of words are
  within 0.3 s (78.2 % with it) and 52.9 % are within 0.1 s (48.1 % with it).
- **Runtime** is 99 s per song on average, 0.46 × the song's length, on an M4 Pro CPU with other apps using about
  1.4 cores.

## Results per language

Word numbers are pooled over all words of a language. AAE and PCO follow the published convention, averaged per
song (see [Method](#method)).

| | English | German | Spanish | French | all 79 |
|---|---:|---:|---:|---:|---:|
| songs / words | 20 / 5,693 | 20 / 5,157 | 20 / 5,269 | 19 / 5,461 | 79 / 21,580 |
| words within 0.1 s | 51.3 % | 50.2 % | 47.2 % | 43.8 % | 48.1 % |
| words within 0.3 s | 75.6 % | 75.0 % | 82.8 % | 79.6 % | **78.2 %** |
| words within 1 s | 86.9 % | 84.8 % | 94.2 % | 91.7 % | 89.4 % |
| median / mean absolute error, s | 0.096 / 3.82 | 0.099 / 4.89 | 0.109 / 0.90 | 0.111 / 1.05 | **0.105** / 2.66 |
| median signed error, s (− = early) | −0.024 | −0.052 | −0.076 | −0.088 | −0.058 |
| unsnapped: words within 0.1 / 0.3 s | 53.8 / 76.1 % | 52.9 / 75.3 % | 54.0 / 83.3 % | 50.8 / 79.9 % | 52.9 / 78.6 % |
| AAE: mean over songs / median over songs, s | 3.34 / 0.23 | 3.05 / 0.25 | 1.26 / 0.31 | 1.19 / 0.37 | 2.22 / 0.28 |
| PCO: within 0.3 s, mean over songs | 74.6 % | 76.5 % | 78.8 % | 78.2 % | 77.0 % |
| lines | 868 | 871 | 881 | 763 | 3,383 |
| lines starting > 0.3 s off (early / late) | 51.6 % (349 / 99) | 55.2 % (342 / 139) | 48.8 % (373 / 57) | 46.4 % (284 / 70) | 50.6 % (1,348 / 365) |
| lines starting > 1 s off | 15.4 % | 21.1 % | 10.6 % | 11.9 % | 14.8 % |
| line sources: whisper / re-heard / estimated | 826 / 14 / 28 | 794 / 8 / 69 | 860 / 12 / 9 | 735 / 10 / 18 | 3,215 / 44 / 124 |
| `sync` seconds per song (× song length) | 96 (0.44) | 96 (0.42) | 107 (0.50) | 98 (0.49) | 99 (0.46) |

Every song ran without an error. The tokens matched the annotations exactly in all 79 songs, and the rebuild
reproduced every `lyrics.json`.

### Compared with published aligners

The [ICASSP 2023 paper](https://arxiv.org/abs/2306.07744) that introduced the dataset reports these numbers (its
Table 3: AAE in seconds per language; PCO only over all four languages):

| system | trained on | EN | ES | DE | FR | all: AAE | all: PCO |
|---|---|---:|---:|---:|---:|---:|---:|
| **song2mv sync** (whisper small × 3, snapped) | — | 3.34 | 1.26 | 3.05 | 1.19 | 2.22 | 77 % |
| M5 (phonemes) | English | 0.16 | 1.72 | 1.22 | 1.36 | 1.11 | 59 % |
| GYL (Gupta et al.) | English | 0.22 | 0.97 | 0.62 | 0.78 | 0.65 | 73 % |
| M6 (characters) | English | 0.15 | 0.37 | 0.41 | 0.47 | 0.35 | 89 % |
| M6 | all four | 0.39 | 0.22 | 0.26 | 0.28 | 0.29 | 91 % |
| M6, language-conditioned | all four | 0.21 | 0.13 | 0.16 | 0.19 | 0.18 | 94 % |

These systems are aligners trained for this task, and their numbers are taken from the paper. song2mv uses
general speech recognition, matches the text it hears to the lyric sheet, and then snaps to a beat grid (unsnapped,
AAE stays 2.22 s and PCO is 77.4 %). AAE is the average error per song, so it is dominated by the few lines
tens of seconds off. In the median song, song2mv's average error is 0.28 s.

## Where the errors come from

Each line that starts more than 0.3 s off gets a likely cause from what its work folder says. The number listed by
`check_by_ear` is in brackets.

| lines starting > 0.3 s off, likely cause | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| first word early, the rest of the line on time | 311 (39) | 327 (12) | 314 (15) | 248 (22) | 1,200 (88) |
| estimated (no run and no re-listening placed it) | 28 (28) | 65 (65) | 9 (9) | 18 (18) | 120 (120) |
| whole line early | 25 (15) | 10 (1) | 37 (13) | 30 (6) | 102 (35) |
| whole line late | 43 (28) | 25 (13) | 16 (2) | 17 (12) | 101 (55) |
| placed on another occurrence of the same words | 11 (5) | 39 (16) | 20 (11) | 9 (5) | 79 (37) |
| first word late, the rest on time | 19 (6) | 7 (2) | 22 (4) | 25 (7) | 73 (19) |
| re-heard gap | 11 (11) | 8 (8) | 12 (12) | 7 (7) | 38 (38) |

### 1. Repeated sections placed on another copy

217 lines start more than 10 s off. They sit in 36 stretches in 25 songs, and five songs hold 162 of them. Their
1,238 words (6 % of all words) carry 86 % of the summed error. The longest stretches:

| song | lines | how far off, s | sources | runs agreeing (whisper lines) | listed by `check_by_ear` | off the lyric order |
|---|---|---:|---|---|---:|---:|
| Jonny M – Keine Lust (de) | s-53 to s-61 (9) | +46 | 9 whisper | 2 runs: 9 | 0 | 0 |
| Jonny M – Keine Lust (de) | s-77 to s-116 (40) | +10 to +46 | 14 whisper, 25 estimated, 1 re-heard | 2 runs: 10, 1 run: 3, 3 runs: 1 | 29 | 0 |
| Moon I mean – Wrong Concept (en) | s-11 to s-38 (28) | +11 to +84 | 12 whisper, 16 estimated | 1 run: 6, 3 runs: 5, 2 runs: 1 | 22 | 4 |
| Shaney 23 – In den Strassen (de) | s-17 to s-21 (5) | +70 to +128 | 5 whisper | 2 runs: 4, 1 run: 1 | 1 | 5 |
| Shaney 23 – In den Strassen (de) | s-41 to s-68 (28) | +10 to +64 | 5 whisper, 23 estimated | 1 run: 5 | 28 | 2 |
| Automatisch Gekommen – 1 Freak (de) | s-30 to s-54 (24, in 2 stretches) | +16 to +39 | 13 whisper, 11 estimated | 1 run: 9, 2 runs: 4 | 20 | 2 |
| Rxbyn – Bad Side (en) | s-14 to s-26 (13) | +44 to +74 | 12 whisper, 1 estimated | 2 runs: 7, 1 run: 5 | 6 | 13 |
| Rxbyn – Bad Side (en) | s-55 to s-66 (12) | −18 to +30 | 10 whisper, 2 estimated | 1 run: 10 | 12 | 4 |
| Dream Tabù – Besando Sapos (es) | s-52 to s-59 (8) | +11 to +33 | 6 whisper, 2 estimated | 3 runs: 3, 2 runs: 2, 1 run: 1 | 3 | 0 |
| LUNABLIND – Vision (en) | s-26 to s-30 (5) | −65 | 5 whisper | 2 runs: 4, 1 run: 1 | 1 | 5 |
| KPTN – Le musée d'air contemporain (fr) | s-32 to s-36 (5) | +35 | 5 whisper | 2 runs: 5 | 0 | 5 |
| Doromusis – Veränderung (de) | s-23 to s-27 (5) | +20 to +42 | 2 whisper, 3 estimated | 3 runs: 2 | 3 | 0 |

The 25 songs with such a stretch hold 93.7 % of the summed word error. In the other 54 songs the mean error is
0.255 s and 84.8 % of words are within 0.3 s.

What happens, in Rxbyn – Bad Side: runs 1 and 2 matched the lyric sheet's first chorus (s-15 to s-26) to the
second chorus's audio, 74 s later. Run 3 got it right, but with three runs `merge_runs` takes the median start, so
the two wrong runs outvoted it. The second chorus in the sheet was then left to run 3 alone. Jonny M – Keine Lust
shows the cascade: two runs moved a block 46 s late, and the 25 lines after it had no song left. No run placed
them, so `estimate` squeezed them into the last seven seconds, 10 to 44 s off. The runs had heard that audio (run 2
spread 559 words over the whole song); the matching step went wrong.

Why: `lib.align` matches the whole sheet against the whole transcription with `difflib.SequenceMatcher`, which
first anchors on the longest common block. When a chorus repeats word for word, that block can pair one copy in
the sheet with the other copy in the audio, and every match after it must then come later still. `merge_runs`
drops a run whose start is more than 1 s from the others, but not two runs that agree. Nothing checks that a
line's time fits between its neighbours'.

### 2. The first word of a line

Each whisper run's word timestamps compared with the annotations. The time of each lyric word comes from one
whisper word; only lines the run matched at least half of are counted.

| whisper word vs annotated word | words | start: median | start within 0.3 s | end: median | end within 0.3 s | duration, whisper / annotated (median) |
|---|---:|---:|---:|---:|---:|---:|
| a line's first word | 7,968 | −0.34 s | 40.1 % | −0.07 s | 86.5 % | 0.58 / 0.25 s |
| the other words | 44,575 | −0.10 s | 86.4 % | −0.09 s | 83.5 % | 0.34 / 0.31 s |

The same pattern holds in every language: a line's first word starts a median 0.30–0.36 s early while its end is
0.06–0.09 s off. Whisper leaves no gap between words, so the pause before a line is heard as part of the line's
first word. faster-whisper shortens such a word to twice the median word duration only after a sentence-end mark
or at the start of a segment that follows a pause, and lyric lines rarely end in a sentence mark.

**What-if** ([`bench/whatif_first_word.py`](../bench/whatif_first_word.py), on the cached runs). In each whisper
run, shorten the word that a lyric line's first word was matched to. It gets the run's median word duration, at
most 0.7 s as faster-whisper caps it, and keeps its end. Then merge, fill and snap exactly as `sync` does. On the
English songs, three lengths were tried: 2× the median (faster-whisper's own limit) left 46.9 % of lines starting
more than 0.3 s off, 1.5× left 35.6 %, and 1× left 21.3 %. Then 1× was run unchanged on the 59 other songs:

| first word shortened to the run's median word length | words within 0.1 / 0.3 / 1 s | a line's first word within 0.3 s | lines > 0.3 s off (early / late) | lines > 1 s off |
|---|---:|---:|---:|---:|
| English, where the rule was chosen: now | 51.3 / 75.6 / 86.9 % | 48.4 % | 51.6 % (349 / 99) | 15.4 % |
| English: shortened | 55.1 / 80.3 / 87.2 % | 78.7 % | 21.3 % (72 / 113) | 13.0 % |
| **German, Spanish, French (59 held-out songs): now** | 47.0 / 79.2 / 90.3 % | 49.7 % | 50.3 % (999 / 266) | 14.6 % |
| **held out: shortened** | 49.6 / 83.6 / 90.7 % | 77.3 % | **22.7 %** (242 / 330) | 11.7 % |
| German: now → shortened | 75.0 → 79.5 % within 0.3 s | 44.8 → 71.2 % | 55.2 → 28.8 % | 21.1 → 16.0 % |
| Spanish: now → shortened | 82.8 → 87.4 % within 0.3 s | 51.2 → 78.2 % | 48.8 → 21.8 % | 10.6 → 9.2 % |
| French: now → shortened | 79.6 → 83.9 % within 0.3 s | 53.6 → 83.1 % | 46.4 → 16.9 % | 11.9 → 9.7 % |

The rule holds on the held-out songs. Its cost is that more lines start late (365 → 443 of 3,383): some first
words really are sung long. It does not touch the repeated-section failures, so the mean error barely moves
(2.66 → 2.64 s).

### 3. Lines nothing placed

The 124 estimated lines are almost all wrong: 123 start more than 0.3 s off, with a median of 20 s, and most of
them are the squeezed lines of section 1. The 44 re-heard lines did better but are still mostly off: 39 start more
than 0.3 s off, with a median of 1.3 s. `check_by_ear` lists all of both kinds.

How many runs agreed says little about whether a whisper line is right. Of lines placed by three runs, 44 % start
more than 0.3 s off; of those placed by two, 59 %; of those placed by one, 56 %. The first-word error is systematic,
and every run makes it.

## How well `check_by_ear` points at wrong lines

| | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| lines listed | 195 | 163 | 94 | 124 | 576 |
| precision: listed lines that start > 0.3 s / > 1 s off | 67.7 / 44.6 % | 71.8 / 60.7 % | 70.2 / 44.7 % | 62.1 / 35.5 % | 68.1 / 47.2 % |
| recall: lines > 0.3 s off that are listed | 29.5 % | 24.3 % | 15.3 % | 21.8 % | 22.9 % |
| recall: lines > 1 s off that are listed | 64.9 % | 53.8 % | 45.2 % | 48.4 % | **54.2 %** |
| order check: lines off the lyric order | 36 | 34 | 14 | 15 | 99 |
| … of them > 1 s off | 88.9 % | 35.3 % | 78.6 % | 73.3 % | 66.7 % |
| `check_by_ear` + order check: recall for > 1 s off | 74.6 % | 56.0 % | 49.5 % | 58.2 % | 60.2 % |
| … precision for > 1 s off | 47.8 % | 59.2 % | 46.5 % | 39.3 % | 48.9 % |

`check_by_ear` lists re-heard and estimated lines, and lines only one of several runs placed. Two thirds of what it
lists is really off. It misses two kinds of error. The first is the first-word error: 1,200 lines, 88 listed,
because every run makes it, so run disagreement cannot show it. The second is a block moved by two or three runs
that agree: in Jonny M – Keine Lust, 9 lines 46 s late, none listed.

The order check is not part of `sync`; the script computes it to see what it would add. It takes the longest
chain of lines that keeps the order of the lyric sheet, where each line may start up to 1 s before the one before
it, and lists the lines off that chain. A chorus placed on another copy breaks the order, and two thirds of the 99
lines it lists are more than 1 s off. Its blind side: when the misplaced block is the longer chain, it keeps the
block and lists the correct lines instead. That happened in Jonny M – Keine Lust: of 14 lines listed, 1 was more
than 1 s off. Even then it points at the right stretch of the song.

## What the numbers point to

In order of how much error each one removes:

1. **Keep repeated sections apart.** This is nearly all of the large error: 217 lines more than 10 s off, whose
   words carry 86 % of the summed error, and invisible to `check_by_ear` when runs agree. Match the sheet in an order-preserving way that
   cannot let one copy of a chorus claim another copy's audio: for example a global alignment by dynamic
   programming instead of difflib's longest block first, or matching section by section. When lines have to be
   squeezed into no room, list the stretch before them too, because the squeeze means earlier lines took their
   audio. Measure it with the lines more than 10 s off (217 now) and recall for lines more than 1 s off (54 % now).
2. **Shorten the whisper word each line starts with** (the what-if above), in `lib.align` or `merge_runs` where
   the matched whisper word is known. Measured gain: wrong line starts go from 50.6 % to 22.4 % over all 79 songs,
   and from 50.3 % to 22.7 % on the 59 held-out songs. Watch the late starts (365 → 443). A vocal-onset check
   near the word's end could catch the first words that really are sung long.
3. **Add the lyric-order check to `check_by_ear`.** It adds 99 lines, two thirds of them more than 1 s off, and
   lifts recall for lines more than 1 s off from 54 % to 60 %.
4. **Snapping is not the problem.** It costs 0.4 points at 0.3 s and 4.8 points at 0.1 s, and the beat grid is
   the point of song2mv.

## Runtime

All 79 songs took 131 minutes of `sync` time, run one at a time: 99 s per song on average (43–270 s), 0.46 s per
second of audio. Three whisper runs are most of it, and the slowest songs had many words or several re-heard gaps.
`sync` used about 5.7 cores on average. Other processes used 1.4 cores on average (0.5–3.3 per song), mostly the
macOS window server and a Codex app, so times on an idle machine would be somewhat lower.

## Per song

Times are snapped (as written to `lyrics.json`), except the "unsnapped" column. "Listed" is `check_by_ear`, with
the lines among them that start more than 0.3 s off in brackets. Sources use `sync`'s names: `asr` is the whisper
runs and `reprompt` a re-heard gap. The licence applies to the song's audio and lyric file.

| song | lang | licence | words | mean abs, s | within 0.3 s | unsnapped within 0.3 s | lines > 0.3 s off | listed (wrong) | sources | sync s |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| HILA – Give Me The Same | en | BY-ND | 322 | 0.28 | 77.6 % | 78.0 % | 39/58 | 7 (4) | 56 asr, 2 reprompt | 69 |
| Quentin Hannappe – Keep On | en | BY-NC-ND | 175 | 0.21 | 80.0 % | 80.0 % | 19/27 | 4 (0) | 27 asr | 44 |
| Songwriterz – Back In Time | en | BY-ND | 238 | 0.20 | 77.7 % | 79.4 % | 24/46 | 7 (4) | 46 asr | 98 |
| KINEMATIC – Peyote | en | BY-ND | 147 | 0.13 | 87.1 % | 87.8 % | 8/14 | 0 (0) | 14 asr | 47 |
| Avercage – Embers | en | BY-NC-SA | 189 | 1.45 | 46.0 % | 48.1 % | 27/42 | 25 (16) | 38 asr, 3 reprompt, 1 estimated | 113 |
| Colour Out – Falling Star | en | BY-NC-ND | 224 | 0.23 | 81.7 % | 83.5 % | 24/37 | 2 (1) | 37 asr | 55 |
| The.Madpix.Project – One Way Street | en | BY-NC-SA | 183 | 0.14 | 87.4 % | 88.5 % | 11/30 | 1 (1) | 30 asr | 58 |
| Wordsmith – The statement | en | BY-ND | 581 | 1.27 | 78.1 % | 78.1 % | 5/31 | 9 (5) | 28 asr, 3 estimated | 220 |
| Jason Miller – Crowdpleaser | en | BY-NC-SA | 521 | 0.09 | 96.4 % | 97.7 % | 17/82 | 0 (0) | 82 asr | 128 |
| Lower Loveday – Is It Right? | en | BY-SA | 212 | 0.22 | 84.0 % | 84.9 % | 17/26 | 0 (0) | 26 asr | 53 |
| Pure Mids – The Leader | en | BY-NC-ND | 114 | 0.74 | 64.0 % | 64.0 % | 14/20 | 7 (7) | 19 asr, 1 reprompt | 98 |
| Ridgway – Fire Inside | en | BY-ND | 304 | 1.05 | 76.6 % | 77.0 % | 24/50 | 12 (9) | 46 asr, 2 reprompt, 2 estimated | 174 |
| Moon I mean – Wrong Concept | en | BY-NC-ND | 272 | 35.19 | 16.5 % | 16.2 % | 41/43 | 31 (30) | 22 asr, 18 estimated, 3 reprompt | 154 |
| Slingshot miracle – Whistler | en | BY-NC-ND | 162 | 0.23 | 76.5 % | 77.8 % | 22/31 | 4 (4) | 30 asr, 1 reprompt | 64 |
| The RINN – Voices | en | BY-NC-ND | 203 | 0.23 | 78.3 % | 78.3 % | 19/46 | 6 (3) | 46 asr | 71 |
| Rxbyn – Bad Side | en | BY | 440 | 19.93 | 47.0 % | 46.8 % | 44/72 | 52 (33) | 67 asr, 4 estimated, 1 reprompt | 119 |
| Tom Orlando – The One (feat Tina G) | en | BY-ND | 498 | 0.13 | 91.2 % | 90.8 % | 20/72 | 7 (3) | 71 asr, 1 reprompt | 82 |
| LUNABLIND – Vision | en | BY-NC | 288 | 4.67 | 78.5 % | 79.2 % | 30/53 | 19 (11) | 53 asr | 108 |
| Explosive ear candy – Like The Sun | en | BY-NC-ND | 265 | 0.14 | 89.1 % | 89.8 % | 23/46 | 0 (0) | 46 asr | 78 |
| Cortez – Feel (Stripped) | en | BY | 355 | 0.28 | 78.6 % | 78.6 % | 20/42 | 2 (1) | 42 asr | 89 |
| Automatisch Gekommen – 1 Freak | de | BY-NC-ND | 367 | 12.26 | 54.8 % | 54.8 % | 30/60 | 24 (20) | 49 asr, 11 estimated | 127 |
| ALFONSO LUGO – Baila | es | BY-NC-SA | 282 | 0.11 | 91.1 % | 94.0 % | 13/36 | 0 (0) | 36 asr | 100 |
| DREAM TABÙ – Besando Sapos | es | BY-NC-SA | 228 | 4.32 | 67.1 % | 67.1 % | 34/64 | 6 (6) | 59 asr, 5 estimated | 76 |
| Bukto – Bitte beweg dich nicht | de | BY-NC-ND | 353 | 0.18 | 86.7 % | 87.2 % | 14/38 | 3 (3) | 38 asr | 101 |
| Abendblau – Burn Out Man | de | BY-NC-ND | 330 | 0.32 | 83.0 % | 82.7 % | 26/45 | 3 (1) | 44 asr, 1 reprompt | 91 |
| KANGAROO MUSIQUE – Cafe Jenseitz Bebelstraße | de | BY-NC-ND | 92 | 0.23 | 79.3 % | 78.3 % | 16/17 | 1 (1) | 17 asr | 67 |
| EL MANU – Capotes à un Franc | fr | BY-NC-SA | 245 | 1.11 | 90.6 % | 90.6 % | 10/26 | 0 (0) | 26 asr | 51 |
| VAGOS PERMANENTES – Caralibro | es | BY-NC-SA | 211 | 0.14 | 87.7 % | 88.6 % | 13/26 | 1 (0) | 26 asr | 81 |
| I'M FRESH! YOU'RE PRETTY! – CHRISTMAS AVEC TOI | fr | BY | 350 | 3.44 | 50.6 % | 52.6 % | 29/40 | 19 (16) | 31 asr, 6 estimated, 3 reprompt | 238 |
| CLUB DESTINO – Pensando en ti | es | BY-NC-SA | 204 | 0.33 | 83.3 % | 84.3 % | 21/36 | 3 (3) | 36 asr | 122 |
| Quesabe – Confession | fr | BY-NC-ND | 336 | 0.36 | 89.3 % | 90.5 % | 17/42 | 7 (7) | 38 asr, 3 reprompt, 1 estimated | 133 |
| COOL CAVEMEN – Culture & Co. | fr | BY-NC-ND | 132 | 4.00 | 63.6 % | 59.9 % | 9/25 | 13 (5) | 25 asr | 62 |
| Alice Tlustlos – Da wurdest du geboren | de | BY-NC-ND | 148 | 0.24 | 76.3 % | 77.7 % | 16/24 | 0 (0) | 24 asr | 54 |
| LE NEZ TORDU – de bonne humeur | fr | BY-NC-SA | 266 | 0.13 | 90.2 % | 90.6 % | 14/40 | 2 (1) | 40 asr | 66 |
| Dienstag ist Damensauna – Der Baum | de | BY-NC-ND | 222 | 0.72 | 82.9 % | 82.9 % | 25/46 | 8 (5) | 46 asr | 85 |
| D. – Der Musiker | de | BY-NC-SA | 354 | 0.17 | 89.5 % | 89.8 % | 19/94 | 7 (5) | 88 asr, 3 reprompt, 3 estimated | 174 |
| Frank Wingenbach – dich gehen zu sehn. | de | BY-NC-ND | 181 | 0.21 | 80.1 % | 81.8 % | 16/22 | 0 (0) | 22 asr | 70 |
| Die Partysahnen – Die Revolution gehört Dir! | de | BY-NC-SA | 156 | 0.57 | 66.7 % | 66.7 % | 18/28 | 7 (6) | 25 asr, 2 reprompt, 1 estimated | 101 |
| BRUNELA CROCHENCI – Diosa de la noche | es | BY-NC-SA | 201 | 0.56 | 69.7 % | 71.6 % | 22/29 | 4 (4) | 25 asr, 4 reprompt | 270 |
| CRIATURA – Disparan | es | BY-NC-SA | 194 | 4.65 | 73.2 % | 73.2 % | 13/40 | 8 (5) | 40 asr | 72 |
| Patrouille – Drei Nüsse | de | BY-NC-ND | 519 | 0.11 | 92.7 % | 92.9 % | 28/56 | 1 (1) | 56 asr | 117 |
| NANDOMALO – Esencia | es | BY-SA | 334 | 0.13 | 91.3 % | 89.8 % | 20/51 | 1 (1) | 51 asr | 97 |
| LOS ROMBOS – Fantasma | es | BY-SA | 88 | 1.46 | 65.9 % | 68.2 % | 11/17 | 3 (3) | 15 asr, 1 estimated, 1 reprompt | 159 |
| Durch Dick und Dünn – Freifliegen | de | BY-SA | 135 | 0.21 | 78.5 % | 80.0 % | 18/32 | 0 (0) | 32 asr | 75 |
| Andreas Jachmann – Fußabdrücke | de | BY-NC-ND | 154 | 0.26 | 76.6 % | 76.6 % | 16/22 | 0 (0) | 22 asr | 72 |
| JhoyKing – Guayateo | es | BY-NC-ND | 340 | 0.49 | 86.2 % | 85.9 % | 19/52 | 9 (5) | 49 asr, 2 estimated, 1 reprompt | 145 |
| BRUNELA CROCHENCI – Háblame - (Talk to me) | es | BY-NC-SA | 106 | 5.84 | 60.4 % | 61.3 % | 20/32 | 11 (5) | 32 asr | 43 |
| Frank Wingenbach – Ich kann dich nicht vergessen | de | BY-NC-ND | 198 | 0.23 | 79.3 % | 78.8 % | 36/40 | 1 (1) | 40 asr | 62 |
| SUNDAYERS – Intentando Destacar | es | BY-NC-SA | 224 | 0.47 | 77.2 % | 76.8 % | 15/30 | 4 (4) | 26 asr, 3 reprompt, 1 estimated | 212 |
| Zeugen der Leere – Intro [Pulsschlag] | de | BY-NC-ND | 82 | 0.29 | 80.5 % | 80.5 % | 5/12 | 4 (1) | 12 asr | 54 |
| Jonny M – Keine Lust | de | BY-SA | 528 | 14.28 | 56.4 % | 56.4 % | 65/122 | 46 (30) | 96 asr, 1 reprompt, 25 estimated | 267 |
| FLO – l'abandon | fr | BY | 341 | 0.19 | 84.8 % | 86.2 % | 20/43 | 4 (2) | 40 asr, 1 estimated, 2 reprompt | 188 |
| RICH DON JERI – La rumba del coronavirus | es | BY-ND | 224 | 1.41 | 69.6 % | 69.2 % | 48/75 | 28 (22) | 73 asr, 2 reprompt | 113 |
| KPTN – Le musée d'air contemporain | fr | BY | 256 | 4.63 | 77.3 % | 77.0 % | 26/48 | 12 (6) | 48 asr | 53 |
| LAW' – Les files d'attente | fr | BY-SA | 319 | 1.06 | 67.7 % | 68.3 % | 25/47 | 7 (7) | 43 asr, 4 estimated | 100 |
| CYBERATTACK – Libre | fr | BY-ND | 397 | 0.12 | 95.2 % | 95.7 % | 5/48 | 5 (0) | 48 asr | 127 |
| LAW' – Mère nature | fr | BY-SA | 254 | 2.51 | 66.9 % | 66.1 % | 22/36 | 6 (3) | 36 asr | 67 |
| KOBZX2Z – Mes Larmes | fr | BY-NC-ND | 388 | 0.58 | 76.5 % | 75.3 % | 22/65 | 16 (8) | 2 estimated, 63 asr | 108 |
| CORRIENTES – ¡Óyeme tiburón! | es | BY-NC-SA | 210 | 0.21 | 79.5 % | 80.5 % | 29/54 | 3 (2) | 54 asr | 58 |
| YUANAN “J.A.R” – Miedo | es | BY-NC-SA | 268 | 0.16 | 85.8 % | 87.7 % | 18/33 | 4 (3) | 1 reprompt, 32 asr | 105 |
| Heiko Sunfyah – Musik | de | BY-NC-ND | 237 | 0.16 | 84.8 % | 86.1 % | 25/36 | 0 (0) | 36 asr | 84 |
| JAVIER GÓMEZ BELLO – Palabras | es | BY-NC-SA | 212 | 4.04 | 64.1 % | 67.5 % | 15/24 | 4 (2) | 24 asr | 56 |
| AZUL – Pas que tes pas | fr | BY-NC-SA | 268 | 0.21 | 84.3 % | 84.7 % | 16/31 | 0 (0) | 31 asr | 62 |
| MIDNIGHT PRÉFOU – Pluie d'entre deux saisons | fr | BY-NC-ND | 134 | 2.35 | 44.8 % | 45.5 % | 23/32 | 8 (7) | 28 asr, 1 reprompt, 3 estimated | 188 |
| CABBAC – POIGNEE DE MAIN | fr | BY-NC-ND | 146 | 0.31 | 70.5 % | 72.6 % | 18/30 | 1 (1) | 30 asr | 49 |
| NACIDOS DE LA TIERRA – Quiero y Puedo | es | BY-ND | 640 | 0.09 | 94.8 % | 96.4 % | 19/73 | 1 (0) | 73 asr | 138 |
| Abendblau – Schnodderdodder | de | BY-NC-ND | 291 | 0.39 | 88.7 % | 89.7 % | 15/43 | 1 (0) | 43 asr | 103 |
| WASARU – Séculaire feat. Nÿme | fr | BY-NC-SA | 345 | 0.27 | 95.1 % | 95.4 % | 7/40 | 4 (3) | 39 asr, 1 estimated | 77 |
| REH-TORTE – Sehnsucht-Unplugged | de | BY-NC-ND | 151 | 0.18 | 86.8 % | 86.1 % | 15/26 | 0 (0) | 26 asr | 68 |
| Shaney 23 – SHANEY 23 feat. G1NA G. x In den Strassen | de | BY-NC-ND | 448 | 24.83 | 46.0 % | 46.0 % | 49/72 | 50 (36) | 48 asr, 24 estimated | 103 |
| LIVING CAMBOYA – Sin miedo | es | BY-NC-SA | 171 | 0.29 | 69.6 % | 67.2 % | 27/28 | 0 (0) | 28 asr | 54 |
| FABIOS LA NUEVA EXPRESION DE LA CANCIÓN – te amo | es | BY-NC-SA | 169 | 0.20 | 77.5 % | 75.7 % | 20/29 | 0 (0) | 29 asr | 44 |
| WILSON WAY – Te Recuerdo | es | BY-SA | 458 | 0.13 | 93.5 % | 93.5 % | 14/51 | 1 (1) | 51 asr | 84 |
| DON VALDES – Tu sais Man | fr | BY-NC-SA | 505 | 0.91 | 76.8 % | 77.0 % | 34/60 | 17 (9) | 59 asr, 1 reprompt | 88 |
| LÖHSTANA DAVID – Une Vie De Roi | fr | BY-NC-SA | 311 | 0.17 | 82.6 % | 82.6 % | 27/44 | 2 (1) | 44 asr | 84 |
| FAFARULO CALABAZA – Vente | es | BY-NC | 505 | 0.16 | 88.9 % | 88.9 % | 39/101 | 3 (0) | 101 asr | 108 |
| Doromusis – Veränderung | de | BY-NC-ND | 211 | 5.19 | 61.1 % | 61.1 % | 29/36 | 7 (7) | 30 asr, 5 estimated, 1 reprompt | 54 |
| RAOUL DE QSM – Le royaume des glous glous | fr | BY-NC-ND | 202 | 0.11 | 95.0 % | 96.0 % | 7/24 | 1 (1) | 24 asr | 52 |
| LÉYÀK – En liberté | fr | BY-NC-SA | 266 | 0.21 | 84.2 % | 83.5 % | 23/42 | 0 (0) | 42 asr | 66 |

## Method

**Dataset.** JamendoLyrics MultiLang (Durand, Stoller and Ewert, [ICASSP 2023](https://arxiv.org/abs/2306.07744)),
Hugging Face [`jamendolyrics/jamendolyrics`](https://huggingface.co/datasets/jamendolyrics/jamendolyrics) at
revision `de188c9` (2025-03-06). It has 79 songs from Jamendo: 20 English, 20 German, 20 Spanish and 19 French, with
21,580 annotated words in 3,383 lines. The lyric files are normalised: lower case, no punctuation except
apostrophes, and no section headers. The annotations are MIT-licensed. Each song's audio and lyric file has its own
Creative Commons licence, listed per song above, and 57 of the 79 are non-commercial (NC). Nothing from the
dataset is in this repository: the script downloads it to a cache.

**Runs.** Each song is run one at a time, with default settings:

```bash
song2mv sync AUDIO --lyrics lyrics/<song>.txt --language <en|de|es|fr> --out runs/<song> --json
```

The defaults are faster-whisper `small` × 3 runs (int8, 8 threads, beam 5), automatic tempo, re-listening to gaps
and snapping to 16ths of the beat grid. The machine was an Apple M4 Pro (8 performance + 4 efficiency cores,
24 GB) on macOS 27, CPU only, with faster-whisper 1.2.1, CTranslate2 4.8.3 and librosa 1.0.0.

**Matching words.** `sync` gets the dataset's own lyric file, so our words are the reference words: song2mv splits
lines on spaces, and the annotations have one row per space-separated word. The script still aligns the two token
sequences (difflib on lower-cased letters and digits) and counts every token that does not match. The count was 0
for every song. No line was dropped, and no line hit one of song2mv's special cases (a line in parentheses, a
`[Section]` line, or a token without letters).

**Numbers.**

- *Word onset error* is our word time minus the annotated word start, both in seconds. A word is "within 0.3 s"
  when |error| ≤ 0.3 s. The numbers are pooled over all words of a language. The published results (and the
  dataset's original `Evaluate.py`) average per song instead: AAE is the mean over songs of each song's mean
  absolute error, and PCO is the share of words within 0.3 s, averaged over songs. Both conventions are shown.
- *Snapped and unsnapped.* `lyrics.json` snaps times to 16ths of the beat grid, but the annotations are not on a
  grid. The unsnapped numbers (`snap_per_beat` 0) are rebuilt from each work folder with the pipeline's own
  functions, using the cached whisper runs and re-heard gaps, so nothing is transcribed again. With snapping on,
  the same rebuild reproduces `lyrics.json` exactly for every song.
- *Line start error* is the error of the line's first word. A line is *wrong* when it starts more than 0.3 s off;
  lines more than 1 s off are counted too.
- *check_by_ear* lists the lines `sync` thinks are most likely wrong (re-heard, estimated, or placed by only one
  whisper run). Recall is the share of wrong lines it lists. Precision is the share of listed lines that are wrong.
  Line ids repeat across songs (`s-01` …), so lines are counted by song and id.
- *Likely cause.* A line placed on another occurrence is one whose start is within 0.3 s of another line with the
  same words, and closer to it than to its own. "First word early, the rest on time" means the median error of the
  line's other words is within 0.3 s.
- *Runtime* is `sync`'s own `seconds`. While a song runs, the script samples `ps` every 10 s and records the CPU
  that other processes used.

## Limits

- **One dataset.** These are 79 songs by independent artists on Jamendo, released under CC licences: pop, rock,
  hip-hop, electronic and more. Their mixes may differ from chart music or from AI-generated songs (Suno), where
  song2mv is mostly used. Korean, song2mv's first language, is not in the set.
- **Normalised lyric files.** The files have no punctuation, no capitals and no `[Section]` headers, so every line
  id here is `s-NN`. Real lyric sheets have all three. song2mv normalises text before matching, so timing should
  not change, but section-based behaviour (ids, section kinds, the template) was not exercised.
- **The dataset's line breaks.** Line metrics depend on where the dataset breaks lines, which is not always where a
  person writing a lyric sheet would. "A line's first word" means the first word of a dataset line.
- **Annotation and grid limits.** People's word starts have their own error, which the dataset does not state.
  Snapping also moves a time by up to half a 16th (63 ms at 120 BPM). So "within 0.1 s" is partly limited by both;
  the unsnapped numbers show how much snapping costs.
- **One setting.** Only whisper `small`, three runs and the fixed seeds were measured. The results are
  deterministic for this machine and these library versions. `--model medium` or more runs might change them; that
  was not measured.
- **Busy laptop.** Times are CPU-only, on a laptop where other apps were running. Expect ±15 %.
- **The what-if is an estimate.** It is not shipped. It reuses the cached runs and changes only the timing of
  whisper words, not which words were heard. Lines no run placed keep what `sync`'s re-listening gave them,
  because re-listening to new gaps would need whisper again. The length was chosen on the English songs, which is
  why the held-out rows are the ones to trust.
- **Likely causes are a heuristic** read from the work folder, not a diagnosis by ear.

## Reproduce

From the repository, with the `sync` extra installed in `.venv`:

```bash
.venv/bin/python -I bench/jamendolyrics.py --lang en        # downloads ~400 MB once, then syncs the 20 English songs
.venv/bin/python -I bench/jamendolyrics.py                  # all 79 songs (about 2¼ hours here); finished songs are skipped
.venv/bin/python -I bench/jamendolyrics.py --no-run --markdown   # the tables on this page
.venv/bin/python -I bench/whatif_first_word.py              # the first-word what-if (seconds; --factor to try other lengths)
.venv/bin/python -I bench/jamendolyrics.py --rerun          # after a change to song2mv: whisper runs are reused
```

Everything goes to `~/.cache/song2mv-bench` (`--cache` to change it): the dataset, one `sync` work folder per song,
and `results/jamendolyrics.json` with every line's numbers. A song's work folder is an ordinary `sync` work folder,
so `song2mv click runs/<song> --from A --to B --words` plays any line discussed here.
