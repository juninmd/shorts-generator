import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  ApiGenerateResponse,
  PipelineProgress,
  PipelineResult,
} from "../types.js";
import { loadConfig } from "../core/config.js";
import { runPipeline, processUrl } from "../core/pipeline.js";
import { logger } from "../core/logger.js";

export const app = new Hono();

app.use("/*", cors());

// In-memory job store
const jobs = new Map<
  string,
  {
    status: ApiGenerateResponse["status"];
    results: PipelineResult[];
    progress: PipelineProgress | null;
    createdAt: string;
  }
>();

const GenerateBodySchema = z.object({
  urls: z.array(z.string().url()).optional().default([]),
  channels: z.array(z.string()).optional().default([]),
  daysBack: z.number().int().positive().optional().default(1),
});

// ─── Health check ───
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Start generation job ───
app.post("/api/generate", async (c) => {
  const body = await c.req.json();
  const parsed = GenerateBodySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { urls, channels, daysBack } = parsed.data;

  if (urls.length === 0 && channels.length === 0) {
    return c.json({ error: "Provide at least one url or channel" }, 400);
  }

  const jobId = nanoid(12);
  const config = loadConfig({
    specificUrls: urls,
    channels,
    daysBack,
  });

  jobs.set(jobId, {
    status: "processing",
    results: [],
    progress: null,
    createdAt: new Date().toISOString(),
  });

  // Run pipeline in background
  (async () => {
    try {
      const results = await runPipeline(config, (progress) => {
        const job = jobs.get(jobId);
        if (job) job.progress = progress;
      });

      const job = jobs.get(jobId);
      if (job) {
        job.status = "completed";
        job.results = results;
      }
    } catch (err) {
      logger.error({ jobId, error: err }, "Job failed");
      const job = jobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.progress = {
          stage: "error",
          videoId: "",
          videoTitle: "",
          message: err instanceof Error ? err.message : String(err),
          progress: 0,
        };
      }
    }
  })();

  return c.json({ jobId, status: "processing" }, 202);
});

// ─── Get job status ───
app.get("/api/jobs/:jobId", (c) => {
  const { jobId } = c.req.param();
  const job = jobs.get(jobId);

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

// ─── List all jobs ───
app.get("/api/jobs", (c) => {
  const jobList = Array.from(jobs.entries()).map(([id, job]) => ({
    jobId: id,
    status: job.status,
    progress: job.progress,
    shortsCount: job.results.reduce((sum, r) => sum + r.shorts.length, 0),
    createdAt: job.createdAt,
  }));

  return c.json(jobList);
});

// ─── Download a generated short ───
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

// ─── List generated shorts ───
app.get("/api/shorts", (c) => {
  const allShorts = Array.from(jobs.values())
    .filter((j) => j.status === "completed")
    .flatMap((j) =>
      j.results.flatMap((r) =>
        r.shorts.map((s) => ({
          id: s.id,
          videoId: r.videoId,
          title: s.clip.title,
          description: s.clip.description,
          viralScore: s.clip.viralScore,
          duration: s.clip.duration,
          startTime: s.clip.startTime,
          endTime: s.clip.endTime,
          originalVideoUrl: s.originalVideoUrl,
          originalVideoTitle: s.originalVideoTitle,
          channelName: s.channelName,
          status: s.status,
          createdAt: s.createdAt,
          downloadUrl: `/api/shorts/${r.videoId}/${s.id}`,
        })),
      ),
    );

  return c.json(allShorts);
});
