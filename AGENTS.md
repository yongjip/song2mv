# AGENTS.md

This repository ships `song2mv`: song in, beat-synced lyric timing (LRC, SRT, word-timed JSON) and a code-drawn
music video out. It is a command-line tool built for coding agents. Five commands: `sync`, `beats`, `click`, `check`, `render`.
The full music-video loop, scene design included, is the skill `.claude/skills/song2mv/SKILL.md`. An installed song2mv
carries the skill and this file in its package folder `song2mv/guide/`; `song2mv --help` prints the skill's path.

## Using song2mv for a user

The checkpoints below don't block: show what you have with your pick and the reason in one line, and carry on; the
user can redirect. Decide timing by measurement, make the ear-check files anyway and list the unheard spots when you
deliver. Wait only for the song's rights or a lyric only the user knows.

1. **Rights first.** Ask whose song it is and whether the user may publish a video of it (an AI music service's
   plan terms count). Never copy the song, its lyrics or renders into a repository; keep them in the work folder.
   It defaults to `./song2mv-work/<song>/`, relative to the current directory: run outside the user's repository
   or pass `--out`, and make sure `song2mv-work/` is in that repository's `.gitignore` if you work inside it.
2. **Timing.** Run `song2mv sync AUDIO --lyrics LYRICS --language CODE --title "TITLE" --json` in the background —
   three whisper runs take a few minutes on a laptop CPU. Read the JSON on stdout: `outputs` has every file path,
   `line_sources` counts the lines per source (each line's own `source` is in `lyrics.json`), `check_by_ear` lists
   the lines most likely to be wrong, and `warnings` says what to tell the user.
   If the audio has a lyrics tag (Suno writes one), `--lyrics` is optional; where a lyric sheet and the tag differ,
   `warnings` says where and which one the whisper runs support, and `off_sheet` lists words the runs hear that no
   line has: sync again with a sheet that matches what they heard. Always set `--language`.
3. **You cannot hear the song.** Turn every judgement that needs ears into a ten-second check for the user:
   `song2mv click WORK --from A --to B --words --json` mixes clicks and word ticks over a stretch into a wav; send
   it with the question in `ask_the_listener`. Fix with `bpm`, `downbeat_mod4` and `manual` in `WORK/song.json`,
   then rerun `song2mv sync WORK/song.json` (finished whisper runs are reused; options such as `--runs 5` given
   there are saved to song.json). A `manual` pin only constrains: re-heard lines around it keep their times while
   they still fit between the pins, so pin only what is wrong.
4. **Subtitles only?** Stop after `sync` and hand over `song.srt` (video editors) or `song.lrc` / `song.words.lrc`.
5. **Video.** `song2mv render WORK/mv.json --still T --aspect both` writes PNGs you can look at; render short
   stretches (`--from A --to B`) while working. For the user's own scenes use `--template DIR` and write them in
   `DIR/src/scenes/`: a scene is a pure function of song time `T`; text pops once and then holds still; lay out
   on the 1920×1080 stage. Start from a concept: propose two or three, in different art styles, as stills side by
   side, and pick one. The scene kit in `DIR/src/kit/` (people, places, sky, objects, effects; style packs such as `paper` that
   put any object in another art style) is optional: reuse what fits the concept, change it in DIR, draw the rest.
   See it with `npx remotion still src/index.ts Kit-Gallery gallery.png --frame=0` in DIR. When the video is done,
   offer the user anything generic you drew as a pull request (`CONTRIBUTING.md`). Remotion is not MIT — tell
   company users about its license before they rely on it.
6. **Check after every render.** `song2mv check VIDEO --song WORK/mv.json --from A --to B --json`. Fix FAILs and
   say which numbers moved. The default goals are a starting point; if one is wrong for this song, copy the goals
   file, change it and tell the user why. Passing is necessary, not proof of fun — send a clip and ask what is
   boring. The user's answer outranks the numbers.
7. **Every command takes `--json`.** Progress goes to stderr, stdout carries one object with `schema_version` and
   `ok`. Exit code 2 is an error: read `error.message` and do what `error.hint` says. Exit code 1 only means `check`
   found a failing check. Check `schema_version` before relying on field names (docs/contract.md).

## Changing this repository

1. Keep the public grammar small: five commands. Before adding a command, flag, config key or output file, apply
   the admission test in `docs/product-scope.md` and prefer extending an existing one.
2. Every `--json` result and every output file in `docs/contract.md` is stamped by `song2mv.contract.stamp`. An
   incompatible change bumps `SCHEMA_VERSION`, updates `docs/contract.md` and gets a `CHANGELOG.md` entry.
3. Add your `CHANGELOG.md` entry under `## Unreleased`. Do not bump the version outside a release-preparation change.
4. Heavy dependencies stay optional (extras `beats`, `sync`). `song2mv --help` and `song2mv check` must work with
   only numpy installed; import heavy modules inside the command that needs them.
5. Before committing: `ruff check src tests` and `pytest -q` in the activated `.venv` (or `uv run --no-sync …`).
   Tests build synthetic audio and video; never add songs, lyrics, renders or other media to the repository.
6. Pin a dependency upper bound only with a comment that says what broke (see `av<19` in pyproject.toml).
7. Write everything in English: code, docs, test data, messages and commits. Write a non-Latin character range in
   a regex as escapes (`\uac00-\ud7af`).
8. Add a comment only when the code cannot say it; prefer clear names and types.
