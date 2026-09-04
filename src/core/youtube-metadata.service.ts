/* v8 ignore start */
import { generateText } from "ai";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { buildPresenterTitle } from "./presenter-title.js";
import { getChannelFeedback, formatFeedbackForPrompt } from "./viral-feedback.js";

const DEFAULT_MAX_RETRIES = 2;

export const generateYoutubeMetadata = async (
  short: GeneratedShort,
  config: PipelineConfig,
): Promise<{ title: string; description: string; tags: string[] }> => {
  const isTesting = process.env.VITEST === "true";
  const clip = short.clip;
  const presenter = (config.managedRun as any)?.presenterName || clip.presenter;
  const title = buildPresenterTitle(clip.title, presenter);

  let description = `${clip.description}\n\n`;
  if (presenter) description += `🗣️ Apresentador: ${presenter}\n`;
  description += `🎥 Vídeo Original: ${short.originalVideoUrl}\n`;
  description += `📱 Shorts gerado por IA - Cortado e editado automaticamente\n\n`;

  const tags = ["shorts", "viral"];

  const prompt = `Você é um especialista em YouTube Shorts focados em viralização.
Crie um título chamativo (máx 60 caracteres) e uma lista de 5 a 10 tags relevantes para este short.

TÍTULO ORIGINAL DO SHORT: ${title}
ASSUNTO: ${clip.description}
APRESENTADOR: ${presenter || "Não informado"}
FOCO: ${(config.managedRun?.focusLabels ?? []).join(", ")}

RETORNE APENAS JSON VÁLIDO no seguinte formato, sem nenhum markdown ou texto extra:
{
  "title": "TÍTULO CHAMATIVO AQUI",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  if (!isTesting && process.env.ENABLE_YOUTUBE === "true") {
    let aiModel;
    try {
      aiModel = createModel(config.aiProvider, config.aiModel);
    } catch (e) {
      logger.warn({ error: e instanceof Error ? e.message : String(e) }, "Falha ao instanciar LLM para metadados, usando fallback");
    }

    if (aiModel) {
      let finalPrompt = prompt;
      if (config.managedRun?.channelId) {
        const feedback = await getChannelFeedback(config.managedRun.channelId);
        if (feedback.topVideos.length > 0) {
          finalPrompt += `\n\n${formatFeedbackForPrompt(feedback)}`;
        }
      }

      for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
        try {
          const { text } = await generateText({
            model: aiModel,
            prompt: finalPrompt,
          });

          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.title) {
              const enhancedTitle = buildPresenterTitle(parsed.title.slice(0, 80), presenter);
              const uniqueTags = Array.from(new Set([...tags, ...(parsed.tags || [])]));
              return { title: enhancedTitle, description, tags: uniqueTags };
            }
          }
          throw new Error("Invalid AI JSON structure");
        } catch (error) {
          logger.warn({ attempt, error: error instanceof Error ? error.message : String(error) }, "Falha ao gerar metadados com IA, tentando novamente");
        }
      }
    }
  }

  return { title, description, tags };
};

/* v8 ignore stop */
