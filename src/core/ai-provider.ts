import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { PipelineConfig } from "../types.js";

export function createModel(config: PipelineConfig): LanguageModel {
  const litellm = createOpenAICompatible({
    name: "litellm",
    apiKey: config.litellmApiKey || "sk-dummy",
    baseURL: config.litellmBaseUrl,
  });
  return litellm(config.aiModel);
}
