---
name: shorts-video-director
description: Direct a new code-rendered short in this repo (stick-figure generate:animated book, or an HTML/GSAP/three.js scene) from idea to MP4 with an open-source voice and QA gates. Use for "cria um short animado", "novo vídeo do Antonio Code", "roteiro com bonequinho", "vídeo em HTML".
---

# Shorts video director

Turns an idea into a rendered 1080x1920 short using the engines already in this repo. Adapted from
kaomei/stickman-video-director (MIT: storyboard → shots → render → QA), motionmaxxing (Apache-2.0:
measured eases and timing), HyperFrames (Apache-2.0: seekable HTML contract) and the
awesome-opus5-5-videos catalog (MIT: hooks and scene structures). No code is copied from repos
whose licence does not allow it; see `docs/VIDEO_SKILLS_RESEARCH.md`.

## 1. Pick the engine

| Want | Engine | Entry |
|---|---|---|
| Character acting a story (explainer, humour, bible) | Pillow stick figures | `bun run cli generate:animated --book <book.json> --style pop\|line` |
| Data, timelines, kinetic type, 3D motif | HTML + GSAP + three.js | `prototypes/html-motion` (`story.json` → `npm run build`) |
| Real footage | clip pipeline | `bun run cli generate` |

## 2. Write the storyboard first (one row per chapter/scene)

Columns: id · on-screen heading (≤ 4 words) · narration (pt-BR) · beats (cue word → pose/face/prop) · purpose.

- Hook in the first 2-5 s: a question or a stake, never a greeting.
- ~20-25 words per 10 s of narration; read numbers the way they should be spoken.
- A visual change every 2-3 s; the main character never idles > 2.5 s (add a beat on a cue word).
- One idea per chapter; the last chapter is the CTA and holds ≤ 1.4 s after the voice ends.
- Facts (dates, names, numbers) must be checkable; no invented statistics.

## 3. Motion rules (frames at 30 fps)

| Move | Ease | Frames |
|---|---|---|
| Text/panel/limb settling | `soft_land` / `softLand` (expo-out k=3.41) | 12 |
| Hero entry | `snap_settle` | 11 |
| Prop/scene pop (once per beat) | `pop_over` (peak 1.08 at t≈0.72) | 15 |
| Opacity | `soft_in_out` | 6-9 |
| Exit | `accel_exit` (t^2.6) | 13 |

Stagger 1-3 frames. Python: `scripts/stickman/eases.py`; JS: `prototypes/html-motion/src/eases.js`.
HTML scenes: one paused GSAP timeline, `gsap.ticker.sleep()`, `lazy:false`, everything a function of
`seek(t)`; no `Date.now`, unseeded `Math.random`, CSS animations or network fetches.

## 4. Voice

Open-source and local by default: Kokoro-82M (`scripts/kokoro_tts.py`, voices `pm_alex`, `pm_santa`,
`pf_dora`). Setup: `pip install kokoro-onnx soundfile`, download `kokoro-v1.0.onnx` and
`voices-v1.0.bin` from the kokoro-onnx GitHub release `model-files-v1.0`, set `KOKORO_MODEL_DIR`.
Stick shorts: `ANIMATED_VOICE=kokoro` (or just `KOKORO_MODEL_DIR`); other narrated flows:
`TTS_ENGINE=kokoro`. ElevenLabs stays first when its key and voice id exist.

## 5. Gate before delivering

1. `python scripts/video_qa.py <out.mp4> --json qa.json` must exit 0 (idle ≤ 2.5 s, final hold
   ≤ 1.4 s, mean volume ≥ -35 dB). Fix the storyboard, not the threshold.
2. Run the `shorts-frame-critic` skill on 3-4 stills.
3. Deliver the MP4 with the QA JSON and a contact sheet.
