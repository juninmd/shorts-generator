# Animated stick-figure shorts (Antonio Code)

`bun run cli generate:animated --demo` renders a vertical short where each chapter is a
procedurally animated stick figure (`scripts/stick_pose.py`, `scripts/stick_render.py`) with a
prop (database, warning, shield), narrated and captioned by the shared comic pipeline.
Inspired by [stickman-video-director](https://github.com/kaomei/stickman-video-director): one
character, pose presets, captions. No LLM or external asset is needed for the demo.

## Voice

| `ANIMATED_VOICE` | Behaviour |
|---|---|
| unset | ElevenLabs if `ELEVENLABS_API_KEY` **and** `ELEVENLABS_VOICE_ID` are set, else edge-tts |
| `elevenlabs` / `edge` / `silent` | forces that provider |

A failing provider is logged and the chapter falls back (ElevenLabs → edge-tts → silent). Silent
chapters keep evenly spaced word timings so captions still sync.

Secret name for deployment: `ELEVENLABS_API_KEY` (optional), with `ELEVENLABS_VOICE_ID`.

## Requirements

Python 3 with Pillow (`pip install pillow`), FFmpeg, and `edge-tts` only for the local voice.
`PYTHON_BIN` overrides the interpreter.

## Custom books

`--book <path.json>` takes an `AnimatedBook`: `{ id, title, chapters: [{ id, title, imagePath, pose, prop, narrationText }] }`.
`imagePath` is overwritten with a generated poster, so any value works. `pose` is one of
`idle | talk | point | alarm | typing`; `prop` is one of `none | database | warning | shield`.

## Status

PoC. The ElevenLabs HTTP flow is unit-tested against mocks only; verify it against the live API
before relying on it. Scripts are not generated from a topic yet (the demo script is hand-written).
