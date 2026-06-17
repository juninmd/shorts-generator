import { google } from "googleapis";
import fs from "node:fs";
import { generateText } from "ai";
import type { GeneratedShort, PipelineConfig, YouTubeAuthConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { withRetry } from "./retry-backoff.js";
import { isDailyLimitReachedAsync, setDailyLimitReachedAsync } from "./state.js";
import { sendErrorAlert } from "./telegram.js";
import { generateReauthUrl, sendReauthAlert } from "./youtube-reauth.js";

interface YouTubeVideoInsertBody {
  snippet: { title: string; description: string; tags?: string[]; categoryId?: string };
  status: { privacyStatus: string; selfDeclaredMadeForKids?: boolean };
}

const withOriginalVideoLink = (description: string, originalVideoUrl?: string | null): string => {
  if (!originalVideoUrl || description.includes(originalVideoUrl)) return description;
  return `${description}\n\nVideo original: ${originalVideoUrl}`;
};

export async function validateYouTubeToken(config: PipelineConfig): Promise<{ valid: boolean; error?: string }> {
  const auth = getYouTubeAuth(config);
  if (!auth) {
    return { valid: false, error: "YouTube credentials not configured" };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
    oauth2Client.setCredentials({ refresh_token: auth.refreshToken });
    await oauth2Client.getAccessToken();
    return { valid: true };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    logger.warn({ error: errorMessage }, "YouTube token validation failed");
    
    const isAuthError = errorMessage.includes("invalid_grant") || 
                        errorMessage.includes("Token has been expired or revoked") ||
                        errorMessage.includes("Bad Request") ||
                        errorMessage.includes("401") ||
                        errorMessage.includes("403");
    
    if (isAuthError && config.telegramBotToken && config.telegramChatId) {
      const channelId = config.managedRun?.channelId || "unknown";
      const channelName = config.managedRun?.channelName || channelId;
      if (!config.serverPublicUrl) {
        logger.error({ channelId }, "SERVER_PUBLIC_URL not configured; cannot build YouTube reauth link");
      } else {
        // Reuse the working OAuth flow: redirect_uri = ${SERVER_PUBLIC_URL}/api/youtube/callback,
        // exchanged server-side and persisted automatically. Avoids the broken localhost auth-url link.
        const reAuthUrl = generateReauthUrl(auth.clientId, auth.clientSecret, config.serverPublicUrl, channelId);
        await sendReauthAlert(channelId, channelName, reAuthUrl, config);
      }
    }
    
    return { valid: false, error: errorMessage };
  }
}

const extractJsonObject = (content: string): string => {
  const clean = content.trim();
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace < firstBrace) return clean;
  return clean.slice(firstBrace, lastBrace + 1);
};

export const generateYoutubeMetadata = async (
  short: GeneratedShort,
  config: PipelineConfig
): Promise<{ title: string; description: string; tags: string[] }> => {
  const isEnabled = process.env.ENABLE_YOUTUBE === "true";
  const originalDescription = withOriginalVideoLink(short.clip.description, short.originalVideoUrl);
  const defaultTags = [
    "shorts",
    "curiosidades",
    "viral",
    ...(short.clip.hashtags || []),
    ...(config.managedRun?.focusLabels || [])
  ];

  if (!isEnabled) {
    return {
      title: short.clip.title,
      description: originalDescription,
      tags: defaultTags,
    };
  }

  /* v8 ignore start */
  if (process.env.SKIP_AI_METADATA === "true") {
    return {
      title: short.clip.title,
      description: originalDescription,
      tags: defaultTags,
    };
  }
  /* v8 ignore stop */

  const prompt = `Crie um título, uma descrição e tags/palavras-chave OTIMIZADOS para o YouTube Shorts para o seguinte corte de vídeo:
Título Sugerido: ${short.clip.title}
Descrição Sugerida: ${short.clip.description}
Contexto do Canal: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hashtags Sugeridas: ${short.clip.hashtags?.join(", ")}
Focos do canal de destino: ${config.managedRun?.focusLabels?.join(", ") || "não informado"}

O título deve ser EXTREMAMENTE chamativo, com no máximo 60 caracteres, e incluir emojis. Use o "Hook" se fizer sentido.
A descrição deve ser muito curta, focada em engajamento, com as hashtags: #shorts #curiosidades #viral ${short.clip.hashtags?.join(" ")}.
A descricao DEVE conter o link original: ${short.originalVideoUrl}.
Gere também o máximo possível de tags/palavras-chave de pesquisa relevantes (termos simples, sem #) para maximizar o alcance e gerar views. Retorne até 30 tags altamente otimizadas.

Responda APENAS com um objeto JSON no formato:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"]
}
O texto deve estar EXCLUSIVAMENTE em Português do Brasil. NÃO use inglês de forma alguma.`;

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt,
      temperature: 0.5,
      maxOutputTokens: 256,
      maxRetries: 5,
    });

    const metadata = JSON.parse(extractJsonObject(text));
    return {
      title: metadata.title || short.clip.title,
      description: withOriginalVideoLink(metadata.description || short.clip.description, short.originalVideoUrl),
      tags: Array.isArray(metadata.tags) && metadata.tags.length > 0 ? metadata.tags : defaultTags,
    };
  } catch (error) {
    logger.error({ error, clipId: short.id }, "Erro ao gerar metadados para o YouTube");
    return {
      title: short.clip.title,
      description: originalDescription,
      tags: defaultTags,
    };
  }
};


function getYouTubeAuth(config: PipelineConfig): YouTubeAuthConfig | null {
  const authFromConfig = config.managedRun?.publishingAccounts?.find(a => a.provider === "youtube");

  const clientId = authFromConfig?.clientId ?? config.youtubeAuth?.clientId ?? process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = authFromConfig?.clientSecret ?? config.youtubeAuth?.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET;
  
  // If we have a publishing account from DB, we need to decrypt its token
  let refreshToken = config.youtubeAuth?.refreshToken ?? process.env.YOUTUBE_REFRESH_TOKEN;
  
  if (authFromConfig && authFromConfig.tokenCiphertext) {
    try {
      const { createSecretStore } = require("./secret-store.js");
      const { loadControlPlaneConfig } = require("./control-plane-config.js");
      const cpConfig = loadControlPlaneConfig();
      const store = createSecretStore(cpConfig);
      refreshToken = store.decryptToken(authFromConfig.channelId, authFromConfig.id, {
        keyVersion: authFromConfig.tokenKeyVersion,
        iv: authFromConfig.tokenIv,
        authTag: authFromConfig.tokenAuthTag,
        ciphertext: authFromConfig.tokenCiphertext
      });
    } catch (error) {
      logger.error({ error }, "Failed to decrypt YouTube refresh token from database");
    }
  }

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

function createSanitizer(auth: YouTubeAuthConfig) {
  const secrets = [auth.clientId, auth.clientSecret, auth.refreshToken].filter(Boolean);
  return (msg: string) =>
    secrets.reduce(
      (s, secret) => s.replace(new RegExp(secret, "g"), "***HIDDEN***"),
      msg,
    );
}

async function performUpload(
  videoPath: string,
  requestBody: YouTubeVideoInsertBody,
  auth: YouTubeAuthConfig,
  config: PipelineConfig,
  logMessage: string,
  isShort?: boolean
): Promise<string | null> {
  const channelId = config.managedRun?.channelId || "global";
  if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    logger.warn({ limit: config.dailyUploadLimit, channelId }, "⚠️ Limite diário de uploads do YouTube atingido — abortando upload");
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const sanitize = createSanitizer(auth);

  logger.info({
    videoPath,
    title: requestBody.snippet.title,
    runId: config.managedRun?.runId,
    channelId: config.managedRun?.channelId,
    accountId: config.managedRun?.accountId,
    destination: config.managedRun?.channelName,
  }, logMessage);

  try {
    const res = await withRetry(
      () => youtube.videos.insert({ part: ["snippet", "status"], requestBody, media: { body: fs.createReadStream(videoPath) } }),
      { maxAttempts: 3, baseDelayMs: 8000, logMessage: "YouTube upload failed, retrying..." },
    );

    const videoId = res.data?.id;
    const url = videoId ? (isShort ? `https://youtube.com/shorts/${videoId}` : `https://youtube.com/watch?v=${videoId}`) : null;

    if (url) {
      logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
    }
    return url;
  } catch (error: any) {
    const errorMessage = sanitize(error?.message || String(error));
    if (errorMessage.includes("The user has exceeded the number of videos they may upload.")) {
      logger.warn({ channelId }, "⚠️ YouTube indicou que o limite diário de uploads foi atingido. Marcando limite atingido no estado.");
      await setDailyLimitReachedAsync(channelId);
    }
    const rawError = String(error?.message || error || "");
    if (rawError.includes("invalid_grant") && config.serverPublicUrl && config.managedRun?.channelId) {
      const reAuthUrl = generateReauthUrl(auth.clientId, auth.clientSecret, config.serverPublicUrl, config.managedRun.channelId);
      await sendReauthAlert(config.managedRun.channelId, config.managedRun.channelName ?? config.managedRun.channelId, reAuthUrl, config);
    }
    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do YouTube após retries");
    return null;
  }
}

export const addCommentToVideo = async (
  videoId: string,
  commentText: string,
  config: PipelineConfig
): Promise<void> => {
  const auth = getYouTubeAuth(config);
  if (!auth) return;

  // Validate token before attempting to add comment
  const validation = await validateYouTubeToken(config);
  if (!validation.valid) {
    logger.warn({ error: validation.error }, "Token do YouTube inválido - pulando comentário");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    await withRetry(
      () => youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId,
            topLevelComment: {
              snippet: {
                textOriginal: commentText
              }
            }
          }
        }
      }),
      { maxAttempts: 3, baseDelayMs: 2000, logMessage: "Failed to post YouTube comment, retrying..." }
    );
    logger.info({ videoId }, "💬 Comentário com link original adicionado ao vídeo");
  } catch (error: any) {
    logger.error({ error: error?.message, videoId }, "❌ Falha ao adicionar comentário no YouTube");
  }
};

const limitTagsLength = (tags: unknown[], limit: number = 490): string[] => {
  const result: string[] = [];
  let currentLength = 0;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const cleanTag = tag.trim();
    if (!cleanTag) continue;
    const tagLength = cleanTag.length + (result.length > 0 ? 1 : 0);
    if (currentLength + tagLength > limit) break;
    result.push(cleanTag);
    currentLength += tagLength;
  }
  return result;
};

export const uploadToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  config: PipelineConfig,
  tags?: string[]
): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = getYouTubeAuth(config);
  if (!auth) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload.");
    return null;
  }

  // Validate token before attempting upload
  const validation = await validateYouTubeToken(config);
  if (!validation.valid) {
    logger.error({ error: validation.error }, "❌ Token do YouTube inválido - upload cancelado");
    return null;
  }

  const uploadTags = limitTagsLength(
    tags && tags.length > 0
      ? tags
      : ["quiz", "shorts", "curiosidades", "viral", ...config.managedRun?.focusLabels ?? []],
    490
  );

  return performUpload(
    videoPath,
    {
      snippet: {
        title: title.slice(0, 100),
        description,
        tags: uploadTags,
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    auth,
    config,
    "🚀 Fazendo upload para o YouTube Shorts...",
    true
  );
};

export const uploadFullVideoToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  config: PipelineConfig
): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = getYouTubeAuth(config);
  if (!auth) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload do vídeo completo.");
    return null;
  }

  // Validate token before attempting upload
  const validation = await validateYouTubeToken(config);
  if (!validation.valid) {
    logger.error({ error: validation.error }, "❌ Token do YouTube inválido - upload cancelado");
    return null;
  }

  return performUpload(
    videoPath,
    {
      snippet: {
        title: title.slice(0, 100),
        description,
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    auth,
    config,
    "🚀 Fazendo upload do vídeo COMPLETO para o YouTube...",
    false
  );
};
