# Whisper Setup — Fix YouTube Download Pipeline

## Problem
Pipeline fails at **transcription stage** (not YouTube download).
- Line: `src/core/transcriber.ts:123`
- Error: `WHISPER_BASE_URL is required; cluster faster-whisper is the only supported transcriber`
- WHISPER_BASE_URL is **NOT set** in `.env`

## Solution: Setup faster-whisper Service

### Option 1: Local Docker (Development)

```bash
# Run faster-whisper in Docker
docker run -d \
  --name faster-whisper \
  -p 8000:8000 \
  -e ASR_MODEL=base \
  onerahmet/openai-whisper-asr-webservice:latest

# Verify it's running
curl http://localhost:8000/asr

# Add to .env
echo "WHISPER_BASE_URL=http://localhost:8000" >> .env

# Test
npm run generate
```

### Option 2: Kubernetes (Production)

```yaml
# faster-whisper as sidecar in same pod
containers:
- name: app
  image: shorts-generator:latest
  env:
  - name: WHISPER_BASE_URL
    value: "http://localhost:8000"  # sidecar on same pod

- name: whisper-sidecar
  image: onerahmet/openai-whisper-asr-webservice:latest-gpu
  ports:
  - containerPort: 8000
  env:
  - name: ASR_MODEL
    value: "base"  # or small, medium, large
  resources:
    requests:
      memory: "4Gi"
      cpu: "2"
    limits:
      memory: "8Gi"
      cpu: "4"
```

Add to ConfigMap:
```yaml
data:
  WHISPER_BASE_URL: "http://localhost:8000"
```

### Option 3: External Service (AWS, Azure, etc.)

Use hosted Whisper API:
```bash
WHISPER_BASE_URL=https://api.openai.com/v1/audio  # OpenAI API
# Or any compatible ASR endpoint
```

---

## Quick Test

```bash
# 1. Set in .env
WHISPER_BASE_URL=http://localhost:8000

# 2. Verify Whisper service responds
curl -X POST \
  -F "audio=@test.wav" \
  http://localhost:8000/asr

# 3. Run pipeline
npm run generate

# 4. Check logs
# Should see: "Audio downloaded and converted → Transcription complete → Analysis by LLM"
```

---

## Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  shorts-generator:
    build: .
    environment:
      WHISPER_BASE_URL: http://whisper:8000
      YOUTUBE_CHANNELS: "@your_channel"
      YOUTUBE_COOKIES_FILE: /app/cookies.txt
      AI_PROVIDER: ollama
      OLLAMA_BASE_URL: http://ollama:11434
    volumes:
      - ./cookies.txt:/app/cookies.txt
      - ./output:/app/output
    depends_on:
      - whisper
      - ollama

  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest-gpu
    ports:
      - "8000:8000"
    environment:
      ASR_MODEL: base  # tiny, base, small, medium, large
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1  # GPU access
              capabilities: [gpu]

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    environment:
      OLLAMA_HOST: 0.0.0.0:11434

volumes:
  ollama-data:
```

Start:
```bash
docker-compose up -d
npm run generate
```

---

## Verification Checklist

- [ ] WHISPER_BASE_URL set in .env
- [ ] faster-whisper service running and responding (curl test)
- [ ] npm run generate completes transcription stage
- [ ] Logs show "Transcription complete"
- [ ] Shorts are generated and posted to Telegram

---

**Now YouTube downloads will work!** 🎉
