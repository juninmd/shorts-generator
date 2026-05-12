import { describe, it, expect } from "vitest";
import { createModel } from "../../src/core/ai-provider.js";
import type { PipelineConfig } from "../../src/types.js";

describe("ai-provider", () => {
  it("should create OpenRouter model when config.aiProvider is openrouter", () => {
    const config = {
      aiProvider: "openrouter",
      openrouterApiKey: "12345",
      aiModel: "model-abc",
      ollamaBaseUrl: "https://127.0.0.1:11434"
    } as PipelineConfig;
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toBe("model-abc");
    expect(model.provider).toBe("openrouter");
  });

  it("should create Ollama model otherwise", () => {
    const config = {
      aiProvider: "ollama",
      aiModel: "model-abc",
      ollamaBaseUrl: "https://127.0.0.1:11434"
    } as PipelineConfig;
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toBe("model-abc");
    expect(model.provider).toBe("ollama");
  });
});
