# Benchmark: lyric timing on JamendoLyrics

How close does `song2mv sync` put each word to where it is sung? Until now its accuracy had been measured on one
Korean song, against a reference that was itself mostly whisper output. This page measures it against people:
JamendoLyrics MultiLang, the standard lyrics-alignment benchmark, has 79 songs in four languages whose word start
and end times were annotated by hand.

Measured on 2026-10-20 with song2mv 0.1.0 and default settings, twice: at `d368734`, and at `97a552c`, which starts
each line where it is sung instead of in the pause before it ([section 2](#2-the-first-word-of-a-line)). The numbers
are for `97a552c` unless they say otherwise; [Before and after](#before-and-after) has both. To reproduce, run
[`bench/jamendolyrics.py`](../bench/jamendolyrics.py) (see [Reproduce](#reproduce)).

## In short

- **Most words land close, but a few songs fail badly.** Across all 79 songs, the median word is 0.098 s from where
  people put it, and 83 % of words are within 0.3 s. The mean error is 2.6 s: 25 songs contain stretches of lines
  tens of seconds off, and those songs hold 94 % of the summed error. In the other 54 songs the mean error is
  0.22 s and 90 % of words are within 0.3 s.
- **Repeated sections cause the big failures.** When a chorus or verse comes back with the same words, two of three
  whisper runs can match one copy in the lyric sheet to the audio of another. The lines after it in the sheet
  then have too little song left: they go unplaced and are squeezed into the last seconds. 214 lines (6 %) start
  more than 10 s off. `check_by_ear` lists two thirds of them, but not the blocks that two or three runs agreed on.
- **Lines now start where they are sung.** Whisper leaves no gap between words, so the pause before a line becomes
  part of the line's first word: measured per run, that word starts a median 0.34 s early while its end is only
  0.07 s early. At `d368734` half of all lines started more than 0.3 s off, mostly for this reason. `sync` now cuts
  that whisper word to the run's median word duration. Wrong line starts fell from 50.6 % to 22.1 %, and words
  within 0.3 s rose from 78.2 % to 82.8 %. The cost: more lines start late (365 → 442), where a first word really
  is sung long.
- **`check_by_ear` lists about two thirds of the lines that are more than 1 s off** (64 %), and 56 % of the lines
  it lists really start more than 0.3 s off. A check on the lyric order would add 98 lines, two thirds of them more
  than 1 s off.
- **Compared with dedicated aligners**, song2mv's share of words within 0.3 s, averaged per song (82 %), falls
  between older systems (59–73 %) and the character-based models of the paper (89–94 %). Its average error per song
  (2.2 s, against 0.18–1.11 s) is worse because of the repeated-section failures.
- **Snapping to the beat grid costs little at 0.3 s and more at 0.1 s.** Without snapping, 83.2 % of words are
  within 0.3 s (82.8 % with it) and 55.7 % are within 0.1 s (50.8 % with it).
- **Runtime** is 99 s per song on average, 0.46 × the song's length, on an M4 Pro CPU with other apps using about
  1.4 cores (measured at `d368734`; the first-word change adds well under a second).

## Results per language

Word numbers are pooled over all words of a language. AAE and PCO follow the published convention, averaged per
song (see [Method](#method)).

| | English | German | Spanish | French | all 79 |
|---|---:|---:|---:|---:|---:|
| songs / words | 20 / 5,693 | 20 / 5,157 | 20 / 5,269 | 19 / 5,461 | 79 / 21,580 |
| words within 0.1 s | 53.7 % | 53.0 % | 49.4 % | 47.0 % | 50.8 % |
| words within 0.3 s | 80.4 % | 79.6 % | 87.6 % | 83.9 % | **82.8 %** |
| words within 1 s | 87.3 % | 85.6 % | 94.6 % | 92.1 % | 89.9 % |
| median / mean absolute error, s | 0.089 / 3.79 | 0.093 / 4.86 | 0.102 / 0.87 | 0.105 / 0.96 | **0.098** / 2.62 |
| median signed error, s (− = early) | −0.011 | −0.046 | −0.061 | −0.079 | −0.046 |
| unsnapped: words within 0.1 / 0.3 s | 57.5 / 80.7 % | 54.7 / 80.0 % | 56.4 / 88.1 % | 54.0 / 84.0 % | 55.7 / 83.2 % |
| AAE: mean over songs / median over songs, s | 3.31 / 0.20 | 3.01 / 0.18 | 1.22 / 0.25 | 1.11 / 0.31 | 2.18 / 0.23 |
| PCO: within 0.3 s, mean over songs | 80.2 % | 82.1 % | 84.2 % | 82.6 % | 82.3 % |
| lines | 868 | 871 | 881 | 763 | 3,383 |
| lines starting > 0.3 s off (early / late) | 21.3 % (70 / 115) | 28.4 % (93 / 154) | 21.2 % (94 / 93) | 16.8 % (48 / 80) | 22.1 % (305 / 442) |
| lines starting > 1 s off | 13.0 % | 16.0 % | 8.9 % | 9.4 % | 11.9 % |
| line sources: whisper / re-heard / estimated | 826 / 13 / 29 | 794 / 7 / 70 | 860 / 10 / 11 | 735 / 12 / 16 | 3,215 / 42 / 126 |
| `sync` seconds per song (× song length), at `d368734` | 96 (0.44) | 96 (0.42) | 107 (0.50) | 98 (0.49) | 99 (0.46) |

Every song ran without an error. The tokens matched the annotations exactly in all 79 songs, and the rebuild
reproduced every `lyrics.json`.

### Before and after

`d368734` → `97a552c`, the change that cuts a line's first whisper word (see [section 2](#2-the-first-word-of-a-line)).

| | English | German | Spanish | French | all 79 |
|---|---:|---:|---:|---:|---:|
| words within 0.1 s | 51.3 → 53.7 % | 50.2 → 53.0 % | 47.2 → 49.4 % | 43.8 → 47.0 % | 48.1 → 50.8 % |
| words within 0.3 s | 75.6 → 80.4 % | 75.0 → 79.6 % | 82.8 → 87.6 % | 79.6 → 83.9 % | 78.2 → 82.8 % |
| words within 1 s | 86.9 → 87.3 % | 84.8 → 85.6 % | 94.2 → 94.6 % | 91.7 → 92.1 % | 89.4 → 89.9 % |
| lines starting > 0.3 s off | 51.6 → 21.3 % | 55.2 → 28.4 % | 48.8 → 21.2 % | 46.4 → 16.8 % | **50.6 → 22.1 %** |
| … of them late | 99 → 115 | 139 → 154 | 57 → 93 | 70 → 80 | 365 → 442 |
| lines starting > 1 s off | 15.4 → 13.0 % | 21.1 → 16.0 % | 10.6 → 8.9 % | 11.9 → 9.4 % | 14.8 → 11.9 % |
| `check_by_ear` recall: lines > 0.3 / > 1 s off it lists | 29.5 / 64.9 → 55.1 / 71.7 % | 24.3 / 53.8 → 43.3 / 70.5 % | 15.3 / 45.2 → 28.9 / 50.0 % | 21.8 / 48.4 → 46.1 / 56.9 % | 22.9 / 54.2 → 43.1 / 64.4 % |
| `check_by_ear` precision: listed lines > 0.3 / > 1 s off | 67.7 / 44.6 → 53.1 / 42.2 % | 71.8 / 60.7 → 66.0 / 60.5 % | 70.2 / 44.7 → 57.4 / 41.5 % | 62.1 / 35.5 → 48.4 / 33.6 % | 68.1 / 47.2 → 56.5 / 45.4 % |
| PCO / AAE, mean over songs | 74.6 % / 3.34 → 80.2 % / 3.31 s | 76.5 % / 3.05 → 82.1 % / 3.01 s | 78.8 % / 1.26 → 84.2 % / 1.22 s | 78.2 % / 1.19 → 82.6 % / 1.11 s | 77.0 % / 2.22 → 82.3 % / 2.18 s |

Every language gains, and no song has more lines starting more than 0.3 s off, or fewer words within 0.3 s, than
before. `check_by_ear` lists almost the same lines (576 → 570), but many of them now start right, so its precision
falls; since most of the first-word errors it never saw are gone, its recall rises.

### Compared with published aligners

The [ICASSP 2023 paper](https://arxiv.org/abs/2306.07744) that introduced the dataset reports these numbers (its
Table 3: AAE in seconds per language; PCO only over all four languages):

| system | trained on | EN | ES | DE | FR | all: AAE | all: PCO |
|---|---|---:|---:|---:|---:|---:|---:|
| **song2mv sync** (whisper small × 3, snapped) | — | 3.31 | 1.22 | 3.01 | 1.11 | 2.18 | 82 % |
| M5 (phonemes) | English | 0.16 | 1.72 | 1.22 | 1.36 | 1.11 | 59 % |
| GYL (Gupta et al.) | English | 0.22 | 0.97 | 0.62 | 0.78 | 0.65 | 73 % |
| M6 (characters) | English | 0.15 | 0.37 | 0.41 | 0.47 | 0.35 | 89 % |
| M6 | all four | 0.39 | 0.22 | 0.26 | 0.28 | 0.29 | 91 % |
| M6, language-conditioned | all four | 0.21 | 0.13 | 0.16 | 0.19 | 0.18 | 94 % |

These systems are aligners trained for this task, and their numbers are taken from the paper. song2mv uses
general speech recognition, matches the text it hears to the lyric sheet, and then snaps to a beat grid (unsnapped,
AAE is 2.17 s and PCO is 82.6 %). AAE is the average error per song, so it is dominated by the few lines tens of
seconds off. In the median song, song2mv's average error is 0.23 s. Before the first-word change (`d368734`), AAE
was 2.22 s and PCO 77 %.

## Where the errors come from

Each line that starts more than 0.3 s off gets a likely cause from what its work folder says. The number listed by
`check_by_ear` is in brackets.

| lines starting > 0.3 s off, likely cause | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| first word early, the rest of the line on time | 37 (11) | 83 (1) | 56 (3) | 26 (6) | 202 (21) |
| first word late, the rest on time | 33 (6) | 18 (2) | 50 (4) | 35 (6) | 136 (18) |
| estimated (no run and no re-listening placed it) | 29 (29) | 66 (66) | 11 (11) | 16 (16) | 122 (122) |
| placed on another occurrence of the same words | 26 (13) | 46 (17) | 16 (6) | 10 (4) | 98 (40) |
| whole line late | 35 (23) | 23 (13) | 22 (7) | 16 (12) | 96 (55) |
| whole line early | 15 (10) | 4 (1) | 23 (14) | 16 (6) | 58 (31) |
| re-heard gap | 10 (10) | 7 (7) | 9 (9) | 9 (9) | 35 (35) |

At `d368734` the first row held 1,200 lines (88 listed) and the second 73 (19): the first-word change fixed most of
the early first words and made some first words late ([section 2](#2-the-first-word-of-a-line)). A line that moved
closer to another line with the same words now counts as "placed on another occurrence" (79 → 98).

### 1. Repeated sections placed on another copy

214 lines start more than 10 s off. They sit in 37 stretches in 25 songs, and five songs hold 162 of them. Their
1,214 words (6 % of all words) carry 86 % of the summed error. The first-word change hardly touched them. The
longest stretches:

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
| LUNABLIND – Vision (en) | s-26 to s-30 (5) | −65 | 5 whisper | 2 runs: 5 | 0 | 5 |
| KPTN – Le musée d'air contemporain (fr) | s-32 to s-36 (5) | +35 | 5 whisper | 2 runs: 5 | 0 | 5 |
| Doromusis – Veränderung (de) | s-23 to s-27 (5) | +20 to +43 | 2 whisper, 3 estimated | 3 runs: 2 | 3 | 0 |

The 25 songs with such a stretch hold 94.3 % of the summed word error. In the other 54 songs the mean error is
0.224 s and 89.9 % of words are within 0.3 s.

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

**What `sync` does about it** (since `97a552c`: `trim_first_words` in
[`align.py`](../src/song2mv/timing/align.py)). In each whisper run, the word that a lyric line's first word matched
is cut to the run's median word duration, at most 0.7 s as faster-whisper caps it, and keeps its end. The length was
chosen with a what-if on the cached runs of `d368734` ([`bench/whatif_first_word.py`](../bench/whatif_first_word.py)).
On the English songs, three lengths were tried: 2× the median (faster-whisper's own limit) left 46.9 % of lines
starting more than 0.3 s off, 1.5× left 35.6 %, and 1× left 21.3 %. Run unchanged on the 59 other songs, 1×
predicted 22.7 %. Measured with the change in `sync`:

| | words within 0.1 / 0.3 / 1 s | a line's first word within 0.3 s | lines > 0.3 s off (early / late) | lines > 1 s off |
|---|---:|---:|---:|---:|
| English, where the length was chosen: `d368734` | 51.3 / 75.6 / 86.9 % | 48.4 % | 51.6 % (349 / 99) | 15.4 % |
| English: `97a552c` | 53.7 / 80.4 / 87.3 % | 78.7 % | 21.3 % (70 / 115) | 13.0 % |
| **German, Spanish, French (59 held-out songs): `d368734`** | 47.0 / 79.2 / 90.3 % | 49.7 % | 50.3 % (999 / 266) | 14.6 % |
| **held out: `97a552c`** | 49.7 / 83.7 / 90.8 % | 77.6 % | **22.3 %** (235 / 327) | 11.5 % |
| German | 75.0 → 79.6 % within 0.3 s | 44.8 → 71.6 % | 55.2 → 28.4 % | 21.1 → 16.0 % |
| Spanish | 82.8 → 87.6 % within 0.3 s | 51.2 → 78.8 % | 48.8 → 21.2 % | 10.6 → 8.9 % |
| French | 79.6 → 83.9 % within 0.3 s | 53.6 → 83.2 % | 46.4 → 16.8 % | 11.9 → 9.4 % |

The change does what the what-if predicted: 22.1 % of all lines start more than 0.3 s off, against 22.4 % predicted.
On the same inputs, `sync` gives the what-if's lines exactly, except where a line's first word matched a whisper word
of zero length: looking whisper words up by time, the what-if cut the word before it (one song's lines differ). The
rest of the difference comes from re-listening: lines next to a gap now start later, so 28 of the 56 gap windows
moved and were heard again, in 13 songs.

The cost is that more lines start late (365 → 442 of 3,383): some first words really are sung long, and the cut
moves their start into the word. The change does not touch the repeated-section failures, so the mean error barely
moves (2.66 → 2.62 s). `bench/whatif_first_word.py` now compares `sync` with the rule off, or at another length
(`--factor`).

**On our Korean test song** (a Suno song, not in this dataset), the effect is unclear. The change moved 39 of its 85
line starts later. The song's only reference timing is itself whisper output from before the change, so it favours
the old starts: 68 line starts are within a 16th note of it before the change, 44 after. The separated vocal stem
does not settle it either. In 29 of the 39 lines, the stretch the cut removed is as loud as the singing, so these
lines follow the one before without a pause. Yet the stronger syllable attack is at the new start in 17 lines, at
the old one in 7, and unclear in 17. One line is clearly worse: whisper's word for a chanted four-syllable word
lasted 1.66 s, the cut left 0.54 s, and the line now starts 1 s late. Lines like that need a `manual` value until
`sync` can tell a pause from a long sung word.

### 3. Lines nothing placed

The 126 estimated lines are almost all wrong: 125 start more than 0.3 s off, with a median of 19 s, and most of
them are the squeezed lines of section 1. The 42 re-heard lines did better but are still mostly off: 35 start more
than 0.3 s off, with a median of 1.1 s. `check_by_ear` lists all of both kinds.

How many runs agreed now says something about whether a whisper line is right. Of lines placed by three runs, 12 %
start more than 0.3 s off; of those placed by two, 32 %; of those placed by one, 40 %. At `d368734` it was 44, 59 and
56 %: the first-word error was systematic, and every run made it.

## How well `check_by_ear` points at wrong lines

| | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| lines listed | 192 | 162 | 94 | 122 | 570 |
| precision: listed lines that start > 0.3 s / > 1 s off | 53.1 / 42.2 % | 66.0 / 60.5 % | 57.4 / 41.5 % | 48.4 / 33.6 % | 56.5 / 45.4 % |
| recall: lines > 0.3 s off that are listed | 55.1 % | 43.3 % | 28.9 % | 46.1 % | 43.1 % |
| recall: lines > 1 s off that are listed | 71.7 % | 70.5 % | 50.0 % | 56.9 % | **64.4 %** |
| order check: lines off the lyric order | 36 | 34 | 14 | 14 | 98 |
| … of them > 1 s off | 86.1 % | 35.3 % | 71.4 % | 78.6 % | 65.3 % |
| `check_by_ear` + order check: recall for > 1 s off | 84.1 % | 73.4 % | 55.1 % | 69.4 % | 72.1 % |
| … precision for > 1 s off | 45.7 % | 59.0 % | 43.4 % | 37.9 % | 47.4 % |

`check_by_ear` lists re-heard and estimated lines, and lines only one of several runs placed. More than half of what
it lists is really off. It misses two kinds of error. The first is a first word that every run times the same wrong
way, early or sung long: 338 lines, 39 listed, because run disagreement cannot show it (at `d368734`, before the
first-word change, 1,273 lines and 107 listed). The second is a block moved by two or three runs that agree: in
Jonny M – Keine Lust, 9 lines 46 s late, none listed.

The order check is not part of `sync`; the script computes it to see what it would add. It takes the longest
chain of lines that keeps the order of the lyric sheet, where each line may start up to 1 s before the one before
it, and lists the lines off that chain. A chorus placed on another copy breaks the order, and two thirds of the 98
lines it lists are more than 1 s off. Its blind side: when the misplaced block is the longer chain, it keeps the
block and lists the correct lines instead. That happened in Jonny M – Keine Lust: of 14 lines listed, 1 was more
than 1 s off. Even then it points at the right stretch of the song.

## What the numbers point to

In order of how much error each one removes:

1. **Keep repeated sections apart.** This is nearly all of the large error: 214 lines more than 10 s off, whose
   words carry 86 % of the summed error, and invisible to `check_by_ear` when runs agree. Match the sheet in an
   order-preserving way that cannot let one copy of a chorus claim another copy's audio: for example a global
   alignment by dynamic programming instead of difflib's longest block first, or matching section by section. When
   lines have to be squeezed into no room, list the stretch before them too, because the squeeze means earlier lines
   took their audio. Measure it with the lines more than 10 s off (214 now) and recall for lines more than 1 s off
   (64 % now).
2. **Tell a pause from a long sung word.** Cutting the first whisper word of each line (done in `97a552c`) took
   wrong line starts from 50.6 % to 22.1 %, but 442 lines now start more than 0.3 s late (365 before), and on our
   Korean test song its effect is unclear. A vocal-onset check near the cut could keep the first words that really
   are sung long.
3. **Add the lyric-order check to `check_by_ear`.** It adds 98 lines, two thirds of them more than 1 s off, and
   lifts recall for lines more than 1 s off from 64 % to 72 %.
4. **Snapping is not the problem.** It costs 0.4 points at 0.3 s and 4.9 points at 0.1 s, and the beat grid is
   the point of song2mv.

Not an error this page can measure, but one it showed: **the tempo pick depends on line starts.** `sync` picks among
tempo candidates by how many gaps between line starts are whole bars, and moving line starts by about a third of a
second changed the tempo in 15 of the 79 songs (see [Method](#method)). Without tempo annotations, which tempo is
right is unknown.

## Runtime

All 79 songs took 131 minutes of `sync` time, run one at a time: 99 s per song on average (43–270 s), 0.46 s per
second of audio. Three whisper runs are most of it, and the slowest songs had many words or several re-heard gaps.
`sync` used about 5.7 cores on average. Other processes used 1.4 cores on average (0.5–3.3 per song), mostly the
macOS window server and a Codex app, so times on an idle machine would be somewhat lower.

These times are from the run at `d368734`. The run at `97a552c` reused the whisper runs, so its seconds are not a
runtime measurement. Cutting first words adds one more alignment of the lyric sheet per whisper run: merging the
runs of the longest song took 0.46 s instead of 0.24 s.

### Several songs at once

`--jobs N` syncs N songs at once and splits `sync`'s 8 whisper threads between them (8 // N each). `sync` has no
flag for threads, so the script writes them into each work folder's `song.json`. This was measured on 6 songs of
about median length (2 English, 2 German, 1 Spanish, 1 French), each synced fresh, in two rounds: 1, 2, 3 songs at
once, then 3, 2, 1.

| `--jobs` | whisper threads each | wall-clock for the 6 songs | faster than `--jobs 1` | memory of the syncs, peak |
|---:|---:|---:|---:|---:|
| 1 | 8 | 539 s, 508 s | – | 1.8–2.3 GB |
| 2 | 4 | 343 s, 310 s | 1.57×, 1.64× | 2.6–3.6 GB |
| 3 | 2 | 284 s, 291 s | 1.90×, 1.75× | 3.6–4.3 GB |

The results do not change: `lyrics.json`, the whisper runs and every other output were byte-identical with 8, 4 and
2 threads. Whisper is about three quarters of a song's `sync` time, and two songs with 4 threads each took only
1.25–1.35× as long in whisper as one song with 8. Other apps used 0.8–1.7 cores during these runs. On this machine,
`--jobs 3` was the fastest setting measured (4 was not tried). With less memory, `--jobs 2` gets most of the gain:
one `sync` peaked at 1.6–2.3 GB.

A song's `sync` seconds include sharing the CPU with the songs next to it. They were 1.2–1.3× a song's time alone
with `--jobs 2` and 1.5–1.6× with `--jobs 3`. So per-song seconds, like every runtime on this page (all from
`--jobs 1`), compare only between runs with the same `--jobs`. `results/jamendolyrics.json` records `jobs` and
`threads` for every song.

## Per song

Times are snapped (as written to `lyrics.json`), except the "unsnapped" column. "Listed" is `check_by_ear`, with
the lines among them that start more than 0.3 s off in brackets. Sources use `sync`'s names: `asr` is the whisper
runs and `reprompt` a re-heard gap. `sync` seconds are from the full run at `d368734`. The licence applies to the
song's audio and lyric file.

| song | lang | licence | words | mean abs, s | within 0.3 s | unsnapped within 0.3 s | lines > 0.3 s off | listed (wrong) | sources | sync s |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| HILA – Give Me The Same | en | BY-ND | 322 | 0.22 | 86.7 % | 87.0 % | 13/58 | 7 (2) | 56 asr, 2 reprompt | 69 |
| Quentin Hannappe – Keep On | en | BY-NC-ND | 175 | 0.13 | 89.7 % | 89.7 % | 2/27 | 4 (0) | 27 asr | 44 |
| Songwriterz – Back In Time | en | BY-ND | 238 | 0.16 | 85.3 % | 87.0 % | 7/46 | 7 (3) | 46 asr | 98 |
| KINEMATIC – Peyote | en | BY-ND | 147 | 0.12 | 91.8 % | 91.2 % | 4/14 | 0 (0) | 14 asr | 47 |
| Avercage – Embers | en | BY-NC-SA | 189 | 1.40 | 50.3 % | 52.9 % | 20/42 | 25 (14) | 38 asr, 2 estimated, 2 reprompt | 113 |
| Colour Out – Falling Star | en | BY-NC-ND | 224 | 0.18 | 91.1 % | 91.5 % | 5/37 | 2 (1) | 37 asr | 55 |
| The.Madpix.Project – One Way Street | en | BY-NC-SA | 183 | 0.11 | 92.3 % | 94.0 % | 2/30 | 1 (1) | 30 asr | 58 |
| Wordsmith – The statement | en | BY-ND | 581 | 1.26 | 78.1 % | 78.1 % | 5/31 | 9 (5) | 28 asr, 3 estimated | 220 |
| Jason Miller – Crowdpleaser | en | BY-NC-SA | 521 | 0.07 | 98.9 % | 98.9 % | 4/82 | 0 (0) | 82 asr | 128 |
| Lower Loveday – Is It Right? | en | BY-SA | 212 | 0.18 | 92.5 % | 92.9 % | 1/26 | 0 (0) | 26 asr | 53 |
| Pure Mids – The Leader | en | BY-NC-ND | 114 | 0.73 | 67.5 % | 66.7 % | 10/20 | 7 (6) | 19 asr, 1 reprompt | 98 |
| Ridgway – Fire Inside | en | BY-ND | 304 | 1.03 | 81.6 % | 82.2 % | 9/50 | 12 (7) | 46 asr, 2 reprompt, 2 estimated | 174 |
| Moon I mean – Wrong Concept | en | BY-NC-ND | 272 | 35.18 | 19.5 % | 19.5 % | 32/43 | 31 (26) | 22 asr, 18 estimated, 3 reprompt | 154 |
| Slingshot miracle – Whistler | en | BY-NC-ND | 162 | 0.18 | 85.8 % | 85.2 % | 8/31 | 4 (2) | 30 asr, 1 reprompt | 64 |
| The RINN – Voices | en | BY-NC-ND | 203 | 0.21 | 84.7 % | 83.7 % | 6/46 | 6 (2) | 46 asr | 71 |
| Rxbyn – Bad Side | en | BY | 440 | 19.91 | 49.8 % | 49.5 % | 32/72 | 50 (25) | 67 asr, 4 estimated, 1 reprompt | 119 |
| Tom Orlando – The One (feat Tina G) | en | BY-ND | 498 | 0.13 | 93.0 % | 93.2 % | 10/72 | 7 (3) | 71 asr, 1 reprompt | 82 |
| LUNABLIND – Vision | en | BY-NC | 288 | 4.63 | 85.4 % | 86.5 % | 10/53 | 18 (4) | 53 asr | 108 |
| Explosive ear candy – Like The Sun | en | BY-NC-ND | 265 | 0.10 | 97.4 % | 97.7 % | 1/46 | 0 (0) | 46 asr | 78 |
| Cortez – Feel (Stripped) | en | BY | 355 | 0.26 | 83.1 % | 83.1 % | 4/42 | 2 (1) | 42 asr | 89 |
| Automatisch Gekommen – 1 Freak | de | BY-NC-ND | 367 | 12.26 | 56.1 % | 56.1 % | 25/60 | 24 (20) | 49 asr, 11 estimated | 127 |
| ALFONSO LUGO – Baila | es | BY-NC-SA | 282 | 0.11 | 91.1 % | 92.2 % | 13/36 | 0 (0) | 36 asr | 100 |
| DREAM TABÙ – Besando Sapos | es | BY-NC-SA | 228 | 4.30 | 73.2 % | 74.1 % | 20/64 | 6 (6) | 59 asr, 5 estimated | 76 |
| Bukto – Bitte beweg dich nicht | de | BY-NC-ND | 353 | 0.17 | 89.8 % | 90.4 % | 4/38 | 3 (2) | 38 asr | 101 |
| Abendblau – Burn Out Man | de | BY-NC-ND | 330 | 0.29 | 88.5 % | 87.9 % | 8/45 | 3 (1) | 44 asr, 1 reprompt | 91 |
| KANGAROO MUSIQUE – Cafe Jenseitz Bebelstraße | de | BY-NC-ND | 92 | 0.12 | 95.7 % | 95.7 % | 0/17 | 1 (0) | 17 asr | 67 |
| EL MANU – Capotes à un Franc | fr | BY-NC-SA | 245 | 1.09 | 94.3 % | 93.9 % | 1/26 | 0 (0) | 26 asr | 51 |
| VAGOS PERMANENTES – Caralibro | es | BY-NC-SA | 211 | 0.13 | 88.6 % | 92.4 % | 3/26 | 1 (0) | 26 asr | 81 |
| I'M FRESH! YOU'RE PRETTY! – CHRISTMAS AVEC TOI | fr | BY | 350 | 2.35 | 53.1 % | 55.7 % | 18/40 | 18 (14) | 31 asr, 3 estimated, 6 reprompt | 238 |
| CLUB DESTINO – Pensando en ti | es | BY-NC-SA | 204 | 0.27 | 94.1 % | 94.6 % | 5/36 | 3 (1) | 36 asr | 122 |
| Quesabe – Confession | fr | BY-NC-ND | 336 | 0.31 | 91.4 % | 92.3 % | 10/42 | 7 (7) | 38 asr, 2 reprompt, 2 estimated | 133 |
| COOL CAVEMEN – Culture & Co. | fr | BY-NC-ND | 132 | 3.98 | 67.4 % | 64.4 % | 4/25 | 13 (2) | 25 asr | 62 |
| Alice Tlustlos – Da wurdest du geboren | de | BY-NC-ND | 148 | 0.17 | 81.8 % | 83.1 % | 8/24 | 0 (0) | 24 asr | 54 |
| LE NEZ TORDU – de bonne humeur | fr | BY-NC-SA | 266 | 0.11 | 95.5 % | 95.9 % | 0/40 | 2 (0) | 40 asr | 66 |
| Dienstag ist Damensauna – Der Baum | de | BY-NC-ND | 222 | 0.64 | 92.3 % | 92.3 % | 4/46 | 8 (4) | 46 asr | 85 |
| D. – Der Musiker | de | BY-NC-SA | 354 | 0.15 | 90.7 % | 90.7 % | 15/94 | 7 (5) | 88 asr, 4 estimated, 2 reprompt | 174 |
| Frank Wingenbach – dich gehen zu sehn. | de | BY-NC-ND | 181 | 0.17 | 87.3 % | 89.5 % | 3/22 | 0 (0) | 22 asr | 70 |
| Die Partysahnen – Die Revolution gehört Dir! | de | BY-NC-SA | 156 | 0.53 | 73.1 % | 73.7 % | 7/28 | 7 (5) | 25 asr, 2 reprompt, 1 estimated | 101 |
| BRUNELA CROCHENCI – Diosa de la noche | es | BY-NC-SA | 201 | 0.52 | 78.6 % | 79.6 % | 5/29 | 4 (4) | 25 asr, 4 reprompt | 270 |
| CRIATURA – Disparan | es | BY-NC-SA | 194 | 4.64 | 76.8 % | 75.3 % | 10/40 | 9 (5) | 40 asr | 72 |
| Patrouille – Drei Nüsse | de | BY-NC-ND | 519 | 0.09 | 97.1 % | 97.5 % | 5/56 | 1 (0) | 56 asr | 117 |
| NANDOMALO – Esencia | es | BY-SA | 334 | 0.11 | 95.5 % | 95.2 % | 5/51 | 1 (0) | 51 asr | 97 |
| LOS ROMBOS – Fantasma | es | BY-SA | 88 | 1.43 | 71.6 % | 73.9 % | 6/17 | 3 (3) | 15 asr, 1 estimated, 1 reprompt | 159 |
| Durch Dick und Dünn – Freifliegen | de | BY-SA | 135 | 0.17 | 80.0 % | 80.7 % | 17/32 | 0 (0) | 32 asr | 75 |
| Andreas Jachmann – Fußabdrücke | de | BY-NC-ND | 154 | 0.19 | 80.5 % | 79.2 % | 10/22 | 0 (0) | 22 asr | 72 |
| JhoyKing – Guayateo | es | BY-NC-ND | 340 | 0.47 | 90.0 % | 89.7 % | 7/52 | 8 (4) | 49 asr, 2 estimated, 1 reprompt | 145 |
| BRUNELA CROCHENCI – Háblame - (Talk to me) | es | BY-NC-SA | 106 | 5.80 | 71.7 % | 74.5 % | 8/32 | 11 (1) | 32 asr | 43 |
| Frank Wingenbach – Ich kann dich nicht vergessen | de | BY-NC-ND | 198 | 0.13 | 90.9 % | 92.4 % | 14/40 | 0 (0) | 40 asr | 62 |
| SUNDAYERS – Intentando Destacar | es | BY-NC-SA | 224 | 0.37 | 80.8 % | 80.8 % | 9/30 | 4 (3) | 26 asr, 3 reprompt, 1 estimated | 212 |
| Zeugen der Leere – Intro [Pulsschlag] | de | BY-NC-ND | 82 | 0.26 | 85.4 % | 85.4 % | 1/12 | 4 (1) | 12 asr | 54 |
| Jonny M – Keine Lust | de | BY-SA | 528 | 14.28 | 58.5 % | 58.5 % | 54/122 | 46 (30) | 96 asr, 1 reprompt, 25 estimated | 267 |
| FLO – l'abandon | fr | BY | 341 | 0.17 | 89.4 % | 90.6 % | 4/43 | 4 (2) | 40 asr, 1 estimated, 2 reprompt | 188 |
| RICH DON JERI – La rumba del coronavirus | es | BY-ND | 224 | 1.29 | 76.3 % | 76.3 % | 32/75 | 29 (23) | 73 asr, 2 estimated | 113 |
| KPTN – Le musée d'air contemporain | fr | BY | 256 | 4.61 | 84.0 % | 84.0 % | 9/48 | 12 (1) | 48 asr | 53 |
| LAW' – Les files d'attente | fr | BY-SA | 319 | 1.03 | 71.8 % | 71.8 % | 12/47 | 7 (7) | 43 asr, 4 estimated | 100 |
| CYBERATTACK – Libre | fr | BY-ND | 397 | 0.11 | 96.0 % | 96.5 % | 2/48 | 5 (0) | 48 asr | 127 |
| LAW' – Mère nature | fr | BY-SA | 254 | 2.48 | 71.7 % | 71.7 % | 10/36 | 6 (3) | 36 asr | 67 |
| KOBZX2Z – Mes Larmes | fr | BY-NC-ND | 388 | 0.55 | 80.9 % | 80.2 % | 9/65 | 16 (6) | 2 estimated, 63 asr | 108 |
| CORRIENTES – ¡Óyeme tiburón! | es | BY-NC-SA | 210 | 0.15 | 92.9 % | 92.4 % | 4/54 | 2 (1) | 54 asr | 58 |
| YUANAN “J.A.R” – Miedo | es | BY-NC-SA | 268 | 0.14 | 90.7 % | 92.5 % | 5/33 | 4 (1) | 1 reprompt, 32 asr | 105 |
| Heiko Sunfyah – Musik | de | BY-NC-ND | 237 | 0.11 | 92.4 % | 93.7 % | 7/36 | 0 (0) | 36 asr | 84 |
| JAVIER GÓMEZ BELLO – Palabras | es | BY-NC-SA | 212 | 4.03 | 68.4 % | 69.3 % | 9/24 | 4 (0) | 24 asr | 56 |
| AZUL – Pas que tes pas | fr | BY-NC-SA | 268 | 0.18 | 89.9 % | 89.9 % | 1/31 | 0 (0) | 31 asr | 62 |
| MIDNIGHT PRÉFOU – Pluie d'entre deux saisons | fr | BY-NC-ND | 134 | 2.30 | 53.0 % | 52.2 % | 12/32 | 8 (7) | 28 asr, 1 reprompt, 3 estimated | 188 |
| CABBAC – POIGNEE DE MAIN | fr | BY-NC-ND | 146 | 0.25 | 74.7 % | 76.7 % | 12/30 | 1 (1) | 30 asr | 49 |
| NACIDOS DE LA TIERRA – Quiero y Puedo | es | BY-ND | 640 | 0.08 | 97.8 % | 98.6 % | 1/73 | 1 (0) | 73 asr | 138 |
| Abendblau – Schnodderdodder | de | BY-NC-ND | 291 | 0.39 | 90.7 % | 92.8 % | 9/43 | 1 (0) | 43 asr | 103 |
| WASARU – Séculaire feat. Nÿme | fr | BY-NC-SA | 345 | 0.27 | 95.7 % | 95.4 % | 5/40 | 4 (3) | 39 asr, 1 estimated | 77 |
| REH-TORTE – Sehnsucht-Unplugged | de | BY-NC-ND | 151 | 0.12 | 95.4 % | 93.4 % | 2/26 | 0 (0) | 26 asr | 68 |
| Shaney 23 – SHANEY 23 feat. G1NA G. x In den Strassen | de | BY-NC-ND | 448 | 24.82 | 48.7 % | 49.1 % | 37/72 | 50 (32) | 48 asr, 24 estimated | 103 |
| LIVING CAMBOYA – Sin miedo | es | BY-NC-SA | 171 | 0.23 | 74.3 % | 73.1 % | 17/28 | 0 (0) | 28 asr | 54 |
| FABIOS LA NUEVA EXPRESION DE LA CANCIÓN – te amo | es | BY-NC-SA | 169 | 0.16 | 81.1 % | 79.3 % | 14/29 | 0 (0) | 29 asr | 44 |
| WILSON WAY – Te Recuerdo | es | BY-SA | 458 | 0.12 | 96.1 % | 96.5 % | 2/51 | 1 (1) | 51 asr | 84 |
| DON VALDES – Tu sais Man | fr | BY-NC-SA | 505 | 0.89 | 81.8 % | 82.0 % | 11/60 | 16 (5) | 59 asr, 1 reprompt | 88 |
| LÖHSTANA DAVID – Une Vie De Roi | fr | BY-NC-SA | 311 | 0.14 | 91.0 % | 91.0 % | 1/44 | 2 (0) | 44 asr | 84 |
| FAFARULO CALABAZA – Vente | es | BY-NC | 505 | 0.14 | 94.3 % | 95.0 % | 12/101 | 3 (1) | 101 asr | 108 |
| Doromusis – Veränderung | de | BY-NC-ND | 211 | 5.15 | 66.8 % | 67.3 % | 17/36 | 7 (7) | 30 asr, 5 estimated, 1 reprompt | 54 |
| RAOUL DE QSM – Le royaume des glous glous | fr | BY-NC-ND | 202 | 0.10 | 97.5 % | 97.5 % | 2/24 | 1 (1) | 24 asr | 52 |
| LÉYÀK – En liberté | fr | BY-NC-SA | 266 | 0.19 | 91.0 % | 89.5 % | 5/42 | 0 (0) | 42 asr | 66 |

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

**The run at `97a552c`.** `bench/jamendolyrics.py --rerun` synced every song again from the align step
(`sync --from align`), with three songs at once: the whisper runs were reused, and everything after them ran as in a
first sync. Re-listening heard 28 of the 56 gap windows again, in 13 songs, because the lines next to them now start
later. The new line starts also changed the automatic tempo in 15 songs: `sync` picks among tempo candidates by how
many gaps between line starts are whole bars. Five songs went to double or half the tempo and ten to another
candidate (for example 105 → 140 BPM). Word timing in those 15 songs barely moved: 2,650 words within 0.3 s, against
2,637 with the old tempo.

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
  that other processes used. With `--jobs` above 1, a song's seconds include sharing the CPU with the songs that
  sync next to it, so they compare only between runs with the same `--jobs`.

## Limits

- **One dataset.** These are 79 songs by independent artists on Jamendo, released under CC licences: pop, rock,
  hip-hop, electronic and more. Their mixes may differ from chart music or from AI-generated songs (Suno), where
  song2mv is mostly used. Korean, song2mv's first language, is not in the set; section 2 has what the first-word
  change did on our Korean test song.
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
- **The first-word length was chosen on these songs.** It was picked on the English songs, so the 59 held-out
  songs are the ones to trust. It has not been measured on another dataset, and on our Korean test song its effect
  is unclear. `bench/whatif_first_word.py` reuses the cached runs and changes only the timing of whisper words: lines
  no run placed keep what `sync`'s re-listening gave them.
- **No tempo annotations.** Whether a song's beat grid has the right tempo is not measured here, only the word
  times after snapping to it.
- **Likely causes are a heuristic** read from the work folder, not a diagnosis by ear.

## Reproduce

From the repository, with the `sync` extra installed in `.venv`:

```bash
.venv/bin/python -I bench/jamendolyrics.py --lang en        # downloads ~400 MB once, then syncs the 20 English songs
.venv/bin/python -I bench/jamendolyrics.py                  # all 79 songs (about 2¼ hours here); finished songs are skipped
.venv/bin/python -I bench/jamendolyrics.py --jobs 3         # the same, three songs at once: about 1.8× faster here
.venv/bin/python -I bench/jamendolyrics.py --no-run --markdown   # the tables on this page
.venv/bin/python -I bench/whatif_first_word.py              # sync vs the first-word rule off (seconds; --factor for other lengths)
.venv/bin/python -I bench/jamendolyrics.py --rerun          # after a change to song2mv: from the align step, reusing whisper runs
```

Everything goes to `~/.cache/song2mv-bench` (`--cache` to change it): the dataset, one `sync` work folder per song,
and `results/jamendolyrics.json` with every line's numbers. A song's work folder is an ordinary `sync` work folder,
so `song2mv click runs/<song> --from A --to B --words` plays any line discussed here.
