import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildAnswerNarration,
  buildTelegramCaption,
  buildYoutubeRelayCaption,
  buildOutputFileName,
  runQuizPipeline
} from "../../../src/core/quiz/quiz-pipeline.js";
import * as quizContentService from "../../../src/core/quiz/quiz-content.service.js";
import * as quizTtsService from "../../../src/core/quiz/quiz-tts.service.js";
import * as quizVideoService from "../../../src/core/quiz/quiz-video.service.js";
import * as youtubeService from "../../../src/core/youtube.service.js";
import { logger } from "../../../src/core/logger.js";
import type { PipelineConfig } from "../../../src/types.js";
import type { Quiz } from "../../../src/core/quiz/quiz.domain.js";

vi.mock("node:fs");
vi.mock("node:path", async () => {
    const actual = await vi.importActual("node:path");
    return {
        ...actual,
        join: vi.fn((...args) => args.join('/'))
    };
});

const mockSendVideo = vi.fn();
const mockSendMessage = vi.fn();

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

vi.mock("../../../src/core/quiz/quiz-content.service.js");
vi.mock("../../../src/core/quiz/quiz-tts.service.js");
vi.mock("../../../src/core/quiz/quiz-video.service.js");
vi.mock("../../../src/core/youtube.service.js");
vi.mock("../../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("quiz-pipeline", () => {
  const mockQuiz: Quiz = {
    tema: "História",
    pergunta: "Quem descobriu o Brasil?",
    opcoes: { A: "Pedro Álvares Cabral", B: "Cristóvão Colombo", C: "Vasco da Gama", D: "Fernão de Magalhães" },
    correta: "A",
    explicacao: "Pedro Álvares Cabral chegou ao Brasil em 1500.",
    resposta_correta: "A",
    fato_curioso: "A viagem era para as Índias."
  };

  const mockConfig: PipelineConfig = {
    tempDir: "/tmp/test",
    outputDir: "/out/test",
    watermarkText: "@testquiz",
    telegramBotToken: "test-token",
    telegramChatId: "test-chat-id",
    keepTempFiles: false,
  } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_YOUTUBE = "false";
  });

  describe("helper functions", () => {
    it("buildAnswerNarration should build correct string", () => {
      const result = buildAnswerNarration(mockQuiz);
      expect(result).toBe("A resposta correta é a letra A: Pedro Álvares Cabral. A viagem era para as Índias.. E aí, você sabia? Se gostou da curiosidade, curta o vídeo e se inscreva no canal para mais vídeos como este!");
    });

    it("buildTelegramCaption should build correct string", () => {
      const result = buildTelegramCaption(mockQuiz, "@test");
      expect(result).toBe("🏆 <b>NOVO QUIZ: HISTÓRIA!</b>\n\nPerguntamos: Quem descobriu o Brasil?\n\nCanal: @test\n\n#quiz #shorts #gerado_ia");
    });

    it("buildYoutubeRelayCaption should build correct string", () => {
      const result = buildYoutubeRelayCaption(mockQuiz, "http://yt.test");
      expect(result).toBe("📺 <b>O vídeo do quiz \"HISTÓRIA\" também já está no YouTube!</b>\n\nAssista e deixe aquele like: http://yt.test");
    });

    it("buildOutputFileName should format correctly", () => {
      vi.spyOn(Date, "now").mockReturnValue(1000);
      const result = buildOutputFileName(mockQuiz);
      expect(result).toBe("quiz_História_1000.mp4");
      vi.spyOn(Date, "now").mockRestore();
    });
  });

  describe("runQuizPipeline", () => {
    it("should run the full pipeline successfully", async () => {
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      mockSendVideo.mockResolvedValue({});
      vi.mocked(fs.rmSync).mockImplementation(() => {});

      const progressCallback = vi.fn();

      const result = await runQuizPipeline(mockConfig, progressCallback);

      expect(result.success).toBe(true);
      expect(result.quiz).toBe(mockQuiz);
      expect(result.telegramSent).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("/tmp/test/quiz-"), { recursive: true });
      expect(quizTtsService.generateNarration).toHaveBeenCalledTimes(2);
      expect(quizVideoService.assembleVideo).toHaveBeenCalled();
      expect(mockSendVideo).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalled(); // temp dir removed
      expect(progressCallback).toHaveBeenCalledTimes(5); // generation, tts, render, tel, done
    });

    it("should handle telegram error without failing the pipeline", async () => {
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      mockSendVideo.mockRejectedValue(new Error("Telegram API Error"));

      const result = await runQuizPipeline(mockConfig);

      expect(result.success).toBe(true);
      expect(result.telegramSent).toBe(false);
      expect(logger.error).toHaveBeenCalledWith({ error: "Telegram API Error" }, expect.stringContaining("Erro ao enviar vídeo"));
    });

    it("should publish to youtube when enabled", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue("http://youtube.com/test");
      mockSendMessage.mockResolvedValue({});
      mockSendVideo.mockResolvedValue({});

      const result = await runQuizPipeline(mockConfig);

      expect(result.youtubeUrl).toBe("http://youtube.com/test");
      expect(youtubeService.uploadToYouTube).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it("should handle error when youtube sharing to telegram fails", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue("http://youtube.com/test");
      mockSendMessage.mockRejectedValue(new Error("Tg Msg Fail"));
      mockSendVideo.mockResolvedValue({});

      const result = await runQuizPipeline(mockConfig);
      expect(result.youtubeUrl).toBe("http://youtube.com/test");
      expect(logger.error).toHaveBeenCalledWith({ error: "Tg Msg Fail" }, expect.stringContaining("Erro ao enviar link"));
    });

    it("should clean up and throw on critical failure", async () => {
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockRejectedValue(new Error("TTS Failed"));

      await expect(runQuizPipeline(mockConfig)).rejects.toThrow("TTS Failed");
      expect(fs.rmSync).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith({ error: "TTS Failed" }, expect.stringContaining("Falha crítica"));
    });

    it("should handle cleanup error gracefully on failure", async () => {
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockRejectedValue(new Error("TTS Failed"));
      // Create a mock that throws an error only when called from the catch block
      let throwOnNextCall = true;
      vi.mocked(fs.rmSync).mockImplementation(() => {
        if (throwOnNextCall) {
          throwOnNextCall = false; // Prevent infinite loops or affecting other tests
          throw new Error("RM Fail");
        }
      });

      await expect(runQuizPipeline(mockConfig)).rejects.toThrow("TTS Failed");
      // Original error is thrown, RM error is swallowed
    });

    it("should use default watermark if none is provided", async () => {
       const configWithoutWatermark = { ...mockConfig, watermarkText: undefined } as any;
       vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
       vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
       vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
       mockSendVideo.mockResolvedValue({});

       await runQuizPipeline(configWithoutWatermark);
       expect(mockSendVideo).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
           caption: expect.stringContaining("@akitemquiz")
       }));
    });

    it("should gracefully continue if youtube upload returns null but is enabled", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      vi.mocked(youtubeService.uploadToYouTube).mockResolvedValue(null);
      mockSendMessage.mockResolvedValue({});
      mockSendVideo.mockResolvedValue({});

      const result = await runQuizPipeline(mockConfig);

      expect(result.youtubeUrl).toBeNull();
      expect(youtubeService.uploadToYouTube).toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled(); // Shouldn't try to notify telegram
    });

    it("should leave temp files if keepTempFiles is true", async () => {
      const keepTempConfig = { ...mockConfig, keepTempFiles: true };
      vi.mocked(quizContentService.generateQuiz).mockResolvedValue(mockQuiz);
      vi.mocked(quizTtsService.generateNarration).mockResolvedValue({ audioPath: "path", wordTimestamps: [] } as any);
      vi.mocked(quizVideoService.assembleVideo).mockResolvedValue("output.mp4");
      mockSendVideo.mockResolvedValue({});

      await runQuizPipeline(keepTempConfig);

      expect(fs.rmSync).not.toHaveBeenCalled();
    });
  });
});
