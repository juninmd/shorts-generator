import { z } from "zod";
import type { PipelineConfig } from "../../types.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";

export const FacelessScriptSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(z.object({
    narration: z.string().min(1),
    /** Short English search phrase for stock footage that illustrates the scene. */
    keywords: z.string().min(1),
  })).min(3).max(10),
});

export type FacelessScript = z.infer<typeof FacelessScriptSchema>;

/** Asks the LLM for a hook-first, ~45s narration split into footage-friendly scenes. */
export async function generateFacelessScript(
  topic: string,
  config: Pick<PipelineConfig, "aiModel" | "litellmApiKey" | "litellmBaseUrl">,
  language = "pt-BR",
): Promise<FacelessScript> {
  return generateJsonObject<FacelessScript>({
    model: createModel(config as PipelineConfig),
    schema: FacelessScriptSchema,
    temperature: 0.8,
    prompt: [
      `Escreva o roteiro de um YouTube Short narrado (sem apresentador) sobre: "${topic}".`,
      `Idioma da narração: ${language}. Duração total falada: 40 a 55 segundos (~110 a 140 palavras).`,
      "A primeira cena deve ser um gancho forte que prende nos 3 primeiros segundos;",
      "a última deve fechar com uma conclusão ou chamada para seguir o canal.",
      "Divida em 5 a 8 cenas curtas de 1 a 2 frases. Não use emojis, hashtags nem marcações de palco.",
      'Para cada cena dê "keywords": uma busca curta EM INGLÊS (2 a 4 palavras) por vídeo de acervo que ilustre a cena.',
      'Formato: {"title": string, "scenes": [{"narration": string, "keywords": string}]}',
    ].join("\n"),
  });
}
