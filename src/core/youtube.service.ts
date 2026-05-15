import { google } from "googleapis";
import fs from "node:fs";
import { generateText } from "ai";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";

export const generateYoutubeMetadata = async (
  short: GeneratedShort,
  config: PipelineConfig
): Promise<{ title: string; description: string }> => {
  const isEnabled = process.env.ENABLE_YOUTUBE === "true";

  if (!isEnabled) {
    return {
      title: short.clip.title,
      description: short.clip.description,
    };
  }

  /* v8 ignore start */
  if (process.env.SKIP_AI_METADATA === "true") {
    return {
      title: short.clip.title,
      description: short.clip.description,
    };
  }
  /* v8 ignore stop */

  const prompt = `Crie um título e uma descrição OTIMIZADOS para o YouTube Shorts para o seguinte corte de vídeo:
Título Sugerido: ${short.clip.title}
Descrição Sugerida: ${short.clip.description}
Contexto do Canal: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hashtags Sugeridas: ${short.clip.hashtags?.join(", ")}

O título deve ser EXTREMAMENTE chamativo, com no máximo 60 caracteres, e incluir emojis. Use o "Hook" se fizer sentido.
A descrição deve ser muito curta, focada em engajamento, com as hashtags: #shorts #curiosidades #viral ${short.clip.hashtags?.join(" ")}.
Responda APENAS com um objeto JSON no formato:
{
  "title": "...",
  "description": "..."
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

    let cleanContent = text.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent
        .substring(7, cleanContent.lastIndexOf("```"))
        .trim();
    } else if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent
        .substring(3, cleanContent.lastIndexOf("```"))
        .trim();
    }

    const metadata = JSON.parse(cleanContent);
    return {
      title: metadata.title || short.clip.title,
      description: metadata.description || short.clip.description,
    };
  } catch (error) {
    logger.error({ error, clipId: short.id }, "Erro ao gerar metadados para o YouTube");
    return {
      title: short.clip.title,
      description: short.clip.description,
    };
  }
};

/**
 * Retry an async operation with exponential backoff.
 * Quota errors (HTTP 403/quotaExceeded) are not retried — they won't recover within the run.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 8000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isQuotaError =
        error?.message?.includes("quotaExceeded") ||
        error?.message?.includes("quota") ||
        error?.code === 403;
      if (isQuotaError || attempt === maxAttempts) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, maxAttempts, delayMs: delay },
        "YouTube upload failed, retrying...",
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

interface YouTubeAuth {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

function getYouTubeAuth(): YouTubeAuth | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

function createSanitizer(auth: YouTubeAuth) {
  const secrets = [auth.clientId, auth.clientSecret, auth.refreshToken].filter(Boolean);
  return (msg: string) =>
    secrets.reduce(
      (s, secret) => s.replace(new RegExp(secret, "g"), "***HIDDEN***"),
      msg,
    );
}

async function performUpload(
  videoPath: string,
  requestBody: any,
  auth: YouTubeAuth,
  logMessage: string
): Promise<string | null> {
  const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const sanitize = createSanitizer(auth);

  logger.info({ videoPath, title: requestBody.snippet.title }, logMessage);

  try {
    const res = await withRetry(() =>
      youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody,
        media: { body: fs.createReadStream(videoPath) },
      }),
    );

    const videoId = res.data?.id;
    const url = videoId ? (requestBody.snippet.categoryId === "27" ? `https://youtube.com/shorts/${videoId}` : `https://youtube.com/watch?v=${videoId}`) : null;

    if (url) {
      logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
    }
    return url;
  } catch (error: any) {
    const errorMessage = sanitize(error?.message || String(error));
    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do YouTube após retries");
    return null;
  }
}

export const uploadToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  _config: PipelineConfig
): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = getYouTubeAuth();
  if (!auth) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload.");
    return null;
  }

  return performUpload(
    videoPath,
    {
      snippet: {
        title: title.slice(0, 100),
        description,
        tags: ["quiz", "shorts", "curiosidades", "viral"],
        categoryId: "27", // Education
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    auth,
    "🚀 Fazendo upload para o YouTube Shorts..."
  );
};

export const uploadFullVideoToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  _config: PipelineConfig
): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = getYouTubeAuth();
  if (!auth) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload do vídeo completo.");
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
    "🚀 Fazendo upload do vídeo COMPLETO para o YouTube..."
  );
};
