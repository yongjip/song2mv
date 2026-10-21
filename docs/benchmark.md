# Benchmark: lyric timing on JamendoLyrics

How close does `song2mv sync` put each word to where it is sung? Until now its accuracy had been measured on one
Korean song, against a reference that was itself mostly whisper output. This page measures it against people:
JamendoLyrics MultiLang, the standard lyrics-alignment benchmark, has 79 songs in four languages whose word start
and end times were annotated by hand.

Measured on 2026-10-20 with song2mv 0.1.0 and default settings, three times: at `d368734`; at `97a552c`, which starts
each line where it is sung instead of in the pause before it ([section 2](#2-the-first-word-of-a-line)); and at
`69c4d29`, which keeps a repeated chorus on its own audio ([section 1](#1-repeated-sections-placed-on-another-copy)).
The numbers are for `69c4d29` unless they say otherwise; [Before and after](#before-and-after) compares it with
`97a552c`. To reproduce, run [`bench/jamendolyrics.py`](../bench/jamendolyrics.py) (see [Reproduce](#reproduce)).

## In short

- **Most words land close, and the large failures are nearly gone.** Across all 79 songs, the median word is 0.087 s
  from where people put it, 88.9 % of words are within 0.3 s and 96.5 % within 1 s. The mean error is 0.26 s. Twelve
  lines in 8 songs still start more than 10 s off, and `check_by_ear` lists all of them; most are vocalisations
  ("oh ah ah", "ooh") that whisper does not write down.
- **Repeated sections no longer take each other's audio.** When a chorus came back word for word, the matching step
  could pair one copy in the lyric sheet with the other copy in the audio, and the lines in between were left with
  no audio. At `97a552c` that put 214 lines more than 10 s off, and their words carried 86 % of the summed error.
  `sync` now also aligns each whisper run over the whole song and keeps lines in the sheet's order. Lines starting
  more than 1 s off fell from 402 to 177, words within 0.3 s rose from 82.8 % to 88.9 %, and the mean error from
  2.62 s to 0.26 s. No song got clearly worse: three have one or two fewer words within 0.3 s, and 33 have more.
- **Lines start where they are sung.** Whisper leaves no gap between words, so the pause before a line becomes part
  of the line's first word: measured per run, that word starts a median 0.34 s early while its end is only 0.07 s
  early. Since `97a552c`, `sync` cuts that whisper word to the run's median word duration. At `d368734` half of all
  lines started more than 0.3 s off, mostly for this reason; now 15.9 % do.
- **`check_by_ear` lists 59 % of the lines that are more than 1 s off** (64 % before), and a third of the lines it
  lists really are (45 % before). Both fell because what it found best is gone: lines squeezed in after a misplaced
  chorus. The lines more than 1 s off that it misses halved, from 143 to 72. It now also lists lines out of the lyric
  sheet's order; 4 are left.
- **Compared with dedicated aligners**, song2mv's share of words within 0.3 s, averaged per song (87 %), falls
  between older systems (59–73 %) and the character-based models of the paper (89–94 %). Its average error per song
  (0.30 s) is now in the range of those models (0.18–0.35 s); before `69c4d29` it was 2.2 s.
- **Snapping to the beat grid costs little at 0.3 s and more at 0.1 s.** Without snapping, 89.2 % of words are
  within 0.3 s (88.9 % with it) and 60.2 % are within 0.1 s (55.0 % with it).
- **Runtime** is 99 s per song on average, 0.46 × the song's length, on an M4 Pro CPU with other apps using about
  1.4 cores (measured at `d368734`). The later changes add under 2 s: matching the runs to the sheet now takes a
  median 0.36 s per song instead of 0.09 s.

## Results per language

Word numbers are pooled over all words of a language. AAE and PCO follow the published convention, averaged per
song (see [Method](#method)).

| | English | German | Spanish | French | all 79 |
|---|---:|---:|---:|---:|---:|
| songs / words | 20 / 5,693 | 20 / 5,157 | 20 / 5,269 | 19 / 5,461 | 79 / 21,580 |
| words within 0.1 s | 59.6 % | 61.7 % | 50.8 % | 47.9 % | 55.0 % |
| words within 0.3 s | 88.1 % | 91.6 % | 90.3 % | 85.9 % | **88.9 %** |
| words within 1 s | 95.7 % | 98.3 % | 98.0 % | 94.3 % | 96.5 % |
| median / mean absolute error, s | 0.077 / 0.24 | 0.076 / 0.16 | 0.097 / 0.18 | 0.103 / 0.44 | **0.087** / 0.26 |
| median signed error, s (− = early) | −0.024 | −0.059 | −0.060 | −0.081 | −0.055 |
| unsnapped: words within 0.1 / 0.3 s | 63.5 / 88.3 % | 64.1 / 91.9 % | 57.9 / 90.9 % | 55.0 / 85.9 % | 60.2 / 89.2 % |
| AAE: mean over songs / median over songs, s | 0.26 / 0.17 | 0.18 / 0.14 | 0.24 / 0.15 | 0.52 / 0.19 | 0.30 / 0.16 |
| PCO: within 0.3 s, mean over songs | 86.2 % | 89.6 % | 87.6 % | 84.8 % | 87.1 % |
| lines | 868 | 871 | 881 | 763 | 3,383 |
| lines starting > 0.3 s off (early / late) | 15.1 % (74 / 57) | 15.2 % (101 / 31) | 18.3 % (70 / 91) | 14.9 % (45 / 69) | 15.9 % (290 / 248) |
| lines starting > 1 s off | 6.6 % | 1.7 % | 5.4 % | 7.5 % | 5.2 % |
| line sources: whisper / re-heard / estimated | 850 / 10 / 8 | 858 / 8 / 5 | 867 / 10 / 4 | 737 / 13 / 13 | 3,312 / 41 / 30 |
| `sync` seconds per song (× song length), at `d368734` | 96 (0.44) | 96 (0.42) | 107 (0.50) | 98 (0.49) | 99 (0.46) |

Every song ran without an error. The tokens matched the annotations exactly in all 79 songs, and the rebuild
reproduced every `lyrics.json`.

### Before and after

`97a552c` → `69c4d29`, the change that keeps a repeated chorus on its own audio (see
[section 1](#1-repeated-sections-placed-on-another-copy)). The change before it, `d368734` → `97a552c`, is in
[section 2](#2-the-first-word-of-a-line).

| | English | German | Spanish | French | all 79 |
|---|---:|---:|---:|---:|---:|
| words within 0.1 s | 53.7 → 59.6 % | 53.0 → 61.7 % | 49.4 → 50.8 % | 47.0 → 47.9 % | 50.8 → 55.0 % |
| words within 0.3 s | 80.4 → 88.1 % | 79.6 → 91.6 % | 87.6 → 90.3 % | 83.9 → 85.9 % | **82.8 → 88.9 %** |
| words within 1 s | 87.3 → 95.7 % | 85.6 → 98.3 % | 94.6 → 98.0 % | 92.1 → 94.3 % | 89.9 → 96.5 % |
| mean absolute error, s | 3.79 → 0.24 | 4.86 → 0.16 | 0.87 → 0.18 | 0.96 → 0.44 | 2.62 → 0.26 |
| lines starting > 0.3 s off | 21.3 → 15.1 % | 28.4 → 15.2 % | 21.2 → 18.3 % | 16.8 → 14.9 % | 22.1 → 15.9 % |
| … of them early / late | 70 / 115 → 74 / 57 | 93 / 154 → 101 / 31 | 94 / 93 → 70 / 91 | 48 / 80 → 45 / 69 | 305 / 442 → 290 / 248 |
| lines starting > 1 s off | 113 → 57 | 139 → 15 | 78 → 48 | 72 → 57 | **402 → 177** |
| lines starting > 10 s off | 60 → 1 | 114 → 0 | 18 → 1 | 22 → 10 | **214 → 12** |
| estimated lines | 29 → 8 | 70 → 5 | 11 → 4 | 16 → 13 | 126 → 30 |
| `check_by_ear`: lines listed | 192 → 115 | 162 → 45 | 94 → 58 | 122 → 103 | 570 → 321 |
| … recall: lines > 0.3 / > 1 s off it lists | 55.1 / 71.7 → 42.7 / 68.4 % | 43.3 / 70.5 → 12.9 / 60.0 % | 28.9 / 50.0 → 19.3 / 39.6 % | 46.1 / 56.9 → 47.4 / 66.7 % | 43.1 / 64.4 → 29.4 / 59.3 % |
| … precision: listed lines > 0.3 / > 1 s off | 53.1 / 42.2 → 48.7 / 33.9 % | 66.0 / 60.5 → 37.8 / 20.0 % | 57.4 / 41.5 → 53.4 / 32.8 % | 48.4 / 33.6 → 52.4 / 36.9 % | 56.5 / 45.4 → 49.2 / 32.7 % |
| … lines > 1 s off it misses | 32 → 18 | 41 → 6 | 39 → 29 | 31 → 19 | 143 → 72 |
| lines off the lyric order | 32 → 2 | 31 → 0 | 12 → 0 | 13 → 2 | 88 → 4 |
| PCO / AAE, mean over songs | 80.2 % / 3.31 → 86.2 % / 0.26 s | 82.1 % / 3.01 → 89.6 % / 0.18 s | 84.2 % / 1.22 → 87.6 % / 0.24 s | 82.6 % / 1.11 → 84.8 % / 0.52 s | 82.3 % / 2.18 → 87.1 % / 0.30 s |

Every language gains; German most, where the worst failures were. French gains least: 10 of the 12 lines still more
than 10 s off are French (section 1). 33 songs have more words within 0.3 s. Three have one or two fewer: HILA – Give
Me The Same (279 → 277 of 322), CHRISTMAS AVEC TOI (186 → 185, one more line starting more than 0.3 s off) and Miedo
(243 → 242, four words a 16th note later or earlier). Two more have one more line starting more than 1 s off but more
words within 0.3 s: Embers (95 → 99) and Intentando Destacar (181 → 190). Apart from Miedo's four words, the lines
that got worse are lines one run placed or that were re-heard, and `check_by_ear` lists them. On our Korean test song
(not in this dataset) nothing changed: the merged runs and every word time are the same as at `97a552c`.

### Compared with published aligners

The [ICASSP 2023 paper](https://arxiv.org/abs/2306.07744) that introduced the dataset reports these numbers (its
Table 3: AAE in seconds per language; PCO only over all four languages):

| system | trained on | EN | ES | DE | FR | all: AAE | all: PCO |
|---|---|---:|---:|---:|---:|---:|---:|
| **song2mv sync** (whisper small × 3, snapped) | — | 0.26 | 0.24 | 0.18 | 0.52 | 0.30 | 87 % |
| M5 (phonemes) | English | 0.16 | 1.72 | 1.22 | 1.36 | 1.11 | 59 % |
| GYL (Gupta et al.) | English | 0.22 | 0.97 | 0.62 | 0.78 | 0.65 | 73 % |
| M6 (characters) | English | 0.15 | 0.37 | 0.41 | 0.47 | 0.35 | 89 % |
| M6 | all four | 0.39 | 0.22 | 0.26 | 0.28 | 0.29 | 91 % |
| M6, language-conditioned | all four | 0.21 | 0.13 | 0.16 | 0.19 | 0.18 | 94 % |

These systems are aligners trained for this task, and their numbers are taken from the paper. song2mv uses
general speech recognition, matches the text it hears to the lyric sheet, and then snaps to a beat grid (unsnapped,
AAE is 0.29 s and PCO is 87.4 %). AAE is the average error per song, so a few lines tens of seconds off dominate it.
In the median song, song2mv's average error is 0.16 s. At `97a552c`, AAE was 2.18 s and PCO 82 %; at `d368734`,
2.22 s and 77 %.

## Where the errors come from

Each line that starts more than 0.3 s off gets a likely cause from what its work folder says. The number listed by
`check_by_ear` is in brackets.

| lines starting > 0.3 s off, likely cause | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| first word early, the rest of the line on time | 41 (6) | 90 (1) | 57 (1) | 28 (5) | 216 (13) |
| first word late, the rest on time | 34 (5) | 21 (2) | 56 (6) | 37 (8) | 148 (21) |
| whole line late | 18 (11) | 5 (1) | 31 (11) | 16 (13) | 70 (36) |
| whole line early | 19 (15) | 5 (2) | 4 (0) | 9 (5) | 37 (22) |
| re-heard gap | 9 (9) | 7 (7) | 9 (9) | 10 (10) | 35 (35) |
| estimated (no run and no re-listening placed it) | 8 (8) | 4 (4) | 4 (4) | 13 (13) | 29 (29) |
| placed on another occurrence of the same words | 2 (2) | 0 (0) | 0 (0) | 1 (0) | 3 (2) |

At `97a552c` the rows read 202, 136, 96, 58, 35, 122 and 98 lines. The lines that were estimated or on another
occurrence are now mostly placed right, and some of them now have the first-word errors of section 2: that is why
the first two rows grew a little.

### 1. Repeated sections placed on another copy

At `97a552c`, 214 lines started more than 10 s off. They sat in 37 stretches in 25 songs, and five songs held 162 of
them. Their 1,214 words (6 % of all words) carried 86 % of the summed error. The longest stretches, and what became of
them:

| song | lines | how far off at `97a552c`, s | runs agreeing (whisper lines) | listed by `check_by_ear` then | at `69c4d29`: lines > 1 s off (worst) |
|---|---|---:|---|---:|---:|
| Jonny M – Keine Lust (de) | s-53 to s-61 (9) | +46 | 2 runs: 9 | 0 | 0 (−0.35 s) |
| Jonny M – Keine Lust (de) | s-77 to s-116 (40) | +10 to +46 | 2 runs: 10, 1 run: 3, 3 runs: 1 (25 estimated, 1 re-heard) | 29 | 0 (−0.52 s) |
| Moon I mean – Wrong Concept (en) | s-11 to s-38 (28) | +11 to +84 | 1 run: 6, 3 runs: 5, 2 runs: 1 (16 estimated) | 22 | 2 (−2.33 s) |
| Shaney 23 – In den Strassen (de) | s-17 to s-21 (5) | +70 to +128 | 2 runs: 4, 1 run: 1 | 1 | 0 (−0.46 s) |
| Shaney 23 – In den Strassen (de) | s-41 to s-68 (28) | +10 to +64 | 1 run: 5 (23 estimated) | 28 | 0 (−0.61 s) |
| Automatisch Gekommen – 1 Freak (de) | s-30 to s-54 (24, in 2 stretches) | +16 to +39 | 1 run: 9, 2 runs: 4 (11 estimated) | 20 | 0 (+0.19 s) |
| Rxbyn – Bad Side (en) | s-14 to s-26 (13) | +44 to +74 | 2 runs: 7, 1 run: 5 (1 estimated) | 6 | 0 (−0.37 s) |
| Rxbyn – Bad Side (en) | s-55 to s-66 (12) | −18 to +30 | 1 run: 10 (2 estimated) | 12 | 6 (+7.03 s) |
| Dream Tabù – Besando Sapos (es) | s-52 to s-59 (8) | +11 to +33 | 3 runs: 3, 2 runs: 2, 1 run: 1 (2 estimated) | 3 | 0 (+0.48 s) |
| LUNABLIND – Vision (en) | s-26 to s-30 (5) | −65 | 2 runs: 5 | 0 | 2 (−2.24 s) |
| KPTN – Le musée d'air contemporain (fr) | s-32 to s-36 (5) | +35 | 2 runs: 5 | 0 | 0 (−0.18 s) |
| Doromusis – Veränderung (de) | s-23 to s-27 (5) | +20 to +43 | 3 runs: 2 (3 estimated) | 3 | 2 (+7.13 s) |

What happened, in Rxbyn – Bad Side: all three runs heard both choruses, but runs 1 and 2 heard the first one a
little worse ("it's meant to be" for "meant to be", "come with me" for "so come with me"). They matched the lyric
sheet's first chorus (s-15 to s-26) to the second chorus's audio, 74 s later. Run 3 got it right, but with three runs
`merge_runs` takes the median start, so the two wrong runs outvoted it. Jonny M – Keine Lust shows the cascade: two
runs moved a block 46 s late, and the 25 lines after it had no song left. No run placed them, so `estimate` squeezed
them into the last seven seconds, 10 to 44 s off. LUNABLIND – Vision is the reverse: the sheet's first copy reads
"i could not breathe", its second "i cannot breathe", whisper heard "i cannot breathe" both times, and the sheet's
second copy took the first copy's audio, 65 s early.

Why: `lib.align` matched the whole sheet against each run's transcription with `difflib.SequenceMatcher`, which
first anchors on the longest common block. When a chorus repeats word for word, the copy a run heard best makes the
longest block, and difflib pairs it with the first of the equal copies in the sheet (or the sheet's copy with the
first sung one). Every match after it must then come later still. The runs had heard the audio in between; the
matching step left it unused. `merge_runs` dropped a run whose start was more than 1 s from the others, but not two
runs that agreed, and nothing checked that a line's time fits between its neighbours'.

**What `sync` does about it** (since `69c4d29`, in [`lib.py`](../src/song2mv/timing/lib.py) and
[`align.py`](../src/song2mv/timing/align.py)):

1. *Two alignments per run.* Each run is also aligned to the sheet over the whole song by dynamic programming:
   +1 for a matched letter, −1 for a letter aligned with another, −1.25 to leave a stretch of letters unmatched on
   either side and −0.05 for each further letter. That alignment counts the matches of the whole song, so one copy of
   a chorus cannot take the other's audio without losing everything in between. Between the letters both alignments
   match the same way, each stretch takes the one with more letters in runs of three or more, difflib's on a tie.
2. *A line is sung in one place.* Where a line's matched letters lie more than 10 s apart in a run, only the larger
   part is kept. (In the annotations, no two words of a line are more than 9.1 s apart.) Two letters that happen to
   match a word 40 s away had moved one line's start that far.
3. *Lines in lyric order.* After merging, a line off the longest chain of lines that keeps the sheet's order is
   merged again from only the runs that placed it between its neighbours on the chain, if any did. A line may start up
   to 2 s before the one above it: on our Korean test song a backing line written after another is sung 1.0 s before
   it. A line that no run placed in order stays where it is, and `check_by_ear` lists it.

The choices were made with a what-if on the cached runs of `97a552c` (re-heard gaps reused, not heard again):

| matching each run to the sheet | words within 0.3 s | lines > 1 s off | lines > 10 s off | songs with fewer words within 0.3 s, or more lines > 0.3 s off |
|---|---:|---:|---:|---:|
| difflib alone (`97a552c`) | 82.8 % | 402 | 214 | – |
| the global alignment alone | 88.7 % | 193 | 18 | 22 |
| both, more matched letters wins (runs of two or more) | 88.7 % | 192 | 21 | 8 |
| both, runs of three or more; one place per line; lyric order (`69c4d29`) | 88.9 % | 180 | 14 | 4 |
| `69c4d29`, measured (`sync`, gaps heard again) | 88.9 % | 177 | 12 | 3 |

Alone, the global alignment moved lines where whisper heard fewer copies of a repeated line than the sheet has: it
groups the unheard lines together, so of "oh burn out man" and four times "burn out man", heard four times without
the "oh", it gave the four hearings to the last four lines. difflib gives them to the first four, which is usually
right, and keeping difflib on ties keeps that. Counting runs of two letters let the global alignment win stretches on
coincidences ("qui est" matched inside "questions"). For a line that no run placed in order, two more things were
tried. Aligning it again to only the words each run heard between its neighbours placed none of them. Leaving it
unplaced, so that re-listening or `estimate` would place it, was worse: in a long instrumental gap `estimate` puts the
line right after the line before, and one line went from 9 s late to 55 s early.

**What is left.** Twelve lines in 8 songs start more than 10 s off, and `check_by_ear` lists all of them. Seven are
vocalisations whisper does not write down ("oh ah ah oh ah ah", "ah ahha ah ah", "ooh ooh ooh ooh", "ah no no no"),
placed by a stray partial match or by `estimate`; two are a count-in and a shout ("um dois três quatro" in a French
song, "here we go"). The other three are a two-word line re-heard in the wrong place, a line two runs placed
differently (the run that matched more letters was wrong) and a line that repeats the one before it, which every
run matched to less than half. The stretch of Rxbyn – Bad Side that is still off (s-55 to s-66) is a bridge where the
sheet alternates chorus lines with "a taste of my bad side" lines about two seconds apart. The runs wrote down only
the "taste of my bad side" lines, whose words come several times there.

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

The change did what the what-if predicted: at `97a552c`, 22.1 % of all lines started more than 0.3 s off, against
22.4 % predicted.
On the same inputs, `sync` gives the what-if's lines exactly, except where a line's first word matched a whisper word
of zero length: looking whisper words up by time, the what-if cut the word before it (one song's lines differ). The
rest of the difference comes from re-listening: lines next to a gap now start later, so 28 of the 56 gap windows
moved and were heard again, in 13 songs.

The cost is that more lines start late (365 → 442 of 3,383): some first words really are sung long, and the cut
moves their start into the word. (At `69c4d29` 248 lines start late: many of the 442 were lines of section 1.) The
change did not touch the repeated-section failures, so the mean error barely moved (2.66 → 2.62 s).
`bench/whatif_first_word.py` now compares `sync` with the rule off, or at another length (`--factor`).

**On our Korean test song** (a Suno song, not in this dataset), the effect is unclear. The change moved 39 of its 85
line starts later. The song's only reference timing is itself whisper output from before the change, so it favours
the old starts: 68 line starts are within a 16th note of it before the change, 44 after. The separated vocal stem
does not settle it either. In 29 of the 39 lines, the stretch the cut removed is as loud as the singing, so these
lines follow the one before without a pause. Yet the stronger syllable attack is at the new start in 17 lines, at
the old one in 7, and unclear in 17. One line is clearly worse: whisper's word for a chanted four-syllable word
lasted 1.66 s, the cut left 0.54 s, and the line now starts 1 s late. Lines like that need a `manual` value until
`sync` can tell a pause from a long sung word.

### 3. Lines nothing placed

The 30 estimated lines (126 at `97a552c`) are almost all wrong: 29 start more than 0.3 s off, with a median of 2.9 s
(19 s at `97a552c`, when most of them were the squeezed lines of section 1). The 41 re-heard lines did better but are
still mostly off: 35 start more than 0.3 s off, with a median of 1.3 s. `check_by_ear` lists all of both kinds.

How many runs agreed says something about whether a whisper line is right. Of lines placed by three runs, 11 % start
more than 0.3 s off; of those placed by two, 24 %; of those placed by one, 38 %. At `97a552c` it was 12, 32 and 40 %,
and at `d368734` 44, 59 and 56 %: the first-word error was systematic, and every run made it.

## How well `check_by_ear` points at wrong lines

| | en | de | es | fr | all |
|---|---:|---:|---:|---:|---:|
| lines listed | 115 | 45 | 58 | 103 | 321 |
| precision: listed lines that start > 0.3 s / > 1 s off | 48.7 / 33.9 % | 37.8 / 20.0 % | 53.4 / 32.8 % | 52.4 / 36.9 % | 49.2 / 32.7 % |
| recall: lines > 0.3 s off that are listed | 42.7 % | 12.9 % | 19.3 % | 47.4 % | 29.4 % |
| recall: lines > 1 s off that are listed | 68.4 % | 60.0 % | 39.6 % | 66.7 % | **59.3 %** |
| lines > 1 s off that are not listed | 18 | 6 | 29 | 19 | 72 |
| lines off the lyric order (listed since `69c4d29`) | 2 | 0 | 0 | 2 | 4 |

`check_by_ear` lists re-heard and estimated lines, lines only one of several runs placed, and since `69c4d29` lines
out of the lyric sheet's order (each line may start up to 2 s before the one above it). At `97a552c`, 88 lines were
out of that order, and 36 of them were not on its list of 570 (28 of those were more than 1 s off). Now the merge
keeps lines in order, and 4 are left. With the large failures gone, most of what it lists are lines placed by one
run (250 lines, 38 % of them more than 0.3 s off), so its precision fell; it misses half as many lines more than 1 s
off as before (72, from 143). What it cannot see is a first word that every run times the same wrong way, early or
sung long: 364 lines start more than 0.3 s off while the rest of the line is on time, and 34 of them are listed.

`check_by_ear` now also lists a line with a word no run timed between words more than 1 s apart per word. `sync`
spreads such a word evenly between the timed words around it. Closer together than that, it is a fair guess: 2–8 %
of those words end up more than 1 s off. Further apart, half of them do (11 of 21): the gap is a held note, or one of
the words around it is wrong. On these runs that adds 10 lines (321 → 331, in 7 songs); in 8 of them the guessed
word is more than 0.3 s off, in 6 more than 1 s. No word time changes, and on the same runs the table's recall for
lines that start more than 1 s off goes from 59.7 to 61.9 %, at the same precision. Listing every line with a word no run timed would have added 495
lines, 8 % of them with that word more than 1 s off, and a word more than 0.5 s from every run's nearest word with
the same letters fires on 42 % of whisper lines, mostly because whisper spells the word differently.

## What the numbers point to

In order of how many wrong lines each one concerns (they overlap):

1. **Tell a pause from a long sung word.** Most wrong line starts are now a line's first word alone: 364 of the 538
   lines that start more than 0.3 s off have the rest of the line on time, 216 early and 148 late. Cutting the first
   whisper word of each line (done in `97a552c`) fixed most of the early ones, and some first words that really are
   sung long now start late. On our Korean test song its effect is unclear. A vocal-onset check near the cut could
   keep the first words that really are sung long.
2. **Lines one run placed.** They are 250 lines and most of what `check_by_ear` lists, and 94 of them (38 %) start
   more than 0.3 s off. More runs (`--runs 5`) might make them fewer; that was not measured.
3. **Lines whisper does not write down.** Vocalisations and shouts are most of the lines still more than 10 s off.
   No run matches them, so a stray partial match or an even spread between the neighbours places them. Re-listening
   with the line as the prompt is right for few of them (35 of 41 re-heard lines start more than 0.3 s off). Looking
   for vocal onsets between the neighbouring lines could place them better than spreading them evenly.
4. **Snapping is not the problem.** It costs 0.3 points at 0.3 s and 5.2 points at 0.1 s, and the beat grid is the
   point of song2mv.

Not an error this page can measure, but one it showed: **the tempo pick depends on line starts.** `sync` picks among
tempo candidates by how many gaps between line starts are whole bars. Moving line starts by about a third of a
second changed the tempo in 15 of the 79 songs at `97a552c` (see [Method](#method)), and at `69c4d29`, when the
misplaced lines of Automatisch Gekommen – 1 Freak moved back, its tempo went from 80 to 133.3 BPM. Without tempo
annotations, which tempo is right is unknown.

## Runtime

All 79 songs took 131 minutes of `sync` time, run one at a time: 99 s per song on average (43–270 s), 0.46 s per
second of audio. Three whisper runs are most of it, and the slowest songs had many words or several re-heard gaps.
`sync` used about 5.7 cores on average. Other processes used 1.4 cores on average (0.5–3.3 per song), mostly the
macOS window server and a Codex app, so times on an idle machine would be somewhat lower.

These times are from the run at `d368734`. The runs at `97a552c` and `69c4d29` reused the whisper runs, so their
seconds are not a runtime measurement. Cutting first words adds one more alignment of the lyric sheet per whisper run,
and since `69c4d29` each alignment is made twice, by difflib and over the whole song. Merging a song's three runs, on
the cached runs of all 79 songs one after another, took a median 0.36 s instead of 0.09 s, and 1.86 s instead of
0.56 s for the longest lyric sheet (640 words; at `d368734` it was 0.24 s). The global alignment needs one byte of
memory per pair of letters, 7 MB for that song; above 40 million pairs, `sync` uses difflib alone.

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
| HILA – Give Me The Same | en | BY-ND | 322 | 0.21 | 86.0 % | 86.3 % | 13/58 | 8 (3) | 56 asr, 2 reprompt | 69 |
| Quentin Hannappe – Keep On | en | BY-NC-ND | 175 | 0.13 | 89.7 % | 89.7 % | 2/27 | 4 (0) | 27 asr | 44 |
| Songwriterz – Back In Time | en | BY-ND | 238 | 0.16 | 85.3 % | 87.0 % | 7/46 | 7 (3) | 46 asr | 98 |
| KINEMATIC – Peyote | en | BY-ND | 147 | 0.12 | 91.8 % | 91.2 % | 4/14 | 0 (0) | 14 asr | 47 |
| Avercage – Embers | en | BY-NC-SA | 189 | 0.83 | 52.4 % | 54.0 % | 19/42 | 23 (12) | 39 asr, 2 estimated, 1 reprompt | 113 |
| Colour Out – Falling Star | en | BY-NC-ND | 224 | 0.18 | 91.1 % | 91.5 % | 5/37 | 2 (1) | 37 asr | 55 |
| The.Madpix.Project – One Way Street | en | BY-NC-SA | 183 | 0.11 | 92.3 % | 94.0 % | 2/30 | 1 (1) | 30 asr | 58 |
| Wordsmith – The statement | en | BY-ND | 581 | 0.14 | 95.3 % | 95.2 % | 2/31 | 7 (1) | 31 asr | 220 |
| Jason Miller – Crowdpleaser | en | BY-NC-SA | 521 | 0.07 | 98.9 % | 98.9 % | 4/82 | 0 (0) | 82 asr | 128 |
| Lower Loveday – Is It Right? | en | BY-SA | 212 | 0.12 | 92.5 % | 92.9 % | 1/26 | 0 (0) | 26 asr | 53 |
| Pure Mids – The Leader | en | BY-NC-ND | 114 | 0.66 | 67.5 % | 66.7 % | 10/20 | 7 (6) | 19 asr, 1 reprompt | 98 |
| Ridgway – Fire Inside | en | BY-ND | 304 | 0.49 | 86.8 % | 86.8 % | 7/50 | 10 (6) | 48 asr, 2 reprompt | 174 |
| Moon I mean – Wrong Concept | en | BY-NC-ND | 272 | 0.56 | 78.3 % | 78.3 % | 6/43 | 13 (4) | 40 asr, 1 reprompt, 2 estimated | 154 |
| Slingshot miracle – Whistler | en | BY-NC-ND | 162 | 0.18 | 85.8 % | 85.2 % | 8/31 | 4 (2) | 30 asr, 1 reprompt | 64 |
| The RINN – Voices | en | BY-NC-ND | 203 | 0.21 | 84.7 % | 83.7 % | 6/46 | 6 (2) | 46 asr | 71 |
| Rxbyn – Bad Side | en | BY | 440 | 0.48 | 82.5 % | 82.7 % | 12/72 | 13 (11) | 67 asr, 4 estimated, 1 reprompt | 119 |
| Tom Orlando – The One (feat Tina G) | en | BY-ND | 498 | 0.13 | 93.0 % | 93.2 % | 10/72 | 7 (3) | 71 asr, 1 reprompt | 82 |
| LUNABLIND – Vision | en | BY-NC | 288 | 0.16 | 90.3 % | 91.3 % | 8/53 | 1 (0) | 53 asr | 108 |
| Explosive ear candy – Like The Sun | en | BY-NC-ND | 265 | 0.10 | 97.4 % | 97.7 % | 1/46 | 0 (0) | 46 asr | 78 |
| Cortez – Feel (Stripped) | en | BY | 355 | 0.26 | 83.1 % | 83.1 % | 4/42 | 2 (1) | 42 asr | 89 |
| Automatisch Gekommen – 1 Freak | de | BY-NC-ND | 367 | 0.07 | 98.9 % | 98.9 % | 1/60 | 2 (0) | 60 asr | 127 |
| ALFONSO LUGO – Baila | es | BY-NC-SA | 282 | 0.11 | 91.1 % | 92.2 % | 13/36 | 0 (0) | 36 asr | 100 |
| DREAM TABÙ – Besando Sapos | es | BY-NC-SA | 228 | 0.14 | 91.7 % | 92.5 % | 10/64 | 1 (0) | 64 asr | 76 |
| Bukto – Bitte beweg dich nicht | de | BY-NC-ND | 353 | 0.16 | 89.8 % | 90.4 % | 4/38 | 3 (2) | 38 asr | 101 |
| Abendblau – Burn Out Man | de | BY-NC-ND | 330 | 0.29 | 88.5 % | 87.9 % | 8/45 | 3 (1) | 44 asr, 1 reprompt | 91 |
| KANGAROO MUSIQUE – Cafe Jenseitz Bebelstraße | de | BY-NC-ND | 92 | 0.12 | 95.7 % | 95.7 % | 0/17 | 1 (0) | 17 asr | 67 |
| EL MANU – Capotes à un Franc | fr | BY-NC-SA | 245 | 0.13 | 95.9 % | 95.5 % | 1/26 | 1 (1) | 26 asr | 51 |
| VAGOS PERMANENTES – Caralibro | es | BY-NC-SA | 211 | 0.13 | 88.6 % | 92.4 % | 3/26 | 1 (0) | 26 asr | 81 |
| I'M FRESH! YOU'RE PRETTY! – CHRISTMAS AVEC TOI | fr | BY | 350 | 2.03 | 52.9 % | 55.1 % | 19/40 | 18 (15) | 32 asr, 3 estimated, 5 reprompt | 238 |
| CLUB DESTINO – Pensando en ti | es | BY-NC-SA | 204 | 0.15 | 95.1 % | 95.6 % | 5/36 | 4 (2) | 36 asr | 122 |
| Quesabe – Confession | fr | BY-NC-ND | 336 | 0.31 | 91.4 % | 92.3 % | 10/42 | 7 (7) | 38 asr, 2 reprompt, 2 estimated | 133 |
| COOL CAVEMEN – Culture & Co. | fr | BY-NC-ND | 132 | 2.10 | 72.0 % | 68.9 % | 3/25 | 14 (2) | 25 asr | 62 |
| Alice Tlustlos – Da wurdest du geboren | de | BY-NC-ND | 148 | 0.17 | 81.8 % | 83.1 % | 8/24 | 0 (0) | 24 asr | 54 |
| LE NEZ TORDU – de bonne humeur | fr | BY-NC-SA | 266 | 0.11 | 95.5 % | 96.2 % | 0/40 | 0 (0) | 40 asr | 66 |
| Dienstag ist Damensauna – Der Baum | de | BY-NC-ND | 222 | 0.09 | 99.6 % | 99.1 % | 0/46 | 2 (0) | 46 asr | 85 |
| D. – Der Musiker | de | BY-NC-SA | 354 | 0.15 | 90.7 % | 90.7 % | 15/94 | 7 (5) | 88 asr, 4 estimated, 2 reprompt | 174 |
| Frank Wingenbach – dich gehen zu sehn. | de | BY-NC-ND | 181 | 0.17 | 87.3 % | 89.5 % | 3/22 | 0 (0) | 22 asr | 70 |
| Die Partysahnen – Die Revolution gehört Dir! | de | BY-NC-SA | 156 | 0.53 | 73.1 % | 73.7 % | 7/28 | 7 (5) | 25 asr, 2 reprompt, 1 estimated | 101 |
| BRUNELA CROCHENCI – Diosa de la noche | es | BY-NC-SA | 201 | 0.52 | 78.6 % | 79.6 % | 5/29 | 4 (4) | 25 asr, 4 reprompt | 270 |
| CRIATURA – Disparan | es | BY-NC-SA | 194 | 0.19 | 84.0 % | 84.0 % | 8/40 | 7 (3) | 40 asr | 72 |
| Patrouille – Drei Nüsse | de | BY-NC-ND | 519 | 0.09 | 97.1 % | 97.5 % | 5/56 | 1 (0) | 56 asr | 117 |
| NANDOMALO – Esencia | es | BY-SA | 334 | 0.10 | 97.0 % | 96.7 % | 5/51 | 1 (0) | 51 asr | 97 |
| LOS ROMBOS – Fantasma | es | BY-SA | 88 | 1.28 | 72.7 % | 75.0 % | 6/17 | 3 (3) | 15 asr, 1 estimated, 1 reprompt | 159 |
| Durch Dick und Dünn – Freifliegen | de | BY-SA | 135 | 0.17 | 80.0 % | 80.7 % | 17/32 | 0 (0) | 32 asr | 75 |
| Andreas Jachmann – Fußabdrücke | de | BY-NC-ND | 154 | 0.19 | 80.5 % | 79.2 % | 10/22 | 0 (0) | 22 asr | 72 |
| JhoyKing – Guayateo | es | BY-NC-ND | 340 | 0.12 | 93.5 % | 93.5 % | 6/52 | 4 (3) | 49 asr, 2 estimated, 1 reprompt | 145 |
| BRUNELA CROCHENCI – Háblame - (Talk to me) | es | BY-NC-SA | 106 | 0.21 | 76.4 % | 79.2 % | 8/32 | 1 (0) | 32 asr | 43 |
| Frank Wingenbach – Ich kann dich nicht vergessen | de | BY-NC-ND | 198 | 0.13 | 91.9 % | 93.4 % | 12/40 | 0 (0) | 40 asr | 62 |
| SUNDAYERS – Intentando Destacar | es | BY-NC-SA | 224 | 0.25 | 84.8 % | 85.3 % | 9/30 | 4 (3) | 26 asr, 3 reprompt, 1 estimated | 212 |
| Zeugen der Leere – Intro [Pulsschlag] | de | BY-NC-ND | 82 | 0.26 | 85.4 % | 85.4 % | 1/12 | 4 (1) | 12 asr | 54 |
| Jonny M – Keine Lust | de | BY-SA | 528 | 0.13 | 96.4 % | 96.8 % | 5/122 | 8 (0) | 122 asr | 267 |
| FLO – l'abandon | fr | BY | 341 | 0.17 | 89.4 % | 90.6 % | 4/43 | 4 (2) | 40 asr, 1 estimated, 2 reprompt | 188 |
| RICH DON JERI – La rumba del coronavirus | es | BY-ND | 224 | 0.39 | 81.2 % | 80.4 % | 24/75 | 17 (9) | 75 asr | 113 |
| KPTN – Le musée d'air contemporain | fr | BY | 256 | 0.13 | 96.9 % | 96.9 % | 4/48 | 0 (0) | 48 asr | 53 |
| LAW' – Les files d'attente | fr | BY-SA | 319 | 0.79 | 71.8 % | 71.8 % | 12/47 | 6 (6) | 44 asr, 1 reprompt, 2 estimated | 100 |
| CYBERATTACK – Libre | fr | BY-ND | 397 | 0.08 | 97.2 % | 97.5 % | 1/48 | 5 (0) | 48 asr | 127 |
| LAW' – Mère nature | fr | BY-SA | 254 | 0.28 | 82.7 % | 81.9 % | 6/36 | 5 (1) | 36 asr | 67 |
| KOBZX2Z – Mes Larmes | fr | BY-NC-ND | 388 | 0.29 | 86.9 % | 85.8 % | 6/65 | 12 (5) | 2 estimated, 63 asr | 108 |
| CORRIENTES – ¡Óyeme tiburón! | es | BY-NC-SA | 210 | 0.14 | 93.8 % | 92.9 % | 4/54 | 2 (1) | 54 asr | 58 |
| YUANAN “J.A.R” – Miedo | es | BY-NC-SA | 268 | 0.14 | 90.3 % | 92.5 % | 5/33 | 4 (1) | 1 reprompt, 32 asr | 105 |
| Heiko Sunfyah – Musik | de | BY-NC-ND | 237 | 0.11 | 92.4 % | 93.7 % | 7/36 | 0 (0) | 36 asr | 84 |
| JAVIER GÓMEZ BELLO – Palabras | es | BY-NC-SA | 212 | 0.16 | 88.7 % | 89.1 % | 4/24 | 0 (0) | 24 asr | 56 |
| AZUL – Pas que tes pas | fr | BY-NC-SA | 268 | 0.18 | 89.9 % | 89.9 % | 1/31 | 0 (0) | 31 asr | 62 |
| MIDNIGHT PRÉFOU – Pluie d'entre deux saisons | fr | BY-NC-ND | 134 | 2.23 | 53.7 % | 53.0 % | 12/32 | 8 (7) | 28 asr, 1 reprompt, 3 estimated | 188 |
| CABBAC – POIGNEE DE MAIN | fr | BY-NC-ND | 146 | 0.25 | 74.7 % | 76.7 % | 12/30 | 1 (1) | 30 asr | 49 |
| NACIDOS DE LA TIERRA – Quiero y Puedo | es | BY-ND | 640 | 0.08 | 97.8 % | 98.6 % | 1/73 | 1 (0) | 73 asr | 138 |
| Abendblau – Schnodderdodder | de | BY-NC-ND | 291 | 0.11 | 95.2 % | 96.9 % | 7/43 | 0 (0) | 43 asr | 103 |
| WASARU – Séculaire feat. Nÿme | fr | BY-NC-SA | 345 | 0.15 | 97.1 % | 96.2 % | 5/40 | 4 (3) | 39 asr, 1 reprompt | 77 |
| REH-TORTE – Sehnsucht-Unplugged | de | BY-NC-ND | 151 | 0.12 | 95.4 % | 93.4 % | 2/26 | 0 (0) | 26 asr | 68 |
| Shaney 23 – SHANEY 23 feat. G1NA G. x In den Strassen | de | BY-NC-ND | 448 | 0.09 | 94.9 % | 94.6 % | 7/72 | 4 (1) | 72 asr | 103 |
| LIVING CAMBOYA – Sin miedo | es | BY-NC-SA | 171 | 0.23 | 74.3 % | 73.1 % | 17/28 | 0 (0) | 28 asr | 54 |
| FABIOS LA NUEVA EXPRESION DE LA CANCIÓN – te amo | es | BY-NC-SA | 169 | 0.16 | 81.1 % | 79.3 % | 14/29 | 0 (0) | 29 asr | 44 |
| WILSON WAY – Te Recuerdo | es | BY-SA | 458 | 0.10 | 96.1 % | 96.5 % | 2/51 | 1 (1) | 51 asr | 84 |
| DON VALDES – Tu sais Man | fr | BY-NC-SA | 505 | 0.25 | 82.8 % | 82.8 % | 10/60 | 16 (4) | 59 asr, 1 reprompt | 88 |
| LÖHSTANA DAVID – Une Vie De Roi | fr | BY-NC-SA | 311 | 0.14 | 91.0 % | 91.0 % | 1/44 | 2 (0) | 44 asr | 84 |
| FAFARULO CALABAZA – Vente | es | BY-NC | 505 | 0.14 | 94.3 % | 95.0 % | 12/101 | 3 (1) | 101 asr | 108 |
| Doromusis – Veränderung | de | BY-NC-ND | 211 | 0.45 | 78.7 % | 79.6 % | 13/36 | 3 (2) | 33 asr, 3 reprompt | 54 |
| RAOUL DE QSM – Le royaume des glous glous | fr | BY-NC-ND | 202 | 0.10 | 97.5 % | 97.5 % | 2/24 | 0 (0) | 24 asr | 52 |
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

**The run at `69c4d29`.** The same, from copies of the work folders of `97a552c`: `--rerun --jobs 3` took 653 s.
Re-listening heard 12 gap windows that were new, in 8 songs (54 windows in all), and one song's automatic tempo
changed (see [What the numbers point to](#what-the-numbers-point-to)). The numbers for `97a552c` on this page come
from its own work folders, scored with its own code; only the order check is the current one (2 s of slack, where
this page used 1 s before and counted 98 lines).

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
  song2mv is mostly used. Korean, song2mv's first language, is not in the set; [Before and after](#before-and-after)
  and section 2 say what the changes did on our Korean test song.
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
- **The settings were chosen on these songs.** The first-word length was picked on the English songs, so for it the
  59 held-out songs are the ones to trust. The settings of section 1 (the alignment's costs, runs of three letters,
  10 s, 2 s) were chosen on all 79 songs with a what-if; no songs were held out for them, and they were not measured
  on another dataset. On our Korean test song they change nothing. `bench/whatif_first_word.py` reuses the cached runs
  and changes only the timing of whisper words: lines no run placed keep what `sync`'s re-listening gave them.
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
