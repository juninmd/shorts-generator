import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addCommentToVideo,
  buildEngagementComment,
  buildQuizEngagementComment,
  extractYouTubeVideoId,
} from "../../src/core/youtube-comment.service.js";
import { getYouTubeAuth, validateYouTubeToken } from "../../src/core/youtube-auth.service.js";

const { mockInsert, mockSetCredentials, mockGetYouTubeAuth, mockValidateToken } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSetCredentials: vi.fn(),
  mockGetYouTubeAuth: vi.fn(),
  mockValidateToken: vi.fn().mockResolvedValue({ valid: true })
}));

vi.mock("../../src/core/youtube-auth.service.js", () => ({
  getYouTubeAuth: mockGetYouTubeAuth,
  validateYouTubeToken: mockValidateToken
}));

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = mockSetCredentials;
        }
      },
      youtube: vi.fn().mockReturnValue({
        commentThreads: {
          insert: mockInsert
        }
      })
    },
  };
});

describe("youtube-comment.service", () => {
  const mockConfig = {
    managedRun: { channelId: "test-channel" }
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetYouTubeAuth.mockReset();
    mockInsert.mockReset();
    mockValidateToken.mockResolvedValue({ valid: true });
  });

  describe("extractYouTubeVideoId", () => {
    it("extracts from shorts URL with query params", () => {
      expect(extractYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from watch URL", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("returns null for invalid URL without 11-char ID", () => {
      expect(extractYouTubeVideoId("https://youtube.com/")).toBeNull();
    });
  });

  describe("buildEngagementComment", () => {
    it("should build standard comment when no religious tags", () => {
      const text = buildEngagementComment("http://url", ["tech", "news"]);
      expect(text).toContain("Concorda? Deixa sua opinião aqui");
      expect(text).toContain("http://url");
    });

    it("should build religious comment when religious tags present", () => {
      const text = buildEngagementComment("http://url", ["gospel", "fe"]);
      expect(text).toContain("O que essa mensagem tocou em você?");
      expect(text).toContain("http://url");
    });

    it("should default correctly if labels are omitted", () => {
      const text = buildEngagementComment("http://url");
      expect(text).toContain("Concorda?");
    });

    it("should use customQuestion when provided", () => {
      const text = buildEngagementComment("http://url", ["tech"], "Você faria isso?");
      expect(text).toContain("Você faria isso?");
      expect(text).toContain("http://url");
    });

    it("should filter out customQuestion if it contains external URLs", () => {
      const text = buildEngagementComment("http://url", ["tech"], "Acesse https://phishing.site");
      expect(text).not.toContain("https://phishing.site");
      expect(text).toContain("Concorda?");
    });

    it("should work without originalVideoUrl", () => {
      const text = buildEngagementComment(undefined, ["tech"], "Comente abaixo!");
      expect(text).toBe("Comente abaixo!");
    });
  });

  describe("buildQuizEngagementComment", () => {
    it("should format score prompt based on question count", () => {
      const text = buildQuizEngagementComment({ perguntas: [{}, {}, {}] });
      expect(text).toContain("Quantas você acertou?");
      expect(text).toContain("de 0 a 3");
    });

    it("should fallback to 3 questions if perguntas array is missing", () => {
      const text = buildQuizEngagementComment({});
      expect(text).toContain("de 0 a 3");
    });
  });

  describe("addCommentToVideo", () => {
    it("should post a comment successfully", async () => {
      mockGetYouTubeAuth.mockResolvedValueOnce({
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "token"
      });
      mockInsert.mockResolvedValueOnce({});

      await addCommentToVideo("videoId123", "Test comment", mockConfig);
      expect(mockInsert).toHaveBeenCalledWith({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId: "videoId123",
            topLevelComment: {
              snippet: {
                textOriginal: "Test comment",
              },
            },
          },
        },
      });
    });

    it("should return early if auth cannot be obtained", async () => {
      mockGetYouTubeAuth.mockResolvedValueOnce(null);
      await addCommentToVideo("videoId123", "Test comment", mockConfig);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should return early if validation fails", async () => {
      mockGetYouTubeAuth.mockResolvedValueOnce({
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "token"
      });
      mockValidateToken.mockResolvedValueOnce({ valid: false, error: "bad token" });

      await addCommentToVideo("videoId123", "Test comment", mockConfig);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should log and handle errors from youtube api without throwing (withRetry)", async () => {
      mockGetYouTubeAuth.mockResolvedValueOnce({
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "token"
      });
      mockInsert.mockRejectedValue(new Error("YouTube API Error"));

      await addCommentToVideo("videoId123", "Test comment", mockConfig);
      expect(mockInsert).toHaveBeenCalledTimes(3); // Due to default withRetry maxAttempts
    });
  });
});
