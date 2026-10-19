# Release checklist

Releases are built and published by GitHub Actions with PyPI Trusted Publishing (short-lived OIDC credentials).
Do not upload artifacts from a developer machine.

## When to cut a release

Merging to `main` is not a reason to release. Every published version is immutable, gets mirrored, and asks every
user to upgrade.

- Feature and fix changes add their `CHANGELOG.md` entry under `## Unreleased` and leave the version alone.
- Ship a patch release promptly only for a regression in the latest release, a broken install path (PyPI, `uvx`,
  extras), or a security fix. Fold everything else into the next release.
- At most one feature (minor) release per week.
- While 0.x, an incompatible change to a JSON format bumps `SCHEMA_VERSION` and the minor version.

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
