import type { PipelineConfig } from "../types.js";
import { logger } from "../core/logger.js";
import { runPipeline } from "../core/pipeline.js";
import { registerJob, runWithSignal } from "../core/run-context.js";
import { completeJob, failJob, updateJobProgress } from "./job-store.js";

/** Runs the pipeline in the background; DELETE /api/jobs/:id aborts it (ffmpeg included). */
export function startJob(jobId: string, config: PipelineConfig): void {
  const { signal, done } = registerJob(jobId);
  void (async () => {
    try {
      const results = await runWithSignal(signal, () => runPipeline(config, (progress) => {
        void updateJobProgress(jobId, progress);
      }));
      await completeJob(jobId, results);
    } catch (err) {
      logger.error({ jobId, error: err }, "Job failed");
      await failJob(jobId, err);
    } finally {
      done();
    }
  })().catch((err) => {
    logger.error({ jobId, error: err }, "Unhandled error in job runner");
    void failJob(jobId, err);
  });
}
