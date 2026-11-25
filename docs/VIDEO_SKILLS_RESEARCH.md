# Video skills research (2026-11-25)

Fifteen external repos were read (one read-only reviewer each) to find ideas for this generator.
Nothing was vendored: ideas were reimplemented, and the only adapted maths (measured eases) comes
from an Apache-2.0 source with attribution in the file. Status: **Adopted** = in this repo now,
**Validated** = run in a CPU-only sandbox, **Not validated** = needs something the sandbox lacks.

| Repo | Licence | What it really is | What we took | Status |
|---|---|---|---|---|
| kaomei/stickman-video-director | MIT | Skill + Node pipeline, 16 stick styles (A1-A8, B1-B8) | Already had A2/B1; now storyboard rules (change every 2-3 s, idle ≤ 2.5 s, hook 2-5 s) in `shorts-video-director` and the idle gate in `video_qa.py` | Adopted, validated (the gate caught a 4.3 s idle stretch in the line demo; fixed with two beats) |
| NiazMorshed2007/reanimate | MIT | Skill: capture a web animation (Playwright), clone it, pixel/timing diff | Idea of per-frame timing diff and easing fit; deterministic clock rule | Ideas only, not run |
| JuneYaooo/rea-video | Apache-2.0 | Shot segmentation (HSV histogram + pixel diff) and shot classification, VLM optional | Histogram-distance cuts and frozen-frame detection, reimplemented in `scripts/video_qa.py` | Adopted, validated |
| yihui-dev/awesome-opus5-5-videos | MIT (prompts belong to their authors) | 703 prompts in `data/videos.json` (motion 369, 3d 117, explainer 116, interactive 101) | Format "history of AI timeline" (kloss-xyz-067876) became the HTML PoC, own script; hook/scene/cadence patterns in the director skill | Adopted as inspiration, credited in `story.json` |
| Tejashmakwana/motionmaxxing | Apache-2.0 (bundled GSAP is not) | Motion-direction skill + HTML runtime; eases fitted to human-made films | Eases `soft_land`, `snap_settle`, `pop_over`, `soft_in_out`, `accel_exit` + frame budgets; final hold ≤ 1.4 s | Adopted (`scripts/stickman/eases.py`, `prototypes/html-motion/src/eases.js`), unit-tested |
| patch-gg/pixelfx | MIT (gallery font excluded) | 244 pixel-art effects as JS modules, headless Node renderer | Checked that effects render headless to MP4/contact sheet (`ui/confetti`, `transitions/glitch-wipe`); transitions are 320x180 landscape and need a 9:16 port before use | Validated, not integrated |
| greensock/GSAP | GSAP Standard "no charge" licence (free incl. commercial; not OSI) | Animation engine | Paused timeline + `seek(t)`, `ticker.sleep()`, `lazy:false` for frame capture | Adopted in the HTML PoC (npm `gsap@3.15.1`); review the licence text at gsap.com/standard-license before production |
| mrdoob/three.js | MIT | 3D engine | Wireframe motif drawn per frame with `preserveDrawingBuffer`, no animation loop, SwiftShader | Adopted in the HTML PoC (`three@0.187.0`), validated on CPU |
| ahujasid/mcp-for-blender | MIT | Blender addon (TCP 9876, no auth) + MCP server; `execute_code` runs arbitrary Python | Nothing; security notes only (arbitrary exec, refuses `blender -b`) | **Not validated**: needs Blender GUI/xvfb |
| Comfy-Org/ComfyUI | GPL-3.0 | Node-graph image/video generation server | Integration path is HTTP only (`POST /prompt`, `/history/{id}`, `/view`) so GPL does not reach our code | **Not validated**: needs model weights (HuggingFace blocked) and ideally a GPU |
| Leonxlnx/taste-skill | MIT | Web design taste skill + Node gates | Type-step, contrast, single-accent, line-length and copy rules ported to video in `shorts-frame-critic`; its Stop hook and asset downloaders were not copied | Adopted as rubric |
| pbakaus/impeccable | Apache-2.0 | Design/copy critic skill + Rust detector | Rubric structure (score, evidence, fix), anti-pattern list, copy tells translated to pt-BR | Adopted as rubric; detector not run (HTML/CSS only, English copy) |
| nexu-io/open-design | Apache-2.0 | Local design workspace app (daemon + web + desktop), 171 skills | Idea: DESIGN.md + tokens.css per brand; the app itself is too heavy here | Ideas only |
| heygen-com/hyperframes | Apache-2.0 | HTML → MP4: `window.__timelines`, `data-start/duration`, seek per frame | Same contract in `prototypes/html-motion` (paused timeline, `window.__hf.seek(t)`), own lean capture loop | Adopted, validated |
| remotion-dev/remotion | Remotion licence (free ≤ 3 employees / individuals; company licence above) | React → MP4 | Already prototyped in `prototypes/motion-remotion`; its agent rules (frame-driven animation, no CSS animations) are in the director skill | Existing prototype; licence threshold noted |

## Open-source voice

edge-tts (WebSocket) and HuggingFace (Piper voices) are blocked in the cloud sandbox. **Kokoro-82M**
(Apache-2.0 weights, `kokoro-onnx` MIT) runs on CPU with model files from the kokoro-onnx GitHub
release and has pt-BR voices `pm_alex`, `pm_santa`, `pf_dora`. It returns no word timings, so
`scripts/kokoro_tts.py` synthesizes clause by clause and spreads words by spoken weight; captions stay
within one clause of the voice. Real-time factor measured here: ~0.6x (4.4 s of audio in 2.7 s).

## Evidence

Sample videos, QA JSON and contact sheets: `/mnt/project-files/shorts-generator/video-skills/`
(project files, not in git). Re-run: see `.claude/skills/shorts-video-director/SKILL.md`.
