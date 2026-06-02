# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start web server with hot reload
pnpm cli generate           # Generate shorts from configured channels/URLs
pnpm cli generate:top       # Send top unposted video (full) to Telegram/YouTube

# Testing
pnpm test                   # Run all tests once
pnpm test:watch             # Watch mode
pnpm test:coverage          # Generate coverage report

# Type checking
pnpm build                  # TypeScript type-check (no emit)

# Web UI
pnpm web:dev                # Start React frontend (Vite, separate from API)
```

To run a single test file: `pnpm vitest run tests/core/pipeline.test.ts`

## Architecture

This project is an automated YouTube Shorts generator with three entry points sharing a common pipeline:

1. **CLI** (`src/cli.ts`) — `generate` and `generate:top` commands
2. **Web Server** (`src/server/`) — Hono REST API on port 3001, async jobs via `POST /api/generate` + polling `GET /api/jobs/:id`
3. **GitHub Actions** (`.github/workflows/`) — Scheduled daily at 12:00 BRT (`generate-shorts.yml`) and 18:00 BRT (`generate-top-shorts.yml`)

### Pipeline Flow

All processing routes through `src/core/pipeline.ts`:

```
YouTube Channel/URL
  → youtube.ts       — fetch metadata, download via yt-dlp
  → transcriber.ts   — audio transcription via OpenAI Whisper (Python subprocess)
  → analyzer.ts      — LiteLLM (OpenAI-compatible) identifies viral moments, returns ShortClip[]
  → clip-boundary.ts — aligns cut points to sentence/word boundaries
  → video-processor.ts — FFmpeg cuts vertical clips, adds watermark
  → subtitle.ts      — generates ASS captions synced to clip timing
  → youtube.service.ts — uploads clips to YouTube
  → telegram.ts      — sends clips + metadata to Telegram
  → state.ts         — persists posted video IDs to avoid duplicates
```

### Two Pipeline Modes

- **`runPipeline()`** — standard: fetches multiple videos per channel, generates multiple shorts per video, posts all clips
- **`runTopVideoPipeline()`** — picks one random channel, selects its top unposted non-Music video, sends the **full video** (not clips) to Telegram/YouTube, tracks in `posted_top_videos.json`

### Configuration

All config is environment-driven via `src/core/config.ts`. Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `YOUTUBE_CHANNELS` | — | Comma-separated channel IDs/handles |
| `VIDEO_URLS` | — | Direct video URLs to process |
| `AI_MODEL` | `cloud/gemma3` | LiteLLM model for transcript analysis |
| `LITELLM_BASE_URL` | `http://localhost:4000/v1` | LiteLLM OpenAI-compatible gateway URL |
| `LITELLM_KEY` | — | LiteLLM gateway API key |
| `WHISPER_BASE_URL` | — | Cluster faster-whisper ASR service URL |
| `WHISPER_CHUNK_DURATION_SEC` | `120` | Sequential audio chunk size sent to faster-whisper |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | Telegram delivery |
| `MAX_VIDEO_SIZE_MB` | `500` | Skip videos larger than this |
| `VIDEO_ENCODER` | `libx264` | FFmpeg codec |

### External Tool Dependencies

The pipeline requires these system tools at runtime:
- **FFmpeg** — video cutting and composition
- **yt-dlp** — YouTube video download
- **OpenAI Whisper** (Python) — audio transcription
- **LiteLLM** — OpenAI-compatible LLM gateway (must be reachable at `LITELLM_BASE_URL`)

### Code Constraints (Antigravity Protocol)

- **150-line maximum per file** — keep files small and focused
- Strict TypeScript typing — all types defined in `src/types.ts`
- Sequential video processing to avoid resource conflicts (no parallelism across videos)

### State Persistence

`posted_top_videos.json` (tracked in git) records which videos have been sent via `generate:top`. The GitHub Actions workflow auto-commits this file after each run to prevent duplicates across runs.
