import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

export function createModel(config: PipelineConfig): LanguageModel {
  if (config.aiProvider === "openai") {
    const openai = createOpenAI({
      apiKey: config.openrouterApiKey || "sk-dummy", // Use openrouterApiKey as general api key
      baseURL: config.openaiBaseUrl || "http://localhost:4000/v1",
    });
    return openai(config.aiModel);
  }

  if (config.aiProvider === "openrouter" && config.openrouterApiKey) {
    try {
      const openrouter = createOpenRouter({
        apiKey: config.openrouterApiKey,
      });
      return openrouter(config.aiModel);
    } catch (err) {
      logger.warn({ err }, "Failed to initialize OpenRouter, falling back to Ollama");
    }
  }

  const ollamaProvider = createOllama({
    baseURL: config.ollamaBaseUrl,
  });
  return ollamaProvider(config.aiModel, {
    structuredOutputs: true,
  });
}
