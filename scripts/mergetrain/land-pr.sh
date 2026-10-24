#!/bin/sh
# Land pull request N through the queue instead of GitHub's merge button: scripts/mergetrain/land-pr.sh N
# Run it again after the pull request changes (after `@dependabot rebase`, say) to retry its job.
set -eu

n=$1
common=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)
repo=$(dirname "$common")
branch=pr/$n
dir="$repo/.mergetrain/pr/$n"

git -C "$repo" fetch -q origin
for done_dir in "$repo"/.mergetrain/pr/*; do
  [ -d "$done_dir" ] || continue
  done_branch=pr/$(basename "$done_dir")
  if git -C "$repo" merge-base --is-ancestor "$done_branch" origin/main 2>/dev/null; then
    git -C "$repo" worktree remove --force "$done_dir" && git -C "$repo" branch -q -D "$done_branch"
  fi
done

head=$(git -C "$repo" ls-remote origin "refs/pull/$n/head" | cut -f1)
[ -n "$head" ] || { echo "land-pr: origin has no pull request $n" >&2; exit 1; }
git -C "$repo" fetch -q origin "refs/pull/$n/head"
if [ -d "$dir" ]; then
  git -C "$dir" reset -q --hard "$head"
else
  git -C "$repo" worktree add -q -B "$branch" "$dir" "$head"
fi

title=$(GH_TOKEN=$(gh auth token --user yongjip) gh pr view "$n" --repo yongjip/song2mv --json title --jq .title 2>/dev/null) ||
  title="pull request"
cd "$dir"
job=$(mergetrain status --json | jq -r --arg b "$branch" '[.attention_jobs[] | select(.branch == $b)][0].id // empty')
if [ -n "$job" ]; then
  mergetrain retry "$job" --json
else
  mergetrain enqueue --task "PR #$n: $title" --branch "$branch" --auto --json
fi
