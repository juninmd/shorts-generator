export interface ShortItem {
  id: string;
  videoId: string;
  title: string;
  description: string;
  viralScore: number;
  duration: number;
  startTime: number;
  endTime: number;
  originalVideoUrl: string;
  originalVideoTitle: string;
  channelName: string;
  status: string;
  createdAt: string;
  downloadUrl: string;
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: {
    stage: string;
    videoId: string;
    videoTitle: string;
    currentShort?: number;
    totalShorts?: number;
    message: string;
    progress: number;
  } | null;
  results?: Array<{
    videoId: string;
    videoTitle: string;
    channelName: string;
    shorts: Array<{
      id: string;
      clip: {
        id: string;
        title: string;
        description: string;
        startTime: number;
        endTime: number;
        duration: number;
        viralScore: number;
        reason: string;
        hookLine: string;
        hashtags: string[];
      };
      outputPath: string;
      originalVideoUrl: string;
      originalVideoTitle: string;
      channelName: string;
      status: string;
      createdAt: string;
    }>;
    errors: string[];
    processingTimeMs: number;
  }>;
  createdAt: string;
}
