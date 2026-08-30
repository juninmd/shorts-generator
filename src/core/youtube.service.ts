
import { google } from "googleapis";
import fs from "node:fs";
import { generateText } from "ai";
import type { GeneratedShort, PipelineConfig, YouTubeAuthConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { buildPresenterTitle } from "./presenter-title.js";
import { withRetry } from "./retry-backoff.js";
import { isDailyLimitReachedAsync, setDailyLimitReachedAsync } from "./state.js";
import { sendErrorAlert, notifyYoutubePublished, notifyYoutubeRateLimited } from "./telegram.js";
import { generateReauthUrl, sendReauthAlert } from "./youtube-reauth.js";
import { getChannelFeedback, formatFeedbackForPrompt } from "./viral-feedback.js";
import { createSecretStore } from "./secret-store.js";
import { loadControlPlaneConfig } from "./control-plane-config.js";
import { getControlPlanePool } from "./control-plane-db.js";
import { ChannelBundleRepository } from "./channel-bundle-repository.js";

interface YouTubeVideoInsertBody {
  snippet: { title: string; description: string; tags?: string[]; categoryId?: string };
  status: { privacyStatus: string; selfDeclaredMadeForKids?: boolean };
}

const withOriginalVideoLink = (description: string, originalVideoUrl?: string | null): string => {
  if (!originalVideoUrl || description.includes(originalVideoUrl)) return description;
  return `${description}\n\nVideo original: ${originalVideoUrl}`;
};

export async function validateYouTubeToken(config: PipelineConfig): Promise<{ valid: boolean; error?: string }> {
  const auth = await getYouTubeAuth(config);
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

// YouTube caps the combined length of all video tags at ~500 chars (commas
// included). Keep the highest-priority tags (assumed already ordered by
// relevance) within a safe 490-char budget, deduping and dropping empties.
// Uses `continue` (not `break`) so a single oversized tag doesn't block shorter
// ones that still fit — maximizing how much of the budget we actually use.
const TAG_CHAR_BUDGET = 490;
const capTagsToLimit = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  let total = 0;
  for (const raw of tags) {
    const tag = (raw ?? "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    const cost = tag.length + 1; // approx separator/quote overhead per tag
    if (total + cost > TAG_CHAR_BUDGET) continue;
    seen.add(key);
    result.push(tag);
    total += cost;
  }
  return result;
};

// Build channel-derived keyword tags: the full channel name plus a couple of
// adjacent word-pairs (handles "Nome Sobrenome Extra" → full + first-two +
// last-two). Lowercased; punctuation that hurts YouTube search is stripped.
const deriveChannelTags = (channelName: string | undefined): string[] => {
  const name = (channelName || "").replace(/[|•·\-–—]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return [];
  const tags = [name.toLowerCase()];
  const words = name.split(" ").filter(Boolean);
  if (words.length >= 2) {
    tags.push(`${words[0]} ${words[1]}`.toLowerCase());
    tags.push(`${words[words.length - 2]} ${words[words.length - 1]}`.toLowerCase());
  }
  return tags;
};

export const generateYoutubeMetadata = async (
  short: GeneratedShort,
  config: PipelineConfig
): Promise<{ title: string; description: string; tags: string[] }> => {
  const isEnabled = process.env.ENABLE_YOUTUBE === "true";
  const originalDescription = withOriginalVideoLink(short.clip.description, short.originalVideoUrl);
  // Derive search tags from the source channel name (e.g. "Padre Paulo Ricardo"
  // → "padre paulo ricardo", "padre paulo", "paulo ricardo") so even the
  // AI-less fallback carries channel-relevant keywords. Content-specific tags
  // only — generic filler ("viral", "curiosidades") is ignored by YouTube at
  // best and feeds mass-produced classification at worst.
  const channelTags = deriveChannelTags(short.channelName);
  const defaultTags = [
    ...channelTags,
    ...(short.clip.hashtags || []).map((h) => h.replace(/^#/, "")),
    ...(config.managedRun?.focusLabels || []),
    "shorts",
    "cortes",
  ];

  if (!isEnabled) {
    return {
      title: buildPresenterTitle(short.clip.title, short.clip.presenter),
      description: originalDescription,
      tags: capTagsToLimit(defaultTags),
    };
  }


  if (process.env.SKIP_AI_METADATA === "true") {
    return {
      title: buildPresenterTitle(short.clip.title, short.clip.presenter),
      description: originalDescription,
      tags: capTagsToLimit(defaultTags),
    };
  }


  const clipTranscript = (short.clip.transcript || [])
    .map((s) => s.text)
    .join(" ")
    .trim();

  const feedbackBlock = formatFeedbackForPrompt(await getChannelFeedback(config));
  const prompt = `Você é especialista em crescimento de YouTube Shorts. Crie título, descrição e tags para este corte:
Título Sugerido do Corte: ${short.clip.title}
Apresentador identificado: ${short.clip.presenter || "não informado"}
Título do Vídeo Original: ${short.originalVideoTitle}
Descrição Sugerida do Corte: ${short.clip.description}
Contexto/Canal de Origem: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hashtags Sugeridas: ${short.clip.hashtags?.join(", ")}
Focos do canal de destino: ${config.managedRun?.focusLabels?.join(", ") || "não informado"}
Transcrição do trecho/corte: "${clipTranscript}"
${feedbackBlock}
INSTRUÇÕES PARA O TÍTULO:
1. Máximo 60 caracteres, com o gancho de curiosidade nos PRIMEIROS 40 (o feed mobile corta o resto).
2. Use o Apresentador identificado (ou a pessoa que fala na Transcrição/Título Original) no título — ex: "Frei Gilson: o que Padre Pio fazia às 4h". Se houver mais de uma pessoa, use a que conduz o trecho; se ninguém for identificável, foque no gatilho de curiosidade do assunto.
3. ÚNICO e específico ao que é DITO neste trecho — títulos genéricos como "Oração", "A Benção", "Conclusão" são PROIBIDOS.
4. No máximo 1 emoji, no final do título. Não use CAIXA ALTA na frase inteira nem as palavras "corte", "clipe", "short", "vídeo", "parte".

INSTRUÇÕES PARA A DESCRIÇÃO:
1. 2 a 3 frases específicas sobre o que é dito no clipe, com a palavra-chave principal e o nome da pessoa nos primeiros 125 caracteres (é o que aparece na busca).
2. Feche com um CTA curto (ex: "Inscreva-se para mais cortes como este e comente o que achou!").
3. Última linha: 3 a 5 hashtags — #shorts + 2 a 4 do nicho/pessoa/tema (ex: #freigilson #oracao).
4. NÃO inclua links (o link do vídeo original é adicionado automaticamente).

INSTRUÇÕES PARA AS TAGS (PALAVRAS-CHAVE):
1. 10 a 14 tags de busca (termos simples em minúsculas, sem #): nome completo e variações da pessoa, nome do canal de origem, tema específico do trecho, termos que o público digitaria para achar este conteúdo.
2. Somente termos DIRETAMENTE ligados ao conteúdo falado — nada de tags genéricas ("viral", "fyp", "shorts").
3. Ordene da mais relevante para a menos relevante.

Responda APENAS com um objeto JSON válido no formato:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"]
}
O texto deve estar EXCLUSIVAMENTE em Português do Brasil. NÃO use inglês de forma alguma.`;

  let rawText: string | undefined;
  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt,
      temperature: 0.5,
      maxOutputTokens: 1200,
      maxRetries: 5,
    });
    rawText = text;

    const metadata = JSON.parse(extractJsonObject(text));
    const aiTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const rawTags = [...aiTags, ...defaultTags];
    return {
      title: metadata.title || short.clip.title,
      description: withOriginalVideoLink(metadata.description || short.clip.description, short.originalVideoUrl),
      tags: capTagsToLimit(rawTags),
    };
  } catch (error) {
    // A silent fallback here ships the raw analyzer title/description to
    // YouTube — log loudly with the response head so failures are visible.
    logger.error(
      { error, clipId: short.id, responseHead: rawText?.slice(0, 300) },
      "Erro ao gerar metadados para o YouTube — publicando com metadata de fallback",
    );
    return {
      title: buildPresenterTitle(short.clip.title, short.clip.presenter),
      description: originalDescription,
      tags: capTagsToLimit(defaultTags),
    };
  }
};


async function getYouTubeAuth(config: PipelineConfig): Promise<YouTubeAuthConfig | null> {
  // Managed channels: ALWAYS read the live token straight from the control-plane
  // DB. YouTube refresh tokens rotate over time, so any embedded snapshot (job
  // payload) or env copy goes stale. We deliberately do NOT fall back to those —
  // a missing/undecryptable DB token fails the upload instead of silently using
  // an expired one.
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

  // Non-managed single-channel mode (legacy/global): explicit config or env.
  const clientId = config.youtubeAuth?.clientId ?? process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = config.youtubeAuth?.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = config.youtubeAuth?.refreshToken ?? process.env.YOUTUBE_REFRESH_TOKEN;
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

    if (url && videoId) {
      logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
      await notifyYoutubePublished(
        {
          videoId,
          url,
          title: requestBody.snippet.title,
          channelName: config.managedRun?.channelName,
          isShort: !!isShort,
          tags: requestBody.snippet.tags,
          description: requestBody.snippet.description,
        },
        config,
      );
    }
    return url;
  } catch (error: any) {
    const errorMessage = sanitize(error?.message || String(error));
    if (errorMessage.includes("The user has exceeded the number of videos they may upload.")) {
      logger.warn({ channelId }, "⚠️ YouTube indicou que o limite diário de uploads foi atingido. Marcando limite atingido no estado.");
      // Notify only on the transition (limit not yet flagged) to avoid spamming.
      const alreadyReached = await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId);
      await setDailyLimitReachedAsync(channelId);
      if (!alreadyReached) {
        await notifyYoutubeRateLimited({ channelName: config.managedRun?.channelName, reason: "youtube-quota" }, config);
      }
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

// The Data API cannot pin comments, but a channel-authored question still
// drives replies — and comments are a satisfaction signal the Shorts feed uses.
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

  const auth = await getYouTubeAuth(config);
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
      : [...config.managedRun?.focusLabels ?? [], "shorts"],
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
  config: PipelineConfig,
  tags?: string[]
): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = await getYouTubeAuth(config);
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

  const uploadTags = limitTagsLength(
    tags && tags.length > 0
      ? tags
      : ["viral", "curiosidades", ...config.managedRun?.focusLabels ?? []],
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
    "🚀 Fazendo upload do vídeo COMPLETO para o YouTube...",
    false
  );
};

