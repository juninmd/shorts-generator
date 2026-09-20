#!/usr/bin/env python3
"""Synthesize narration audio + word-level timestamps via edge-tts.

Usage: python comic_tts.py <text_file> <out_audio_mp3> <out_words_json> [voice]
Prints nothing on success; non-zero exit + stderr message on failure.
"""
import asyncio
import json
import sys

import edge_tts


async def synth(text: str, out_audio: str, out_words: str, voice: str) -> None:
    communicate = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    words = []
    with open(out_audio, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "word": chunk["text"],
                    "start": chunk["offset"] / 10_000_000,
                    "end": (chunk["offset"] + chunk["duration"]) / 10_000_000,
                })
    with open(out_words, "w", encoding="utf-8") as words_file:
        json.dump(words, words_file, ensure_ascii=False)


def main() -> None:
    if len(sys.argv) < 4:
        print("usage: comic_tts.py <text_file> <out_audio> <out_words_json> [voice]", file=sys.stderr)
        sys.exit(1)
    text_file, out_audio, out_words = sys.argv[1:4]
    voice = sys.argv[4] if len(sys.argv) > 4 else "pt-BR-AntonioNeural"
    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        print("empty narration text", file=sys.stderr)
        sys.exit(1)
    asyncio.run(synth(text, out_audio, out_words, voice))


if __name__ == "__main__":
    main()
