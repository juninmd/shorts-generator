import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadConfig } from "../core/config.js";
import { runPipeline } from "../core/pipeline.js";
import { logger } from "../core/logger.js";
import {
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  listJobs,
  getAllShorts,
} from "./job-store.js";

export const app = new Hono();

app.use("/*", cors());

const GenerateBodySchema = z.object({
  urls: z.array(z.string().url()).optional().default([]),
  channels: z.array(z.string()).optional().default([]),
  videoLimit: z.number().int().positive().optional().default(3),
});

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.post("/api/generate", async (c) => {
  const body = await c.req.json();
  const parsed = GenerateBodySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { urls, channels, videoLimit } = parsed.data;

  if (urls.length === 0 && channels.length === 0) {
    return c.json({ error: "Provide at least one url or channel" }, 400);
  }

  const jobId = nanoid(12);
  const config = loadConfig({ specificUrls: urls, channels, videoLimit });

  createJob(jobId);

  (async () => {
    try {
      const results = await runPipeline(config, (progress) => {
        updateJobProgress(jobId, progress);
      });
      completeJob(jobId, results);
    } catch (err) {
      logger.error({ jobId, error: err }, "Job failed");
      failJob(jobId, err);
    }
  })();

  return c.json({ jobId, status: "processing" }, 202);
});

app.get("/api/jobs/:jobId", (c) => {
  const { jobId } = c.req.param();
  const job = getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    jobId,
    status: job.status,
    progress: job.progress,
    results: job.status === "completed" ? job.results : undefined,
    createdAt: job.createdAt,
  });
});

app.get("/api/jobs", (c) => {
  return c.json(listJobs());
});

app.get("/api/shorts/:videoId/:clipId", async (c) => {
  const { videoId, clipId } = c.req.param();
  const config = loadConfig();
  const filePath = path.join(config.outputDir, videoId, `${clipId}.mp4`);

  if (!fs.existsSync(filePath)) {
    return c.json({ error: "Short not found" }, 404);
  }

  const file = fs.readFileSync(filePath);
  return new Response(file, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${clipId}.mp4"`,
    },
  });
});

app.get("/api/shorts", (c) => {
  return c.json(getAllShorts());
});
