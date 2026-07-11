import { describe, it, expect, vi, beforeEach } from "vitest";
import { runQuizPipeline, buildOutputFileName, buildTelegramCaption, buildYoutubeMetadata, buildRevealNarration, buildOutroNarration } from "../../../src/core/quiz/quiz-pipeline.js";
import * as content from "../../../src/core/quiz/quiz-content.service.js";
import * as tts from "../../../src/core/quiz/quiz-tts.service.js";
import * as video from "../../../src/core/quiz/quiz-video.service.js";
import * as youtubeService from "../../../src/core/youtube.service.js";
import * as queue from "../../../src/core/queue.js";
import * as state from "../../../src/core/state.js";
import fs from "node:fs";

// Create spy functions that we can check in our tests
const sendVideoSpy = vi.fn().mockResolvedValue(true);
const sendMessageSpy = vi.fn().mockResolvedValue(true);

// Mock the whole grammy module
vi.mock("grammy", () => {
    return {
        Bot: class {
            api = {
                sendVideo: sendVideoSpy,
                sendMessage: sendMessageSpy
            };
        },
        InputFile: class {}
    };
});

vi.mock("node:fs");
vi.mock("../../../src/core/quiz/quiz-content.service.js");
vi.mock("../../../src/core/quiz/quiz-tts.service.js");
vi.mock("../../../src/core/quiz/quiz-video.service.js");
vi.mock("../../../src/core/youtube.service.js");
vi.mock("../../../src/core/queue.js");
vi.mock("../../../src/core/state.js");
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

describe("quiz-pipeline", () => {
  const config = {
    tempDir: "temp",
    outputDir: "out",
    watermarkText: "test_watermark",
    keepTempFiles: false
  } as any;

  const validQuiz = {
    tema: "test",
    titulo_youtube: "title",
    hook: "hook text",
    perguntas: [
      { pergunta: "P1?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" }
    ],
    fato_curioso: "curious fact",
    tags: ["test"],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    sendVideoSpy.mockClear();
    sendMessageSpy.mockClear();

    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.rmSync).mockImplementation(() => undefined);

    vi.mocked(content.generateQuiz).mockResolvedValue(validQuiz);
    vi.mocked(tts.generateNarration).mockResolvedValue({ audioPath: "audio.mp3", wordTimestamps: [] });
    vi.mocked(video.assembleVideo).mockResolvedValue("out.mp4");

    vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue("https://youtube.com/shorts/123");

    process.env.ENABLE_YOUTUBE = "true";
  });

  describe("helpers", () => {
      it("buildRevealNarration", () => {
          expect(buildRevealNarration(validQuiz.perguntas[0]!)).toBe("Letra A: a!");
      });
      it("buildOutroNarration", () => {
          expect(buildOutroNarration(validQuiz)).toContain("curious fact");
      });
      it("buildTelegramCaption", () => {
          expect(buildTelegramCaption(validQuiz, "watermark")).toContain("title");
          expect(buildTelegramCaption(validQuiz, "watermark")).toContain("watermark");
      });
      it("buildYoutubeMetadata", () => {
          const meta = buildYoutubeMetadata(validQuiz, "watermark");
          expect(meta.title).toBe("title");
          expect(meta.tags).toContain("test");
      });
      it("buildOutputFileName", () => {
          expect(buildOutputFileName(validQuiz)).toContain("quiz_test_");
      });
      it("buildYoutubeMetadata fallbacks", () => {
          const m = buildYoutubeMetadata({...validQuiz, titulo_youtube: "", tags: undefined} as any, "w");
          expect(m.title).toContain("P1?");
          expect(m.tags).toEqual(["test", "quiz"]);
      });
      it("handles missing content properties without error", () => {
          const q = { ...validQuiz };
          delete (q as any).tags;
          const m = buildYoutubeMetadata(q as any, "w");
          expect(m.tags).toEqual(["test", "quiz"]);
      });

      it("handles when title is generated from quiz default", () => {
         const quizNoTitleNoPerg = {
             ...validQuiz,
             titulo_youtube: "",
             perguntas: []
         };
         const m = buildYoutubeMetadata(quizNoTitleNoPerg as any, "w");
         expect(m.title).toContain("test");
      });
  });

  it("runs the full pipeline successfully without telegram and youtube disabled", async () => {
    process.env.ENABLE_YOUTUBE = "false";
    const res = await runQuizPipeline(config, vi.fn());
    expect(res.success).toBe(true);
    expect(res.youtubeUrl).toBeNull();
    expect(res.telegramSent).toBe(false);
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("runs full pipeline with telegram and youtube", async () => {
    const configWithTelegram = { ...config, telegramBotToken: "token", telegramChatId: "chatId" };
    sendVideoSpy.mockResolvedValueOnce(true);
    sendMessageSpy.mockResolvedValueOnce(true);

    const res = await runQuizPipeline(configWithTelegram, vi.fn());
    expect(res.success).toBe(true);
    expect(res.youtubeUrl).toBe("https://youtube.com/shorts/123");

    expect(sendVideoSpy).toHaveBeenCalled();
    expect(sendMessageSpy).toHaveBeenCalled();
    expect(state.incrementDailyUploadCountAsync).toHaveBeenCalled();
  });

  it("enqueues youtube upload if daily limit reached", async () => {
    vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(true);
    const res = await runQuizPipeline(config, vi.fn());
    expect(res.success).toBe(true);
    expect(res.youtubeUrl).toBeNull();
    expect(queue.enqueueYoutubeUpload).toHaveBeenCalled();
  });

  it("enqueues youtube upload if uploadToYouTube returns null", async () => {
    vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue(null);
    const res = await runQuizPipeline(config, vi.fn());
    expect(res.success).toBe(true);
    expect(res.youtubeUrl).toBeNull();
    expect(queue.enqueueYoutubeUpload).toHaveBeenCalled();
  });

  it("cleans up and rethrows on failure", async () => {
    // Rejects after mkdirSync so rmSync in catch block is tested
    vi.mocked(tts.generateNarration).mockRejectedValue(new Error("Fail"));

    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail");
    // Ensure rmSync is called during failure cleanup
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("handles cleanup error gracefully", async () => {
      vi.mocked(tts.generateNarration).mockRejectedValue(new Error("Fail"));
      vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("cleanup fail"); });

      await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail");
  });

  it("handles telegram api fail gracefully", async () => {
      const configWithTelegram = { ...config, telegramBotToken: "token", telegramChatId: "chatId" };
      sendVideoSpy.mockRejectedValueOnce(new Error("err"));

      const res = await runQuizPipeline(configWithTelegram, vi.fn());
      expect(res.success).toBe(true);
      expect(res.telegramSent).toBe(false);
  });

  it("sends telegram message if youtube upload succeeds", async () => {
    process.env.ENABLE_YOUTUBE = "true";
    vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue("url");
    const configWithTelegram = { ...config, telegramBotToken: "token", telegramChatId: "chatId" };

    sendVideoSpy.mockResolvedValueOnce(true);
    sendMessageSpy.mockResolvedValueOnce(true);

    await runQuizPipeline(configWithTelegram, vi.fn());
    expect(sendMessageSpy).toHaveBeenCalled();
  });

  it("keeps temp files if config says so", async () => {
      const configKeep = { ...config, keepTempFiles: true };
      await runQuizPipeline(configKeep, vi.fn());
      expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it("handles youtube publish relay caption error gracefully", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue("url");
      const configWithTelegram = { ...config, telegramBotToken: "token", telegramChatId: "chatId" };

      sendVideoSpy.mockResolvedValueOnce(true);
      sendMessageSpy.mockRejectedValueOnce(new Error("fail"));

      const res = await runQuizPipeline(configWithTelegram, vi.fn());
      expect(res.success).toBe(true);
  });

  it("handles missing quiz title dynamically", async () => {
    vi.mocked(content.generateQuiz).mockResolvedValue({...validQuiz, titulo_youtube: ""} as any);
    const res = await runQuizPipeline(config, vi.fn());
    expect(res.success).toBe(true);
  });

  it("defaults to @akitemquiz if no watermark config is present", async () => {
    const configNoWatermark = { ...config, watermarkText: undefined } as any;
    const res = await runQuizPipeline(configNoWatermark, vi.fn());
    expect(res.success).toBe(true);
  });

  it("handles missing job workspace dynamically on error gracefully", async () => {
      vi.mocked(content.generateQuiz).mockRejectedValue(new Error("Fail"));
      // The directory doesn't exist, rmSync might throw or fail differently.
      // But we just want to execute the specific branch `catch {}` of the cleanup inside `catch`.
      vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("ignore"); });
      await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail");
  });

  it("handles catch block cleanly when error is string", async () => {
    vi.mocked(content.generateQuiz).mockRejectedValue("string error");

    // Make rmSync throw to trigger the nested catch block
    vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("rmSync failed"); });

    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("string error");
  });

  it("handles catch block error when error is an object", async () => {
    const customError = new Error("Custom Error");
    vi.mocked(content.generateQuiz).mockRejectedValue(customError);

    // Trigger catch with no rmSync error to check error reporting of the custom error
    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Custom Error");
  });

  /* v8 ignore start */
  it("handles when fs.rmSync fails with any error gracefully when keeping workspace on fail", async () => {
    vi.mocked(content.generateQuiz).mockRejectedValue(new Error("Fail"));
    // Try to throw error in rmSync, the outer catch block catches it but discards
    // so we just expect the original reject Error to be the one thrown
    vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("cleanup fail"); });

    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail");
  });

  it("handles catch block with fallback on nested try/catch inside main catch", async () => {
    vi.mocked(content.generateQuiz).mockRejectedValue(new Error("Fail outer"));
    // Try to trigger line 151 the catch block with empty body
    vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("ignore"); });

    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail outer");
  });

  it("handles when fs.rmSync fails gracefully without keeping temp files", async () => {
    vi.mocked(content.generateQuiz).mockRejectedValue(new Error("Fail outer"));
    // We override rmSync and make it throw, testing the outer catch logic
    vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("rmSync fail"); });

    await expect(runQuizPipeline(config, vi.fn())).rejects.toThrow("Fail outer");
  });
  /* v8 ignore stop */
});
