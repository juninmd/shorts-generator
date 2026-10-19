export type PlatformName = "bluesky" | "instagram" | "threads" | "tiktok" | "pinterest";

/** Text prepared for one platform (see social-copy.ts). */
export interface SocialCopy {
  title: string;
  caption: string;
  description: string;
}

export interface PublishInput {
  /** Local mp4. */
  videoPath: string;
  /** Public https URL of the same file — required by platforms that pull the video. */
  videoUrl?: string;
  copy: SocialCopy;
}

export interface Publisher {
  name: PlatformName;
  /** True when the credentials this platform needs are present in the environment. */
  configured(): boolean;
  /** Pull-based platforms (Instagram, Threads, TikTok) fetch the video from videoUrl. */
  needsPublicUrl: boolean;
  /** Publishes and returns the post's URL (or id when no URL is available). */
  publish(input: PublishInput): Promise<string>;
}
