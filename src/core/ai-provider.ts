import { createOpenRouter } from \"@openrouter/ai-sdk-provider\";
import { ollama } from \"ai-sdk-ollama\";
import type { LanguageModel } from \"ai\";
import type { PipelineConfig } from \"../types.js\";
import { logger } from \"./logger.js\";

export function createModel(config: PipelineConfig): LanguageModel {
  if (config.aiProvider === \"openrouter\" && config.openrouterApiKey) {
    try {
      const openrouter = createOpenRouter({
        apiKey: config.openrouterApiKey,
      });
      return openrouter(config.aiModel);
    } catch (err) {
      logger.warn({ err }, \"Failed to initialize OpenRouter, falling back to Ollama\");
    }
  }

  return ollama(config.aiModel, {
    structuredOutputs: true,
  });
}
