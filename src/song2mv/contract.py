"""The machine contract: every JSON file song2mv writes, and every `--json` result, carries
`schema_version`. Agents and scripts should check it. While song2mv is 0.x the formats may change;
any incompatible change bumps SCHEMA_VERSION and is listed in CHANGELOG.md. See docs/contract.md.
"""
from __future__ import annotations

SCHEMA_VERSION = 1


def stamp(obj: dict) -> dict:
    """Return `obj` with schema_version as its first key."""
    return {"schema_version": SCHEMA_VERSION, **{k: v for k, v in obj.items() if k != "schema_version"}}
