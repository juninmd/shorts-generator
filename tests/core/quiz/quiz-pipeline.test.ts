import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import {
  buildAnswerNarration,
  buildTelegramCaption,
  buildYoutubeRelayCaption,
  buildOutputFileName,
  runQuizPipeline
} from "../../../src/core/quiz/quiz-pipeline";
import { generateQuiz } from "../../../src/core/quiz/quiz-content.service";
import { generateNarration } from "../../../src/core/quiz/quiz-tts.service";
import { assembleVideo } from "../../../src/core/quiz/quiz-video.service";
import { uploadToYouTube } from "../../../src/core/youtube.service";
import type { Quiz } from "../../../src/core/quiz/quiz.domain";

let mockSendVideo = vi.fn().mockResolvedValue(true);
let mockSendMessage = vi.fn().mockResolvedValue(true);

vi.mock("grammy", () => {
  return {
    Bot: class {
      api = {
        sendVideo: mockSendVideo,
        sendMessage: mockSendMessage
      }
    },
    InputFile: class {}
  };
});
vi.mock("node:fs");
vi.mock("../../../src/core/quiz/quiz-content.service");
vi.mock("../../../src/core/quiz/quiz-tts.service");
vi.mock("../../../src/core/quiz/quiz-video.service");
vi.mock("../../../src/core/youtube.service");
vi.mock("../../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Quiz Pipeline", () => {
  const mockQuiz: Quiz = {
    tema: "test theme",
    pergunta: "Test Question?",
    opcoes: { A: "1", B: "2", C: "3", D: "4" },
    resposta_correta: "A",
    fato_curioso: "Test Fact"
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockSendVideo = vi.fn().mockResolvedValue(true);
    mockSendMessage = vi.fn().mockResolvedValue(true);
  });

  describe("Caption/Text Builders", () => {
    it("should build answer narration", () => {
      const text = buildAnswerNarration(mockQuiz);
      expect(text).toContain("letra A: 1");
      expect(text).toContain("Test Fact");
    });

    it("should build telegram caption", () => {
      const text = buildTelegramCaption(mockQuiz, "@test");
      expect(text).toContain("TEST THEME");
      expect(text).toContain("Test Question?");
      expect(text).toContain("@test");
    });

    it("should build youtube relay caption", () => {
      const text = buildYoutubeRelayCaption(mockQuiz, "http://yt.url");
      expect(text).toContain("TEST THEME");
      expect(text).toContain("http://yt.url");
    });

    it("should build output file name", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const name = buildOutputFileName(mockQuiz);
      expect(name).toBe("quiz_test_theme_1000.mp4");
      vi.useRealTimers();
    });
  });

  describe("runQuizPipeline", () => {
    const config = {
      tempDir: "temp",
      outputDir: "out",
      watermarkText: "@test"
    } as any;

    beforeEach(() => {
      vi.mocked(generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(generateNarration).mockResolvedValue({ audioPath: "audio.mp3", wordTimestamps: [] });
      vi.mocked(assembleVideo).mockResolvedValue("out/video.mp4");
    });

    it("should run successfully and clean up temp files", async () => {
      const result = await runQuizPipeline(config);

      expect(result.success).toBe(true);
      expect(result.quiz).toBe(mockQuiz);
      expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("temp/quiz-"), { recursive: true, force: true });
    });

    it("should keep temp files if configured", async () => {
      await runQuizPipeline({ ...config, keepTempFiles: true });
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it("should upload to Telegram if configured", async () => {
      const result = await runQuizPipeline({ ...config, telegramBotToken: "token", telegramChatId: "id" });

      expect(mockSendVideo).toHaveBeenCalled();
      expect(result.telegramSent).toBe(true);
    });

    it("should handle Telegram errors gracefully", async () => {
      mockSendVideo.mockRejectedValueOnce(new Error("TG Error"));

      const result = await runQuizPipeline({ ...config, telegramBotToken: "token", telegramChatId: "id" });

      expect(result.telegramSent).toBe(false); // Did not throw, but sent is false
    });

    it("should upload to YouTube if enabled", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(uploadToYouTube).mockResolvedValue("http://yt.url");

      const result = await runQuizPipeline(config);

      expect(uploadToYouTube).toHaveBeenCalled();
      expect(result.youtubeUrl).toBe("http://yt.url");

      process.env.ENABLE_YOUTUBE = "false";
    });

    it("should send YouTube relay to Telegram if both configured", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(uploadToYouTube).mockResolvedValue("http://yt.url");

      await runQuizPipeline({ ...config, telegramBotToken: "token", telegramChatId: "id" });

      expect(mockSendMessage).toHaveBeenCalledWith("id", expect.stringContaining("http://yt.url"), expect.any(Object));

      process.env.ENABLE_YOUTUBE = "false";
    });

    it("should handle YouTube relay to Telegram errors gracefully", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(uploadToYouTube).mockResolvedValue("http://yt.url");
      mockSendMessage.mockRejectedValueOnce(new Error("TG YT Error"));

      await runQuizPipeline({ ...config, telegramBotToken: "token", telegramChatId: "id" });

      // Should not throw
      expect(mockSendMessage).toHaveBeenCalled();

      process.env.ENABLE_YOUTUBE = "false";
    });

    it("should handle pipeline failures, cleanup and rethrow", async () => {
      vi.mocked(generateNarration).mockRejectedValue(new Error("TTS Error"));

      await expect(runQuizPipeline(config)).rejects.toThrow("TTS Error");
      expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("temp/quiz-"), { recursive: true, force: true });
    });

    it("should catch and silence errors during cleanup block when catching an outer failure safely via fake catch", async () => {
      vi.mocked(generateQuiz).mockRejectedValue(new Error("Gen Error"));
      vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("rmSync failed"); });

      await expect(runQuizPipeline(config)).rejects.toThrow("Gen Error");
    });

    it("should handle YouTube missing youtubeUrl relay safely", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(uploadToYouTube).mockResolvedValue(null);

      const result = await runQuizPipeline({ ...config, telegramBotToken: "token", telegramChatId: "id" });

      expect(result.youtubeUrl).toBe(null);
      expect(mockSendMessage).not.toHaveBeenCalled();

      process.env.ENABLE_YOUTUBE = "false";
    });

    it("should invoke onProgress callback", async () => {
      const onProgress = vi.fn();
      await runQuizPipeline(config, onProgress);
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "generating_quiz" }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "generating_tts" }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "rendering" }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "done" }));
    });

    it("should fallback watermark if not configured", async () => {
       const result = await runQuizPipeline({
           tempDir: "temp",
           outputDir: "out"
       } as any);
       expect(result.success).toBe(true);
    });
  });
});
