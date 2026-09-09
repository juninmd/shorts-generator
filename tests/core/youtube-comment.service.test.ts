import { describe, it, expect, vi, beforeEach } from "vitest";
import { addCommentToVideo, buildEngagementComment } from "../../src/core/youtube-comment.service.js";
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
