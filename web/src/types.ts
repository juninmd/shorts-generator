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

export interface AdminChannelFocus {
  id?: string;
  key: "politica" | "catolicos" | "musica" | "filmes" | "series" | "jogos" | "tecnologia";
  label: string;
}

export interface AdminSourceTarget {
  id?: string;
  kind: "youtube_channel" | "youtube_handle" | "youtube_url";
  value: string;
  label: string;
}

export interface AdminPublishingAccount {
  id?: string;
  provider: "youtube" | "telegram" | "openrouter";
  label: string;
  status: "active" | "inactive";
  accountIdentifier: string;
  clientId?: string;
  clientSecret?: string;
  hasClientCredentials?: boolean;
  refreshToken?: string;
  hasStoredToken?: boolean;
}

export interface AdminChannelBundle {
  channel: {
    id: string;
    slug: string;
    name: string;
    description: string;
    status: "active" | "inactive";
    logoPath: string | null;
    watermarkText: string;
    channelType: "cuts" | "quiz";
    createdAt: string;
    updatedAt: string;
  };
  profile: {
    channelId: string;
    videoLimit: number;
    minShortDuration: number;
    maxShortDuration: number;
    targetShorts: number | null;
    videoQuery: string | null;
    sortByViews: boolean;
    aiProvider: "openrouter" | "ollama";
    aiModel: string;
  };
  focuses: AdminChannelFocus[];
  sources: AdminSourceTarget[];
  publishingAccounts: AdminPublishingAccount[];
}

export interface AdminRunRecord {
  id: string;
  channelId: string;
  requestedBy: string;
  status: string;
  progress: JobStatus["progress"];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
