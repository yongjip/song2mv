import subprocess
import sys

import pytest

from song2mv import __version__
from song2mv.cli import build_parser, main


def test_version(capsys):
    with pytest.raises(SystemExit) as e:
        main(["--version"])
    assert e.value.code == 0
    assert __version__ in capsys.readouterr().out


def test_no_command_prints_help(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    for cmd in ("sync", "beats", "check", "render"):
        assert cmd in out


def test_public_grammar_stays_small():
    # docs/product-scope.md: adding a top-level command needs a written reason.
    sub = next(a for a in build_parser()._actions if a.dest == "command")
    assert sorted(sub.choices) == ["beats", "check", "render", "sync"]


def test_python_m_entry_point():
    r = subprocess.run([sys.executable, "-m", "song2mv", "--version"], capture_output=True, text=True)
    assert r.returncode == 0 and __version__ in r.stdout
