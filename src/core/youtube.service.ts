import { google } from "googleapis";
import fs from "node:fs";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { Ollama } from "ollama";
import { logger } from "./logger.js";

const getOllama = (config: PipelineConfig) =>
  new Ollama({
    host: config.ollamaBaseUrl || "http://localhost:11434",
  });

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

  const ollama = getOllama(config);
  const modelName = config.ollamaModel || "gemma3:1b";

  const prompt = `Crie um título e uma descrição OTIMIZADOS para o YouTube Shorts para o seguinte corte de vídeo:
Título Sugerido: ${short.clip.title}
Descrição Sugerida: ${short.clip.description}
Contexto do Canal: ${short.channelName}
Motivo da Viralização: ${short.clip.reason}
Hook: ${short.clip.hookLine}
Hashtags Sugeridas: ${short.clip.hashtags.join(", ")}

O título deve ser EXTREMAMENTE chamativo, com no máximo 60 caracteres, e incluir emojis. Use o "Hook" se fizer sentido. O título DEVE gerar curiosidade extrema, FOMO (medo de perder) ou apresentar uma opinião forte/controversa. Use palavras-chave de alto impacto.
A descrição deve ser muito curta, focada em engajamento, convidando o usuário a comentar, com as hashtags: #shorts #curiosidades #viral ${short.clip.hashtags.join(" ")}.
Responda APENAS com um objeto JSON no formato:
{
  "title": "...",
  "description": "..."
}
O texto deve estar EXCLUSIVAMENTE em Português do Brasil. NÃO use inglês de forma alguma.`;

  try {
    const response = await ollama.chat({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      format: "json",
    });

    const content = response.message.content.trim();
    let cleanContent = content;
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

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  logger.info({ videoPath }, "📤 Fazendo upload para o YouTube Shorts...");

  try {
    const res = await youtube.videos.insert({
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
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const url = `https://youtube.com/shorts/${res.data?.id}`;
    logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
    return url;
  } catch (error: any) {
    let errorMessage = error.message || String(error);
    if (clientId) errorMessage = errorMessage.replace(new RegExp(clientId, "g"), "***HIDDEN***");
    if (clientSecret) errorMessage = errorMessage.replace(new RegExp(clientSecret, "g"), "***HIDDEN***");
    if (refreshToken) errorMessage = errorMessage.replace(new RegExp(refreshToken, "g"), "***HIDDEN***");

    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do YouTube");
    return null;
  }
};
