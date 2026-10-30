# Melhorias adotadas do `ffmpeg-skill`

Referência: [`kajisho5/ffmpeg-skill`](https://github.com/kajisho5/ffmpeg-skill) — skill de edição local com FFmpeg que trata
verificação como parte do contrato (probe → editar sem perdas quando possível → checar → verificar).

Este repositório já tinha um pipeline de FFmpeg maduro (enquadramento por falante, corte de silêncios, B-roll, legendas
ASS, ducking). O que faltava era o *acabamento de entrega*: o arquivo saía tocável, mas sem os números que as plataformas
medem (loudness, sample rate, faststart, tags de cor) e sem gate que impedisse subir um arquivo fora de spec.

## O que foi adotado

| Prática do skill | Onde vive aqui | Efeito |
|---|---|---|
| `_platforms.py` — uma tabela por destino (frame, fps, codecs, loudness, duração máxima) | `src/core/delivery-spec.ts` | `DELIVERY_PLATFORM=shorts\|reels\|tiktok` define o alvo; nada de números repetidos em três arquivos |
| `export.py` — presets de entrega, `+faststart`, tags BT.709, matriz BT.601→BT.709 | `src/core/encode-settings.ts` | GOP fixo de 2 s, teto de bitrate, `-profile high -level 4.1`, AAC 48 kHz estéreo, `+faststart` |
| `color.py --to-sdr` / `bt709_matrix_args` | `src/core/hdr-tonemap.ts` + `encode-settings.ts` | HDR (PQ/HLG) é tone-mapped para SDR quando o build tem `zscale`/`tonemap`; se não tem, avisa em vez de rotular errado |
| `loudness.py` — dois passes EBU R128, `-c:v copy`, re-medir e corrigir overshoot do encoder | `src/core/loudness.ts` + `loudness-measure.ts` | −14 LUFS / −1 dBTP, vídeo copiado, até 3 encodes subindo bitrate antes de baixar o teto |
| `check.py` — PASS/WARN/FAIL por propriedade contra a spec do destino | `src/core/delivery-check.ts` + `short-quality.ts` | Falha bloqueia a publicação; pixel format/tags de cor/canais fora do padrão viram aviso |
| `--timeout`, `--progress` (mm:ss / ETA), matar ffmpeg travado e remover saída parcial | `src/core/ffmpeg-run.ts` + `quiz-ffmpeg.service.ts` | Nenhum job fica pendurado; o quiz loga `%` e ETA e é encerrado no `FFMPEG_TIMEOUT_MS` |
| `ffmpeg_base()` — `-hide_banner -nostdin` | `ffmpeg-run.ts`, `audio-chunker.ts`, `quiz-ffmpeg.service.ts` | Nunca lê stdin (worker não trava esperando prompt); log de erro sem banner |
| `doctor` — não confiar em formato/nome | `probeVideoStream`, `delivery-check` | Cor e geometria da fonte são medidas; a decisão de converter/tone-map vem do probe |

## Fluxo de um short agora

```
probe da fonte (cor, geometria)
  → filtros de enquadramento/legenda/B-roll (como antes)
  → encode: 2 s GOP, teto de bitrate, BT.709, AAC 48 kHz estéreo, faststart
  → loudness: medir → normalizar (vídeo copy) → medir → corrigir se o pico estourar
  → gate: resolução, codec, fps, 48 kHz, duração vs plataforma (falha = erro)
  → avisos no log: pixel format, tags de cor, canais, loudness não medido
```

## Como validar

```bash
pnpm test:coverage      # 100% de lines/functions/branches/statements (inclui os módulos novos)
pnpm build              # typecheck
pnpm smoke-test         # FFmpeg + provedor de IA
```

Verificação manual com ffmpeg real (usada durante o desenvolvimento): um render de 8 s de `testsrc2` + `sine`
passou pelo `renderShort` completo e saiu com `1080x1920`, H.264 High/4.1, `yuv420p`, `bt709`, 30 fps, AAC 48 kHz
estéreo, `moov` antes de `mdat` e −14.0 LUFS / −9.7 dBTP.

## O que não foi adotado (e por quê)

- **`render.py`/`batch.py`/`multicam.py`**: o pipeline já tem seu próprio orquestrador (`pipeline.ts`) e fila BullMQ;
  importar outro grafo de projeto duplicaria responsabilidades.
- **MCP server / contract.json**: a integração aqui é por código tipado, não por um agente externo chamando ferramentas.
- **`--dry-run`/`--plan`**: cada etapa é testada com mocks de `execFile`/`spawn`; um plano fingerprinted não traria
  ganho para jobs de fila, onde o retry já é idempotente por artefato.
- **normalização por canal (fala) em dois passes**: o `loudnorm` de dois passes roda no arquivo final; aplicá-lo também
  na fala antes da mixagem custaria outro decode sem mudar o resultado final.
