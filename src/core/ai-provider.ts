import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ollama } from "ai-sdk-ollama";
import type { LanguageModel } from "ai";
import type { PipelineConfig } from "../types.js";

export function createModel(config: PipelineConfig): LanguageModel {
  /* v8 ignore start */
  if (config.aiProvider === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: config.openrouterApiKey,
    });
    return openrouter(config.aiModel);
  }

  return ollama(config.aiModel, {
    structuredOutputs: true,
  });
  /* v8 ignore stop */
}
