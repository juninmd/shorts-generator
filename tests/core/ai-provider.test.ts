import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineConfig } from "../../src/types.js";

let throwOnInit = false;

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => {
    if (throwOnInit) throw new Error("OpenRouter init failed");
    return (model: string) => ({ modelId: model, provider: "openrouter" });
  }),
}));
vi.mock("../../src/core/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createModel } from "../../src/core/ai-provider.js";

describe("ai-provider", () => {
  beforeEach(() => { throwOnInit = false; });

  it("should create OpenRouter model when config.aiProvider is openrouter", () => {
    const config = { aiProvider: "openrouter", openrouterApiKey: "12345", aiModel: "model-abc" } as PipelineConfig;
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toBe("model-abc");
    expect(model.provider).toBe("openrouter");
  });

  it("should create Ollama model otherwise", () => {
    const config = { aiProvider: "ollama", aiModel: "model-abc" } as PipelineConfig;
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toBe("model-abc");
    expect(model.provider).toBe("ollama");
  });

  it("falls back to Ollama when createOpenRouter throws", () => {
    throwOnInit = true;
    const config = { aiProvider: "openrouter", openrouterApiKey: "key", aiModel: "model-abc" } as PipelineConfig;
    const model = createModel(config);
    expect(model.provider).toBe("ollama");
  });
});
