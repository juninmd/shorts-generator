import fs from "node:fs";
import path from "node:path";
import { pollUntilDone, requestJson } from "./http.js";
import type { Publisher } from "./types.js";

const VIDEO_SERVICE = "https://video.bsky.app/xrpc";

interface Session {
  accessJwt: string;
  did: string;
  handle: string;
  didDoc?: { service?: Array<{ id: string; serviceEndpoint: string }> };
}

/**
 * Bluesky video post: login → service-auth token → upload to the video service
 * → wait for the blob → post with a video embed. Uses an app password.
 */
export const bluesky: Publisher = {
  name: "bluesky",
  needsPublicUrl: false,
  configured: () => Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
  async publish({ videoPath, copy }) {
    const pds = process.env.BLUESKY_SERVICE || "https://bsky.social";
    const session = await requestJson<Session>("Bluesky login", `${pds}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }),
    });
    const bearer = { Authorization: `Bearer ${session.accessJwt}` };
    const endpoint = session.didDoc?.service?.find((service) => service.id === "#atproto_pds")?.serviceEndpoint ?? pds;
    const audience = `did:web:${new URL(endpoint).host}`;
    const expiry = Math.floor(Date.now() / 1000) + 1800;
    const { token } = await requestJson<{ token: string }>(
      "Bluesky service auth",
      `${pds}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(audience)}&lxm=com.atproto.repo.uploadBlob&exp=${expiry}`,
      { headers: bearer },
    );
    const uploadUrl = `${VIDEO_SERVICE}/app.bsky.video.uploadVideo?did=${encodeURIComponent(session.did)}&name=${encodeURIComponent(path.basename(videoPath))}`;
    const upload = await requestJson<{ jobId: string }>("Bluesky upload", uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" },
      body: fs.readFileSync(videoPath),
    });
    let blob: unknown;
    await pollUntilDone("Bluesky video", async () => {
      const { jobStatus } = await requestJson<{ jobStatus: { state: string; blob?: unknown } }>(
        "Bluesky job status", `${VIDEO_SERVICE}/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(upload.jobId)}`,
      );
      blob = jobStatus.blob;
      return jobStatus.state === "JOB_STATE_COMPLETED" ? "done" : jobStatus.state === "JOB_STATE_FAILED" ? "failed" : "pending";
    });
    const record = await requestJson<{ uri: string }>("Bluesky post", `${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: copy.caption,
          createdAt: new Date().toISOString(),
          embed: { $type: "app.bsky.embed.video", video: blob, aspectRatio: { width: 1080, height: 1920 } },
        },
      }),
    });
    return `https://bsky.app/profile/${session.handle}/post/${record.uri.split("/").pop()}`;
  },
};
