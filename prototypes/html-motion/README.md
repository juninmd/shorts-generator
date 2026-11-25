# Protótipo: HTML → vídeo (GSAP + three.js + voz Kokoro)

Cena HTML 1080x1920 no contrato do HyperFrames (Apache-2.0): uma timeline GSAP pausada em
`window.__timelines.main` e `window.__hf.seek(t)`, que desenha o quadro do tempo `t` (GSAP, three.js
e legendas). O renderer abre a página no Chromium headless, chama `seek` por quadro e manda os JPEGs
para o ffmpeg junto com a narração. Eases medidos do motionmaxxing (`src/eases.js`).

Episódio de exemplo: "A história da IA em 40 segundos" (`story.json`), pauta inspirada no prompt
`kloss-xyz-067876` do catálogo awesome-opus5-5-videos, roteiro e visual próprios.

```bash
cd prototypes/html-motion
npm install
export KOKORO_MODEL_DIR=/caminho/kokoro   # kokoro-v1.0.onnx + voices-v1.0.bin
export PYTHON_BIN=python3                 # com kokoro-onnx e soundfile
npm run narrate                           # out/<cena>.wav, out/plan.json, out/voice.wav
npm run render -- --still 1,6,20          # quadros de conferência
npm run render                            # out/video.mp4
python ../../scripts/video_qa.py out/video.mp4
npm test                                  # timing e paginação de legendas
```

`CHROME_PATH` aponta para outro Chromium (padrão: o do Playwright em `/opt/pw-browsers`). O WebGL
roda em SwiftShader (CPU). O servidor local só serve `src/`, as builds do GSAP/three.js e as fontes
do repositório.

Licenças: GSAP usa a "Standard no-charge license" (gratuita, inclusive comercial, mas não OSI);
three.js MIT; Poppins OFL. Detalhes em `docs/VIDEO_SKILLS_RESEARCH.md`.
