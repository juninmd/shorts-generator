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
  // AI-less fallback carries channel-relevant keywords.
  const channelTags = deriveChannelTags(short.channelName);
  const defaultTags = [
    ...channelTags,
    ...(short.clip.hashtags || []).map((h) => h.replace(/^#/, "")),
    ...(config.managedRun?.focusLabels || []),
    "shorts",
    "cortes",
    "viral",
    "curiosidades",
    "melhores momentos",
  ];

  if (!isEnabled) {
    return {
      title: buildPresenterTitle(short.clip.title, short.clip.presenter),
      description: originalDescription,
      tags: capTagsToLimit(defaultTags),
    };
  }

  /* v8 ignore start */
  if (process.env.SKIP_AI_METADATA === "true") {
    return {
      title: buildPresenterTitle(short.clip.title, short.clip.presenter),
      description: originalDescription,
      tags: capTagsToLimit(defaultTags),
    };
  }
  /* v8 ignore stop */

  const clipTranscript = (short.clip.transcript || [])
    .map((s) => s.text)
    .join(" ")
    .trim();

  const prompt = `Crie um título, uma descrição e tags/palavras-chave OTIMIZADOS para o YouTube Shorts para o seguinte corte de vídeo:
Título Sugerido do Corte: ${short.clip.title}
Apresentador identificado: ${short.clip.presenter || "não informado"}
Título do Vídeo Original: ${short.originalVideoTitle}
Descrição Sugerida do Corte: ${short.clip.description}
Contexto/Canal de Origem: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hashtags Sugeridas: ${short.clip.hashtags?.join(", ")}
Focos do canal de destino: ${config.managedRun?.focusLabels?.join(", ") || "não informado"}
Transcrição do trecho/corte: "${clipTranscript}"

INSTRUÇÕES PARA O TÍTULO:
1. O título deve ser EXTREMAMENTE chamativo e instigante, com no máximo 70 caracteres, e DEVE começar ou terminar com 1 ou 2 emojis relevantes ao tema (ex: 🔥, 😱, 🙏, 💡, ⚠️, ❤️). Use gatilhos mentais ou um "Hook" (curiosidade, polêmica, urgência, números) se fizer sentido.
2. Identifique na Transcrição, no Título do Vídeo Original ou no Contexto o nome da pessoa que está FALANDO no vídeo (entrevistado, palestrante, convidado, influenciador, ou figura principal). O título do Short DEVE obrigatoriamente incluir o nome ou sobrenome dessa pessoa (exemplo: "🔥 Padre Paulo Ricardo alertou sobre isso", "😱 Tiago Brunet revela segredo", "🙏 Monja Coen ensina como acalmar a mente"). Se houver mais de uma pessoa, use a que conduz o trecho. Se NENHUMA pessoa for identificável, crie o título mais chamativo possível focado no assunto, ainda com emojis.
3. NÃO use as palavras "corte", "clipe", "short", "vídeo", "parte" no título. Não use CAIXA ALTA na frase inteira.

INSTRUÇÕES PARA A DESCRIÇÃO:
1. A descrição deve ser completa e altamente engajadora em Português do Brasil (pt-BR), bem formatada com quebras de linha entre os blocos.
2. Comece com um resumo/teaser curto e instigante sobre o que é falado neste clipe (2 a 4 frases) que gere curiosidade e retenção, citando o nome da pessoa que fala quando identificada.
3. Em seguida, inclua de 3 a 5 tópicos curtos (bullets com "•" ou emojis) destacando os pontos altos do trecho.
4. Inclua obrigatoriamente uma chamada para ação (CTA) convidativa (exemplo: "👉 Inscreva-se no canal para não perder os próximos cortes! Deixe seu like 👍 e comente o que você achou.").
5. O link do vídeo original completo DEVE ser inserido na descrição exatamente desta forma: "🎥 Vídeo original completo: ${short.originalVideoUrl}".
6. Termine com um bloco de 5 a 10 hashtags em uma única linha, incluindo: #shorts #viral, o nome da pessoa envolvida (sem espaços, ex: #PadrePauloRicardo), o nome do canal/contexto e as hashtags sugeridas.

INSTRUÇÕES PARA AS TAGS (PALAVRAS-CHAVE):
1. Gere a MAIOR quantidade possível de tags/palavras-chave de pesquisa relevantes (termos simples em minúsculas, sem #) para maximizar o alcance de busca no YouTube.
2. Gere pelo menos 30 tags cobrindo:
   - O nome completo e variações do nome da pessoa envolvida no vídeo.
   - O nome do canal e termos relacionados ao canal original.
   - Termos e tópicos específicos abordados na Transcrição e no Título.
   - Termos amplos relacionados (head tags) e termos específicos de pesquisa (long-tail tags) que as pessoas digitam para achar esse tipo de conteúdo.
   - Variações, sinônimos e termos relacionados.
3. Ordene da tag mais relevante e buscada para a menos relevante.

Responda APENAS com um objeto JSON válido no formato:
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
      maxOutputTokens: 1100,
      maxRetries: 5,
    });

    const metadata = JSON.parse(extractJsonObject(text));
    const aiTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const rawTags = [...aiTags, ...defaultTags];
    return {
      title: metadata.title || short.clip.title,
      description: withOriginalVideoLink(metadata.description || short.clip.description, short.originalVideoUrl),
      tags: capTagsToLimit(rawTags),
    };
  } catch (error) {
    logger.error({ error, clipId: short.id }, "Erro ao gerar metadados para o YouTube");
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
