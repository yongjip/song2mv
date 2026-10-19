"""Measure `song2mv sync` lyric timing on JamendoLyrics MultiLang, the standard lyrics-alignment benchmark: 79 songs
(20 English, 20 German, 20 Spanish, 19 French) whose word start and end times were annotated by people.

  python -I bench/jamendolyrics.py --lang en       # download, sync every English song without a result yet, score
  python -I bench/jamendolyrics.py --no-run        # score the runs already on disk
  python -I bench/jamendolyrics.py --rerun         # after a change to song2mv: sync again, reusing the whisper runs
  python -I bench/jamendolyrics.py --markdown      # print the tables as Markdown (no lyric text in them)

Run it with the repository's .venv (the `sync` extra; huggingface_hub comes with faster-whisper). Nothing goes into
the repository: everything lives in a cache, by default ~/.cache/song2mv-bench —
  jamendolyrics/                 the dataset at a pinned revision (audio, lyric files, annotations)
  runs/<song>/                   song2mv's work folder for that song (the `--out` of sync)
  runs/<song>/bench/             sync's --json result, its progress log, and run.json (wall time, machine load)
  results/jamendolyrics.json     the scores, per song and per language
The annotations are MIT. Each song's audio and lyric file has its own Creative Commons licence, most of them
non-commercial (column LicenseType in JamendoLyrics.csv, copied into the results).

What is measured. Every song runs with default settings (whisper small × 3):
  song2mv sync AUDIO --lyrics lyrics/<song>.txt --language <en|de|es|fr> --out runs/<song> --json
sync gets the dataset's own lyric file, so our words are the reference words: song2mv splits lines on spaces and
the annotations are one row per space-separated word. The script still matches our words to the reference word by
word (difflib on normalised tokens) and reports every token that does not match, so a tokenisation difference
shows up in the numbers instead of shifting them.
  - word onset error: our word time − annotated word start, as written to lyrics.json (snapped to 16ths of the beat
    grid) and unsnapped (snap_per_beat 0). The unsnapped times are rebuilt from the work folder with the pipeline's
    own functions (cached whisper runs and re-heard gaps, nothing is transcribed); the same rebuild with snapping on
    must reproduce lyrics.json exactly, and the result says whether it did;
  - a line's start error is its first word's; a line is wrong when it starts more than 0.3 s off (also counted at
    1 s). check_by_ear is scored against that: recall = wrong lines it lists, precision = listed lines that are wrong.
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import csv
import difflib
import io
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time

REPO = "jamendolyrics/jamendolyrics"
REVISION = "de188c963fd4539bc769b3feb83582e5a9595e36"  # 2025-03-06
FILES = ["JamendoLyrics.csv", "README.md", "LICENSE", "annotations/*", "lyrics/*", "subsets/*", "vocab/*"]
LANGS = {"English": "en", "German": "de", "Spanish": "es", "French": "fr"}
WRONG = 0.3  # a line that starts further off than this is wrong
BAD = 1.0
WITHIN = (0.1, 0.3, 1.0)
SYNC = [sys.executable, "-I", "-m", "song2mv", "sync"]


def songs(data: str, langs: list[str], names: list[str] | None) -> list[dict]:
    out = []
    for r in csv.DictReader(open(os.path.join(data, "JamendoLyrics.csv"), encoding="utf-8")):
        name, lang = r["Filepath"].removesuffix(".mp3"), LANGS[r["Language"]]
        if lang not in langs or (names and name not in names):
            continue
        out.append({"name": name, "lang": lang, "artist": r["Artist"], "title": r["Title"], "genre": r["Genre"],
                    "license": r["LicenseType"].removeprefix("CC").strip().replace("  ", " "), "url": r["URL"],
                    "lyric_overlap": r["LyricOverlap"] == "true", "polyphonic": r["Polyphonic"] == "true",
                    "non_lexical": r["NonLexical"] == "true",
                    "audio": os.path.join(data, "subsets", lang, "mp3", name + ".mp3"),
                    "lyrics": os.path.join(data, "lyrics", name + ".txt")})
    return out


def download(data: str) -> None:
    if os.path.exists(os.path.join(data, "JamendoLyrics.csv")) and os.path.isdir(os.path.join(data, "subsets")):
        return
    from huggingface_hub import snapshot_download
    print(f"downloading {REPO}@{REVISION[:7]} (~400 MB) to {data}", file=sys.stderr)
    snapshot_download(REPO, repo_type="dataset", revision=REVISION, local_dir=data, allow_patterns=FILES)


class Load:
    """What else runs on the machine while a song syncs (`ps` every few seconds): timing on a busy laptop is not
    timing on an idle one. CPU is in % of one core; `ours` is this script and the sync it started."""

    def __init__(self, every: float = 10.0):
        self.every, self.samples, self._stop = every, [], threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join()

    def _loop(self):
        while True:
            self.sample()
            if self._stop.wait(self.every):
                return

    def sample(self):
        out = subprocess.run(["ps", "-Ao", "pid=,ppid=,pcpu=,comm="], capture_output=True, text=True).stdout
        procs = []
        for row in out.splitlines():
            p = row.split(None, 3)
            if len(p) == 4:
                procs.append((int(p[0]), int(p[1]), float(p[2]), os.path.basename(p[3])))
        children: dict[int, list[int]] = {}
        for pid, ppid, _, _ in procs:
            children.setdefault(ppid, []).append(pid)
        ours, todo = set(), [os.getpid()]
        while todo:
            ours.add(todo[-1])
            todo.extend(children.get(todo.pop(), []))
        others: dict[str, float] = {}
        for pid, _, cpu, name in procs:
            if pid not in ours:
                others[name] = others.get(name, 0.0) + cpu
        self.samples.append({"load1": os.getloadavg()[0], "ours": sum(c for pid, _, c, _ in procs if pid in ours),
                             "others": others})

    def summary(self) -> dict:
        s = self.samples
        if not s:
            return {}
        names: dict[str, float] = {}
        for x in s:
            for k, v in x["others"].items():
                names[k] = names.get(k, 0.0) + v / len(s)
        mean = lambda xs: round(statistics.mean(xs), 1)  # noqa: E731
        return {"samples": len(s), "load1_mean": mean([x["load1"] for x in s]), "load1_max": round(max(x["load1"] for x in s), 1),
                "ours_cpu_mean": mean([x["ours"] for x in s]), "others_cpu_mean": mean([sum(x["others"].values()) for x in s]),
                "others_cpu_max": round(max(sum(x["others"].values()) for x in s), 1),
                "heavy": {k: round(v) for k, v in sorted(names.items(), key=lambda kv: -kv[1]) if v >= 20}}


def sync(song: dict, runs: str, again: bool = False) -> dict:
    """Run sync for one song unless it already has a result (or `again`). Returns the run record."""
    work = os.path.join(runs, song["name"])
    rec = os.path.join(work, "bench")
    path = os.path.join(rec, "run.json")
    if os.path.exists(path) and not again:
        old = json.load(open(path, encoding="utf-8"))
        if old.get("ok"):
            return old
    os.makedirs(rec, exist_ok=True)
    cmd = SYNC + [song["audio"], "--lyrics", song["lyrics"], "--language", song["lang"], "--out", work, "--json"]
    print(f"[{song['lang']}] {song['name']} …", file=sys.stderr, flush=True)
    started = time.strftime("%Y-%m-%dT%H:%M:%S")
    t0 = time.time()
    with Load() as load, open(os.path.join(rec, "sync.log"), "w", encoding="utf-8") as log:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=log, text=True, cwd=runs)
    wall = time.time() - t0
    try:
        res = json.loads(p.stdout)
    except ValueError:
        res = {"ok": False, "error": {"message": f"no JSON on stdout (exit {p.returncode})"}}
    with open(os.path.join(rec, "sync.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    out = {"ok": bool(res.get("ok")), "exit": p.returncode, "started": started, "wall_seconds": round(wall, 1),
           "song2mv": song2mv_version(), "cmd": cmd[2:], "load": load.summary()}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    msg = f"{res.get('seconds')} s, sources {res.get('line_sources')}" if out["ok"] else res.get("error", {}).get("message")
    print(f"    {msg}  (others on the machine: {out['load'].get('others_cpu_mean')} % CPU)", file=sys.stderr, flush=True)
    return out


def song2mv_version() -> dict:
    import song2mv
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    git = lambda *a: subprocess.run(["git", "-C", root, *a], capture_output=True, text=True).stdout.strip()  # noqa: E731
    return {"version": song2mv.__version__, "commit": git("rev-parse", "--short", "HEAD"),
            "src_changed": bool(git("status", "--porcelain", "--", "src"))}


def reference(song: dict) -> list[dict]:
    """The annotated lines: lyric-file lines, each with its words' annotated start and end times."""
    data = os.path.dirname(os.path.dirname(song["lyrics"]))
    lines = [x.strip() for x in open(song["lyrics"], encoding="utf-8").read().splitlines() if x.strip()]
    ann = list(csv.DictReader(open(os.path.join(data, "annotations", "words", song["name"] + ".csv"), encoding="utf-8")))
    words = open(os.path.join(data, "lyrics", song["name"] + ".words.txt"), encoding="utf-8").read().splitlines()
    if len(ann) != len(words) or [w for x in lines for w in x.split()] != words:
        raise SystemExit(f"{song['name']}: the dataset's lyric file, word list and annotations disagree")
    out, k = [], 0
    for text in lines:
        n = len(text.split())
        out.append({"text": text, "words": [{"w": words[k + i], "s": float(ann[k + i]["word_start"]),
                                             "e": float(ann[k + i]["word_end"])} for i in range(n)]})
        k += n
    return out


def refill(work: str) -> tuple[dict, list[dict], dict, float]:
    """A work folder's song config, its merged lines with the re-heard gaps filled in again from reprompt.json (with
    sync's own fill_gaps: nothing is transcribed), its grid and the song's end."""
    from song2mv.timing import lib, transcribe
    from song2mv.timing.reprompt import fill_gaps

    def no_decode(path):
        raise RuntimeError("a re-heard gap is missing from reprompt.json")
    decode, transcribe.decode = transcribe.decode, no_decode
    try:
        cfg = lib.load_config(os.path.join(work, "song.json"))
        merged = json.load(open(os.path.join(work, "merged.json"), encoding="utf-8"))["lines"]
        grid = json.load(open(os.path.join(work, "grid.json"), encoding="utf-8"))
        end_song = float(cfg.get("end") or lib.audio_duration(cfg["audio"]))
        with tempfile.TemporaryDirectory() as td, contextlib.redirect_stdout(io.StringIO()):
            heard = os.path.join(td, "reprompt.json")
            if os.path.exists(os.path.join(work, "reprompt.json")):
                shutil.copyfile(os.path.join(work, "reprompt.json"), heard)
            merged = fill_gaps(merged, cfg, end_song, heard, key=None)
        lib.WARNINGS.clear()
    finally:
        transcribe.decode = decode
    return cfg, merged, grid, end_song


def finish_lines(merged: list[dict], cfg: dict, grid: dict, end_song: float, snap_per_beat: int | None = None) -> list[dict]:
    """sync's last steps on filled merged lines: manual values, estimates for unplaced lines, interpolation, snapping."""
    from song2mv.timing import lib
    from song2mv.timing.build_lyrics import apply_manual, estimate, finish
    merged = copy.deepcopy(merged)
    with contextlib.redirect_stdout(io.StringIO()):
        apply_manual(merged, cfg.get("manual") or {})
        estimate(merged, end_song)
        out = finish(merged, grid, int(cfg.get("snap_per_beat") or 0) if snap_per_beat is None else snap_per_beat, end_song)
    lib.WARNINGS.clear()
    return out


def rebuild(work: str) -> tuple[list[dict], list[dict], dict[str, list[bool]]]:
    """Final lines as sync wrote them and with snap_per_beat 0, from the work folder alone, plus which words had a
    time of their own (whisper, re-heard or manual) before in-line interpolation, by line id. Nothing is transcribed."""
    from song2mv.timing.build_lyrics import apply_manual
    cfg, merged, grid, end_song = refill(work)
    placed = copy.deepcopy(merged)
    with contextlib.redirect_stdout(io.StringIO()):
        apply_manual(placed, cfg.get("manual") or {})
    own = {r["id"]: [t is not None for t in r["wt"]] for r in placed}
    return finish_lines(merged, cfg, grid, end_song), finish_lines(merged, cfg, grid, end_song, 0), own


def stats(errs: list[float]) -> dict:
    a = [abs(e) for e in errs]
    if not a:
        return {"n": 0}
    out = {"n": len(a), "mean": round(statistics.mean(a), 3), "median": round(statistics.median(a), 3)}
    for w in WITHIN:
        out[f"le{w:g}"] = round(sum(x <= w + 1e-9 for x in a) / len(a), 4)
    out["signed_median"] = round(statistics.median(errs), 3)
    return out


def score(song: dict, runs: str) -> dict:
    from song2mv.timing.lib import load_config, norm, parse_lyrics
    work = os.path.join(runs, song["name"])
    run = json.load(open(os.path.join(work, "bench", "run.json"), encoding="utf-8"))
    res = json.load(open(os.path.join(work, "bench", "sync.json"), encoding="utf-8"))
    ref = reference(song)
    ours = json.load(open(os.path.join(work, "lyrics.json"), encoding="utf-8"))["lines"]
    snapped, raw, own = rebuild(work)
    same = [(r["id"], r["start"], r["end"], [w["t"] for w in r["words"]]) for r in ours] == \
           [(r["id"], r["start"], r["end"], [w["t"] for w in r["words"]]) for r in snapped]
    merged = {r["id"]: r for r in json.load(open(os.path.join(work, "merged.json"), encoding="utf-8"))["lines"]}
    parsed = parse_lyrics(os.path.join(work, "lyrics.txt"), load_config(os.path.join(work, "song.json")))
    by_id = {r["id"]: r for r in ours}
    raw = {r["id"]: r for r in raw}

    # our words (from the lyric sheet as song2mv parsed it) ↔ reference words, by normalised token
    mine = [(r["id"], k, w) for r in parsed for k, w in enumerate(r["words"])]
    theirs = [(i, k, w["w"]) for i, x in enumerate(ref) for k, w in enumerate(x["words"])]
    sm = difflib.SequenceMatcher(None, [norm(w) for *_, w in mine], [norm(w) for *_, w in theirs], autojunk=False)
    pairs, only_ours, only_ref = [], [], []
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "equal":
            pairs += list(zip(mine[a0:a1], theirs[b0:b1]))
        else:
            only_ours += [w for *_, w in mine[a0:a1]]
            only_ref += [w for *_, w in theirs[b0:b1]]
    # a token that matched after normalisation but is written differently (case, apostrophes) is reported too
    spelled = [(a[2], b[2]) for a, b in pairs if a[2] != b[2]]

    # snapped / unsnapped: every word. own: words with a time of their own; filled: words in a placed line that got
    # their time between (or after) their neighbours; estimated: words of lines no source placed. first / later: a
    # line's first word and the others (whisper leaves no gaps between words, so a pause before a line is heard as
    # part of its first word)
    words = {k: [] for k in ("snapped", "unsnapped", "own", "filled", "estimated", "first", "later")}
    line_errs: dict[str, list[float]] = {}
    first: dict[str, tuple[int, float]] = {}
    for (lid, k, _), (i, j, _) in pairs:
        if lid not in by_id:
            continue
        s = ref[i]["words"][j]["s"]
        d = by_id[lid]["words"][k]["t"] - s
        words["snapped"].append(d)
        words["unsnapped"].append(raw[lid]["words"][k]["t"] - s)
        words["estimated" if by_id[lid]["source"] == "estimated" else "own" if own[lid][k] else "filled"].append(d)
        words["first" if k == 0 else "later"].append(d)
        line_errs.setdefault(lid, []).append(d)
        if k == 0 and j == 0:
            first[lid] = (i, s)
    flagged = set(res.get("check_by_ear") or [])
    disorder = off_order(ours)
    lines = []
    for r in ours:
        if r["id"] not in first:
            continue
        i, s = first[r["id"]]
        m = merged.get(r["id"], {})
        # placed on another occurrence of the same words? (choruses repeat; a run can match the wrong one)
        twin = next((x for x in ref if x is not ref[i] and norm(x["text"]) == norm(r["text"])
                     and abs(x["words"][0]["s"] - r["start"]) < abs(s - r["start"]) and abs(x["words"][0]["s"] - r["start"]) <= WRONG), None)
        later = line_errs[r["id"]][1:]
        x = {"id": r["id"], "text": r["text"], "n_words": len(r["words"]), "source": r["source"],
             "runs_used": r["runs_used"], "coverage": r["coverage"], "spread": m.get("spread"),
             "start": r["start"], "ref_start": round(s, 3), "err": r["start"] - s,  # unrounded: compared with 0.3 s
             "err_unsnapped": raw[r["id"]]["start"] - s,
             "later_words_err": statistics.median(later) if later else None,
             "mean_word_err": round(statistics.mean(abs(e) for e in line_errs[r["id"]]), 3),
             "flagged": r["id"] in flagged, "out_of_order": r["id"] in disorder,
             "twin": round(twin["words"][0]["s"], 3) if twin else None}
        x["cause"] = cause(x)
        lines.append(x)
    return {
        **{k: song[k] for k in ("name", "lang", "artist", "title", "genre", "license", "url", "lyric_overlap", "polyphonic", "non_lexical")},
        "ok": True, "duration": res.get("duration"), "bpm": res.get("bpm"), "seconds": res.get("seconds"),
        "wall_seconds": run.get("wall_seconds"), "load": run.get("load"), "song2mv": run.get("song2mv"),
        "line_sources": res.get("line_sources"), "check_by_ear": res.get("check_by_ear"), "dropped": res.get("dropped"),
        "warnings": res.get("warnings"),
        "tokens": {"ours": len(mine), "reference": len(theirs), "matched": len(pairs), "only_ours": only_ours,
                   "only_reference": only_ref, "spelled_differently": spelled},
        "rebuild_matches_lyrics_json": same,
        "words": {k: stats(v) for k, v in words.items()},
        "lines": lines,
        "_errs": words,
    }


def off_order(lines: list[dict], tol: float = 1.0) -> set[str]:
    """Ids of lines off the longest chain of lines that keeps the lyric order: each line starts no more than `tol`
    seconds before the one before it in the chain. Not part of sync — a check it could add: a chorus placed on its
    other occurrence breaks the order of the sheet."""
    best, prev = [1] * len(lines), [-1] * len(lines)
    for j in range(len(lines)):
        for i in range(j):
            if lines[j]["start"] >= lines[i]["start"] - tol and best[i] + 1 > best[j]:
                best[j], prev[j] = best[i] + 1, i
    keep, k = set(), max(range(len(lines)), key=lambda j: best[j]) if lines else -1
    while k >= 0:
        keep.add(k)
        k = prev[k]
    return {r["id"] for j, r in enumerate(lines) if j not in keep}


def cause(x: dict) -> str | None:
    """The likely reason a line starts more than 0.3 s off, from what the work folder says about it."""
    if abs(x["err"]) <= WRONG:
        return None
    if x["twin"] is not None:
        return "on another occurrence of the same words"
    if x["source"] in ("estimated", "reprompt", "manual"):
        return x["source"]
    if x["later_words_err"] is not None and abs(x["later_words_err"]) <= WRONG:
        return "first word early, the rest on time" if x["err"] < 0 else "first word late, the rest on time"
    return "whole line early" if x["err"] < 0 else "whole line late"


def checked(lines: list[dict], t: float, listed=lambda x: x["flagged"]) -> dict:
    """check_by_ear (or another list) against the lines that start more than t off. Line ids repeat across songs."""
    wrong = {(x["song"], x["id"]) for x in lines if abs(x["err"]) > t}
    flag = {(x["song"], x["id"]) for x in lines if listed(x)}
    hit = len(wrong & flag)
    return {"wrong": len(wrong), "flagged": len(flag), "wrong_and_flagged": hit,
            "recall": round(hit / len(wrong), 3) if wrong else None, "precision": round(hit / len(flag), 3) if flag else None}


def summarise(results: list[dict]) -> dict:
    """Pooled over all words (or lines) of the songs, and as the mean over songs of each song's own numbers."""
    def pool(recs):
        out = {}
        if not recs:
            return out
        for kind in ("snapped", "unsnapped", "own", "filled", "estimated", "first", "later"):
            out[kind] = stats([e for r in recs for e in r["_errs"][kind]])
        per_song = {}
        for k in ("mean", "median", "le0.1", "le0.3", "le1"):
            for kind in ("snapped", "unsnapped"):
                vals = [r["words"][kind][k] for r in recs if r["words"][kind].get("n")]
                per_song[f"{kind}.{k}"] = round(statistics.mean(vals), 4) if vals else None
        out["per_song_mean"] = per_song
        out["per_song_median_of_mean_error"] = round(statistics.median(r["words"]["snapped"]["mean"] for r in recs), 3)
        lines = [dict(x, song=r["name"]) for r in recs for x in r["lines"]]
        out["lines"] = {"n": len(lines), "start_off_gt_0.3": sum(abs(x["err"]) > WRONG for x in lines),
                        "early_gt_0.3": sum(x["err"] < -WRONG for x in lines), "late_gt_0.3": sum(x["err"] > WRONG for x in lines),
                        "start_off_gt_1": sum(abs(x["err"]) > BAD for x in lines),
                        "start_off_gt_0.3_unsnapped": sum(abs(x["err_unsnapped"]) > WRONG for x in lines),
                        "signed_median_start_err": round(statistics.median(x["err"] for x in lines), 3)}
        causes: dict[str, list[int]] = {}  # cause → [lines, of them listed by check_by_ear]
        for x in lines:
            if x["cause"]:
                c = causes.setdefault(x["cause"], [0, 0])
                c[0] += 1
                c[1] += x["flagged"]
        out["causes"] = dict(sorted(causes.items(), key=lambda kv: -kv[1][0]))
        out["check_by_ear"] = {f"{WRONG:g}": checked(lines, WRONG), f"{BAD:g}": checked(lines, BAD)}
        out["order_check"] = {f"{t:g}": checked(lines, t, lambda x: x["out_of_order"]) for t in (WRONG, BAD)}
        out["check_by_ear_or_order"] = {f"{t:g}": checked(lines, t, lambda x: x["flagged"] or x["out_of_order"]) for t in (WRONG, BAD)}
        src: dict[str, int] = {}
        for r in recs:
            for k, v in (r["line_sources"] or {}).items():
                src[k] = src.get(k, 0) + v
        out["line_sources"] = src
        by_src = {}
        for s in sorted({x["source"] for x in lines}):
            xs = [x for x in lines if x["source"] == s]
            by_src[s] = {"lines": len(xs), "start_off_gt_0.3": sum(abs(x["err"]) > WRONG for x in xs),
                         "median_abs_start_err": round(statistics.median(abs(x["err"]) for x in xs), 3)}
        by_runs = {}
        for n in sorted({len(x["runs_used"]) for x in lines if x["source"] == "asr"}):
            xs = [x for x in lines if x["source"] == "asr" and len(x["runs_used"]) == n]
            by_runs[n] = {"lines": len(xs), "start_off_gt_0.3": sum(abs(x["err"]) > WRONG for x in xs)}
        out["lines_by_source"], out["asr_lines_by_runs_used"] = by_src, by_runs
        secs = [r["seconds"] for r in recs if r["seconds"]]
        dur = [r["duration"] for r in recs if r["duration"]]
        out["runtime"] = {"songs": len(recs), "sync_seconds_mean": round(statistics.mean(secs), 1),
                          "sync_seconds_median": round(statistics.median(secs), 1), "audio_seconds_mean": round(statistics.mean(dur), 1),
                          "seconds_per_audio_second": round(sum(secs) / sum(dur), 3),
                          "others_cpu_mean": round(statistics.mean(r["load"].get("others_cpu_mean", 0) for r in recs), 1)}
        out["token_mismatches"] = sum(len(r["tokens"]["only_ours"]) + len(r["tokens"]["only_reference"]) for r in recs)
        out["rebuild_mismatches"] = [r["name"] for r in recs if not r["rebuild_matches_lyrics_json"]]
        return out
    langs = [lg for lg in LANGS.values() if any(r["lang"] == lg for r in results)]
    out = {lg: pool([r for r in results if r["lang"] == lg]) for lg in langs}
    if len(langs) > 1:
        out["all"] = pool(results)
    return out


def pct(x):
    return "–" if x is None else f"{100 * x:.1f} %"


def markdown(results: list[dict], summary: dict) -> str:
    """Tables for docs/benchmark.md. Songs by name, lines by id and time: no lyric text."""
    out = []
    cols = [k for k in summary]
    out.append("| | " + " | ".join(cols) + " |")
    out.append("|---|" + "---:|" * len(cols))
    rows = [("songs", lambda s: s["runtime"]["songs"]), ("words", lambda s: s["snapped"]["n"]),
            ("mean abs onset error, s", lambda s: f"{s['snapped']['mean']:.3f}"),
            ("median abs onset error, s", lambda s: f"{s['snapped']['median']:.3f}"),
            ("words within 0.1 s", lambda s: pct(s["snapped"]["le0.1"])),
            ("words within 0.3 s", lambda s: pct(s["snapped"]["le0.3"])),
            ("words within 1 s", lambda s: pct(s["snapped"]["le1"])),
            ("median signed error, s (+ = late)", lambda s: f"{s['snapped']['signed_median']:+.3f}"),
            ("unsnapped: mean / median abs, s", lambda s: f"{s['unsnapped']['mean']:.3f} / {s['unsnapped']['median']:.3f}"),
            ("unsnapped: within 0.1 / 0.3 / 1 s", lambda s: " / ".join(pct(s["unsnapped"][f"le{w:g}"]) for w in WITHIN)),
            ("mean over songs: mean abs error, s", lambda s: f"{s['per_song_mean']['snapped.mean']:.3f}"),
            ("mean over songs: within 0.3 s", lambda s: pct(s["per_song_mean"]["snapped.le0.3"])),
            ("median over songs: mean abs error, s", lambda s: f"{s['per_song_median_of_mean_error']:.3f}"),
            ("a line's first word: within 0.3 s", lambda s: pct(s["first"]["le0.3"])),
            ("a line's first word: median signed error, s", lambda s: f"{s['first']['signed_median']:+.3f}"),
            ("later words: within 0.3 s", lambda s: pct(s["later"]["le0.3"])),
            ("later words: median signed error, s", lambda s: f"{s['later']['signed_median']:+.3f}"),
            ("lines", lambda s: s["lines"]["n"]),
            ("lines starting > 0.3 s off", lambda s: f"{s['lines']['start_off_gt_0.3']} ({pct(s['lines']['start_off_gt_0.3'] / s['lines']['n'])})"),
            ("… of them early / late", lambda s: f"{s['lines']['early_gt_0.3']} / {s['lines']['late_gt_0.3']}"),
            ("lines starting > 1 s off", lambda s: f"{s['lines']['start_off_gt_1']} ({pct(s['lines']['start_off_gt_1'] / s['lines']['n'])})"),
            ("check_by_ear lines", lambda s: s["check_by_ear"]["0.3"]["flagged"]),
            ("check_by_ear recall (> 0.3 s / > 1 s)", lambda s: " / ".join(pct(s["check_by_ear"][t]["recall"]) for t in ("0.3", "1"))),
            ("check_by_ear precision (> 0.3 s / > 1 s)", lambda s: " / ".join(pct(s["check_by_ear"][t]["precision"]) for t in ("0.3", "1"))),
            ("lines off the lyric order (a check sync could add)", lambda s: s["order_check"]["0.3"]["flagged"]),
            ("… recall / precision for lines > 1 s off", lambda s: f"{pct(s['order_check']['1']['recall'])} / {pct(s['order_check']['1']['precision'])}"),
            ("check_by_ear + order: recall (> 0.3 s / > 1 s)", lambda s: " / ".join(pct(s["check_by_ear_or_order"][t]["recall"]) for t in ("0.3", "1"))),
            ("check_by_ear + order: precision (> 0.3 s / > 1 s)", lambda s: " / ".join(pct(s["check_by_ear_or_order"][t]["precision"]) for t in ("0.3", "1"))),
            ("line sources", lambda s: ", ".join(f"{v} {k}" for k, v in sorted(s["line_sources"].items(), key=lambda kv: -kv[1]))),
            ("sync seconds per song (mean)", lambda s: f"{s['runtime']['sync_seconds_mean']:.0f}"),
            ("sync seconds per audio second", lambda s: f"{s['runtime']['seconds_per_audio_second']:.2f}"),
            ("token mismatches", lambda s: s["token_mismatches"])]
    for label, f in rows:
        out.append(f"| {label} | " + " | ".join(str(f(summary[c])) for c in cols) + " |")
    out.append("")
    causes = list(dict.fromkeys(k for c in cols for k in summary[c]["causes"]))
    out.append("| lines starting > 0.3 s off, likely cause (listed by check_by_ear) | " + " | ".join(cols) + " |")
    out.append("|---|" + "---:|" * len(cols))
    for k in causes:
        out.append(f"| {k} | " + " | ".join("{} ({})".format(*summary[c]["causes"].get(k, [0, 0])) for c in cols) + " |")
    out.append("")
    out.append("| song | lang | licence | words | mean abs, s | within 0.3 s | unsnapped within 0.3 s | lines > 0.3 s off | "
               "check_by_ear (wrong among them) | sources | sync s |")
    out.append("|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|")
    for r in results:
        w, u = r["words"]["snapped"], r["words"]["unsnapped"]
        wrong = sum(abs(x["err"]) > WRONG for x in r["lines"])
        fl = [x for x in r["lines"] if x["flagged"]]
        out.append(f"| {r['artist']} – {r['title']} | {r['lang']} | {r['license']} | {w['n']} | {w['mean']:.2f} | {pct(w['le0.3'])} | "
                   f"{pct(u['le0.3'])} | {wrong}/{len(r['lines'])} | {len(fl)} ({sum(abs(x['err']) > WRONG for x in fl)}) | "
                   + ", ".join(f"{v} {k}" for k, v in r["line_sources"].items()) + f" | {r['seconds']:.0f} |")
    out.append("")
    worst = sorted(((r, x) for r in results for x in r["lines"]), key=lambda rx: -abs(rx[1]["err"]))[:25]
    out.append("| song | line | words | ours, s | annotated, s | off, s | rest of line, s | source | runs | coverage | listed | likely cause |")
    out.append("|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|")
    for r, x in worst:
        rest = "–" if x["later_words_err"] is None else f"{x['later_words_err']:+.2f}"
        out.append(f"| {r['artist']} – {r['title']} | {x['id']} | {x['n_words']} | {x['start']:.2f} | {x['ref_start']:.2f} | {x['err']:+.2f} | "
                   f"{rest} | {x['source']} | {len(x['runs_used'])} | {' '.join(f'{c:.1f}' for c in x['coverage'])} | "
                   f"{'yes' if x['flagged'] else 'no'} | {x['cause']} |")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/song2mv-bench"))
    ap.add_argument("--lang", nargs="+", default=list(LANGS.values()), choices=list(LANGS.values()))
    ap.add_argument("--songs", nargs="+", help="only these songs (dataset names, e.g. HILA_-_Give_Me_the_Same)")
    ap.add_argument("--no-run", action="store_true", help="score the runs on disk; sync nothing")
    ap.add_argument("--rerun", action="store_true", help="sync songs that have a result again, after a change to song2mv: "
                    "the work folders keep their whisper runs, so only the steps after them run (and are timed)")
    ap.add_argument("--markdown", action="store_true", help="print Markdown tables instead of the JSON summary")
    a = ap.parse_args()
    data, runs = os.path.join(a.cache, "jamendolyrics"), os.path.join(a.cache, "runs")
    download(data)
    os.makedirs(runs, exist_ok=True)
    todo = songs(data, a.lang, a.songs)
    if not a.no_run:
        for s in todo:
            sync(s, runs, a.rerun)
    results, failed = [], []
    for s in todo:
        rec = os.path.join(runs, s["name"], "bench", "run.json")
        if not os.path.exists(rec) or not json.load(open(rec, encoding="utf-8")).get("ok"):
            failed.append(s["name"])
            continue
        results.append(score(s, runs))
    summary = summarise(results)
    os.makedirs(os.path.join(a.cache, "results"), exist_ok=True)
    out = os.path.join(a.cache, "results", "jamendolyrics.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"dataset": f"{REPO}@{REVISION}", "summary": summary, "missing": failed,
                   "songs": [{k: v for k, v in r.items() if not k.startswith("_")} for r in results]}, f, ensure_ascii=False, indent=1)
    if a.markdown:
        print(markdown(results, summary))
    else:
        print(json.dumps({"summary": summary, "missing": failed, "results": out}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
