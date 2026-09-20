# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start web server with hot reload
pnpm cli generate           # Generate shorts from configured channels/URLs
pnpm cli generate:top       # Send top unposted video (full) to Telegram/YouTube
pnpm cli generate:comic --demo         # Narrate the built-in comic smoke-test book (Flashpoint)
pnpm cli generate:movie --demo         # Narrate the built-in movie-recap smoke-test book (Shrek)
pnpm cli generate:series --demo        # Narrate the built-in series-recap smoke-test book (The Flash 1x01)
pnpm cli generate:bio --demo           # Narrate the built-in biography smoke-test book (Ada Lovelace)
pnpm cli generate:news --demo          # Narrate the built-in news-digest smoke-test book (example headlines)
pnpm cli generate:book --demo          # Narrate the built-in book-recap smoke-test book (Dom Casmurro)
pnpm cli generate:<kind> --book <path.json>  # Any kind: narrate a custom ComicBook definition

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

### Narrated-Story Pipeline (`src/core/comic/`)

Separate, standalone flow — narrates a "book" (chapter images + narration script) into a vertical short. Shared by six CLI entry points — comics, movie recaps, series-episode recaps, biographies, news digests, book recaps — since the engine only cares about chapters of image+narration, not the content's genre. Not wired into `runPipeline`/YouTube upload; local output only.

```
ComicBook { id, title, chapters: [{ id, title, imagePath, narrationText }] }
  → comic-tts.ts     — edge-tts (Python subprocess, scripts/comic_tts.py) synthesizes narration + word timestamps
  → comic-video.ts   — FFmpeg: image+audio per chapter (Ken Burns), concat, burn ASS subtitles
  → comic-pipeline.ts — orchestrates chapters, offsets word timestamps onto one timeline, reuses subtitle.ts's generateASSSubtitles via a synthetic ShortClip
```

`pnpm cli generate:<kind> --demo` (kind: `comic`/`movie`/`series`/`bio`/`news`/`book`) runs the matching built-in smoke-test book from `demo-books.ts` (Flashpoint / Shrek / The Flash 1x01 / Ada Lovelace / example headlines / Dom Casmurro) — plain color chapter cards with an original synopsis, no copyrighted stills/panels/dialogue, since those must be supplied by the user for their own licensed use. `--book <path.json>` narrates a custom `ComicBook`. Requires `pip install edge-tts`; voice via `COMIC_TTS_VOICE` (default `pt-BR-AntonioNeural`), optional watermark via `COMIC_WATERMARK_TEXT` (unset by default).

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
- **opencv-python** (Python, optional) — speaker-centered framing (`scripts/detect_face.py`); when absent the crop falls back to centered (toggled by `SPEAKER_FOCUS`)

### Code Constraints (Antigravity Protocol)

- **150-line maximum per file** — keep files small and focused
- Strict TypeScript typing — all types defined in `src/types.ts`
- Sequential video processing to avoid resource conflicts (no parallelism across videos)

### State Persistence

`posted_top_videos.json` (tracked in git) records which videos have been sent via `generate:top`. The GitHub Actions workflow auto-commits this file after each run to prevent duplicates across runs.
