import type { PipelineConfig, PipelineProgress, PipelineResult } from "../../types.js";
import { logger } from "../logger.js";
import { runPipeline } from "../pipeline.js";
import { runQuizPipeline } from "../quiz/quiz-pipeline.js";
import type { DurableRunRepository, RunOptions } from "./durable-run-repository.js";
import { mapQuizResultToPipeline } from "./quiz-result.js";
import type { RunStatus } from "./run-status.js";

export interface ResolvedRunConfig {
  readonly config: PipelineConfig;
  readonly channelType: "cuts" | "quiz";
  readonly channelName: string;
}

export interface RunExecutorDeps {
  readonly runs: DurableRunRepository;
  /** Must resolve current credentials by channel reference (never from the job payload). */
  readonly resolveConfig: (runId: string, channelId: string, options: RunOptions) => Promise<ResolvedRunConfig>;
  readonly owner: string;
  readonly leaseMs?: number;
  readonly runCuts?: typeof runPipeline;
  readonly runQuiz?: typeof runQuizPipeline;
}

export type ExecuteOutcome =
  | { readonly status: RunStatus }
  | { readonly status: "deferred"; readonly reason: string }
  | { readonly status: "skipped"; readonly reason: string };

const DONE: readonly string[] = ["generated", "review_pending", "publish_pending", "published", "completed"];
const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export async function executeRun(runId: string, deps: RunExecutorDeps): Promise<ExecuteOutcome> {
  const { runs } = deps;
  const leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
  const state = await runs.getExecutionState(runId);
  if (!state) return { status: "skipped", reason: "run not found" };
  if (DONE.includes(state.status)) return { status: "skipped", reason: `run already ${state.status}` };
  if (!(await runs.acquireLease(runId, state.channelId, deps.owner, leaseMs))) {
    return { status: "deferred", reason: "another run holds the channel lease" };
  }
  const heartbeat = setInterval(() => {
    runs.renewLease(runId, deps.owner, leaseMs).catch((error) => logger.warn({ runId, error: String(error) }, "Lease renewal failed"));
  }, Math.max(1000, Math.floor(leaseMs / 3)));
  heartbeat.unref?.();

  const progress = (p: PipelineProgress) => {
    void runs.updateProgress(runId, p).catch((error) => logger.warn({ runId, error: String(error) }, "Progress update failed"));
  };
  try {
    const resolved = await deps.resolveConfig(runId, state.channelId, state.options);
    let results: PipelineResult[];
    if (resolved.channelType === "quiz") {
      if (process.env.CHANNEL_FLOW_MODE === "cuts") throw new Error("Quiz runs are disabled while CHANNEL_FLOW_MODE=cuts");
      const quiz = await (deps.runQuiz ?? runQuizPipeline)(resolved.config, (p) => progress(p as PipelineProgress), state.options.quizTopic);
      results = [mapQuizResultToPipeline(quiz, resolved.channelName)];
    } else {
      const done = new Set(state.checkpoint.completedVideoIds);
      const previous = [...state.checkpoint.results];
      const fresh = await (deps.runCuts ?? runPipeline)(resolved.config, progress, {
        completedVideoIds: done,
        onVideoDone: async (result) => {
          done.add(result.videoId);
          previous.push(result);
          await runs.saveCheckpoint(runId, { completedVideoIds: [...done], results: previous });
        },
      });
      // Results already checkpointed are in `previous`; add any not reported through the hook.
      results = [...previous, ...fresh.filter((r) => !previous.includes(r))];
    }
    const status = await runs.finishRun(runId, results);
    logger.info({ runId, channelId: state.channelId, status }, "Run finished");
    return { status };
  } catch (error) {
    await runs.markFailed(runId, error);
    logger.error({ runId, error: error instanceof Error ? error.message : String(error) }, "Run failed");
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
