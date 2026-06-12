# YouTube Download in Kubernetes Cluster

## Problem
YouTube downloads are failing in the cluster. Common causes:
1. **Missing dependencies**: `yt-dlp` or `ffmpeg` not installed
2. **YouTube blocking**: IP-based or bot-detection blocks from cluster
3. **Missing cookies**: No authentication to bypass age-restricted/limited content
4. **Wrong player client**: Outdated YouTube player decryption

## Solution Architecture

### 1. System Dependencies in Docker

```dockerfile
FROM node:24-slim

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    yt-dlp \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN yt-dlp --version && ffmpeg -version
```

### 2. YouTube Authentication Strategy

#### Option A: Browser Cookies (Recommended for public videos)
```bash
# Locally, extract cookies using browser:
# - Install: https://github.com/kairi003/Get-cookies.txt-LOCALLY
# - Export from Chrome/Firefox to cookies.txt
# - Convert to base64

base64 cookies.txt | tr -d '\n' > /tmp/cookies.b64
export YOUTUBE_COOKIES_BASE64=$(cat /tmp/cookies.b64)
```

#### Option B: Docker Secret
```bash
# In Kubernetes:
kubectl create secret generic youtube-cookies \
  --from-file=cookies.txt=/path/to/cookies.txt
```

#### Option C: OpenRouter API (No cookies needed, but costs $)
```bash
export AI_PROVIDER=openrouter
export OPENROUTER_API_KEY=sk-or-v1-xxxxx
# yt-dlp still needed for download, but at least AI inference is not localhost
```

### 3. Environment Variables

**Minimum for cluster:**
```bash
YOUTUBE_PLAYER_CLIENT=web
YOUTUBE_COOKIES_BASE64=<base64-encoded-cookies>  # OR
YOUTUBE_COOKIES_FILE=/etc/secrets/cookies.txt    # OR
YOUTUBE_COOKIES_BROWSER=firefox                  # If browser available

# Backup strategy
SKIP_VIDEO_SIZE_CHECK=true                       # Skip pre-download size check
```

**For resilience:**
```bash
# Timeout values (milliseconds)
YOUTUBE_TIMEOUT_MS=60000

# Retry strategy (handle transient failures)
MAX_RETRIES=3
RETRY_DELAY_MS=5000

# IP rotation (if using proxy)
HTTP_PROXY=http://proxy:8080
HTTPS_PROXY=http://proxy:8080
```

### 4. Kubernetes ConfigMap + Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: shorts-generator-config
data:
  YOUTUBE_PLAYER_CLIENT: "web"
  AI_PROVIDER: "ollama"
  OLLAMA_BASE_URL: "http://ollama:11434"
  SKIP_VIDEO_SIZE_CHECK: "true"
---
apiVersion: v1
kind: Secret
metadata:
  name: youtube-auth
type: Opaque
data:
  YOUTUBE_COOKIES_BASE64: <base64-of-cookies>  # `base64 < cookies.txt`
---
apiVersion: v1
kind: Pod
metadata:
  name: shorts-generator
spec:
  containers:
  - name: app
    image: shorts-generator:latest
    envFrom:
    - configMapRef:
        name: shorts-generator-config
    env:
    - name: YOUTUBE_COOKIES_BASE64
      valueFrom:
        secretKeyRef:
          name: youtube-auth
          key: YOUTUBE_COOKIES_BASE64
```

### 5. Health Check

```bash
# Verify YouTube access before running pipeline
npm run test:youtube-health

# Or manually:
yt-dlp \
  --no-check-certificates \
  --js-runtimes node \
  --list-formats \
  https://www.youtube.com/watch?v=aqz-KE-bpKQ
```

### 6. Debugging YouTube Blocks

If downloads fail with "403 Forbidden" or "Bot detection":

#### a) Check yt-dlp version
```bash
yt-dlp --upgrade  # Update to latest (YouTube frequently changes)
```

#### b) Verify cookies are valid
```bash
# Test with a simple video that doesn't require auth
yt-dlp --print "%(id)s" \
  --no-warnings \
  --cookies cookies.txt \
  "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
```

#### c) Check cluster IP is not blocked
```bash
# From inside pod:
curl -I https://www.youtube.com
# If times out or returns 403, YouTube is blocking the cluster IP
```

#### d) Try different player client
```bash
# In .env or K8s config:
YOUTUBE_PLAYER_CLIENT=android  # Rotate: web, android, mweb
```

### 7. Cluster Deployment Checklist

- [ ] Docker image has `ffmpeg` and `yt-dlp`
- [ ] `YOUTUBE_COOKIES_BASE64` or `YOUTUBE_COOKIES_FILE` is set
- [ ] `YOUTUBE_PLAYER_CLIENT=web`
- [ ] `SKIP_VIDEO_SIZE_CHECK=true` (optional, speeds up)
- [ ] Run `npm run test:youtube-health` in CI/CD
- [ ] GitHub Actions workflow runs every 6 hours
- [ ] Ollama or OpenRouter is configured for AI inference
- [ ] Temporary directory has write permissions
- [ ] Output directory has write permissions

### 8. Fallback: Direct Video URL Mode

If YouTube channel access fails, use direct video URLs:
```bash
export VIDEO_URLS="https://www.youtube.com/watch?v=xxx,https://www.youtube.com/watch?v=yyy"
npm run generate  # Processes only these URLs, no channel scraping
```

---

**Last Updated:** 2026-05-30  
**Tested On:** Ubuntu 24.04 LTS, Node 24.x, yt-dlp 2025.x
