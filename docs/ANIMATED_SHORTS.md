# Animated stick-figure shorts (Antonio Code)

`bun run cli generate:animated --demo --style pop|line` renders a 9:16 short where every chapter is an
acted scene: a rigged stick figure changes pose and expression, props appear as their words are
spoken, captions and effects follow the voice. The look follows two styles of
[stickman-video-director](https://github.com/kaomei/stickman-video-director) (MIT), re-implemented as
local code:

| `--style` | Reference | Look |
|---|---|---|
| `pop` (default) | A2 · Modern Pop (Style 2A) | high-key white studio, perspective grid floor, red-beanie / yellow-tee figure, cyan glass holograms |
| `line` | B1 · Minimal Line Art | warm paper with a faint grid, fine irregular pen figure, crayon props drawn stroke by stroke, handwritten heading with red emphasis |

Both share one rig (13 poses, eased transitions, breathing, talk gestures, walk-in), seven expressions
with blinking and word-driven lip movement, nine props (terminal, database, shield, warning,
checklist, approval, robot, lock, x) with states (`danger`, `aprovar`, `negar`), single-line semantic
captions in the style's own font, and synthesized effects (pop, scribble, alarm, ding, whoosh).
Frames are drawn at 2x and downsampled; `STICK_SUPERSAMPLE` and `STICK_WORKERS` tune cost.

## Writing a book

`--book <path.json>` takes an `AnimatedBook` (`src/core/animated/animated-types.ts`):
`{ id, title, style?, chapters: [{ id, title, imagePath, heading, emphasis?, enter?, narrationText, beats }] }`.
A beat fires when the narration speaks a word starting with `cue` (accents and case ignored), else at
its `at` fraction. It may set `pose`, `face`, `prop` (`slot`, `id`, `lines`, `items`, `label`, `title`),
`set: { id, state }` or `sfx`. `imagePath` is replaced by a generated poster.

## Voice

| `ANIMATED_VOICE` | Behaviour |
|---|---|
| unset | ElevenLabs if `ELEVENLABS_API_KEY` **and** `ELEVENLABS_VOICE_ID` are set, else Kokoro if `KOKORO_MODEL_DIR` is set, else edge-tts |
| `elevenlabs` / `kokoro` / `edge` / `silent` | forces that provider |

Kokoro is the open-source local voice (`scripts/kokoro_tts.py`, `KOKORO_VOICE` = `pm_alex`,
`pm_santa` or `pf_dora`); word timings are estimated per clause. Setup in
`docs/VIDEO_SKILLS_RESEARCH.md`.

A failing provider is logged and the rest of the run stays on the fallback (ElevenLabs → edge-tts →
silent, or Kokoro → silent), so one short never mixes voices. Silent chapters keep evenly spaced word timings.
Deployment secret: `ELEVENLABS_API_KEY` (optional), with `ELEVENLABS_VOICE_ID`.

## Requirements and checks

Python 3 with Pillow, FFmpeg, `edge-tts` only for that voice; `PYTHON_BIN` overrides the interpreter.
Fonts: bundled Poppins ExtraBold and Caveat (OFL, `assets/fonts`). Renderer tests:
`python -m unittest discover -s tests/python`.

## Status

PoC. ElevenLabs is unit-tested against mocks only. Scripts are hand-written (no topic → script step
yet). Layouts are drawn for 1080x1920 only.
