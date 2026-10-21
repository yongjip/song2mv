import re
from pathlib import Path

import pytest

from song2mv.cli import build_parser, main

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".claude" / "skills" / "song2mv" / "SKILL.md"
FLAG = re.compile(r"--[a-z][a-z0-9-]*")


def _code(text: str):
    """Every line of the fenced blocks and every inline code span, whitespace collapsed."""
    fence = re.compile(r"^```[^\n]*\n(.*?)^```", re.M | re.S)
    for block in fence.findall(text):
        for line in block.replace("\\\n", " ").splitlines():
            yield re.sub(r"\s#.*", "", line).strip()
    for span in re.findall(r"`([^`]+)`", fence.sub("", text)):
        yield " ".join(span.split())


def _options() -> dict:
    parser = build_parser()
    sub = next(a for a in parser._actions if a.dest == "command")
    return {"": parser._option_string_actions} | {name: p._option_string_actions for name, p in sub.choices.items()}


@pytest.mark.parametrize("command", ["", "sync", "beats", "click", "check", "render"])
def test_help_points_agents_to_the_guide(command, capsys):
    with pytest.raises(SystemExit):
        main([command, "--help"] if command else ["--help"])
    lines = capsys.readouterr().out.splitlines()
    i = next(i for i, line in enumerate(lines) if line.startswith("Coding agent? Read this guide first"))
    assert Path(lines[i + 1].strip()).read_text(encoding="utf-8") == SKILL.read_text(encoding="utf-8")


@pytest.mark.parametrize("guide", [SKILL, ROOT / "AGENTS.md", ROOT / "llms.txt"], ids=lambda p: p.name)
def test_guide_names_only_real_commands_flags_and_choices(guide):
    options = _options()
    wrong = []
    for code in _code(guide.read_text(encoding="utf-8")):
        words = [w.strip("[]") for w in code.split()]
        prefixed = len(words) > 1 and words[0] == "song2mv"
        if prefixed:
            words = words[1:]
        if words and words[0] in options and words[0]:
            owners, words = [words[0]], words[1:]
        elif prefixed and words[0].startswith("--"):
            owners = [""]
        elif prefixed:
            wrong.append(f"`{code}`: no command {words[0]}")
            continue
        elif words and words[0].startswith("--"):
            owners = [c for c in options if c]
        else:
            continue
        for word, value in zip(words, words[1:] + [""]):
            flag = word.split("=")[0]
            if not FLAG.fullmatch(flag):
                continue
            actions = [options[o][flag] for o in owners if flag in options[o]]
            if not actions:
                wrong.append(f"`{code}`: {' or '.join(owners) or 'song2mv'} has no {flag}")
            elif len(owners) == 1 and actions[0].choices and re.fullmatch(r"[a-z0-9|]+", value):
                bad = [v for v in value.split("|") if v not in map(str, actions[0].choices)]
                if bad:
                    wrong.append(f"`{code}`: {flag} takes {', '.join(map(str, actions[0].choices))}, not {', '.join(bad)}")
    assert not wrong, "\n".join(wrong)
