import re
from pathlib import Path

import pytest

from song2mv.cli import build_parser, main

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".claude" / "skills" / "song2mv" / "SKILL.md"
FLAG = re.compile(r"--[a-z][a-z0-9-]*")
SHELL_SEPARATOR = re.compile(r"&&|\|\||;|\s\|\s")


def _code(text: str):
    """Every line of the fenced blocks, every inline code span and every flag named in prose."""
    fence = re.compile(r"^[ \t]*```[^\n]*\n(.*?)^[ \t]*```", re.M | re.S)
    for block in fence.findall(text):
        for line in block.replace("\\\n", " ").splitlines():
            yield re.sub(r"\s#.*", "", line).strip()
    prose = fence.sub("", text)
    for span in re.findall(r"`([^`]+)`", prose):
        yield " ".join(span.split())
    yield from re.findall(r"(?<![\w-])--[a-z][\w-]*", re.sub(r"`[^`]+`", "", prose))


def _options() -> dict:
    parser = build_parser()
    sub = next(a for a in parser._actions if a.dest == "command")
    return {"": parser._option_string_actions} | {name: p._option_string_actions for name, p in sub.choices.items()}


@pytest.mark.parametrize("command", ["", "sync", "beats", "click", "check", "sheet", "render"])
def test_help_points_agents_to_the_guide(command, capsys):
    with pytest.raises(SystemExit):
        main([command, "--help"] if command else ["--help"])
    lines = capsys.readouterr().out.splitlines()
    i = next(i for i, line in enumerate(lines) if line.startswith("Coding agent? Read this guide first"))
    assert Path(lines[i + 1].strip()).read_text(encoding="utf-8") == SKILL.read_text(encoding="utf-8")


@pytest.mark.parametrize("guide", [SKILL, *sorted(SKILL.parent.glob("briefs/*.md")), ROOT / "AGENTS.md", ROOT / "llms.txt"],
                         ids=lambda p: p.name)
def test_guide_names_only_real_commands_flags_and_choices(guide):
    options = _options()
    commands = [c for c in options if c]
    wrong = []
    for code in _code(guide.read_text(encoding="utf-8")):
        for part in (p.strip() for p in SHELL_SEPARATOR.split(code)):
            words = [w.strip("[]") for w in part.split()]
            prefixed = "song2mv" in words[:-1]
            if prefixed:
                words = words[words.index("song2mv") + 1:]
            if words and words[0] in commands:
                owners, words = [words[0]], words[1:]
            elif words and words[0].startswith("--"):
                owners = [""] if prefixed else commands
            elif prefixed:
                wrong.append(f"`{part}`: no command {words[0]}")
                continue
            else:
                continue
            for word, after in zip(words, words[1:] + [""]):
                flag, eq, value = word.partition("=")
                if not FLAG.fullmatch(flag):
                    continue
                defined = [o for o in owners if flag in options[o]]
                if not defined:
                    wrong.append(f"`{part}`: {' or '.join(owners) or 'song2mv'} has no {flag}")
                    continue
                choices = list(map(str, options[defined[0]][flag].choices or []))
                value = value if eq else after
                if len(defined) == 1 and choices and re.fullmatch(r"[\w:|]+", value):
                    bad = [v for v in value.split("|") if v not in choices]
                    if bad:
                        wrong.append(f"`{part}`: {flag} takes {', '.join(choices)}, not {', '.join(bad)}")
    assert not wrong, "\n".join(wrong)
