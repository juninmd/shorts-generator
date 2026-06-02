import { describe, it, expect, vi } from "vitest";
import type { PipelineConfig } from "../../src/types.js";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn((opts: { apiKey: string; baseURL: string }) =>
    (model: string) => ({ modelId: model, provider: "litellm", apiKey: opts.apiKey, baseURL: opts.baseURL }),
  ),
}));

import { createModel } from "../../src/core/ai-provider.js";

describe("ai-provider", () => {
  it("creates a LiteLLM model with configured key and base URL", () => {
    const config = {
      litellmApiKey: "litellm-key",
      litellmBaseUrl: "http://litellm:4000/v1",
      aiModel: "cloud/gemma3",
    } as PipelineConfig;
    const model = createModel(config) as unknown as { modelId: string; apiKey: string; baseURL: string };
    expect(model.modelId).toBe("cloud/gemma3");
    expect(model.apiKey).toBe("litellm-key");
    expect(model.baseURL).toBe("http://litellm:4000/v1");
  });

  it("falls back to a dummy key when none is configured", () => {
    const config = { litellmApiKey: "", litellmBaseUrl: "http://litellm:4000/v1", aiModel: "cloud/gemma3" } as PipelineConfig;
    const model = createModel(config) as unknown as { apiKey: string };
    expect(model.apiKey).toBe("sk-dummy");
  });
});
