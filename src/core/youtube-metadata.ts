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
