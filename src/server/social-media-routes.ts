import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { loadConfig } from "../core/config.js";
import { socialDir } from "../core/social-publish.js";

const PUBLIC_NAME = /^[A-Za-z0-9_-]{16,64}\.mp4$/;

/**
 * Unauthenticated, read-only video URLs for platforms that pull the file
 * (Instagram, Threads, TikTok). Only the unguessable names issued by the social
 * queue resolve; nothing else in the output directory is reachable.
 */
export function registerSocialMediaRoutes(app: Hono): void {
  app.get("/public/social/:name", (c) => {
    const { name } = c.req.param();
    const file = PUBLIC_NAME.test(name) ? path.join(socialDir(loadConfig()), name) : null;
    if (!file || !fs.existsSync(file)) return c.json({ error: "Not found" }, 404);
    return new Response(fs.readFileSync(file), {
      headers: { "Content-Type": "video/mp4", "Cache-Control": "public, max-age=3600" },
    });
  });
}
