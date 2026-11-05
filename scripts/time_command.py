"""Measure one command and keep its combined log in a new directory."""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter


def run_timed(command: list[str], out: Path, cwd: Path) -> dict:
    if not command:
        raise ValueError("Give a command after --")
    out.mkdir(parents=True, exist_ok=False)
    record = {"command": command, "cwd": str(cwd.resolve()), "started_at": datetime.now(timezone.utc).isoformat()}
    started = perf_counter()
    interrupted = False
    with (out / "command.log").open("w", encoding="utf-8") as log:
        try:
            result = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
            returncode = result.returncode
        except KeyboardInterrupt:
            interrupted = True
            returncode = 130
            log.write("\nCommand interrupted.\n")
        except OSError as error:
            log.write(str(error) + "\n")
            returncode = 127
    record.update(seconds=perf_counter() - started, returncode=returncode, interrupted=interrupted,
                  ended_at=datetime.now(timezone.utc).isoformat())
    (out / "timing.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="A new directory outside the repository")
    parser.add_argument("--cwd", type=Path, default=Path.cwd())
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    try:
        record = run_timed(command, args.out, args.cwd)
    except (ValueError, OSError) as error:
        parser.exit(2, f"time_command: {error}\n")
    print(json.dumps(record), flush=True)
    raise SystemExit(record["returncode"] if record["returncode"] >= 0 else 128 - record["returncode"])


if __name__ == "__main__":
    main()
