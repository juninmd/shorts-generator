import { pollUntilDone, requestJson } from "./http.js";
import type { Publisher } from "./types.js";

const GRAPH = "https://graph.threads.net/v1.0";

/** Threads video post via the Threads API: create container → wait → publish. Needs a public video URL. */
export const threads: Publisher = {
  name: "threads",
  needsPublicUrl: true,
  configured: () => Boolean(process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN),
  async publish({ videoUrl, copy }) {
    const user = process.env.THREADS_USER_ID!;
    const token = process.env.THREADS_ACCESS_TOKEN!;
    const container = await requestJson<{ id: string }>("Threads container", `${GRAPH}/${user}/threads`, {
      method: "POST",
      body: new URLSearchParams({ media_type: "VIDEO", video_url: videoUrl!, text: copy.caption, access_token: token }),
    });
    await pollUntilDone("Threads video", async () => {
      const { status } = await requestJson<{ status: string }>(
        "Threads status", `${GRAPH}/${container.id}?fields=status&access_token=${token}`,
      );
      return status === "FINISHED" ? "done" : status === "ERROR" || status === "EXPIRED" ? "failed" : "pending";
    });
    const published = await requestJson<{ id: string }>("Threads publish", `${GRAPH}/${user}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return `threads:${published.id}`;
  },
};
