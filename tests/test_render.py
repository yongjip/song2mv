"""`song2mv render` without Node: inputs are checked before anything is installed; install marker, the install
template copies share, outputs, progress lines."""
import json
import os
import shutil
import subprocess
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


@pytest.fixture
def npm(tmp_path, monkeypatch):
    """npm ci that only makes node_modules; returns the folders it ran in"""
    monkeypatch.setenv("SONG2MV_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(runner, "_require", lambda tool: tool)
    calls = []

    def fake_npm(cmd, cwd, stdout):
        assert cmd[1] == "ci"
        calls.append(cwd)
        os.makedirs(os.path.join(cwd, "node_modules"), exist_ok=True)

        class Done:
            returncode = 0
        return Done()

    monkeypatch.setattr(runner.subprocess, "run", fake_npm)
    return calls


def test_npm_runs_until_an_install_finished(npm):
    tpl = runner.prepare_template(None)
    assert npm == [tpl] and os.path.exists(os.path.join(tpl, "render.mjs"))
    runner.prepare_template(None)
    assert npm == [tpl]  # installed: not again
    os.remove(os.path.join(tpl, "node_modules", runner.INSTALLED))  # as after an interrupted install
    runner.prepare_template(None)
    assert npm == [tpl, tpl]


def test_template_copies_share_the_cached_install(tmp_path, npm):
    one = runner.prepare_template(str(tmp_path / "one" / "video"))
    two = runner.prepare_template(str(tmp_path / "two" / "video"))
    shared = runner.prepare_template(None)
    assert npm == [shared]  # one install, in the cache
    for copy in (one, two):
        modules = os.path.join(copy, "node_modules")
        assert os.path.islink(modules) and os.path.samefile(modules, os.path.join(shared, "node_modules"))
    assert runner.prepare_template(one) == one and npm == [shared]


def test_a_copy_whose_lock_file_differs_installs_its_own(tmp_path, npm):
    copy = runner.prepare_template(str(tmp_path / "video"))
    shared = runner.prepare_template(None)
    with open(os.path.join(copy, "package-lock.json"), "a", encoding="utf-8") as f:
        f.write("\n")  # a package added, or a copy made by another song2mv
    runner.prepare_template(copy)
    assert npm == [shared, copy] and not os.path.islink(os.path.join(copy, "node_modules"))
    assert os.path.exists(os.path.join(shared, "node_modules", runner.INSTALLED))  # the shared install stays
    runner.prepare_template(copy)
    assert npm == [shared, copy]  # its own install counts as installed


def test_a_copy_linked_to_a_deleted_cache_links_again(tmp_path, npm):
    copy = runner.prepare_template(str(tmp_path / "video"))
    shutil.rmtree(tmp_path / "cache")
    runner.prepare_template(copy)
    shared = runner.prepare_template(None)
    assert npm == [shared, shared] and os.path.samefile(os.path.join(copy, "node_modules"), os.path.join(shared, "node_modules"))


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
                   "  rendered 8/8 frames", "  encoded 8/8 frames", "a warning worth seeing"]


def test_a_slow_encode_still_prints_a_line_every_heartbeat(capsys, monkeypatch):
    monkeypatch.setattr(runner, "HEARTBEAT", 0.0)
    child = "\n".join(f"Encoded {k}/100" for k in (40, 41, 42))
    runner._run_filtered([sys.executable, "-c", f"print({child!r})"], ".")
    assert capsys.readouterr().err.splitlines() == ["  encoded 40/100 frames", "  encoded 41/100 frames",
                                                   "  encoded 42/100 frames"]


def capture_render(tmp_path, monkeypatch, render_mjs):
    """A template whose render.mjs has the given text; returns the mv.json and the argument lists render.mjs got"""
    tpl = tmp_path / "tpl"
    tpl.mkdir()
    (tpl / "render.mjs").write_text(render_mjs, encoding="utf-8")
    monkeypatch.setattr(runner, "_require", lambda tool: tool)
    monkeypatch.setattr(runner, "prepare_template", lambda template: str(tpl))
    calls = []
    monkeypatch.setattr(runner, "_run_filtered", lambda args, cwd: calls.append(args) or 0)
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(MV), encoding="utf-8")
    return mv, calls


@pytest.mark.parametrize("args, drafted", [(["--from", "1", "--to", "2"], True), (["--still", "1.5"], False)])
def test_draft_reaches_the_template_for_videos_not_stills(tmp_path, capsys, monkeypatch, args, drafted):
    mv, calls = capture_render(tmp_path, monkeypatch, 'const draft = flag("draft");')
    code, res = run_json(capsys, ["render", str(mv), "--draft"] + args)
    assert code == 0 and ("--draft" in calls[0]) is drafted
    assert not [w for w in res["warnings"] if "--draft" in w]


def test_a_copy_made_before_drafts_says_it_rendered_at_the_full_rate(tmp_path, capsys, monkeypatch):
    mv, calls = capture_render(tmp_path, monkeypatch, "// a copy made by an older song2mv")
    code, res = run_json(capsys, ["render", str(mv), "--from", "1", "--to", "2", "--draft"])
    assert code == 0 and any("full frame rate" in w for w in res["warnings"])


@pytest.mark.parametrize("args, passed", [(["--from", "1", "--to", "2"], True), (["--from", "1", "--to", "2", "--draft"], False),
                                          (["--still", "1.5"], False)])
def test_max_mb_reaches_the_template_for_finished_videos_only(tmp_path, capsys, monkeypatch, args, passed):
    mv, calls = capture_render(tmp_path, monkeypatch, 'const draft = flag("draft");')
    code, res = run_json(capsys, ["render", str(mv), "--max-mb", "200"] + args)
    assert code == 0 and ("--max-mb" in calls[0]) is passed


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_cover_turns_the_16x9_frame_into_a_square_and_keeps_only_the_cover(tmp_path, monkeypatch):
    tpl = tmp_path / "tpl"
    tpl.mkdir()
    monkeypatch.setattr(runner, "_require", lambda tool: tool)
    monkeypatch.setattr(runner, "prepare_template", lambda template: str(tpl))
    still = tmp_path / "renders" / "song-16x9-1.5s.png"

    def run(args, cwd):
        assert args[args.index("--still") + 1] == "1.5" and args[args.index("--aspect") + 1] == "16x9"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1",
                        str(still)], check=True)
        open(args[args.index("--manifest") + 1], "a", encoding="utf-8").write(f"{still}\n")
        return 0
    monkeypatch.setattr(runner, "_run_filtered", run)
    mv = tmp_path / "mv.json"
    mv.write_text(json.dumps(MV), encoding="utf-8")
    res = runner.render(str(mv), aspect="9x16", cover=1.5)
    ((name, png),) = res["outputs"].items()
    size = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", png],
                          check=True, capture_output=True, text=True).stdout.strip()
    assert name == "song-cover-1.5s.png" and size == "1080,1080" and not still.exists()


def test_still_and_cover_together_are_refused(tmp_path, capsys, monkeypatch):
    mv, calls = capture_render(tmp_path, monkeypatch, "")
    code, res = run_json(capsys, ["render", str(mv), "--still", "1", "--cover", "1"])
    assert code != 0 and not calls
