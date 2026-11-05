import type { PipelineProgress, PipelineResult } from "../types.js";

export interface ApiGenerateRequest {
  urls?: string[];
  channels?: string[];
  videoLimit?: number;
}

export interface ApiGenerateResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  results?: PipelineResult[];
  progress?: PipelineProgress;
}
