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
  liveStatus?: string;
  categories?: string[];
  viewCount?: number;
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

export interface YouTubeAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ManagedRunContext {
  runId: string;
  channelId: string;
  channelName: string;
  accountId?: string;
  focusLabels: string[];
  logoPath?: string | null;
}

export interface PipelineConfig {
  channels: string[];
  specificUrls: string[];
  videoLimit: number;
  maxCutsPerBlock: number;
  minuteBlockSize: number;
  maxShortDuration: number;
  minShortDuration: number;
  /** Maximum video file size in bytes before skipping download (default: 500 MB) */
  maxVideoSizeBytes: number;
  /** Minimum number of shorts to generate per video */
  minShortsPerVideo: number;
  /** Hard cap on clips per video — overrides duration-based calculation (useful for testing) */
  maxClipsOverride?: number;
  outputDir: string;
  tempDir: string;
  /** AI provider: "openrouter" or "ollama" */
  aiProvider: "openrouter" | "ollama";
  /** Model identifier (e.g. "google/gemma-3-4b-it:free" or "gemma3:1b") */
  aiModel: string;
  /** Timeout in milliseconds for AI HTTP requests (default: 300_000 = 5 min) */
  aiTimeoutMs: number;
  /** OpenRouter API key (required when aiProvider is "openrouter") */
  openrouterApiKey: string;
  /** Ollama base URL (only used when aiProvider is "ollama") */
  ollamaBaseUrl: string;
  whisperModel: string;
  whisperBaseUrl?: string;
  telegramBotToken: string;
  telegramChatId: string;
  verticalWidth: number;
  verticalHeight: number;
  youtubeCookiesBrowser?: string;
  youtubeCookiesFile?: string;
  youtubeCookiesBase64?: string;
  watermarkText: string;
  videoEncoder: string;
  /** Explicit total short clips target for this pipeline run */
  targetShorts?: number;
  /** If set, generate this many top full videos via runTopVideoPipeline (command-level, not per-video) */
  fullVideoCount?: number;
  /** Skip remote video file-size check — safe when audio-only download is used */
  skipVideoSizeCheck?: boolean;
  /** Sort channel videos by view count instead of most recent */
  sortByViews?: boolean;
  /** Keep temp files (audio, video sections) after processing — useful for debugging */
  keepTempFiles?: boolean;
  /** Max YouTube uploads per calendar day (default: 70). Shorts beyond this are Telegram-only. */
  dailyUploadLimit: number;
  /** Maximum video duration (seconds) to include from channel listings. Default: 3h */
  maxVideoDurationSec: number;
  /** Optional query string to filter videos by title (case-insensitive substring match) */
  videoQuery?: string;
  youtubeAuth?: YouTubeAuthConfig;
  managedRun?: ManagedRunContext;
  /** Optional progress callback (used by transcriber) */
  onProgress?: (percent: number) => void;
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
  videoLimit?: number;
}

export interface ApiGenerateResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  results?: PipelineResult[];
  progress?: PipelineProgress;
}
