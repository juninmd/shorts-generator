import { generateText } from "ai";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { buildPresenterTitle } from "./presenter-title.js";
import { getChannelFeedback, formatFeedbackForPrompt } from "./viral-feedback.js";
import { extractJson } from "./generate-json.js";
import { DEFAULT_EDITORIAL_PROFILE, buildEditorialPromptBlock } from "./editorial/editorial-profile.js";
import { sanitizePresenter } from "./metadata/presenter-validation.js";
import { composeDescription } from "./metadata/description.js";
import { validateMetadataDraft, type MetadataDraft } from "./metadata/metadata-validation.js";

const DEFAULT_MAX_ATTEMPTS = 2;
const BASE_TAGS = ["shorts", "viral"];

export interface YoutubeMetadata {
  title: string;
  description: string;
  tags: string[];
  /** Editable body without the fixed attribution footer. */
  descriptionBody: string;
  sourceUrl: string;
  presenter: string | null;
  language: string;
  /** True when no valid metadata could be produced: must go to human review, never auto-publish. */
  held: boolean;
  heldReasons: string[];
}

export type MetadataGenerator = (prompt: string, config: PipelineConfig) => Promise<string>;

const llmGenerator: MetadataGenerator = async (prompt, config) =>
  (await generateText({ model: createModel(config), prompt, maxRetries: 0 })).text;

function defaultGenerator(): MetadataGenerator | null {
  if (process.env.ENABLE_YOUTUBE !== "true" || process.env.VITEST === "true") return null;
  return llmGenerator;
}

export function buildMetadataPrompt(short: GeneratedShort, config: PipelineConfig, presenter: string | null, previousErrors: string[]): string {
  const profile = config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE;
  const retry = previousErrors.length ? `\nA TENTATIVA ANTERIOR FOI REJEITADA POR: ${previousErrors.join("; ")}. Corrija.\n` : "";
  return `Você cria metadados fiéis para YouTube Shorts.
${buildEditorialPromptBlock(profile, config.managedRun?.focusLabels ?? [])}
Regras:
- Escreva título (40-70 caracteres), descrição (1-3 frases) e 5-10 tags SOMENTE em ${profile.language}.
- O título deve refletir o que é dito na fala; não transforme hipótese, opinião ou especulação em fato confirmado.
- ${presenter ? `Quem fala: ${presenter}. Não invente outros nomes.` : "Não cite nome de apresentador: ele não foi identificado com segurança."}
- Nunca use placeholders (presenter, unknown, null, nome do apresentador) nem colchetes/chaves.
- Não inclua links nem a linha de fonte: ela é adicionada automaticamente.
${retry}
TÍTULO ATUAL: ${short.clip.title}
RESUMO: ${short.clip.description}
TRECHO FALADO: ${transcriptOf(short).slice(0, 1500)}

Responda só com JSON: {"title":"...","description":"...","tags":["..."]}`;
}

function transcriptOf(short: GeneratedShort): string {
  return (short.clip.transcript ?? []).map((s) => s.text).join(" ");
}

async function tryGenerate(
  short: GeneratedShort, config: PipelineConfig, presenter: string | null,
  generator: MetadataGenerator, ctx: Parameters<typeof validateMetadataDraft>[1], errors: string[],
): Promise<MetadataDraft | null> {
  let prompt = buildMetadataPrompt(short, config, presenter, []);
  if (config.managedRun?.channelId) prompt += formatFeedbackForPrompt(await getChannelFeedback(config));
  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
    try {
      const raw = extractJson(await generator(prompt, config));
      if (!raw) throw new Error("resposta sem JSON");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const title = typeof parsed.title === "string" ? buildPresenterTitle(parsed.title, presenter) : parsed.title;
      const check = validateMetadataDraft({ ...parsed, title }, ctx);
      if (check.ok && check.draft) return check.draft;
      errors.splice(0, errors.length, ...check.reasons);
    } catch (error) {
      errors.splice(0, errors.length, error instanceof Error ? error.message : String(error));
    }
    logger.warn({ attempt, reasons: errors }, "Metadados do LLM rejeitados");
    prompt = buildMetadataPrompt(short, config, presenter, errors);
  }
  return null;
}

export const generateYoutubeMetadata = async (
  short: GeneratedShort,
  config: PipelineConfig,
  generator: MetadataGenerator | null = defaultGenerator(),
): Promise<YoutubeMetadata> => {
  const clip = short.clip;
  const language = config.managedRun?.editorial?.language ?? DEFAULT_EDITORIAL_PROFILE.language;
  const transcript = transcriptOf(short);
  const evidence = [transcript, short.originalVideoTitle, short.channelName, clip.description].join(" ");
  const presenter = sanitizePresenter(clip.presenter, evidence);
  const ctx = { language, transcript, presenter };
  const errors: string[] = [];

  let draft: MetadataDraft | null = null;
  if (generator) {
    try {
      draft = await tryGenerate(short, config, presenter, generator, ctx, errors);
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, "LLM de metadados indisponível; usando fallback");
    }
  }

  let heldReasons: string[] = [];
  if (!draft) {
    const fallback = { title: buildPresenterTitle(clip.title, presenter), description: clip.description, tags: clip.hashtags?.map((t) => t.replace(/^#/, "")) ?? [] };
    const check = validateMetadataDraft(fallback, ctx);
    draft = check.draft ?? { title: fallback.title.slice(0, 100), description: fallback.description, tags: [] };
    heldReasons = check.ok ? [] : check.reasons;
  }

  return {
    title: draft.title,
    description: composeDescription(draft.description, short.originalVideoUrl, presenter),
    tags: Array.from(new Set([...BASE_TAGS, ...draft.tags])),
    descriptionBody: draft.description,
    sourceUrl: short.originalVideoUrl,
    presenter,
    language,
    held: heldReasons.length > 0,
    heldReasons,
  };
};
