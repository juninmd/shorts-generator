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
pnpm cli generate:faceless --topic "assunto"  # Faceless short: LLM script + Pexels stock footage + edge-tts narration

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

This project is an automated YouTube Shorts generator with several entry points sharing a common pipeline:

1. **CLI** (`src/cli.ts`) — `generate` and `generate:top` commands
2. **Web Server** (`src/server/`) — Hono REST API on port 3001, async jobs via `POST /api/generate` + polling `GET /api/jobs/:id`
3. **Queue / Kubernetes** (`src/core/queue*.ts`, `k8s/`) — BullMQ queue (`queue:process`), quiz generation (`generate:quiz`), CronJobs and manifests under `k8s/`
4. **GitHub Actions** (`.github/workflows/`) — `validate.yml` (secrets scan, typecheck, tests with 100% coverage gate), `deploy.yml` (Docker image), `security.yml` (gitleaks), `update-yt-dlp.yml` (daily yt-dlp lock bump), `dependabot-automerge.yml`, `release-drafter.yml`

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

### Faceless Mode (`src/core/faceless/`)

`pnpm cli generate:faceless --topic "..." [--lang pt-BR]` — topic in, finished short out, no source video. It reuses the narrated-story engine: `faceless-script.ts` (LLM → scenes of narration + English stock-footage keywords) → `stock-footage.ts` (Pexels portrait clips via `PEXELS_API_KEY`; plain color cards when there is no key/match) → `faceless-pipeline.ts` builds a `ComicBook` whose chapters carry `videoPath` and hands it to `runComicPipeline`. Narration is edge-tts; captions are karaoke; `BGM_FILE`/`BGM_DIR` adds ducked background music.

### Captions, Speaker Tracking, Ducking

- **Karaoke captions** (`subtitle-karaoke.ts`): one ASS event per phrase with `\kf` sweeps (white → yellow as each word is spoken). `SUBTITLE_STYLE=highlight` restores the legacy one-word-at-a-time highlight.
- **Speaker tracking** (`scripts/track_speaker.py`, `speaker_faces.py`, `speaker_seats.py`, `face-framing.ts`, `focus-keyframes.ts`): faces come from YuNet (`assets/models/face_detection_yunet_2023mar.onnx`, finds small/side-on faces in wide podcast shots; Haar cascade fallback when the model or `cv2.FaceDetectorYN` is missing) on a 1280px-wide frame, with tiny false positives (logos) dropped. Faces are clustered into seats, seats seen <30% of the clip (screen faces) are dropped, and smoothed mouth-motion (from the YuNet mouth landmarks) picks the active speaker every 0.5s; a challenger must lead 1.5s before the crop moves (the switch is back-dated). Each sample carries the speaker's real face position, the frame is padded half a crop width per side (`edgePadFilter`) so a guest at the far edge still lands centered, no zoom is applied (the old breathing punch-in is opt-in via `PUNCH_IN=true`), and keyframes (median, dead zone, quick hold-then-pan on abrupt speaker steps, up to 48) become a time-varying ffmpeg `crop` x expression. Falls back to the static `detect_face.py` focus, then to a centered crop. `SPEAKER_TRACKING=false` disables panning, `SPEAKER_FOCUS=false` disables all face logic. Needs `opencv-python` (<5: OpenCV 5 dropped the Haar cascade API).
- **Ducking** (`audio-ducking.ts`): `BGM_FILE` or a random file in `BGM_DIR` is looped under the speech and sidechain-compressed by it (`BGM_VOLUME`, default 0.18). Used by `short-renderer.ts` (clips) and the narrated-story pipeline (comic/faceless). No music configured = speech only.

### Clip Editing & Analysis (Opus-style)

- **Analysis** (`analyzer-guidance.ts`, `audio-signals.ts`): the LLM also returns `scoreBreakdown` (hook/flow/engagement/trend), `keywords` and `broll` cues. `VIDEO_GENRE` / `--genre` (podcast, qa, vlog, listicle, webinar, sermon, gaming, sports, news, comedy) steers selection; `CLIP_PROMPT` / `--prompt` ("momentos engraçados sobre dinheiro") restricts it to a natural-language request. Per-second audio loudness (ffmpeg `astats`) names the most energetic spans in the prompt and breaks score ties (+0.5 max).
- **Captions** (`caption-emphasis.ts`, `subtitle-overlays.ts`, `subtitle-header.ts`): bundled heavy sans `Poppins ExtraBold` (`assets/fonts`, OFL; override with `CAPTION_FONT`), size 6.8% of the height with a proportional outline — `fonts.conf` includes the system config so fallbacks stay sans; keywords/numbers/power words get their own colour, size and pop; `CAPTION_EMOJI=true` appends an emoji (libass draws it monochrome); hook title card (first 2.8s), presenter lower third and closing CTA (`CTA_TEXT`).
- **Brand templates** (`brand-template.ts`): `brand-templates/default.json` then `<channel id or name slug>.json` (font, `#RRGGBB` colours, `fontScale`, `captionPosition`, `hook`, `cta`, `lowerThird`, `emoji`, `pop`); env switches `CAPTION_EMOJI`, `HOOK_OVERLAY`, `LOWER_THIRD`, `CTA_TEXT` win. **Brand vocabulary** (`brand-vocabulary.ts`): `BRAND_VOCABULARY` / `BRAND_VOCABULARY_FILE` fix near-miss transcriptions before analysis.
- **Endings on a full stop** (`sentence-end.ts`): `processClips` moves the end to the nearest sentence end (`.`/`!`/`?`, not abbreviations or `...`) within the allowed length, and `processClip` cuts back to the last full stop (≥ half the clip, 8s min) when a clip still ends mid-sentence, leaving a 0.35s breath.
- **Edits at render time** (`silence-cuts.ts`, `cut-graph.ts`, `broll.ts`, `letterbox.ts`, `scene-changes.ts`, `short-framing.ts`, `short-renderer.ts`): pauses >0.45s and filler words are cut (`SILENCE_CUT=false` disables) by concatenating `trim`/`atrim` pieces, and captions, tracking keyframes and B-roll cues are remapped to the edited timeline; baked-in black bars are cropped (`AUTO_CROP=false`); camera cuts make the speaker-tracking crop jump instead of pan; B-roll (`BROLL_DIR` library named after what it shows, else Pexels) is overlaid under the captions (`BROLL`, `BROLL_SECONDS`, `BROLL_MAX`); speech gets `afftdn` noise reduction (`SPEECH_DENOISE=false`).
- **Delivery quality** (`delivery-spec.ts`, `encode-settings.ts`, `ffmpeg-run.ts`, `loudness.ts`, `delivery-check.ts`, `short-delivery.ts`, `hdr-tonemap.ts`): every render is encoded for a destination (`DELIVERY_PLATFORM`, default `shorts`: 1080x1920/30 fps, 2 s GOP, bitrate cap, `+faststart`, BT.709 tags, AAC 48 kHz stereo), HDR sources are tone-mapped when the build has `zscale`/`tonemap` (without them the source colour tags are kept, never relabelled; a BT.601 source is converted with its own matrix), the audio is normalised in two EBU R128 passes to −14 LUFS/−1 dBTP with the picture stream-copied, and the written file is re-probed against the destination spec. `LOUDNESS_NORMALIZE=false` skips the level pass; `FFMPEG_TIMEOUT_MS` (default 30 min) kills a hung job and removes its partial output, and every ffprobe call carries the same ceiling. Adopted from [`ffmpeg-skill`](https://github.com/kajisho5/ffmpeg-skill) — rationale and file map in `docs/FFMPEG_SKILL_IMPROVEMENTS.md`.
- **Publishing** (`social-copy.ts`, `publishers/`, `social-queue.ts`, `publish-schedule.ts`, `server/social-media-routes.ts`): `TITLE_STYLE` (catchy/curious/serious/question) steers the title prompt; platform-sized copy for Bluesky, Instagram Reels, Threads, TikTok and Pinterest; one BullMQ job per platform in the `social-posts` queue, delayed to the next `PEAK_HOURS` slot (`PUBLISH_TZ`; `SOCIAL_SCHEDULE=false` = next run) and drained by `queue:process`. Instagram/Threads/TikTok pull the video from `SERVER_PUBLIC_URL/public/social/<unguessable>.mp4`. Credentials per platform: `BLUESKY_HANDLE`+`BLUESKY_APP_PASSWORD`, `INSTAGRAM_USER_ID`+`INSTAGRAM_ACCESS_TOKEN`, `THREADS_USER_ID`+`THREADS_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN` (`TIKTOK_PRIVACY`, default `SELF_ONLY`), `PINTEREST_ACCESS_TOKEN`+`PINTEREST_BOARD_ID`; `PUBLISH_PLATFORMS` limits the set. The platform HTTP flows are unit-tested against mocks only — verify against each live API before relying on them.

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
| `SUBTITLE_STYLE` | `karaoke` | `karaoke` (`\kf` sweep) or `highlight` (legacy) |
| `SPEAKER_TRACKING` | `true` | Pan the crop between speakers (`false` = static focus) |
| `BGM_FILE` / `BGM_DIR` / `BGM_VOLUME` | — / — / `0.18` | Background music with speech ducking |
| `DELIVERY_PLATFORM` | `shorts` | Destination spec the render is verified against (`shorts`, `reels`, `tiktok`) |
| `LOUDNESS_NORMALIZE` | `true` | Two-pass EBU R128 pass after the render (`false` keeps mixed levels) |
| `FFMPEG_TIMEOUT_MS` | `1800000` | Ceiling for one ffmpeg job; a hung encoder is killed and its partial output removed |
| `PEXELS_API_KEY` | — | Stock footage for `generate:faceless` |

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

### Dependency Updates

- `.github/dependabot.yml` — weekly grouped minor/patch PRs for npm (root + `web`), GitHub Actions, Docker; daily for `tests/yt-download` (yt-dlp)
- `dependabot-automerge.yml` — auto-merges non-major Dependabot PRs once required checks pass (requires branch protection with `validate` as a required check); majors stay manual
- `minimumReleaseAge` (`pnpm-workspace.yaml`, `.npmrc`) — pnpm refuses versions published <24h ago (supply-chain guard)
- pnpm version is pinned via `packageManager` in `package.json`; keep CI/Dockerfile in sync

### State Persistence

`posted_top_videos.json` (tracked in git) records which videos have been sent via `generate:top`. The GitHub Actions workflow auto-commits this file after each run to prevent duplicates across runs.
