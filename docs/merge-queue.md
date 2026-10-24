# Landing changes through the merge queue

Agent sessions on the maintainer's Mac do not push `main`. They enqueue their branch in
[mergetrain](https://github.com/yongjip/mergetrain), a local merge queue: one runner merges the queued branches onto
`origin/main` in order, runs the checks below, pushes, and waits for CI. Pull requests from forks work as before.

## Land a change

Work on your own branch in a linked worktree of `~/AIProjects/song2mv-new`, for example

```sh
git -C ~/AIProjects/song2mv-new worktree add -b fix/short-name ~/AIProjects/song2mv-short-name origin/main
```

Claude Code and Codex worktrees of that checkout count too. Do not work in `~/AIProjects/song2mv-new` itself: it is
the queue's control checkout and stays on `main`. A separate clone has a queue of its own that nothing lands from.

1. Commit in your worktree and leave it clean. The usual rules apply (`AGENTS.md`, `CONTRIBUTING.md`), CHANGELOG
   entry included; parallel entries merge without conflicts.
2. Enqueue the branch:

   ```sh
   mergetrain enqueue --task "sync: what it does" --branch fix/short-name --auto --json
   ```

   `job.id` in the result is your job. `--auto` is approved for this repository: see below.
3. Wait in the background, checking every minute:

   ```sh
   mergetrain inspect ID --json | jq -r '.job | "\(.status) \(.push_status) \(.verify_status)"'
   ```

   | Output | Meaning | Then |
   | --- | --- | --- |
   | `deployed succeeded succeeded` | on `main`, CI passed | report `.job.deploy_sha` and the `verify-ci:` line of `.job.log_path` |
   | `deployed succeeded failed` | on `main`, CI failed or did not finish | report the same; fix forward on a new branch |
   | `failed …` or `blocked …` | nothing landed | step 4 |
   | anything else | waiting or running | keep waiting |

   The checks take about 40 seconds, or 2 minutes when the train touches the renderer, and CI about 6 more. Jobs
   enqueued meanwhile go in the next train together. If your job stays `queued` and
   `scripts/mergetrain/daemon.sh status` says the runner is stopped, it was stopped for a benchmark: report that and
   stop waiting.
4. Failed or blocked: `.outcome.message` says why, and the whole output is in `.job.log_path`. Fix it on the same
   branch (for a conflict, merge `origin/main` into it), commit, and run the job's `.retry_command`
   (`mergetrain retry ID --json`): that is how the queue takes the branch again, as enqueueing it a second time is
   refused. Wait on the new `job.id` as in step 3.

The rules every agent follows with this queue are in [AGENTS.mergetrain.md](../AGENTS.mergetrain.md).

## What `--auto` approves

The maintainer approved landing song2mv without asking again. For the job's pinned commit, `--auto` lets the
runner merge it with the other queued jobs onto `origin/main`, run the checks, push the result to `main` together
with `refs/mergetrain/deploys/<sha>`, and wait for CI. A session may also run `mergetrain verify --job ID` to check
CI again after rerunning it on GitHub.

Not approved: tags (a `v*` tag publishes to PyPI), releases, other branches, force pushes, `verify --ack`, and the
recovery commands `status` may offer (`reconcile`, `unlock`, and `cancel` or `dismiss` of another session's job).
Ask the maintainer for those.

The approval is bound to the push destination and to `.mergetrain.yaml`. A job queued before either changes blocks
with `approval_execution_policy_changed`: `mergetrain dismiss ID`, then enqueue it again with `--auto`.

## Checks

`.mergetrain.yaml` runs these in a fresh worktree of the train:

| Gate | What | When |
| --- | --- | --- |
| `diff-check` | `git diff --check` of the train, mergetrain's own | always |
| `setup` | `scripts/mergetrain/setup.sh`: `.venv` from uv's cache, the template's `node_modules` linked from `~/.cache/song2mv-gates` | always |
| `ruff`, `tsc`, `pytest` | `ruff check src tests`, `npx tsc --noEmit` in the template, `pytest -q` without `tests/test_template.py`, side by side | always |
| `render` | `npm run test:assets` in the template, then `pytest -q tests/test_template.py` | when the train changes `src/song2mv/render/`, `src/song2mv/check/`, a module they import, their tests, `pyproject.toml` or `scripts/mergetrain/setup.sh` |

At most 4 worker slots run at once (the Mac has 12 cores): one each for `ruff`, `tsc` and `pytest`, and all 4 for
`render`, which runs after them. Its renders use about 2 cores on average and up to 7 for moments. After the push,
`scripts/mergetrain/verify-ci.sh` waits up to 50 minutes for the CI workflow on the pushed commit and passes only
when every job passed. CI also covers what the Mac cannot: Linux, Windows and Python 3.10–3.14.

## The runner

```sh
scripts/mergetrain/daemon.sh start    # or: stop, status
```

`start` runs `mergetrain daemon` for `~/AIProjects/song2mv-new` as the launchd agent
`com.yongjip.mergetrain.song2mv-new`, holding `caffeinate -i` while it runs, and starts it again at login. Its log is
`~/Library/Logs/mergetrain-song2mv-new.log`. It lands only `--auto` jobs.

`caffeinate` prevents idle sleep only: a closed lid still sleeps the Mac. Nothing is lost then, and the train goes on
after waking. With mergetrain 3.7.0, `status` may offer `mergetrain unlock --force` right after a sleep longer than
30 minutes; do not run it while the runner is running, read `status` again a few seconds later.

**Benchmarks need the CPU to themselves.** Run `scripts/mergetrain/daemon.sh stop` first and
`scripts/mergetrain/daemon.sh start` after. `stop` lets a train in progress finish, CI wait included, so it can take
several minutes. Jobs enqueued meanwhile wait and land after `start`.

Restart the runner (`stop`, then `start`) after upgrading mergetrain. It reads `.mergetrain.yaml` from
`~/AIProjects/song2mv-new`, so a change to it applies once that checkout has it:
`git -C ~/AIProjects/song2mv-new pull --ff-only`.

## Pushes

Pushes to `yongjip/song2mv` use the personal account's token through a credential helper in
`~/AIProjects/song2mv-new/.git/config`, which its worktrees share; the active `gh` account stays as it is:

```sh
git -C ~/AIProjects/song2mv-new config credential.https://github.com.helper ''
git -C ~/AIProjects/song2mv-new config --add credential.https://github.com.helper \
  '!f() { test "$1" = get || exit 0; echo username=yongjip; echo "password=$(gh auth token --user yongjip)"; }; f'
```

A `pre-push` hook refuses pushes to `main` that do not come from the queue, whose push carries
`refs/mergetrain/deploys/<sha>` for the same commit. Install or update it with

```sh
cp scripts/mergetrain/pre-push "$(git -C ~/AIProjects/song2mv-new rev-parse --path-format=absolute --git-path hooks)/pre-push"
```

It is a guard against mistakes, not a lock: `git push --no-verify` and GitHub's web interface bypass it.
