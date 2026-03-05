// ─── Core domain types for shorts-generator ───

export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  channelName: string;
  channelUrl: string;
  duration: number;
  publishedAt: string;
  thumbnailUrl?: string;
}

export interface DownloadedVideo extends VideoInfo {
  filePath: string;
  audioPath: string;
  fileSize: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  videoId: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  fullText: string;
  language: string;
  duration: number;
}

export interface ShortClip {
  id: string;
  videoId: string;
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore: number;
  reason: string;
  hookLine: string;
  transcript: TranscriptSegment[];
  words: TranscriptWord[];
  hashtags: string[];
}

export interface GeneratedShort {
  id: string;
  clip: ShortClip;
  outputPath: string;
  subtitlePath: string;
  originalVideoUrl: string;
  originalVideoTitle: string;
  channelName: string;
  telegramMessageId?: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  createdAt: string;
}

export interface PipelineConfig {
  channels: string[];
  specificUrls: string[];
  daysBack: number;
  maxCutsPerBlock: number;
  minuteBlockSize: number;
  maxShortDuration: number;
  minShortDuration: number;
  /** Maximum video file size in bytes before skipping download (default: 500 MB) */
  maxVideoSizeBytes: number;
  /** Minimum number of shorts to generate per video */
  minShortsPerVideo: number;
  outputDir: string;
  tempDir: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  whisperModel: string;
  telegramBotToken: string;
  telegramChatId: string;
  verticalWidth: number;
  verticalHeight: number;
  youtubeCookiesBrowser?: string;
  youtubeCookiesFile?: string;
  youtubeCookiesBase64?: string;
}

export interface PipelineResult {
  videoId: string;
  videoTitle: string;
  channelName: string;
  shorts: GeneratedShort[];
  errors: string[];
  processingTimeMs: number;
}

export interface PipelineProgress {
  stage:
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "cutting"
  | "subtitling"
  | "uploading"
  | "done"
  | "error";
  videoId: string;
  videoTitle: string;
  currentShort?: number;
  totalShorts?: number;
  message: string;
  progress: number;
}

export interface ApiGenerateRequest {
  urls?: string[];
  channels?: string[];
  daysBack?: number;
}

export interface ApiGenerateResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  results?: PipelineResult[];
  progress?: PipelineProgress;
}
