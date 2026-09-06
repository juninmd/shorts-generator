
import { google } from "googleapis";
import type { PipelineConfig, YouTubeAuthConfig } from "../types.js";
import { logger } from "./logger.js";
import { createSecretStore } from "./secret-store.js";
import { loadControlPlaneConfig } from "./control-plane-config.js";
import { getControlPlanePool } from "./control-plane-db.js";
import { ChannelBundleRepository } from "./channel-bundle-repository.js";
import { sendReauthAlert, generateReauthUrl } from "./youtube-reauth.js";

export async function validateYouTubeToken(config: PipelineConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const auth = await getYouTubeAuth(config);
    if (!auth) {
      return { valid: false, error: "YouTube credentials not configured" };
    }

    const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
    oauth2Client.setCredentials({ refresh_token: auth.refreshToken });

    const token = await oauth2Client.getAccessToken();
    if (!token.token) {
      throw new Error("Não foi possível gerar um access token a partir do refresh token");
    }

    return { valid: true };
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    logger.error({ error: errorMsg, channelId: config.managedRun?.channelId }, "Validação de token do YouTube falhou");

    if (errorMsg.includes("invalid_grant") && config.serverPublicUrl && config.managedRun?.channelId) {
      try {
        const auth = await getYouTubeAuth(config);
        if (auth) {
          const reAuthUrl = generateReauthUrl(auth.clientId, auth.clientSecret, config.serverPublicUrl, config.managedRun.channelId);
          await sendReauthAlert(config.managedRun.channelId, config.managedRun.channelName ?? config.managedRun.channelId, reAuthUrl, config);
          logger.info({ channelId: config.managedRun.channelId }, "Alerta de reautenticação enviado para o Telegram");
        }
      } catch (alertError) {
        logger.error({ error: alertError }, "Falha ao enviar alerta de reautenticação");
      }
    }

    return { valid: false, error: errorMsg };
  }
}

export async function getYouTubeAuth(config: PipelineConfig): Promise<YouTubeAuthConfig | null> {
  if (config.managedRun?.channelId) {
    const channelId = config.managedRun.channelId;
    try {
      const cpConfig = loadControlPlaneConfig();
      const store = createSecretStore(cpConfig);
      const repo = new ChannelBundleRepository(getControlPlanePool(cpConfig) as any);

      const bundle = await repo.getBundle(channelId);
      const yt = bundle?.publishingAccounts.find((a) => a.provider === "youtube");
      if (!yt) {
        logger.error({ channelId }, "Nenhuma conta YouTube no banco para o canal gerenciado");
        return null;
      }
      const refreshToken = store.decryptToken(yt.channelId, yt.id, yt.encryptedToken);
      const clientId = yt.clientId ?? process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = yt.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET;
      if (!clientId || !clientSecret || !refreshToken) return null;
      return { clientId, clientSecret, refreshToken };
    } catch (error) {
      logger.error({ error, channelId }, "Falha ao carregar token do YouTube do banco — upload cancelado (sem fallback)");
      return null;
    }
  }

  const clientId = config.youtubeAuth?.clientId ?? process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = config.youtubeAuth?.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = config.youtubeAuth?.refreshToken ?? process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }
  return { clientId, clientSecret, refreshToken };
}

