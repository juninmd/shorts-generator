import { describe, it, expect } from "vitest";
import { buildFullVideoDescription, buildFullVideoTags } from "../../src/core/full-video-metadata.js";
import type { VideoInfo, PipelineConfig } from "../../src/types.js";

describe("full-video-metadata", () => {
  const mockVideo: VideoInfo = {
    videoId: "123",
    title: "Meu Vídeo Teste",
    url: "https://youtube.com/watch?v=123",
    description: "Original description",
    channelName: "Canal Teste Legal",
    viewCount: 100,
    duration: 600,
  };

  const mockConfig: PipelineConfig = {
    managedRun: {
      focusLabels: ["label1", "label2"],
    },
  } as PipelineConfig;

  it("should build full video description correctly", () => {
    const description = buildFullVideoDescription(mockVideo);
    expect(description).toContain("🎬 Meu Vídeo Teste");
    expect(description).toContain("Canal Teste Legal");
    expect(description).toContain("https://youtube.com/watch?v=123");
    expect(description).toContain("#shorts #viral #CanalTesteLegal #Canal");
  });

  it("should handle empty or weird channel names for tags", () => {
    const weirdVideo = { ...mockVideo, channelName: "  " };
    const desc1 = buildFullVideoDescription(weirdVideo);
    expect(desc1).toContain("#shorts #viral");

    const tags = buildFullVideoTags(weirdVideo, mockConfig);
    expect(tags).toEqual(["label1", "label2", "viral", "curiosidades", "melhores momentos"]);
  });

  it("should build full video tags correctly", () => {
    const tags = buildFullVideoTags(mockVideo, mockConfig);
    expect(tags).toContain("canal teste legal");
    expect(tags).toContain("canal teste");
    expect(tags).toContain("teste legal");
    expect(tags).toContain("label1");
    expect(tags).toContain("label2");
    expect(tags).toContain("viral");
  });
});
