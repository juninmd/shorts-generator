# 🎬 Shorts Generator

Gerador automático de YouTube Shorts alimentado por IA **100% local e gratuito**. Baixa vídeos, transcreve com Whisper local, identifica momentos virais via Ollama (qwen3-vl:4b), gera vídeos verticais com legendas estilizadas e envia para o Telegram.

> ✅ **Este projeto utiliza [pnpm](https://pnpm.io) como gerenciador de pacotes por padrão.**
> Basta rodar `pnpm install` no diretório raiz (a workspace também instala o frontend em `web/`).

## Arquitetura

```
YouTube ──▶ yt-dlp ──▶ FFmpeg (audio) ──▶ Whisper local ──▶ Transcrição
                                                                │
                                                    AI SDK + Ollama (qwen3-vl:4b)
                                                                │
                                                       Momentos virais
                                                                │
                                              FFmpeg (corte + 9:16 + legendas ASS)
                                                                │
                                                    ┌───────────┴───────────┐
                                                    ▼                       ▼
                                              Telegram Bot            Frontend Web
```

## Stack

| Componente | Tecnologia |
|---|---|
| Download de vídeos | `yt-dlp` |
| Transcrição | Whisper local (`openai-whisper` CLI) |
| Análise viral | Vercel AI SDK + Ollama (`qwen3-vl:4b`) |
| Processamento de vídeo | FFmpeg (`fluent-ffmpeg`) |
| Legendas | ASS (word-by-word highlight) |
| Telegram | `grammy` |
| API Server | `hono` |
| Frontend | Vite + React + TypeScript + TailwindCSS |
| Execução | GitHub Actions (cron) |
| Runtime | Node.js 22+ / `tsx` |

> **💰 Custo total: $0** — Whisper e Ollama rodam localmente, sem API keys pagas.

## Setup

### Pré-requisitos

- **Node.js** ≥ 20
- **pnpm** (recomendado via `corepack enable`; veja também https://pnpm.io/installation)
- **FFmpeg** instalado e no PATH
- **yt-dlp** instalado e no PATH
- **Python 3.9+** com `pip install openai-whisper`
- **Ollama** instalado ([ollama.com](https://ollama.com)) com o modelo baixado:
  ```bash
  ollama pull qwen3-vl:4b
  ```

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/juninmd/shorts-generator.git
cd shorts-generator

# Instalar dependências (root e frontend) usando pnpm
pnpm install

# Instalar Whisper local
pip install openai-whisper

# Baixar modelo Ollama
ollama pull qwen3-vl:4b

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações
```

### Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `YOUTUBE_CHANNELS` | Canais YouTube (separados por vírgula) | ⚠️ * |
| `VIDEO_URLS` | URLs específicas (separados por vírgula) | ⚠️ * |
| `OLLAMA_BASE_URL` | URL do Ollama (default: `http://localhost:11434`) | ❌ |
| `OLLAMA_MODEL` | Modelo Ollama (default: `qwen3-vl:4b`) | ❌ |
| `WHISPER_MODEL` | Modelo Whisper local: tiny/base/small/medium/large (default: `base`) | ❌ |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram | ❌ |
| `TELEGRAM_CHAT_ID` | Chat ID do canal Telegram | ❌ |
| `DAYS_BACK` | Dias para buscar vídeos (default: 1) | ❌ |
| `MAX_SHORT_DURATION` | Duração máxima do short em segundos (default: 59) | ❌ |
| `MIN_SHORT_DURATION` | Duração mínima do short em segundos (default: 15) | ❌ |
| `OUTPUT_DIR` | Diretório de saída (default: ./output) | ❌ |
| `PORT` | Porta do servidor API (default: 3001) | ❌ |

\* Pelo menos um entre `YOUTUBE_CHANNELS` ou `VIDEO_URLS` é necessário.

## Uso

### CLI

```bash
# Gerar shorts dos canais configurados no .env
pnpm run generate

# Gerar de uma URL específica
pnpm run cli -- generate --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Gerar de um canal específico
pnpm run cli -- generate --channel "@channelHandle"

# Buscar vídeos dos últimos 3 dias
pnpm run cli -- generate --days 3

# Iniciar servidor API
pnpm run dev
```

### Frontend (Web UI)

```bash
# Terminal 1: Backend
pnpm run dev

# Terminal 2: Frontend
pnpm run web:dev
```

Acesse `http://localhost:5173` para a interface web.

### GitHub Actions (Cron)

O workflow roda automaticamente todos os dias às 06:00 UTC. Para configurar:

1. No repositório GitHub, vá em **Settings → Secrets and variables → Actions**

2. Adicione os **Secrets** (opcionais — só se usar Telegram):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

3. Adicione as **Variables**:
   - `YOUTUBE_CHANNELS` — ex: `@canal1,@canal2`
   - `DAYS_BACK` — ex: `1`
   - `OLLAMA_MODEL` — ex: `qwen3-vl:4b` (opcional, este é o default)
   - `WHISPER_MODEL` — ex: `base` (opcional, este é o default)

4. Para execução manual, vá em **Actions → Generate Shorts → Run workflow**

> **Nota:** O workflow instala Ollama e faz `ollama pull` do modelo automaticamente.

## Limite de cortes

Para evitar sobrecarga, existe um limite de **10 cortes por cada 20 minutos** de vídeo:

| Duração do vídeo | Máx. cortes |
|---|---|
| 0 – 20 min | 10 |
| 20 – 40 min | 20 |
| 40 – 60 min | 30 |
| 60+ min | 10 por bloco de 20min |

## Pipeline

1. **Fetch** — Busca vídeos recentes dos canais configurados (ou URLs específicas)
2. **Download** — Baixa vídeo + extrai áudio (WAV 16kHz mono)
3. **Transcrição** — Whisper local com word-level timestamps
4. **Análise** — Ollama (qwen3-vl:4b) identifica momentos com potencial viral via AI SDK
5. **Corte** — FFmpeg corta o trecho, converte para 9:16, aplica legendas ASS
6. **Envio** — Shorts finalizados são enviados ao Telegram com metadados

## API

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/generate` | POST | Inicia geração (`{ urls: string[], channels?: string[] }`) |
| `/api/jobs/:id` | GET | Status de um job |
| `/api/jobs` | GET | Lista todos os jobs |
| `/api/shorts` | GET | Lista shorts gerados |
| `/api/shorts/:videoId/:clipId` | GET | Download de um short |

## Licença

MIT
