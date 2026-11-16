# Short semanal: repositório trending do GitHub

`bun run cli generate:trending` escolhe o repositório mais falado da semana que ainda
não virou short, lê o README, narra as capturas de tela e gera um vídeo vertical
1080x1920 com legendas karaokê e trilha leve.

## Fluxo

1. **Trending** (`src/core/trending/github-trending.ts`): o GitHub não expõe trending
   em API pública (`github.com/trending` é só HTML), então usamos a busca:
   repositórios criados nos últimos `TRENDING_WINDOW_DAYS` dias com pelo menos
   `TRENDING_MIN_STARS` estrelas, ordenados por estrelas.
2. **Já usados** (`repo-registry.ts`): `OUTPUT_DIR/trending/used-repos.json`. Um
   repositório entra na lista só depois de renderizado, então nunca se repete.
3. **README** (`readme.ts`, `fetch-images.ts`): README bruto de `raw.githubusercontent.com`,
   capturas em PNG/JPG/GIF/WebP (badges e SVG ficam de fora). O README precisa ser
   majoritariamente latino: a voz é pt-BR, então READMEs em CJK são pulados.
4. **Roteiro** (`script.ts`): cartão de abertura, um capítulo por captura (texto da
   seção do README ou o alt da imagem) e cartão final com o link.
5. **Vídeo** (`src/core/comic/comic-pipeline.ts`): o mesmo motor dos shorts narrados
   (edge-tts, karaokê, ducking, normalização de loudness).
6. **Trilha** (`ambient-track.ts`): `BGM_FILE`/`BGM_DIR` quando configurados; senão um
   pad gerado por fórmula com ffmpeg, sem música de terceiros.

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `TRENDING_WINDOW_DAYS` | `7` | Janela de criação dos repositórios |
| `TRENDING_MIN_STARS` | `100` | Piso de estrelas |
| `TRENDING_CANDIDATES` | `15` | Quantos repositórios ranqueados considerar |
| `TRENDING_MAX_IMAGES` | `6` | Capturas por vídeo |
| `GITHUB_TOKEN` | — | Opcional; aumenta o limite da API de busca |
| `COMIC_TTS_VOICE` | `pt-BR-AntonioNeural` | Voz da narração |

## Agendamento

`k8s/cron-generate-trending.yaml`: CronJob semanal (segunda, 15:00 UTC) no PVC de saída.

## Limitações conhecidas

- O roteiro usa a descrição e os textos do README como estão. Um README em inglês é
  lido por uma voz pt-BR, o que soa pior do que uma narração escrita em português.
  Tradução com LLM é o próximo passo.
- O enquadramento 9:16 do motor de comics faz centro-corte: parte das laterais de
  capturas horizontais some.
- O GitHub não tem trending oficial; a busca por criação recente é uma aproximação.
