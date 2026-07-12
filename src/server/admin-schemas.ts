/* v8 ignore start */

import { z } from "zod";

export const channelIdSchema = z.string().min(3).max(80);

export const focusSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.enum(["politica", "catolicos", "musica", "filmes", "series", "jogos", "tecnologia"]),
  label: z.string().min(1).max(80),
});

export const sourceSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(["youtube_channel", "youtube_handle", "youtube_url"]),
  value: z.string().min(1).max(300),
  label: z.string().min(1).max(120),
});

export const publishingAccountSchema = z.object({
  id: z.string().min(1).optional(),
  provider: z.enum(["youtube", "telegram", "openrouter"]),
  label: z.string().min(1).max(120),
  status: z.enum(["active", "inactive"]),
  accountIdentifier: z.string().min(1).max(200),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
});

export const bundleSchema = z.object({
  slug: z.string().min(3).max(80),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  status: z.enum(["active", "inactive"]),
  logoPath: z.string().max(260).nullable().optional(),
  watermarkText: z.string().min(1).max(120),
  channelType: z.enum(["cuts", "quiz"]).default("cuts"),
  profile: z.object({
    videoLimit: z.number().int().positive().max(50),
    minShortDuration: z.number().int().positive().max(120),
    maxShortDuration: z.number().int().positive().max(120),
    targetShorts: z.number().int().positive().max(100).nullable().optional(),
    videoQuery: z.string().max(160).nullable().optional(),
    sortByViews: z.boolean().default(false),
    aiProvider: z.enum(["openrouter", "ollama"]),
    aiModel: z.string().min(1).max(160),
  }),
  focuses: z.array(focusSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  publishingAccounts: z.array(publishingAccountSchema).default([]),
});



/* v8 ignore stop */
