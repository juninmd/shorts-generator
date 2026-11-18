import { z } from "zod";
import type { PipelineConfig } from "../../types.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";

/** Arco narrativo obrigatório: setup → ação → virada → resolução (LottieFiles/motion-design: narrative structure). */
export const BIBLE_ACTS = ["gancho", "contexto", "acontecimento", "virada", "aplicacao"] as const;
/** Sequência pedida ao modelo (o schema aceita 5 a 8 cenas, mas pedir ordem fixa evita arcos quebrados). */
export const PROMPT_ACTS: readonly BibleAct[] = ["gancho", "contexto", "acontecimento", "acontecimento", "virada", "aplicacao"];

export type BibleAct = (typeof BIBLE_ACTS)[number];

export const BibleScriptSchema = z.object({
  title: z.string().min(1).max(80),
  /** Citação da passagem, ex.: "Lucas 15,11-24". */
  reference: z.string().min(3).max(60),
  scenes: z.array(z.object({
    act: z.enum(BIBLE_ACTS),
    narration: z.string().min(1),
    /** Trecho curto da passagem exibido em tela (tipografia cinética). */
    verse: z.string().min(1).max(140),
    keywords: z.string().min(1),
  })).min(5).max(8),
}).superRefine((script, ctx) => {
  const order = script.scenes.map((s) => BIBLE_ACTS.indexOf(s.act));
  const sorted = order.every((n, i) => i === 0 || n >= order[i - 1]!);
  const words = script.scenes.reduce((sum, s) => sum + s.narration.split(/\s+/).filter(Boolean).length, 0);
  if (words < 80) ctx.addIssue({ code: "custom", message: `Narração curta demais (${words} palavras; mínimo 80)` });
  const missing = BIBLE_ACTS.filter((act) => !script.scenes.some((s) => s.act === act));
  if (!sorted || missing.length > 0 || order[0] !== 0 || order[order.length - 1] !== BIBLE_ACTS.length - 1) {
    ctx.addIssue({
      code: "custom",
      message: `Os atos devem aparecer em ordem (${BIBLE_ACTS.join(" → ")}), cada um ao menos uma vez`,
    });
  }
});

export type BibleScript = z.infer<typeof BibleScriptSchema>;

/** Roteiro fiel a UMA passagem, com começo, meio e fim verificados pelo schema. */
export async function generateBibleScript(
  passage: string,
  config: Pick<PipelineConfig, "aiModel" | "litellmApiKey" | "litellmBaseUrl">,
  language = "pt-BR",
): Promise<BibleScript> {
  return generateJsonObject<BibleScript>({
    model: createModel(config as PipelineConfig),
    schema: BibleScriptSchema,
    temperature: 0.4,
    prompt: [
      `Escreva o roteiro de um YouTube Short católico narrado sobre a passagem bíblica: "${passage}".`,
      `Idioma: ${language}. Duração falada: 45 a 58 segundos: a narração somada DEVE ter entre 120 e 150 palavras (cada cena com 2 a 3 frases).`,
      "Conte SOMENTE o que a passagem diz, com começo, meio e fim completos; não invente fatos, falas nem personagens.",
      `Use EXATAMENTE ${PROMPT_ACTS.length} cenas, e o campo "act" de cada uma, nesta ordem fixa: ${PROMPT_ACTS.join(", ")}.`,
      "Não pule nenhum ato (a cena de virada é obrigatória) e não repita atos fora dessa sequência.",
      "gancho = pergunta ou tensão tirada do próprio texto (3 primeiros segundos); contexto = quem, onde, por quê;",
      "acontecimento = o que acontece; virada = o momento central da passagem; aplicacao = o que isso diz ao ouvinte, fechando a história e citando a referência.",
      'Cada cena tem "verse": trecho curto (até 140 caracteres) da passagem, fiel ao texto, para aparecer em tela.',
      'Cada cena tem "keywords": 2 a 4 palavras em inglês que ilustram a cena.',
      'Tom reverente e simples. Sem emojis, hashtags nem marcações de palco. "reference" no formato "Livro capítulo,versículos".',
      'Formato: {"title": string, "reference": string, "scenes": [{"act": string, "narration": string, "verse": string, "keywords": string}]}',
    ].join("\n"),
  });
}
