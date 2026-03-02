# 🎬 Shorts Generator

Gerador automático de YouTube Shorts alimentado por IA. Baixa vídeos, transcreve com Whisper, identifica momentos virais via LLM, gera vídeos verticais com legendas estilizadas e envia para o Telegram.

## Arquitetura

```
YouTube ──▶ yt-dlp ──▶ FFmpeg (audio) ──▶ Whisper API ──▶ Transcrição
                                                              │
                                                    AI SDK + GPT-4o
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
| Transcrição | OpenAI Whisper API |
| Análise viral | Vercel AI SDK + GPT-4o |
| Processamento de vídeo | FFmpeg (`fluent-ffmpeg`) |
| Legendas | ASS (word-by-word highlight) |
| Telegram | `grammy` |
| API Server | `hono` |
| Frontend | Vite + React + TypeScript + TailwindCSS |
| Execução | GitHub Actions (cron) |
| Runtime | Node.js 22+ / `tsx` |

## Setup

### Pré-requisitos

- **Node.js** ≥ 20
- **FFmpeg** instalado e no PATH
- **yt-dlp** instalado e no PATH
- **Chave da API OpenAI** (para Whisper + GPT-4o)

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/SEU_USUARIO/shorts-generator.git
cd shorts-generator

# Instalar dependências do backend
npm install

# Instalar dependências do frontend
cd web && npm install && cd ..

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves
```

### Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `OPENAI_API_KEY` | Chave da API OpenAI | ✅ |
| `YOUTUBE_CHANNELS` | Canais YouTube (separados por vírgula) | ⚠️ * |
| `VIDEO_URLS` | URLs específicas (separados por vírgula) | ⚠️ * |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram | ❌ |
| `TELEGRAM_CHAT_ID` | Chat ID do canal Telegram | ❌ |
| `DAYS_BACK` | Dias para buscar vídeos (default: 1) | ❌ |
| `OPENAI_MODEL` | Modelo LLM (default: gpt-4o) | ❌ |
| `MAX_SHORT_DURATION` | Duração máxima do short em segundos (default: 59) | ❌ |
| `MIN_SHORT_DURATION` | Duração mínima do short em segundos (default: 15) | ❌ |
| `OUTPUT_DIR` | Diretório de saída (default: ./output) | ❌ |
| `PORT` | Porta do servidor API (default: 3001) | ❌ |

\* Pelo menos um entre `YOUTUBE_CHANNELS` ou `VIDEO_URLS` é necessário.

## Uso

### CLI

```bash
# Gerar shorts dos canais configurados no .env
npm run generate

# Gerar de uma URL específica
npx tsx src/cli.ts generate --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Gerar de um canal específico
npx tsx src/cli.ts generate --channel "@channelHandle"

# Buscar vídeos dos últimos 3 dias
npx tsx src/cli.ts generate --days 3

# Iniciar servidor API
npm run dev
```

### Frontend (Web UI)

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run web:dev
```

Acesse `http://localhost:5173` para a interface web.

### GitHub Actions (Cron)

O workflow roda automaticamente todos os dias às 06:00 UTC. Para configurar:

1. No repositório GitHub, vá em **Settings → Secrets and variables → Actions**

2. Adicione os **Secrets**:
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

3. Adicione as **Variables**:
   - `YOUTUBE_CHANNELS` — ex: `@canal1,@canal2`
   - `DAYS_BACK` — ex: `1`

4. Para execução manual, vá em **Actions → Generate Shorts → Run workflow**

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
3. **Transcrição** — Envia áudio para Whisper API (word-level timestamps)
4. **Análise** — LLM identifica momentos com potencial viral (structured output via AI SDK)
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
