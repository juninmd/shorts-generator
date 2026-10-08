import type { YouTubeAuthConfig, ManagedRunContext, GeneratedShort } from "./types-video.js";

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
  /** Model identifier served by LiteLLM (e.g. "cloud/auto") */
  aiModel: string;
  /** Timeout in milliseconds for AI HTTP requests (default: 300_000 = 5 min) */
  aiTimeoutMs: number;
  /** LiteLLM gateway API key */
  litellmApiKey: string;
  /** LiteLLM OpenAI-compatible base URL (e.g. http://litellm:4000/v1) */
  litellmBaseUrl: string;
  whisperBaseUrl?: string;
  telegramBotToken: string;
  telegramChatId: string;
  verticalWidth: number;
  verticalHeight: number;
  youtubeCookiesBrowser?: string;
  youtubeCookiesFile?: string;
  youtubeCookiesBase64?: string;
  youtubeNoCookies?: boolean;
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
  /** Max YouTube uploads per calendar day (default: 4). Shorts beyond this are Telegram-only. */
  dailyUploadLimit: number;
  /** Minimum viralScore (1-10) a clip must reach to be published (default: 7) */
  minViralScore: number;
  /** Channel handle (e.g. "@akitemquiz") used to fetch real performance feedback for prompts */
  channelHandle?: string;
  /** Maximum video duration (seconds) to include from channel listings. Default: 3h */
  maxVideoDurationSec: number;
  /** Optional query string to filter videos by title (case-insensitive substring match) */
  videoQuery?: string;
  youtubeAuth?: YouTubeAuthConfig;
  managedRun?: ManagedRunContext;
  /** Public base URL of this server — used to build the YouTube OAuth callback URL */
  serverPublicUrl?: string;
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
  stage: PipelineStage;
  videoId?: string;
  videoTitle?: string;
  currentShort?: number;
  totalShorts?: number;
  message: string;
  progress: number;
}


export type PipelineStage =
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "cutting"
  | "subtitling"
  | "uploading"
  | "done"
  | "error"
  | "generating_quiz"
  | "generating_tts"
  | "rendering"
  | "publishing_telegram"
  | "publishing_youtube";
