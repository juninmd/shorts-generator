import { describe, it, expect, vi, beforeEach } from "vitest";
import { processVideo } from "../../src/core/pipeline-video-processor.js";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import { downloadAudioOnly, downloadVideoSection, cleanupVideo } from "../../src/core/youtube.js";
import { transcribeVideo } from "../../src/core/transcriber.js";
import { processClip, getFileStartTime } from "../../src/core/video-processor.js";
import { sendToTelegram, sendSummary } from "../../src/core/telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, addCommentToVideo, buildEngagementComment } from "../../src/core/youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "../../src/core/state.js";
import { enqueueYoutubeUpload } from "../../src/core/queue.js";
import type { VideoInfo, PipelineConfig } from "../../src/types.js";

vi.mock("../../src/core/youtube.js");
vi.mock("../../src/core/transcriber.js");
vi.mock("../../src/core/analyzer.js");
vi.mock("../../src/core/video-processor.js");
vi.mock("../../src/core/telegram.js");
vi.mock("../../src/core/youtube.service.js");
vi.mock("../../src/core/state.js");
vi.mock("../../src/core/queue.js");

describe("processVideo (pipeline-video-processor)", () => {
  const mockVideoInfo: VideoInfo = {
    id: "vid1",
    url: "http://youtube.com/watch?v=vid1",
    title: "Test Video",
    channelName: "Test Channel",
    duration: 120,
    downloadPath: "/tmp/vid1.mp4",
  };
  const mockConfig: PipelineConfig = {
    keepTempFiles: false,
    dailyUploadLimit: 5,
    whisperModel: "small",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_YOUTUBE = "false";
    process.env.DEFER_UPLOADS = "false";

    vi.mocked(downloadAudioOnly).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(transcribeVideo).mockResolvedValue([{ start: 0, end: 10, text: "hello" }]);
    vi.mocked(generateYoutubeMetadata).mockResolvedValue({
      title: "Title",
      description: "Desc",
      tags: ["tags"],
    });
    vi.mocked(sendSummary).mockResolvedValue();
    vi.mocked(cleanupVideo).mockReturnValue();
  });

  it("handles video with no clips found", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([]);
    const res = await processVideo(mockVideoInfo, mockConfig);
    expect(res.shorts).toHaveLength(0);
    expect(cleanupVideo).toHaveBeenCalledWith("vid1", mockConfig);
  });

  it("handles non-preserved timestamps (seekOffset calculation)", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 15, endTime: 25, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(30);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(processClip).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startTime: 2, endTime: 12 }),
      expect.anything()
    );
  });

  it("handles missing msgId from telegram", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(undefined as any);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.shorts[0]?.telegramMessageId).toBeUndefined();
  });

  it("handles non-Error objects thrown during clip send", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockRejectedValue("String Error");

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("String Error");
  });

  it("handles non-Error objects thrown during clip process", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockRejectedValue("String Error Process");

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("String Error Process");
  });

  it("processes and uploads shorts correctly", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(uploadToYouTube).mockResolvedValue("https://youtube.com/watch?v=123");
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "false";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.shorts[0]?.telegramMessageId).toBe(123);
    expect(uploadToYouTube).toHaveBeenCalled();
    expect(addCommentToVideo).toHaveBeenCalledWith("watch?v=123", "comment", mockConfig);
  });

  it("processes and uploads shorts without defer uploads and not reached daily limits, no videoId for comment", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(uploadToYouTube).mockResolvedValue("https://youtube.com/"); // Emulate video id empty
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "false";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.shorts[0]?.telegramMessageId).toBe(123);
    expect(uploadToYouTube).toHaveBeenCalled();
    expect(incrementDailyUploadCountAsync).toHaveBeenCalled();
  });

  it("processes and uploads shorts with telegram failure", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(true);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockRejectedValue(new Error("Telegram Fail"));
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "false";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
  });

  it("handles night generation", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "true";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(enqueueYoutubeUpload).toHaveBeenCalled();
  });

  it("handles processing errors", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockRejectedValue(new Error("Fail"));

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());
    expect(res.errors).toHaveLength(1);
  });

  it("handles processing errors with clip error", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockRejectedValue(new Error("Fail Clip"));

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());
    expect(res.errors).toHaveLength(1);
  });

  it("handles fatal errors", async () => {
    vi.mocked(analyzeTranscript).mockRejectedValue(new Error("Fatal"));

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());
    expect(res.errors).toHaveLength(1);
    expect(cleanupVideo).toHaveBeenCalled();
  });

  it("handles fatal errors without temp files cleanup", async () => {
    vi.mocked(analyzeTranscript).mockRejectedValue(new Error("Fatal"));

    const res = await processVideo(mockVideoInfo, { ...mockConfig, keepTempFiles: true }, vi.fn());
    expect(res.errors).toHaveLength(1);
    expect(cleanupVideo).not.toHaveBeenCalled();
  });

  it("processes and uploads shorts without youtube metadata failing", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(generateYoutubeMetadata).mockRejectedValue(new Error("Fail Meta"));
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(true);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "false";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
  });

  it("handles maxShorts limit", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" },
      { id: "clip2", startTime: 10, endTime: 20, title: "T2", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P2" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn(), 1);
    expect(res.shorts).toHaveLength(1);
  });

  it("processes and uploads shorts without uploadToYouTube resolving and youtube queueing", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([
      { id: "clip1", startTime: 0, endTime: 10, title: "T1", viralScore: 100, reason: "R1", duration: 10, presentationTitle: "P1" }
    ]);
    vi.mocked(downloadVideoSection).mockResolvedValue({
      ...mockVideoInfo,
      audioPath: "/tmp/vid1.wav",
      filePath: "/tmp/vid1.mp4",
      fileSize: 1000,
    });
    vi.mocked(getFileStartTime).mockResolvedValue(0);
    vi.mocked(processClip).mockResolvedValue({
      id: "clip1",
      clip: {} as any,
      outputPath: "/out/clip1.mp4",
      subtitlePath: "/out/clip1.ass",
      originalVideoUrl: "url",
      originalVideoTitle: "Title",
      channelName: "channel",
      status: "completed",
      createdAt: "now"
    });
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
    vi.mocked(uploadToYouTube).mockResolvedValue(undefined);
    vi.mocked(enqueueYoutubeUpload).mockResolvedValue();
    vi.mocked(sendToTelegram).mockResolvedValue(123);
    vi.mocked(buildEngagementComment).mockReturnValue("comment");

    process.env.ENABLE_YOUTUBE = "true";
    process.env.DEFER_UPLOADS = "false";

    const res = await processVideo(mockVideoInfo, mockConfig, vi.fn());

    expect(res.shorts).toHaveLength(1);
    expect(enqueueYoutubeUpload).toHaveBeenCalled();
  });

  it("progresses transcribe properly", async () => {
      vi.mocked(analyzeTranscript).mockResolvedValue([]);

      let progressCb: any = null;
      vi.mocked(transcribeVideo).mockImplementation((_audio, opts) => {
          progressCb = opts.onProgress;
          return Promise.resolve([{ start: 0, end: 10, text: "hello" }]);
      });

      const pCb = vi.fn();
      const resPromise = processVideo(mockVideoInfo, mockConfig, pCb);

      // Wait for it to call transcribeVideo
      await new Promise(r => setTimeout(r, 100));

      if (progressCb) {
          progressCb(50);
          progressCb(100);
      }

      await resPromise;

      expect(pCb).toHaveBeenCalledWith(expect.objectContaining({
          stage: "transcribing",
          progress: 30
      }));
  });
});
