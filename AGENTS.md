# AGENTS.md

This repository ships `song2mv`: song in, beat-synced lyric timing (LRC, SRT, word-timed JSON) and a code-drawn
music video out. It is a command-line tool built for coding agents. Four commands: `sync`, `beats`, `check`, `render`.

## Using song2mv for a user

1. **Rights first.** Ask whose song it is and whether the user may publish a video of it (an AI music service's
   plan terms count). Never copy the song, its lyrics or renders into a repository; keep them in the work folder
   (`song2mv-work/<song>/` by default).
2. **Timing.** Run `song2mv sync AUDIO --lyrics LYRICS --language CODE --json` in the background — three whisper
   runs take a few minutes on a laptop CPU. Read the JSON on stdout: `outputs` has every file path,
   `line_sources` says how each line was placed, `check_by_ear` lists the lines most likely to be wrong.
   If the audio has a lyrics tag (Suno writes one), `--lyrics` is optional. Always set `--language`.
3. **You cannot hear the song.** Turn every judgement that needs ears into a ten-second check for the user:
   `python -m song2mv.timing.click_check WORK --from A --to B --words` mixes clicks and word ticks over a stretch.
   Fix with `bpm`, `downbeat_mod4` and `manual` in `WORK/song.json`, then rerun `song2mv sync WORK/song.json`
   (finished whisper runs are reused).
4. **Subtitles only?** Stop after `sync` and hand over `song.srt` (video editors) or `song.lrc` / `song.words.lrc`.
5. **Video.** `song2mv render WORK/mv.json --still T --aspect both` writes PNGs you can look at; render short
   stretches (`--from A --to B`) while working. For the user's own scenes use `--template DIR` and write them in
   `DIR/src/scenes/`: a scene is a pure function of song time `T`; text pops once and then holds still; lay out
   on the 1920×1080 stage. Remotion is not MIT — tell company users about its license before they rely on it.
6. **Check after every render.** `song2mv check VIDEO --song WORK/mv.json --from A --to B --json`. Fix FAILs and
   say which numbers moved. The default goals are a starting point; if one is wrong for this song, copy the goals
   file, change it and tell the user why. Passing is necessary, not proof of fun — send a clip and ask what is
   boring. The user's answer outranks the numbers.
7. **Every command takes `--json`.** Progress goes to stderr, stdout carries one object with `schema_version`.
   Check `schema_version` before relying on field names (docs/contract.md).

## Changing this repository

1. Keep the public grammar small: four commands. Before adding a command, flag, config key or output file, apply
   the admission test in `docs/product-scope.md` and prefer extending an existing one.
2. Every JSON file and `--json` result is stamped by `song2mv.contract.stamp`. An incompatible change bumps
   `SCHEMA_VERSION`, updates `docs/contract.md` and gets a `CHANGELOG.md` entry.
3. Add your `CHANGELOG.md` entry under `## Unreleased`. Do not bump the version outside a release-preparation change.
4. Heavy dependencies stay optional (extras `beats`, `sync`). `song2mv --help` and `song2mv check` must work with
   only numpy installed; import heavy modules inside the command that needs them.
5. Before committing: `ruff check src tests` and `pytest -q`. Tests build synthetic audio and video; never add
   songs, lyrics, renders or other media to the repository.
6. Pin a dependency upper bound only with a comment that says what broke (see `av<19` in pyproject.toml).
