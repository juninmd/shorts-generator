
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

  const prompt = `Você é um especialista em YouTube Shorts focados em viralização. Responda em Português do Brasil (pt-BR).
Crie um título, uma descrição e tags otimizados para este short.

TÍTULO ORIGINAL DO SHORT: ${title}
ASSUNTO: ${clip.description}
APRESENTADOR (quem está falando no vídeo): ${presenter || "Não informado"}
FOCO: ${(config.managedRun?.focusLabels ?? []).join(", ")}
TRANSCRIÇÃO DO TRECHO: "${(clip.transcript ?? []).map((s) => s.text).join(" ").slice(0, 1500)}"

INSTRUÇÕES PARA O TÍTULO:
1. Máximo 70 caracteres, chamativo e instigante (curiosidade, polêmica, urgência ou número).
2. Inicie ou termine com 1 ou 2 emojis relevantes ao tema (ex: 🔥, 😱, 🙏, 💡, ⚠️).
3. Se o apresentador for informado, inclua o nome dele no título. Não use as palavras "corte", "clipe", "short", "vídeo" ou "parte".

INSTRUÇÕES PARA A DESCRIÇÃO:
1. Comece com um teaser de 2 a 4 frases que gere curiosidade e cite o apresentador quando houver.
2. Inclua de 3 a 5 tópicos curtos com "•" destacando os pontos altos do trecho.
3. Inclua uma chamada para ação: inscrever-se no canal, deixar o like e comentar.
4. Termine com 5 a 10 hashtags em uma linha, incluindo #shorts, #viral e o nome do apresentador sem espaços.

INSTRUÇÕES PARA AS TAGS:
1. Gere de 20 a 30 palavras-chave de busca em minúsculas, sem "#", da mais relevante para a menos relevante.
2. Cubra o nome do apresentador e variações, o tema, termos da transcrição e termos amplos (head tags) e específicos (long-tail).

RETORNE APENAS JSON VÁLIDO no seguinte formato, sem nenhum markdown ou texto extra:
{
  "title": "TÍTULO AQUI",
  "description": "DESCRIÇÃO AQUI",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  if (!isTesting && process.env.ENABLE_YOUTUBE === "true") {
    let aiModel;
    try {
      aiModel = createModel(config);
    } catch (e) {
      logger.warn({ error: e instanceof Error ? e.message : String(e) }, "Falha ao instanciar LLM para metadados, usando fallback");
    }

    if (aiModel) {
      let finalPrompt = prompt;
      if (config.managedRun?.channelId) {
        const feedback = await getChannelFeedback(config);
        if (feedback && feedback.topTitles.length > 0) {
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
              const aiDescription = typeof parsed.description === "string" && parsed.description.trim()
                ? `${parsed.description.trim()}\n\n🎥 Vídeo Original: ${short.originalVideoUrl}\n📱 Shorts gerado por IA - Cortado e editado automaticamente`
                : description;
              return { title: enhancedTitle, description: aiDescription, tags: uniqueTags };
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

