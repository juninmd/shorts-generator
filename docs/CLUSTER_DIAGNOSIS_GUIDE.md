# 🔍 Cluster Diagnosis Guide — YouTube Audio Download Issues

**Updated**: 2026-05-30  
**Improved error messages now identify the exact failure stage**

---

## 📊 Error Message Examples

### ✅ SUCCESS (Audio Download Complete)
```
✓ Audio downloaded and converted successfully
sizeKB: 2048
```

### ❌ FAILURE: Download Video Stream
```
[AUDIO EXTRACTION FAILED] Stage: download_video_stream
Expected: /app/output/temp/xyz.wav
Stderr: ERROR: ... unable to extract video data ...
Hint: YouTube may be blocking or video URL is invalid
```

### ❌ FAILURE: FFmpeg Conversion
```
[AUDIO EXTRACTION FAILED] Stage: ffmpeg_audio_extraction
Expected: /app/output/temp/xyz.wav
Stderr: ffmpeg ... returned non-zero exit code ...
Hint: FFmpeg post-processor failed (container format, codec issue)
```

### ❌ FAILURE: Whisper Service
```
[WHISPER UNREACHABLE] Cannot connect to http://whisper.ai.svc.cluster.local:9000
Check that WHISPER_BASE_URL="http://whisper.ai.svc.cluster.local:9000" is correct and service is running.
```

### ❌ FAILURE: Whisper DNS Error
```
[WHISPER DNS_ERROR] Cannot resolve hostname in http://whisper.ai.svc.cluster.local:9000
Hint: Service name is wrong or namespace is different
```

### ❌ FAILURE: Whisper Timeout
```
[WHISPER TIMEOUT] request exceeded 600s
Hint: Service is running but too slow (might be processing large audio)
```

---

## 🛠️ Step-by-Step Diagnosis

### Step 1: Check Kubernetes Resources

```bash
# Check if whisper pod is running
kubectl get pods -n ai | grep whisper
# Expected: Running with 1/1 Ready

# Check service
kubectl get svc -n ai | grep whisper
# Expected: ClusterIP, Port 9000

# Check logs
kubectl logs -n ai deployment/whisper --tail=50
# Look for initialization messages
```

### Step 2: Test Whisper Connectivity Inside Pod

```bash
# Enter shorts-generator pod
kubectl exec -it <pod-name> -- /bin/bash

# Test direct connection
curl -v http://whisper.ai.svc.cluster.local:9000/asr

# Expected:
# < HTTP/1.1 400 Bad Request
# (400 is OK — means service is up but query is incomplete)

# DO NOT expect:
# Connection refused
# Cannot resolve hostname
# Timeout
```

### Step 3: Check Configuration

```bash
# Verify environment variables in pod
kubectl exec <pod-name> -- env | grep WHISPER

# Expected output:
# WHISPER_BASE_URL=http://whisper.ai.svc.cluster.local:9000
# WHISPER_REQUEST_TIMEOUT_MS=600000
```

### Step 4: Test Audio Download (No Whisper)

Test **just** the yt-dlp audio extraction:

```bash
# Inside cluster pod
npm run test:youtube-health

# Should show:
# ✓ yt-dlp installed
# ✓ yt-dlp can query YouTube
# ✓ YouTube access verified
```

### Step 5: Run Full Diagnostic

```bash
kubectl exec <pod-name> -- npm run diagnose:cluster

# Look for this output:
# [✓] ffmpeg installed
# [✓] yt-dlp v2026.03.17
# [✓] Node v24.15.0
# [✓] YouTube cookies loaded (37 persistent)
# [✓] YouTube connectivity: PASS
# [✓] Ollama running
# [✓] 289 tests passing
# [!] WHISPER_BASE_URL set and reachable? ← Check this line
```

---

## 🚨 Common Issues & Solutions

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `YOUTUBE_BLOCKED` | YouTube detected bot | Update `YOUTUBE_COOKIES_BASE64` |
| `NO_VIDEO_FORMATS` | Video not found or region blocked | Try different video URL or player client |
| `FFMPEG_NOT_INSTALLED` | FFmpeg missing in container | Rebuild Docker image: `docker build -t shorts-generator .` |
| `FFMPEG_CONVERSION_FAILED` | Audio format incompatible | Check ffmpeg logs in pod stderr |
| `WHISPER_UNREACHABLE` | Service not running or wrong address | `kubectl get svc whisper -n ai` verify port/IP |
| `WHISPER_DNS_ERROR` | Wrong namespace or hostname | Check `WHISPER_BASE_URL` — should be `http://whisper.ai.svc.cluster.local:9000` |
| `WHISPER_TIMEOUT` | Service too slow | Increase `WHISPER_REQUEST_TIMEOUT_MS` (default 600s) |
| `DISK_SPACE_FULL` | `/app/output` or `/app/temp` full | `kubectl exec <pod> -- df -h` check usage |
| `PERMISSION_ERROR` | Container user can't write | Pod running as non-root; check PVC permissions |

---

## 📋 Verification Checklist

After deploying, verify:

- [ ] **yt-dlp**: `npm run test:youtube-health` passes
- [ ] **WHISPER_BASE_URL**: Set in ConfigMap or env
- [ ] **Whisper pod**: Running with `kubectl get pods -n ai`
- [ ] **Whisper service**: Accessible from app pod (curl test)
- [ ] **Output volume**: 50Gi available (`df -h`)
- [ ] **Temp volume**: 100Gi available
- [ ] **Cookies**: Valid and base64-encoded correctly

---

## 📜 Log Files to Check

**In pod:**
```bash
# Real-time logs
kubectl logs -f deployment/shorts-generator

# Whisper service logs
kubectl logs -f deployment/whisper -n ai

# Container shell (debug)
kubectl exec -it <pod> -- tail -f /var/log/app.log  # if mounted
```

**On local machine** (for docker-compose):
```bash
docker-compose logs -f shorts-generator
docker-compose logs -f whisper
```

---

## 🔗 Related Files

- **Error improvements**: `src/core/youtube.ts` — `downloadAudioOnly()` function
- **Whisper diagnostics**: `src/core/transcriber.ts` — `transcribeRemote()` function
- **Kubernetes config**: `D:\Solutions\pessoal\app-charts\shorts-generator\cronjob-generate.yaml`
- **Health check**: `tests/core/youtube.health.ts`
- **Cluster diagnostic**: `scripts/diagnose-cluster.ts`

---

## 💡 Pro Tips

### Test Audio Download Without Whisper
```bash
npm run test:youtube-health
```
This verifies yt-dlp works before testing full pipeline.

### Force Redownload Docker Image
```bash
docker build -t shorts-generator:latest . --no-cache
```

### Check Whisper Model Size
```bash
kubectl exec -n ai <whisper-pod> -- du -sh /models/
# Large models (medium, large) need more resources
```

### View Raw yt-dlp Command
Add debug logging to see the exact command being run:
```bash
export DEBUG=yt-dlp
npm run generate
```

---

**Questions?** Check the error message format — it now tells you exactly which stage failed! 🚀
