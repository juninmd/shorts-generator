export type PublishingProvider = "youtube" | "telegram" | "openrouter";

export type FocusKey =
  | "politica"
  | "catolicos"
  | "musica"
  | "filmes"
  | "series"
  | "jogos"
  | "tecnologia";

export type ChannelStatus = "active" | "inactive";

export type ChannelType = "cuts" | "quiz";

export interface ManagedChannel {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly status: ChannelStatus;
  readonly logoPath: string | null;
  readonly watermarkText: string;
  readonly channelType: ChannelType;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChannelFocus {
  readonly id: string;
  readonly key: FocusKey;
  readonly label: string;
}

export interface SourceTarget {
  readonly id: string;
  readonly kind: "youtube_channel" | "youtube_handle" | "youtube_url";
  readonly value: string;
  readonly label: string;
  readonly createdAt: string;
}

export interface PublishingAccountSecret {
  readonly keyVersion: string;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
}

export interface PublishingAccount {
  readonly id: string;
  readonly channelId: string;
  readonly provider: PublishingProvider;
  readonly label: string;
  readonly status: ChannelStatus;
  readonly accountIdentifier: string;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly encryptedToken: PublishingAccountSecret;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChannelSourceMapping {
  readonly id: string;
  readonly channelId: string;
  readonly sourceTargetId: string;
  readonly createdAt: string;
}

export interface ChannelProfile {
  readonly channelId: string;
  readonly videoLimit: number;
  readonly minShortDuration: number;
  readonly maxShortDuration: number;
  readonly targetShorts: number | null;
  readonly videoQuery: string | null;
  readonly sortByViews: boolean;
  readonly aiProvider: "openrouter" | "ollama";
  readonly aiModel: string;
}

export interface ResolvedPublishingCredentials {
  readonly provider: PublishingProvider;
  readonly accountId: string;
  readonly channelId: string;
  readonly accountIdentifier: string;
  readonly token: string;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
}

export interface ResolvedChannelRun {
  readonly channel: ManagedChannel;
  readonly profile: ChannelProfile;
  readonly focuses: readonly ChannelFocus[];
  readonly sources: readonly SourceTarget[];
  readonly publishingAccount: ResolvedPublishingCredentials;
  readonly telegramAccount?: ResolvedPublishingCredentials;
  readonly openrouterAccount?: ResolvedPublishingCredentials;
  readonly snapshotCreatedAt: string;
}

export interface ManagedRunRequest {
  readonly channelId: string;
  readonly requestedBy: string;
}

export interface ManagedChannelBundle {
  readonly channel: ManagedChannel;
  readonly profile: ChannelProfile;
  readonly focuses: readonly ChannelFocus[];
  readonly sources: readonly SourceTarget[];
  readonly publishingAccounts: readonly PublishingAccount[];
}export const _testCoverage = () => true;
