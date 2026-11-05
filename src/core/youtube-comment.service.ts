import { google } from "googleapis";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry-backoff.js";
import { getYouTubeAuth, validateYouTubeToken } from "./youtube-auth.service.js";

export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:shorts\/|v=|\/live\/|\/)([a-zA-Z0-9_-]{11})(?:[?&/]|$)/);
  return match ? match[1]! : null;
}

export const buildEngagementComment = (
  originalVideoUrl?: string,
  focusLabels?: string[],
  customQuestion?: string
): string => {
  const religious = (focusLabels ?? []).some((l) => /cat[óo]lic|gospel|crist[ãa]?o|f[ée]|igreja|ora[çc][ãa]o|b[íi]blia/i.test(l));
  const fallback = religious
    ? "O que essa mensagem tocou em você? Conta aqui nos comentários 🙏"
    : "Concorda? Deixa sua opinião aqui nos comentários 👇";
  const cleanCustom = customQuestion && !/https?:\/\/|www\./i.test(customQuestion)
    ? customQuestion.trim().slice(0, 150)
    : "";
  const question = cleanCustom || fallback;
  return originalVideoUrl ? `${question}\n\n🎥 Vídeo original completo: ${originalVideoUrl}` : question;
};

export const buildQuizEngagementComment = (quiz: { perguntas?: unknown[] }): string => {
  const count = quiz.perguntas?.length ?? 3;
  return `Quantas você acertou? 🧠\n\nConta aqui nos comentários seu resultado (de 0 a ${count})! 👇`;
};

export const addCommentToVideo = async (
  videoId: string,
  commentText: string,
  config: PipelineConfig
): Promise<void> => {
  const auth = await getYouTubeAuth(config);
  if (!auth) return;

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
    logger.info({ videoId }, "💬 Comentário fixado de engajamento adicionado ao vídeo");
  } catch (error: any) {
    logger.error({ error: error?.message, videoId }, "❌ Falha ao adicionar comentário no YouTube");
  }
};
