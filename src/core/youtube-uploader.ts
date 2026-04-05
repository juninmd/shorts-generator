/* v8 ignore start */
import { google } from "googleapis";
import fs from "node:fs";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

/**
 * Upload a video file to YouTube using the Data API v3.
 */
export async function uploadToYouTube(
  filePath: string,
  title: string,
  description: string,
  config: PipelineConfig,
  isShort: boolean = true
): Promise<string | null> {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REFRESH_TOKEN) {
    logger.warn("YouTube credentials missing");
    return null;
  }

  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  const youtube = google.youtube({ version: "v3", auth });

  const safeTitle = title.slice(0, 100);

  logger.info({ title: safeTitle }, "Uploading video to YouTube");

  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: safeTitle, description, categoryId: "22" },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      },
      media: { body: fs.createReadStream(filePath) },
    });

    const videoId = res.data.id;
    if (!videoId) return null;

    const videoUrl = isShort 
      ? `https://youtube.com/shorts/${videoId}`
      : `https://youtube.com/watch?v=${videoId}`;
      
    logger.info({ videoId, videoUrl }, "Video uploaded successfully");
    return videoUrl;
  } catch (error: any) {
    logger.error({ error: error.message || error }, "YouTube upload failed");
    return null;
  }
}

/**
 * Upload full video (repost).
 */
export async function uploadFullVideoToYouTube(
  filePath: string,
  title: string,
  description: string,
  config: PipelineConfig,
): Promise<string | null> {
  return uploadToYouTube(filePath, title, description, config, false);
}
