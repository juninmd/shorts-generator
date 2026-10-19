import { pollUntilDone, requestJson } from "./http.js";
import type { Publisher } from "./types.js";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Instagram Reels via the Graph API: create container → wait → publish. Needs a public video URL. */
export const instagram: Publisher = {
  name: "instagram",
  needsPublicUrl: true,
  configured: () => Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN),
  async publish({ videoUrl, copy }) {
    const user = process.env.INSTAGRAM_USER_ID!;
    const token = process.env.INSTAGRAM_ACCESS_TOKEN!;
    const container = await requestJson<{ id: string }>("Instagram container", `${GRAPH}/${user}/media`, {
      method: "POST",
      body: new URLSearchParams({ media_type: "REELS", video_url: videoUrl!, caption: copy.caption, share_to_feed: "true", access_token: token }),
    });
    await pollUntilDone("Instagram video", async () => {
      const { status_code } = await requestJson<{ status_code: string }>(
        "Instagram status", `${GRAPH}/${container.id}?fields=status_code&access_token=${token}`,
      );
      return status_code === "FINISHED" ? "done" : status_code === "ERROR" || status_code === "EXPIRED" ? "failed" : "pending";
    });
    const published = await requestJson<{ id: string }>("Instagram publish", `${GRAPH}/${user}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return `instagram:${published.id}`;
  },
};
