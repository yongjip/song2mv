#!/bin/sh
# Post-push verify: wait for the CI workflow on the deployed commit and require every one of its jobs to pass.
# A failure here means the commit is on main and CI disagrees (or did not finish): mergetrain records it on the job.
set -eu

repo=yongjip/song2mv
sha=$(git rev-parse HEAD)
wait=${SONG2MV_CI_WAIT_SECONDS:-3000}
GH_TOKEN=$(gh auth token --user yongjip) || { echo "verify-ci: gh has no token for yongjip" >&2; exit 1; }
export GH_TOKEN

deadline=$(($(date +%s) + wait))
echo "verify-ci: waiting up to ${wait}s for CI on $sha"
while :; do
  run=$(gh run list --repo "$repo" --commit "$sha" --workflow ci.yml --limit 1 --json databaseId,status,conclusion,url \
    --jq '.[0] | select(. != null) | "\(.databaseId) \(.status) \(.conclusion) \(.url)"' || true)
  if [ -n "$run" ]; then
    set -- $run
    if [ "$2" = completed ]; then
      jobs=$(gh api "repos/$repo/actions/runs/$1/jobs?per_page=100" \
        --jq '"\([.jobs[] | select(.conclusion == "success")] | length)/\(.jobs | length)"')
      echo "verify-ci: CI $3, $jobs jobs passed: $4"
      if [ "$3" = success ] && [ "${jobs%/*}" = "${jobs#*/}" ]; then
        exit 0
      fi
      exit 1
    fi
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "verify-ci: CI on $sha is ${2:-not reported} after ${wait}s ${4:-}"
    exit 1
  fi
  sleep 20
done
