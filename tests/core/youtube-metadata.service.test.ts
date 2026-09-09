import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateYoutubeMetadata } from "../../src/core/youtube-metadata.service.js";
import { generateText } from "ai";
import { createModel } from "../../src/core/ai-provider.js";
import { getChannelFeedback, formatFeedbackForPrompt } from "../../src/core/viral-feedback.js";
import { buildPresenterTitle } from "../../src/core/presenter-title.js";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(),
}));

vi.mock("../../src/core/viral-feedback.js", () => ({
  getChannelFeedback: vi.fn(),
  formatFeedbackForPrompt: vi.fn(),
}));

vi.mock("../../src/core/presenter-title.js", () => ({
  buildPresenterTitle: vi.fn().mockImplementation((title, presenter) => {
    if (!presenter) return title;
    return `${title} - ${presenter}`;
  }),
}));

describe("youtube-metadata.service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("should return basic metadata when testing", async () => {
    process.env.VITEST = "true";
    const clip = { presenter: "Alice", title: "Original Title", description: "Desc" };
    const config = { managedRun: { presenterName: "Bob" } } as any;

    const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
    expect(metadata.title).toBe("Original Title - Bob");
    expect(metadata.tags).toEqual(["shorts", "viral"]);
  });

  it("should handle error in createModel and fallback to basic metadata", async () => {
    process.env.VITEST = "false";
    process.env.ENABLE_YOUTUBE = "true";
    vi.mocked(createModel).mockImplementationOnce(() => {
      throw new Error("Model failed");
    });

    const clip = { presenter: "Alice", title: "Original Title", description: "Desc" };
    const config = { managedRun: { presenterName: "Bob" } } as any;

    const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
    expect(metadata.title).toBe("Original Title - Bob");
  });

  it("should use AI generated metadata", async () => {
    process.env.VITEST = "false";
    process.env.ENABLE_YOUTUBE = "true";

    const mockModel = {};
    vi.mocked(createModel).mockReturnValue(mockModel as any);
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ title: "AI Title", tags: ["aiTag"] })
    } as any);

    const clip = { title: "Title", description: "Desc" };
    const config = { managedRun: {} } as any;

    const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
    expect(metadata.title).toBe("AI Title");
    expect(metadata.tags).toEqual(["shorts", "viral", "aiTag"]);
  });

  it("should handle missing tags in AI JSON", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ title: "AI Title No Tags" })
      } as any);

      const clip = { title: "Title", description: "Desc" };
      const config = { managedRun: {} } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("AI Title No Tags");
      expect(metadata.tags).toEqual(["shorts", "viral"]); // fallbacks to default tags
  });

  it("should fallback if title is missing in AI JSON", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ tags: ["aiTag"] })
      } as any);

      const clip = { title: "Base Title", description: "Desc" };
      const config = { managedRun: {} } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("Base Title");
  });

  it("should handle invalid AI JSON and fallback to base after retries", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: "Invalid format"
      } as any);

      const clip = { title: "Base Title", description: "Desc" };
      const config = { managedRun: {} } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("Base Title");
  });

  it("should include channel feedback if available", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ title: "Feedback Title", tags: [] })
      } as any);

      vi.mocked(getChannelFeedback).mockResolvedValue({ topTitles: ["t1", "t2"] } as any);
      vi.mocked(formatFeedbackForPrompt).mockReturnValue("FEEDBACK TEXT");

      const clip = { title: "Title", description: "Desc" };
      const config = { managedRun: { channelId: "ch1" } } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("Feedback Title");
      expect(getChannelFeedback).toHaveBeenCalled();
  });

  it("should gracefully handle null feedback when channelId exists", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ title: "Feedback Title Null", tags: [] })
      } as any);

      vi.mocked(getChannelFeedback).mockResolvedValue(null);

      const clip = { title: "Title", description: "Desc" };
      const config = { managedRun: { channelId: "ch1" } } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("Feedback Title Null");
  });

  it("should gracefully handle empty topTitles in feedback when channelId exists", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";

      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ title: "Feedback Title Empty", tags: [] })
      } as any);

      vi.mocked(getChannelFeedback).mockResolvedValue({ topTitles: [] } as any);

      const clip = { title: "Title", description: "Desc" };
      const config = { managedRun: { channelId: "ch1" } } as any;

      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, config);
      expect(metadata.title).toBe("Feedback Title Empty");
  });

  it("should handle error instance in createModel catch block", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(createModel).mockImplementationOnce(() => {
        throw "String error";
      });
      const clip = { title: "Base Title", description: "Desc" };
      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, { managedRun: {} } as any);
      expect(metadata.title).toBe("Base Title");
  });

  it("should handle string error in AI retry loop", async () => {
      process.env.VITEST = "false";
      process.env.ENABLE_YOUTUBE = "true";
      const mockModel = {};
      vi.mocked(createModel).mockReturnValue(mockModel as any);
      vi.mocked(generateText).mockReset(); // Clear previous mocks
      vi.mocked(generateText).mockRejectedValue("String error in generateText");

      const clip = { title: "Base Title", description: "Desc" };
      const metadata = await generateYoutubeMetadata({ clip, originalVideoUrl: "url" } as any, { managedRun: {} } as any);
      expect(metadata.title).toBe("Base Title");
  });
});
