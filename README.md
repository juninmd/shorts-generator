# Shorts Generator

Gerador automatizado de YouTube Shorts: baixa vídeos de canais/URLs, transcreve com faster-whisper, escolhe os momentos virais via LLM (gateway LiteLLM), corta clipes verticais com FFmpeg (legendas karaokê, enquadramento no falante) e entrega no Telegram/YouTube. Inclui um painel admin (Hono + React/Vite) para gerenciar canais, fontes e runs, com persistência em PostgreSQL e tokens criptografados por canal.

## Requisitos

- Node.js >= 20 (CI usa 24) e pnpm 12 (`packageManager` no `package.json`)
- FFmpeg e yt-dlp no `PATH`
- Serviço faster-whisper acessível via HTTP (`WHISPER_BASE_URL`)
- Gateway LiteLLM compatível com OpenAI (`LITELLM_BASE_URL`)
- PostgreSQL (control plane) e Redis (fila BullMQ)
- Python 3 opcional: `opencv-python` (<5) para enquadramento no falante e `edge-tts` para os modos narrados

## Instalação

```bash
pnpm install --frozen-lockfile
cp .env.example .env   # preencha os valores localmente; nunca commite o .env
```

## Configuração

Toda a configuração vem de variáveis de ambiente (`src/core/config.ts`). O `.env.example` lista todas; as principais:

- Pipeline: `YOUTUBE_CHANNELS`, `VIDEO_LIMIT`, `MAX_CLIPS_PER_VIDEO`, `MIN_VIRAL_SCORE`, `MAX_SHORT_DURATION`, `MIN_SHORT_DURATION`, `OUTPUT_DIR`, `WATERMARK_TEXT`
- IA e transcrição: `AI_MODEL`, `AI_TIMEOUT_MS`, `LITELLM_BASE_URL`, `LITELLM_KEY`, `WHISPER_BASE_URL`, `WHISPER_REQUEST_TIMEOUT_MS`
- Entrega: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `MAX_DAILY_UPLOADS`
- Enquadramento: `SPEAKER_FOCUS`, `SPEAKER_TRACKING`
- Control plane (obrigatórias para o painel): `PORT`, `DATABASE_URL`, `ADMIN_API_TOKEN`, `ADMIN_ALLOWED_ORIGINS`, `CONTROL_PLANE_ENCRYPTION_KEY` (base64 de 32 bytes), `CONTROL_PLANE_ENCRYPTION_KEY_VERSION`
- Fluxo do canal: `CHANNEL_FLOW_MODE=cuts` e `VITE_CHANNEL_FLOW_MODE=cuts` bloqueiam runs/criação de `quiz` (modo do cluster); fora do cluster, `quiz` segue disponível

O control plane roda as migrations de `db/migrations/` automaticamente quando `ADMIN_API_TOKEN`, `DATABASE_URL` e `CONTROL_PLANE_ENCRYPTION_KEY` estão definidos.

## Uso

```bash
pnpm start                       # API Hono em http://localhost:3001 (health: /api/health)
pnpm dev                         # API com hot reload
pnpm web:dev                     # painel admin (Vite) em http://localhost:5173, proxy /api -> :3001
pnpm bootstrap:control-plane     # cria canal inicial de dev, sem gravar token em texto puro

pnpm generate --url "<url1>,<url2>"                       # shorts a partir de URLs
pnpm generate --channel "@Handle" --limit 1 --clips 1     # shorts a partir de canais
pnpm generate:top --clips 3                               # vídeo mais popular ainda não postado
pnpm generate:quiz --prompt "Curiosidades sobre o Espaço" # quiz
pnpm generate:metrics-digest
pnpm queue:process               # drena a fila BullMQ (CronJob no cluster)
pnpm smoke-test                  # valida FFmpeg e o provedor de IA
pnpm diagnose:cluster
```

Depois do bootstrap, abra o painel, salve as credenciais de publicação do canal e dispare o run por lá. A saída de `pnpm cli --help` está em [`docs/terminal.txt`](docs/terminal.txt). Os modos narrados (`generate:comic|movie|series|bio|news|book --demo`, `generate:faceless --topic`) e o detalhamento da arquitetura estão em [`CLAUDE.md`](CLAUDE.md). Setup auxiliar: [`QUICKSTART.md`](QUICKSTART.md), [`WHISPER_SETUP.md`](WHISPER_SETUP.md), [`docs/`](docs/). Renovação de tokens do YouTube: [`AGENTS.md`](AGENTS.md).

## Testes, lint e build

```bash
pnpm test                   # vitest (run único)
pnpm test:coverage          # exige 100% de lines/functions/branches/statements
pnpm build                  # typecheck (tsc --noEmit); não há bundle
pnpm --dir web run test     # testes do painel
pnpm --dir web run build    # tsc -b + vite build
```

Não há linter dedicado; o gate estático é o typecheck TypeScript.

## Screenshot

Screenshot pendente: o painel exige PostgreSQL, `ADMIN_API_TOKEN` e chave de criptografia, que não foram provisionados no ambiente de documentação.

## Gates de CI (`.github/workflows`)

| Workflow | O que checa |
|---|---|
| `validate.yml` | PRs e push em main/master: bloqueia arquivos de segredo versionados, gitleaks, `pnpm install --frozen-lockfile`, `pnpm run build` (typecheck) e `pnpm test:coverage` (100%) |
| `security.yml` | Gitleaks via workflow reutilizável (push em main/master e manual) |
| `deploy.yml` | Build e push da imagem Docker no GHCR a cada push em main/master |
| `update-yt-dlp.yml` | Diário: atualiza a versão do yt-dlp em `tests/yt-download` |
| `dependabot-automerge.yml` | Auto-merge de PRs Dependabot não-major após os checks |
| `release-drafter.yml` | Mantém o rascunho de release |

## Deploy

Imagem Docker (`Dockerfile`, `docker-compose.yml`) e manifestos Kubernetes em `k8s/` (CronJobs de `queue:process` e `generate:quiz`, PVC de saída).
