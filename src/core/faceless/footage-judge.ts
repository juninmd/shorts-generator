import { z } from "zod";
import type { PipelineConfig } from "../../types.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";
import type { FootageCandidate } from "./stock-footage.js";

/** Temas que nunca cabem num canal católico de passagens bíblicas, qualquer que seja a cena. */
const BLOCKED = /\b(couple|couples|romantic|romance|wedding|bride|groom|kiss|kissing|lover|lovers|dating|honeymoon|bikini|lingerie|nightclub|party|beer|cocktail|casino|gun|weapon)\b/i;

export const isBlockedFootage = (description: string): boolean => BLOCKED.test(description);

export interface FootageScene {
  act: string;
  narration: string;
  verse: string;
}

/** Decide qual candidato ilustra fielmente a cena; devolve o id ou null (melhor um card liso do que um vídeo fora de contexto). */
export type FootageJudge = (scene: FootageScene, candidates: FootageCandidate[]) => Promise<number | null>;

const VerdictSchema = z.object({ pick: z.number().int().nullable() });

export function createFootageJudge(
  config: Pick<PipelineConfig, "aiModel" | "litellmApiKey" | "litellmBaseUrl">,
): FootageJudge {
  return async (scene, candidates) => {
    const list = candidates.map((c, i) => `${i}: ${c.description || "(sem descrição)"}`).join("\n");
    const verdict = await generateJsonObject<z.infer<typeof VerdictSchema>>({
      model: createModel(config as PipelineConfig),
      schema: VerdictSchema,
      temperature: 0,
      prompt: [
        "Você escolhe vídeo de acervo para ilustrar uma cena de um short católico sobre uma passagem bíblica.",
        `Cena (${scene.act}): "${scene.narration}"`,
        `Versículo em tela: "${scene.verse}"`,
        "Candidatos (índice: descrição do vídeo):",
        list,
        "Escolha UM candidato cujo conteúdo ilustre FIELMENTE a cena: os mesmos personagens e a mesma ação",
        "(ex.: pai abraçando filho NÃO é casal; filho faminto NÃO é festa). Se estiver em dúvida entre pessoas, prefira paisagem, céu, campo, mãos ou objetos simples.",
        "Descarte qualquer vídeo romântico, de festa, bebida alcoólica ou fora do contexto reverente. Se nenhum for fiel, responda null.",
        'Formato: {"pick": número do índice ou null}',
      ].join("\n"),
    });
    const chosen = verdict.pick === null ? undefined : candidates[verdict.pick];
    return chosen ? chosen.id : null;
  };
}
