import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, execMock, writeMock, readMock, sendVideo, getBotMock, uploadMock, commentMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  execMock: vi.fn(),
  writeMock: vi.fn(),
  readMock: vi.fn(),
  sendVideo: vi.fn(),
  getBotMock: vi.fn(),
  uploadMock: vi.fn(),
  commentMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: any[]) => {
    execMock(...args);
    args[args.length - 1](null, { stdout: "", stderr: "" });
  },
}));
vi.mock("node:fs", () => {
  const api = { mkdirSync: vi.fn(), writeFileSync: writeMock, readFileSync: readMock };
  return { ...api, default: api };
});
vi.mock("../../../src/core/faceless/stock-footage.js", () => ({ fetchSceneFootage: fetchMock }));
vi.mock("nanoid", () => ({ nanoid: () => "abc123" }));
vi.mock("grammy", () => ({ InputFile: class { constructor(public path: string) {} } }));
vi.mock("../../../src/core/ffmpeg-bin.js", () => ({ ffmpegBin: () => "ffmpeg" }));
vi.mock("../../../src/core/ffmpeg-env.js", () => ({ buildFontEnv: () => ({}) }));
vi.mock("../../../src/core/quiz/quiz-fonts.js", () => ({ resolveQuizFont: () => "assets/fonts/P.ttf" }));
vi.mock("../../../src/core/quiz/quiz-assets.service.js", () => ({ wrapText: (t: string) => t }));
vi.mock("../../../src/core/telegram-bot.js", () => ({ getBot: getBotMock }));
vi.mock("../../../src/core/youtube.service.js", () => ({ uploadToYouTube: uploadMock }));
vi.mock("../../../src/core/youtube-comment.service.js", () => ({
  addCommentToVideo: commentMock,
  extractYouTubeVideoId: (u: string) => u.match(/shorts\/(\w+)/)?.[1] ?? null,
  buildEngagementComment: vi.fn(),
}));
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { ACT_BACKGROUND, buildVerseCardBook, buildVerseFilters, scrimFilter } from "../../../src/core/faceless/verse-cards.js";
import { publishBiblePreview, sendBiblePreview } from "../../../src/core/faceless/bible-preview.js";

const script = {
  title: "T", reference: "Lucas 15,11-24",
  scenes: [
    { act: "gancho", narration: "n1", verse: "v1", keywords: "k" },
    { act: "aplicacao", narration: "n2", verse: "v2", keywords: "k" },
  ],
} as any;

describe("verse cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(null);
  });

  it("renders one PNG per scene with the act colour, reference and verse inside the safe area", async () => {
    const book = await buildVerseCardBook(script, "/work");
    expect(book.id).toBe("bible-abc123");
    expect(book.chapters.map((c) => c.id)).toEqual(["scene1", "scene2"]);
    expect(book.chapters[0]!.imagePath).toMatch(/scene1\.png$/);
    const args = execMock.mock.calls[0]![1] as string[];
    expect(args).toContain(`color=c=${ACT_BACKGROUND.gancho}:s=1080x1920`);
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(execMock).toHaveBeenCalledTimes(2);
    expect(book.chapters[0]).not.toHaveProperty("videoPath");
    expect(vf).toContain("vignette");
    expect(vf).toContain("y=330");
    expect(vf).toContain("y=440");
    expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/scene1_ref\.txt$/), "Lucas 15,11-24");
  });

  it("uses stock footage with a translucent text overlay when a clip matches", async () => {
    fetchMock.mockResolvedValueOnce("/work/scene1.mp4");
    const book = await buildVerseCardBook(script, "/work", "KEY");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "k", expect.stringMatching(/scene1\.mp4$/), "KEY", expect.any(Set));
    expect(book.chapters[0]).toMatchObject({ videoPath: "/work/scene1.mp4" });
    expect(book.chapters[0]!.overlayPath).toMatch(/scene1_overlay\.png$/);
    expect(book.chapters[1]).not.toHaveProperty("overlayPath");
    const overlayArgs = execMock.mock.calls[1]![1] as string[];
    expect(overlayArgs).toContain("color=c=black@0:s=1080x1920,format=rgba");
    expect(overlayArgs[overlayArgs.indexOf("-vf") + 1]).toContain("drawbox=");
  });

  it("shrinks the type for long verses and sizes the scrim to the text", () => {
    const short = buildVerseFilters(["a"], ["/a.txt"], "/r.txt", "f.ttf").join(",");
    const long = buildVerseFilters(Array(6).fill("a"), Array(6).fill("/a.txt"), "/r.txt", "f.ttf").join(",");
    expect(short).toContain("fontsize=76");
    expect(long).toContain("fontsize=64");
    expect(scrimFilter(2)).toContain("replace=1");
    expect(scrimFilter(6)).not.toBe(scrimFilter(2));
  });
});

describe("bible preview", () => {
  const meta = {
    channelId: "santidade-catolica", videoPath: "/out/v.mp4", durationSec: 52.4, reference: "Lucas 15,11-24",
    title: "T | Lucas", description: "d", tags: ["a"], commentText: "Pergunta <b>\n🛒 link",
  };
  const config = { telegramChatId: "42" } as any;

  beforeEach(() => vi.clearAllMocks());

  it("sends the approval card to Telegram and writes the sidecar", async () => {
    getBotMock.mockReturnValue({ api: { sendVideo } });
    const file = await sendBiblePreview(meta, config);
    expect(file).toBe("/out/v.publish.json");
    expect(JSON.parse(writeMock.mock.calls[0]![1])).toMatchObject({ title: "T | Lucas" });
    const [chat, , options] = sendVideo.mock.calls[0]!;
    expect(chat).toBe("42");
    expect(options.caption).toContain("PRÉVIA");
    expect(options.caption).toContain("Pergunta &lt;b&gt;");
    expect(options.caption.length).toBeLessThanOrEqual(1000);
  });

  it("still writes the sidecar when Telegram is not configured", async () => {
    getBotMock.mockReturnValue(null);
    expect(await sendBiblePreview(meta, config)).toBe("/out/v.publish.json");
    expect(sendVideo).not.toHaveBeenCalled();
  });

  it("publishes an approved preview and posts the comment", async () => {
    readMock.mockReturnValue(JSON.stringify(meta));
    uploadMock.mockResolvedValue("https://youtube.com/shorts/vid123");
    expect(await publishBiblePreview("/out/v.publish.json", config)).toBe("https://youtube.com/shorts/vid123");
    expect(uploadMock).toHaveBeenCalledWith("/out/v.mp4", "T | Lucas", "d", config, ["a"]);
    expect(commentMock).toHaveBeenCalledWith("vid123", meta.commentText, config);
  });

  it("skips the comment without a video id and fails loudly when the upload fails", async () => {
    readMock.mockReturnValue(JSON.stringify(meta));
    uploadMock.mockResolvedValueOnce("https://youtube.com/watch");
    await publishBiblePreview("/x.json", config);
    expect(commentMock).not.toHaveBeenCalled();
    uploadMock.mockResolvedValueOnce(null);
    await expect(publishBiblePreview("/x.json", config)).rejects.toThrow("Upload falhou");
  });
});
