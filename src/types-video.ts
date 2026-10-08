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
  /** Name of the person presenting/speaking in this clip, when identifiable */
  presenter?: string;
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
  publishingAccounts?: any[]; // For legacy compatibility in youtube.service.ts
  focusLabels: string[];
  logoPath?: string | null;
}
