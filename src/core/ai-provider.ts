import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { PipelineConfig } from "../types.js";

export function createModel(config: PipelineConfig): LanguageModel {
  if (config.aiProvider === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: config.openrouterApiKey,
    });
    return openrouter(config.aiModel);
  }

  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: config.ollamaBaseUrl + "/v1",
  });
  return ollama.languageModel(config.aiModel);
}
