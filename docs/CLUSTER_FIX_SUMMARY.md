# 🚀 YouTube Download Cluster Fix — Complete Solution

**Status**: YouTube downloads stopped working in your cluster  
**Root Cause**: Likely missing system dependencies or YouTube authentication in container  
**Solution**: Implemented multi-layer health checks + cluster deployment guide

---

## What Was Done

### 1. **GitHub Actions Workflow** (`.github/workflows/youtube-health-check.yml`)
- Runs every 6 hours to detect YouTube blocking early
- Tests `yt-dlp` access to public videos
- Verifies `ffmpeg` and system dependencies
- Alerts on failures

**Run manually:**
```bash
# In GitHub Actions UI, trigger: youtube-health-check
```

### 2. **YouTube Health Check Test** (`tests/core/youtube.health.ts`)
- Tests YouTube access with `verifyYoutubeAccess()`
- Fetches metadata from test video
- Graceful error handling for blocks

**Run locally:**
```bash
npm run test:youtube-health
```

### 3. **Cluster Diagnostic Script** (`scripts/diagnose-cluster.ts`)
- Comprehensive health check for cluster environment
- Verifies ffmpeg, yt-dlp, Node, Python installations
- Checks environment variable configuration
- Tests YouTube connectivity
- Validates directory permissions

**Run in cluster:**
```bash
npm run diagnose:cluster
```

### 4. **Updated Dockerfile**
- Installs `yt-dlp` from apt-get (not just Python pip)
- Installs `ffmpeg` with minimal footprint
- Verifies all tools in build step
- Uses `node:24-slim` base

### 5. **Cluster Setup Documentation** (`YOUTUBE_CLUSTER_SETUP.md`)
- Kubernetes ConfigMap/Secret examples
- Authentication strategies (cookies, browser, API)
- Docker deployment guide
- Debugging YouTube blocks
- IP rotation & fallback strategies

---

## Quick Fix Checklist

### For Kubernetes Deployment

```bash
# 1. Verify Docker image has all tools
docker build -t shorts-generator:latest .

# 2. Create YouTube auth secret
kubectl create secret generic youtube-auth \
  --from-literal=YOUTUBE_COOKIES_BASE64="$(base64 < cookies.txt | tr -d '\n')"

# 3. Create ConfigMap
kubectl create configmap shorts-generator-config \
  --from-literal=YOUTUBE_PLAYER_CLIENT=web \
  --from-literal=SKIP_VIDEO_SIZE_CHECK=true

# 4. Deploy pod with config (see YOUTUBE_CLUSTER_SETUP.md for full YAML)

# 5. Run diagnostic inside pod
kubectl exec -it <pod-name> -- npm run diagnose:cluster

# 6. Run health test
kubectl exec -it <pod-name> -- npm run test:youtube-health
```

### For Local Docker
```bash
# Build with YouTube auth
docker run -it \
  -e YOUTUBE_COOKIES_BASE64="$(base64 < cookies.txt | tr -d '\n')" \
  -e YOUTUBE_PLAYER_CLIENT=web \
  shorts-generator:latest \
  npm run diagnose:cluster
```

---

## Likely Issues & Solutions

| Issue | Solution |
|-------|----------|
| `yt-dlp not found` | Dockerfile now installs from apt-get |
| `ffmpeg not found` | Added to Dockerfile, verified in build |
| `403 Forbidden` | Update cookies: `yt-dlp --upgrade` |
| `sign in to confirm you're not a bot` | Use `YOUTUBE_COOKIES_BASE64` or `YOUTUBE_COOKIES_BROWSER` |
| Cluster IP blocked by YouTube | Use proxy or fallback to `VIDEO_URLS` mode |
| No available formats | yt-dlp outdated — runs auto-upgrade in CI |

---

## Files Modified/Created

```
.github/workflows/youtube-health-check.yml   ← 6-hourly GitHub Actions test
tests/core/youtube.health.ts                 ← YouTube health test suite
scripts/diagnose-cluster.ts                  ← Cluster diagnostic tool
YOUTUBE_CLUSTER_SETUP.md                     ← Full deployment guide
CLUSTER_FIX_SUMMARY.md                       ← This file
Dockerfile                                   ← Added yt-dlp + verification
package.json                                 ← Added test & diagnose scripts
```

---

## Next Steps

### 1. **Test Locally**
```bash
npm install
npm run diagnose:cluster
npm run test:youtube-health
```

### 2. **Extract YouTube Cookies** (if needed)
```bash
# Use browser extension: https://github.com/kairi003/Get-cookies.txt-LOCALLY
# Export from Chrome/Firefox, then:
base64 < cookies.txt | tr -d '\n' > cookie.b64
cat cookie.b64  # Copy this value
```

### 3. **Deploy to Cluster**
```bash
# Update .env with cookies
export YOUTUBE_COOKIES_BASE64="<paste-here>"

# Rebuild Docker image
docker build -t shorts-generator:latest .

# Push to registry
docker push <registry>/shorts-generator:latest

# Deploy with Kubernetes (see YOUTUBE_CLUSTER_SETUP.md for full YAML)
kubectl apply -f k8s-deployment.yaml
```

### 4. **Verify in Cluster**
```bash
kubectl exec -it deployment/shorts-generator -- npm run diagnose:cluster
kubectl exec -it deployment/shorts-generator -- npm run test:youtube-health
```

---

## Monitoring

GitHub Actions will:
- Run health check every 6 hours
- Alert if YouTube becomes inaccessible
- Auto-update yt-dlp weekly (workflow: `update-yt-dlp.yml`)

Manually check anytime:
```bash
npm run diagnose:cluster      # Local or in-cluster
npm run test:youtube-health   # Quick health test
```

---

## Support

If YouTube access still fails after these steps:
1. Check GitHub Actions logs: `.github/workflows/youtube-health-check.yml`
2. Run `npm run diagnose:cluster` and share output
3. Verify `YOUTUBE_COOKIES_BASE64` is base64-encoded correctly
4. Try `YOUTUBE_PLAYER_CLIENT=android` or `YOUTUBE_PLAYER_CLIENT=mweb`
5. Consider fallback: use `VIDEO_URLS` env var instead of channel scraping

---

**Generated:** 2026-05-30  
**For:** shorts-generator cluster deployment
