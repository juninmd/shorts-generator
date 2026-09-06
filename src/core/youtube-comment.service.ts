
import { google } from "googleapis";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry-backoff.js";
import { getYouTubeAuth, validateYouTubeToken } from "./youtube-auth.service.js";

export const buildEngagementComment = (originalVideoUrl: string, focusLabels?: string[]): string => {
  const religious = (focusLabels ?? []).some((l) => /cat[óo]lic|gospel|crist[ãa]?o|f[ée]|igreja|ora[çc][ãa]o|b[íi]blia/i.test(l));
  const question = religious
    ? "O que essa mensagem tocou em você? Conta aqui nos comentários 🙏"
    : "Concorda? Deixa sua opinião aqui nos comentários 👇";
  return `${question}\n\n🎥 Vídeo original completo: ${originalVideoUrl}`;
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
    logger.info({ videoId }, "💬 Comentário com link original adicionado ao vídeo");
  } catch (error: any) {
    logger.error({ error: error?.message, videoId }, "❌ Falha ao adicionar comentário no YouTube");
  }
};

