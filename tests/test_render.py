"""`song2mv render` without Node: inputs are checked before anything is installed; install marker, outputs,
progress lines."""
import json
import os
import sys

import pytest

from song2mv.cli import main
from song2mv.render import runner

MV = {"title": "t", "audio": "song.mp3", "duration": 30.0, "grid": {"beat": 0.5, "phi": 0.0, "bar0": 0.0},
      "sections": [{"id": "v1", "kind": "mid", "start": 0.0, "end": 30.0}], "lines": []}


@pytest.fixture
def no_install(monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("nothing may be installed for bad input")
    monkeypatch.setattr(runner, "prepare_template", refuse)


def run_json(capsys, argv):
    code = main(argv + ["--json"])
    return code, json.loads(capsys.readouterr().out)


def test_a_song_json_is_refused_before_installing_anything(tmp_path, capsys, no_install):
    cfg = tmp_path / "song.json"
    cfg.write_text(json.dumps({"audio": "song.mp3"}), encoding="utf-8")
    code, res = run_json(capsys, ["render", str(cfg)])
    assert code == 2 and "song config (song.json), not an mv.json" in res["error"]["message"]


@pytest.mark.parametrize("args, says", [
    (["--from", "40"], "outside the song"),
    (["--from", "10", "--to", "5"], "must be after"),
    (["--still", "31"], "outside the rendered stretch"),
])
def test_times_outside_the_song_are_refused(tmp_path, capsys, no_install, args, says):
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(MV), encoding="utf-8")
    code, res = run_json(capsys, ["render", str(mv)] + args)
    assert code == 2 and says in res["error"]["message"]


def test_npm_runs_until_an_install_finished(tmp_path, monkeypatch):
    monkeypatch.setenv("SONG2MV_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(runner, "_require", lambda tool: tool)
    calls = []

    def fake_npm(cmd, cwd, stdout):
        calls.append(cmd[1])
        os.makedirs(os.path.join(cwd, "node_modules"), exist_ok=True)

        class Done:
            returncode = 0
        return Done()

    monkeypatch.setattr(runner.subprocess, "run", fake_npm)
    tpl = runner.prepare_template(None)
    assert calls == ["ci"] and os.path.exists(os.path.join(tpl, "render.mjs"))
    runner.prepare_template(None)
    assert calls == ["ci"]  # installed: not again
    os.remove(os.path.join(tpl, "node_modules", runner.INSTALLED))  # as after an interrupted install
    runner.prepare_template(None)
    assert calls == ["ci", "ci"]


def fake_render(tmp_path, monkeypatch, use_manifest):
    tpl = tmp_path / "tpl"
    tpl.mkdir()
    monkeypatch.setattr(runner, "_require", lambda tool: tool)
    monkeypatch.setattr(runner, "prepare_template", lambda template: str(tpl))

    def run(args, cwd):
        out = args[args.index("--out") + 1]
        made = os.path.join(out, "song-16x9-1-2.mp4")
        open(made, "wb").write(b"mp4")
        if use_manifest:
            open(args[args.index("--manifest") + 1], "a", encoding="utf-8").write(made + "\n")
        return 0
    monkeypatch.setattr(runner, "_run_filtered", run)
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(MV), encoding="utf-8")
    renders = tmp_path / "renders"
    renders.mkdir()
    (renders / "older.mp4").write_bytes(b"old")
    return runner.render(str(mv), start=1.0, end=2.0)


@pytest.mark.parametrize("use_manifest", [True, False])
def test_outputs_name_only_the_files_this_render_wrote(tmp_path, monkeypatch, use_manifest):
    res = fake_render(tmp_path, monkeypatch, use_manifest)
    assert res["outputs"] == {"song-16x9-1-2.mp4": str(tmp_path / "renders" / "song-16x9-1-2.mp4")}
    assert res["warnings"] and "silent" in res["warnings"][0]  # no song.mp3 anywhere


def test_per_frame_progress_becomes_a_line_per_quarter(capsys):
    child = "\n".join(["Bundling 50%", "Bundling 100%", "Getting composition"] +
                      [f"Rendered {k}/8, time remaining: 1s" for k in range(9)] +
                      ["Encoded 8/8", "a warning worth seeing"])
    code = runner._run_filtered([sys.executable, "-c", f"print({child!r})"], ".")
    err = capsys.readouterr().err.splitlines()
    assert code == 0
    assert err == ["  rendered 0/8 frames", "  rendered 2/8 frames", "  rendered 4/8 frames", "  rendered 6/8 frames",
                   "  rendered 8/8 frames", "a warning worth seeing"]
