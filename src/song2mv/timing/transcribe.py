"""Transcribe a song with faster-whisper several times, keeping every run with word timestamps.

Why several runs: on our test song, two runs with the same file and settings gave 342 and 380 words,
and one of them skipped 15 seconds (five sung lines) completely. Whisper falls back to random sampling
when it is unsure, and where its 30-second windows fall changes what it hears. So run k gets random
seed k and starts after a different amount of leading silence (which moves the window edges). align.py
then merges the runs in lyric space, where they can be compared word by word.

Runs already on disk are reused, so raising "runs" from 3 to 5 only transcribes runs 4 and 5.

Usage: python -m song2mv.timing.transcribe song.mp3 work/asr [--runs 3] [--model small] [--language ko]
"""
from __future__ import annotations

import argparse
import os
import time

from .lib import write_json

SR = 16000
_models: dict = {}


def pad_for(run: int) -> float:
    """Seconds of silence in front of run `run` (1-based). Run 1 hears the file as is."""
    return round(((run - 1) * 3.7) % 11, 2)


def load_model(w: dict):
    key = (w["model"], w["device"], w["compute_type"], w["threads"])
    if key not in _models:
        from faster_whisper import WhisperModel
        _models[key] = WhisperModel(w["model"], device=w["device"], compute_type=w["compute_type"], cpu_threads=w["threads"])
    return _models[key]


def decode(audio_path: str):
    from faster_whisper import decode_audio
    return decode_audio(audio_path, sampling_rate=SR)


def transcribe_array(audio, w: dict, language=None, offset=0.0, pad=0.0, seed=None, prompt=None) -> dict:
    """`audio` is 16 kHz mono. Returned times are song times: `offset` (where this clip starts in the song)
    added, `pad` (leading silence we inserted) removed."""
    import ctranslate2
    import numpy as np
    if seed is not None:
        ctranslate2.set_random_seed(seed)
    if pad > 0:
        audio = np.concatenate([np.zeros(int(pad * SR), dtype=audio.dtype), audio])
    segments, info = load_model(w).transcribe(
        audio, language=language, word_timestamps=True, vad_filter=False, beam_size=w.get("beam_size", 5),
        condition_on_previous_text=False, initial_prompt=prompt)
    shift = offset - pad
    segs, words = [], []
    for s in segments:
        segs.append({"start": round(s.start + shift, 2), "end": round(s.end + shift, 2), "text": s.text.strip()})
        for wd in s.words or []:
            if wd.end + shift <= offset:  # heard inside the inserted silence
                continue
            words.append({"t": wd.word.strip(), "s": round(max(offset, wd.start + shift), 3),
                          "e": round(wd.end + shift, 3), "p": round(wd.probability, 3)})
    return {"language": info.language, "segments": segs, "words": words}


def run_all(audio_path: str, out_dir: str, w: dict, language=None, force=False) -> list[str]:
    paths, audio = [], None
    for k in range(1, int(w["runs"]) + 1):
        p = os.path.join(out_dir, f"run{k}.json")
        paths.append(p)
        if os.path.exists(p) and not force:
            print(f"  run {k}: cached")
            continue
        if audio is None:
            audio = decode(audio_path)
        t0 = time.time()
        res = transcribe_array(audio, w, language, pad=pad_for(k), seed=k)
        res.update(run=k, pad=pad_for(k), seed=k, model=w["model"])
        write_json(res, p)
        print(f"  run {k}: {len(res['words'])} words (lead-in {pad_for(k)} s, seed {k}, {time.time() - t0:.0f} s)")
    return paths


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("out_dir")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--force", action="store_true", help="re-transcribe runs that are already on disk")
    a = ap.parse_args()
    run_all(a.audio, a.out_dir, {"model": a.model, "runs": a.runs, "device": a.device, "compute_type": a.compute_type,
                                 "threads": a.threads, "beam_size": 5}, a.language, a.force)
