import fs from "node:fs";
import { pollUntilDone, requestJson } from "./http.js";
import type { Publisher } from "./types.js";

const API = "https://api.pinterest.com/v5";

/** Pinterest video pin: register media → upload the file → wait → create the pin on PINTEREST_BOARD_ID. */
export const pinterest: Publisher = {
  name: "pinterest",
  needsPublicUrl: false,
  configured: () => Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID),
  async publish({ videoPath, copy }) {
    const headers = { Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}`, "Content-Type": "application/json" };
    const media = await requestJson<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>(
      "Pinterest media", `${API}/media`, { method: "POST", headers, body: JSON.stringify({ media_type: "video" }) },
    );
    const form = new FormData();
    for (const [key, value] of Object.entries(media.upload_parameters)) form.append(key, value);
    form.append("file", new Blob([fs.readFileSync(videoPath)], { type: "video/mp4" }), "video.mp4");
    const upload = await fetch(media.upload_url, { method: "POST", body: form });
    if (!upload.ok) throw new Error(`Pinterest upload failed (${upload.status})`);
    await pollUntilDone("Pinterest video", async () => {
      const { status } = await requestJson<{ status: string }>("Pinterest status", `${API}/media/${media.media_id}`, { headers });
      return status === "succeeded" ? "done" : status === "failed" ? "failed" : "pending";
    });
    const pin = await requestJson<{ id: string }>("Pinterest pin", `${API}/pins`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        board_id: process.env.PINTEREST_BOARD_ID,
        title: copy.title,
        description: copy.description,
        media_source: { source_type: "video_id", media_id: media.media_id, cover_image_key_frame_time: 1 },
      }),
    });
    return `https://www.pinterest.com/pin/${pin.id}/`;
  },
};
