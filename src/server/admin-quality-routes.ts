import type { Context, Hono } from "hono";
import { z, ZodError } from "zod";
import { listEditorialDecisions } from "../core/editorial/editorial-decisions.js";
import { SnapshotRepository } from "../core/feedback/snapshot-repository.js";
import { logger } from "../core/logger.js";
import type { AdminDeps } from "./admin-helpers.js";
import { channelIdSchema } from "./admin-schemas.js";

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const bankListSchema = pageSchema.extend({ status: z.enum(["approved", "pending_review", "rejected"]).optional() });

/** Maps validation failures to 400 instead of leaking them as 500s. */
export function adminErrorHandler(error: Error, c: Context) {
  if (error instanceof ZodError) {
    return c.json({ error: "Invalid request", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  }
  if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON body" }, 400);
  logger.error({ error: error.message }, "Admin route failed");
  return c.json({ error: "Internal error" }, 500);
}

export function registerQualityRoutes(admin: Hono, deps: AdminDeps): void {
  if (deps.decisionsDb) {
    const db = deps.decisionsDb;
    admin.get("/channels/:channelId/editorial-decisions", async (c) => {
      const channelId = channelIdSchema.parse(c.req.param("channelId"));
      const { limit, offset } = pageSchema.parse(c.req.query());
      return c.json({ items: await listEditorialDecisions(db, channelId, limit, offset), limit, offset });
    });
    admin.get("/channels/:channelId/metric-snapshots", async (c) => {
      const channelId = channelIdSchema.parse(c.req.param("channelId"));
      const { limit } = pageSchema.parse(c.req.query());
      return c.json({ items: (await new SnapshotRepository(db).recent(channelId, new Date(), 60, limit)) });
    });
  }

  const bank = deps.quizBank;
  if (!bank) return;
  admin.get("/quiz-bank", async (c) => {
    const { status, limit, offset } = bankListSchema.parse(c.req.query());
    return c.json({ items: await bank.list(status, limit, offset), limit, offset });
  });
  for (const [action, status] of [["approve", "approved"], ["reject", "rejected"]] as const) {
    admin.post(`/quiz-bank/:id/${action}`, async (c) => {
      const ok = await bank.review(c.req.param("id") ?? "", status, "admin");
      return ok ? c.json({ id: c.req.param("id"), status }) : c.json({ error: "Question not found or already reviewed" }, 404);
    });
  }
}
