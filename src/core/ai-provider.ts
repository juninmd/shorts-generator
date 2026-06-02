import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { PipelineConfig } from "../types.js";

export function createModel(config: PipelineConfig): LanguageModel {
  const litellm = createOpenAI({
    apiKey: config.litellmApiKey || "sk-dummy",
    baseURL: config.litellmBaseUrl,
  });
  return litellm(config.aiModel);
}
