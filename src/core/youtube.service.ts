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

  const prompt = `Crie um título e uma descrição OTIMIZADOS para o YouTube Shorts para o seguinte corte de vídeo:
Título Sugerido: ${short.clip.title}
Descrição Sugerida: ${short.clip.description}
Contexto do Canal: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hook: ${short.clip.hookLine}
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
      /* v8 ignore next */
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

export const uploadToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  config: PipelineConfig
): Promise<string | null> => {
  const isEnabled = process.env.ENABLE_YOUTUBE === "true";

  if (!isEnabled) {
    logger.info("⏩ Upload para o YouTube desativado (ENABLE_YOUTUBE=false)");
    return null;
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload.");
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  logger.info({ videoPath, title, description: description.slice(0, 120) }, "📤 Fazendo upload para o YouTube Shorts...");

  const sanitize = (msg: string) =>
    [clientId, clientSecret, refreshToken].reduce(
      (s, secret) => s.replace(new RegExp(secret!, "g"), "***HIDDEN***"),
      msg,
    );

  try {
    const res = await withRetry(() =>
      youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            tags: ["quiz", "shorts", "curiosidades", "viral"],
            categoryId: "27", // Education
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
          },
        },
        media: { body: fs.createReadStream(videoPath) },
      }),
    );

    const url = `https://youtube.com/shorts/${res.data?.id}`;
    logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
    return url;
  } catch (error: any) {
    /* v8 ignore start */
    const errorMessage = sanitize(error.message || String(error));
    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do YouTube após retries");
    return null;
    /* v8 ignore stop */
  }
};

export const uploadFullVideoToYouTube = async (
  videoPath: string,
  title: string,
  description: string,
  config: PipelineConfig
): Promise<string | null> => {
  const isEnabled = process.env.ENABLE_YOUTUBE === "true";

  if (!isEnabled) {
    logger.info("⏩ Upload completo para o YouTube desativado (ENABLE_YOUTUBE=false)");
    return null;
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload do vídeo completo.");
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  logger.info({ videoPath }, "📤 Fazendo upload do vídeo COMPLETO para o YouTube...");

  const sanitize = (msg: string) =>
    [clientId, clientSecret, refreshToken].reduce(
      (s, secret) => s.replace(new RegExp(secret!, "g"), "***HIDDEN***"),
      msg,
    );

  try {
    const res = await withRetry(() =>
      youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
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
        media: { body: fs.createReadStream(videoPath) },
      }),
    );

    const url = `https://youtube.com/watch?v=${res.data?.id}`;
    logger.info({ url }, "✅ Vídeo COMPLETO enviado com sucesso para o YouTube!");
    return url;
  } catch (error: any) {
    /* v8 ignore start */
    const errorMessage = sanitize(error.message || String(error));
    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do vídeo completo pro YouTube após retries");
    return null;
    /* v8 ignore stop */
  }
};
