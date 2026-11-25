#!/usr/bin/env python3
"""Synthesize narration + estimated word timestamps with Kokoro-82M (open-source, CPU, offline).

Same contract as comic_tts.py:
    python kokoro_tts.py <text_file> <out_audio_wav> <out_words_json> [voice]

Needs `pip install kokoro-onnx soundfile` and KOKORO_MODEL_DIR holding kokoro-v1.0.onnx and
voices-v1.0.bin (GitHub release thewh1teagle/kokoro-onnx model-files-v1.0). Kokoro returns no word
boundaries, so each clause is synthesized on its own and its words are spread over the clause audio
by spoken weight; captions stay within a clause of the voice.
"""
import json
import os
import re
import sys

PAUSE_AFTER = {",": 0.12, ";": 0.18, ":": 0.18, ".": 0.28, "!": 0.28, "?": 0.28}
EDGE = 0.04  # Kokoro pads each clause with a little silence on both ends
# split only where punctuation is followed by a space or the end: "3,50", "1.000" and "R$ 2,5" stay whole
_CLAUSE = re.compile(r".+?(?:[,;:.!?]+(?=\s|$)|$)")


def split_clauses(text: str) -> list:
    """Clauses keep their trailing punctuation so the pause and the prosody both follow it."""
    return [c.strip() for c in _CLAUSE.findall(" ".join(text.split())) if c.strip(" ,;:.!?")]


def spoken_weight(word: str) -> float:
    letters = sum(ch.isalnum() for ch in word)
    return max(1, letters) + 1.5  # +1.5: every word carries an onset/transition cost


def word_times(clause: str, start: float, duration: float) -> list:
    """Spreads a clause's words over [start+EDGE, start+duration-EDGE] by spoken weight."""
    words = clause.split()
    span = max(0.05, duration - 2 * EDGE)
    total = sum(spoken_weight(w) for w in words) or 1.0
    t, out = start + EDGE, []
    for w in words:
        d = span * spoken_weight(w) / total
        out.append({"word": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


def pause_for(clause: str) -> float:
    return PAUSE_AFTER.get(clause[-1], 0.08)


def synth(text: str, out_audio: str, out_words: str, voice: str) -> None:
    import numpy as np
    import soundfile as sf
    from kokoro_onnx import Kokoro

    model_dir = os.environ.get("KOKORO_MODEL_DIR", "")
    kokoro = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
    speed = float(os.environ.get("KOKORO_SPEED") or 1.0)
    lang = os.environ.get("KOKORO_LANG") or "pt-br"
    chunks, words, t, rate = [], [], 0.0, 24000
    for clause in split_clauses(text):
        samples, rate = kokoro.create(clause, voice=voice, speed=speed, lang=lang)
        dur = len(samples) / rate
        words += word_times(clause, t, dur)
        gap = pause_for(clause)
        chunks += [samples, np.zeros(int(gap * rate), dtype=samples.dtype)]
        t += dur + gap
    if not chunks:
        raise ValueError("no speakable text")
    sf.write(out_audio, np.concatenate(chunks[:-1]), rate)  # drop the trailing pause
    with open(out_words, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


def main() -> None:
    if len(sys.argv) < 4:
        print("usage: kokoro_tts.py <text_file> <out_audio> <out_words_json> [voice]", file=sys.stderr)
        sys.exit(1)
    text_file, out_audio, out_words = sys.argv[1:4]
    voice = sys.argv[4] if len(sys.argv) > 4 else "pm_alex"
    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        print("empty narration text", file=sys.stderr)
        sys.exit(1)
    synth(text, out_audio, out_words, voice)


if __name__ == "__main__":
    main()
