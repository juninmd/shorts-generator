import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { runControlPlaneMigrations } from "../core/control-plane-migrations.js";
import { logger } from "../core/logger.js";
import { QuizBankRepository } from "../core/quiz/quiz-bank-repository.js";
import { quizQuestionSchema } from "../core/quiz/quiz.domain.js";
import { buildWorkerContext } from "../worker/worker-deps.js";
import { collectAllFeedback, startWorkers } from "../worker/worker.js";

const seedSchema = z.array(z.object({
  theme: z.string().min(2),
  question: quizQuestionSchema,
  source: z.object({ url: z.string().url(), title: z.string(), excerpt: z.string() }),
}));

export const DEFAULT_SEED_FILE = path.join("db", "seeds", "quiz-bank.json");

async function openDb() {
  const cp = loadControlPlaneConfig();
  const db = getControlPlanePool(cp);
  await runControlPlaneMigrations(db);
  return { cp, db };
}

/** Seeds stay pending_review: a human must approve them before any channel can use them. */
export async function seedQuizBank(repo: QuizBankRepository, file = DEFAULT_SEED_FILE): Promise<number> {
  const entries = seedSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  for (const e of entries) await repo.upsert(e.theme, e.question, "pending_review", "seed", e.source);
  return entries.length;
}

export async function runWorkerCommand(command: string, args: string[]): Promise<void> {
  if (command === "worker") {
    const handle = await startWorkers();
    const stop = () => void handle.close().finally(() => process.exit(0));
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    return;
  }
  const { cp, db } = await openDb();
  if (command === "feedback:collect") {
    await collectAllFeedback(buildWorkerContext(db, cp));
    logger.info("Feedback collection finished");
    return;
  }
  const fileIndex = args.indexOf("--file");
  const file = fileIndex !== -1 && args[fileIndex + 1] ? args[fileIndex + 1] : DEFAULT_SEED_FILE;
  const count = await seedQuizBank(new QuizBankRepository(db), file);
  logger.info({ count, file }, "Quiz bank seeded (pending_review)");
}
