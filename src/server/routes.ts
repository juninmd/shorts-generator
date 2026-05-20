import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadConfig } from "../core/config.js";
import { runPipeline } from "../core/pipeline.js";
import { logger } from "../core/logger.js";
import { registerAdminRoutes } from "./admin-routes.js";
import {
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  listJobs,
  getAllShorts,
  deleteJob,
} from "./job-store.js";

export const app = new Hono();

const apiAllowedOrigins = (process.env.ADMIN_ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",").map((o) => o.trim()).filter(Boolean);
app.use("/api/*", cors({ origin: apiAllowedOrigins }));

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

  await createJob(jobId);

  void (async () => {
    try {
      const results = await runPipeline(config, (progress) => {
        void updateJobProgress(jobId, progress);
      });
      await completeJob(jobId, results);
    } catch (err) {
      logger.error({ jobId, error: err }, "Job failed");
      await failJob(jobId, err);
    }
  })().catch(/* v8 ignore next */(err) => {
    logger.error({ jobId, error: err }, "Unhandled error in job runner");
    void failJob(jobId, err);
  });

  return c.json({ jobId, status: "processing" }, 202);
});

app.get("/api/jobs/:jobId", async (c) => {
  const { jobId } = c.req.param();
  const job = await getJob(jobId);

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

app.get("/api/jobs", async (c) => {
  return c.json(await listJobs());
});

app.delete("/api/jobs/:jobId", async (c) => {
  const { jobId } = c.req.param();
  const job = await getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  await deleteJob(jobId);

  return c.json({ status: "deleted" });
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

app.get("/api/shorts", async (c) => {
  return c.json(await getAllShorts());
});

registerAdminRoutes(app);
