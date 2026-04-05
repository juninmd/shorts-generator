/* v8 ignore start */
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { generateText } from "ai";
import { createModel } from "./ai-provider.js";

/**
 * Use LLM to generate catchy title and description with hashtags for YouTube.
 */
export async function generateYoutubeMetadata(
  short: GeneratedShort,
  config: PipelineConfig,
): Promise<{ title: string; description: string }> {
  if (process.env.ENABLE_YOUTUBE !== "true") {
    return { title: short.clip.title, description: short.clip.description };
  }

  const prompt = `Gere um título curto (máx 60 caracteres) e uma descrição otimizada para o YouTube Shorts baseada no clipe abaixo.

Clipe: ${short.clip.title}
Descrição: ${short.clip.description}
Canal original: ${short.channelName}

Responda APENAS com um JSON: {"title": "...", "description": "..."}`;

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt,
      temperature: 0.7,
    });
    
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(jsonStr);
    return {
      title: data.title || short.clip.title,
      description: data.description || short.clip.description
    };
  } catch {
    return { title: short.clip.title, description: short.clip.description };
  }
}
