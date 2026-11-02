# Release checklist

Releases are built and published by GitHub Actions with PyPI Trusted Publishing (short-lived OIDC credentials).
Do not upload artifacts from a developer machine.

CI's `release-artifacts` job downloads the wheel and source archive from the package job and verifies their
SHA-256 checksums with the release workflow's artifact action versions. Keep those versions aligned in both
workflows. This checks archive transfer without running Trusted Publishing or creating a GitHub release.

## When to cut a release

Merging to `main` is not a reason to release. Every published version is immutable, gets mirrored, and asks every
user to upgrade.

- Feature and fix changes add their `CHANGELOG.md` entry under `## Unreleased` and leave the version alone.
- Ship a patch release promptly only for a regression in the latest release, a broken install path (PyPI, `uvx`,
  extras), or a security fix. Fold everything else into the next release.
- At most one feature (minor) release per week.
- While 0.x, an incompatible change to a JSON format bumps `SCHEMA_VERSION` and the minor version.

## Leaving alpha

song2mv is alpha while it is 0.x, and says so in the `Development Status :: 3 - Alpha` classifier, the README's banner
and status column, `docs/contract.md` and `CONTRIBUTING.md`. It moves to beta, still 0.x, when all three hold:

1. Four weeks of releases with no `SCHEMA_VERSION` bump and no command or flag removed.
2. Two or three people outside the project have made a whole video from the README alone, and what they ran into is
   fixed or listed as known.
3. Those four weeks kept to the release cadence above, with no exception.

A command can go beta before the project does: `sync`, `beats`, `click` and `check` once their formats and flags meet
point 1, then `render`, the kit and the skill. Mark it in the README's status column.

1.0 promises no incompatible change without a major version. It waits until song2mv has been beta for about two months
and the kit and the skill no longer change from week to week.

## Release preparation (one change)

1. Turn `## Unreleased` into `## X.Y.Z — YYYY-MM-DD`.
2. Bump `__version__` in `src/song2mv/__init__.py` (the package version is read from it) and `version` in
   `src/song2mv/render/template/package.json`.
3. `uv run --no-sync ruff check src tests && uv run --no-sync pytest -q && uv build` locally.
4. Merge, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`. The release workflow checks that the tag,
   the package version, the template version and a dated `CHANGELOG.md` section agree, runs the tests, builds,
   publishes to PyPI and creates the GitHub release (marked pre-release while 0.x) with that section as its notes.

## One-time setup (repository owner)

1. On PyPI, add a *pending trusted publisher* for project `song2mv`: owner `yongjip`, repository `song2mv`,
   workflow `release.yml`, environment `pypi`.
2. In the GitHub repository settings, create an environment named `pypi` (optionally with required reviewers).
3. Before the first real release, consider a dry run against TestPyPI with a pending publisher there.
