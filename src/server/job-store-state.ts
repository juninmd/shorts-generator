import type { ApiGenerateResponse, PipelineProgress, PipelineResult } from "../types.js";

export interface JobState {
  status: ApiGenerateResponse["status"];
  results: PipelineResult[];
  progress: PipelineProgress | null;
  createdAt: string;
}


export const jobs = new Map<string, JobState>();


export interface RunRow {
  status: JobState["status"];
  progress: PipelineProgress | null;
  results: PipelineResult[];
  created_at: string;
}



export interface RunSummaryRow extends RunRow {
  id: string;
}

export interface RunResultsRow {
  results: PipelineResult[];
}

export function mapRowToJobState(row: RunRow): JobState {
  return {
    status: row.status,
    progress: row.progress,
    results: row.results,
    createdAt: row.created_at,
  };
}


export function flattenShorts(results: readonly PipelineResult[]) {
  return results.flatMap((result) =>
    result.shorts.map((short) => ({
      id: short.id,
      videoId: result.videoId,
      title: short.clip.title,
      description: short.clip.description,
      viralScore: short.clip.viralScore,
      duration: short.clip.duration,
      startTime: short.clip.startTime,
      endTime: short.clip.endTime,
      originalVideoUrl: short.originalVideoUrl,
      originalVideoTitle: short.originalVideoTitle,
      channelName: short.channelName,
      status: short.status,
      createdAt: short.createdAt,
      downloadUrl: `/api/shorts/${result.videoId}/${short.id}`,
    })),
  );
}
