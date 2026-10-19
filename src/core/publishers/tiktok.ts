import { pollUntilDone, requestJson } from "./http.js";
import type { Publisher } from "./types.js";

const API = "https://open.tiktokapis.com/v2/post/publish";

/**
 * TikTok Content Posting API (PULL_FROM_URL; the URL's domain must be verified
 * in the TikTok developer portal). Unaudited apps can only post privately, so
 * TIKTOK_PRIVACY defaults to SELF_ONLY.
 */
export const tiktok: Publisher = {
  name: "tiktok",
  needsPublicUrl: true,
  configured: () => Boolean(process.env.TIKTOK_ACCESS_TOKEN),
  async publish({ videoUrl, copy }) {
    const headers = {
      Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
      "Content-Type": "application/json; charset=UTF-8",
    };
    const init = await requestJson<{ data: { publish_id: string } }>("TikTok init", `${API}/video/init/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        post_info: { title: copy.caption, privacy_level: process.env.TIKTOK_PRIVACY || "SELF_ONLY" },
        source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
      }),
    });
    const publishId = init.data.publish_id;
    await pollUntilDone("TikTok video", async () => {
      const status = await requestJson<{ data: { status: string } }>("TikTok status", `${API}/status/fetch/`, {
        method: "POST", headers, body: JSON.stringify({ publish_id: publishId }),
      });
      return status.data.status === "PUBLISH_COMPLETE" ? "done" : status.data.status === "FAILED" ? "failed" : "pending";
    });
    return `tiktok:${publishId}`;
  },
};
