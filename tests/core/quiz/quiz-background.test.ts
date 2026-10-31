import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import {
  QUIZ_BACKGROUND_DIR,
  pickBackgroundImage,
  prepareQuizBackground,
} from "../../../src/core/quiz/quiz-background.js";
import { logger } from "../../../src/core/logger.js";

vi.mock("node:fs");
vi.mock("node:child_process");
vi.mock("../../../src/core/quiz/quiz-assets.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/quiz/quiz-assets.service.js")>();
  return { ...actual, normalizePath: (p: string) => p };
});
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const withImages = (names: string[]) => {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readdirSync).mockReturnValue(names as any);
  vi.spyOn(Math, "random").mockReturnValue(0);
};

describe("quiz background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("pickBackgroundImage", () => {
    it("picks an image only, ignoring other files", () => {
      withImages(["b.png", "a.jpg", "notes.txt", "clip.mp4"]);
      expect(pickBackgroundImage("art")).toBe(path.join("art", "a.jpg"));
      expect(fs.readdirSync).toHaveBeenCalledWith("art");
    });

    it("returns null without the folder or without images", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(pickBackgroundImage("art")).toBeNull();

      withImages(["notes.txt"]);
      expect(pickBackgroundImage("art")).toBeNull();

      expect(pickBackgroundImage("")).toBeNull();
    });

    it("honours QUIZ_BACKGROUND_DIR", () => {
      vi.stubEnv("QUIZ_BACKGROUND_DIR", "custom-art");
      withImages(["x.webp"]);
      expect(pickBackgroundImage()).toBe(path.join("custom-art", "x.webp"));
    });
  });

  describe("prepareQuizBackground", () => {
    it("prefers the hand-made art and says it already has a text area", () => {
      withImages(["quiz-02.png"]);

      const background = prepareQuizBackground("tmp", 30);

      expect(background).toEqual({
        path: path.join(QUIZ_BACKGROUND_DIR, "quiz-02.png"),
        kind: "image",
        hasPanel: true,
        source: "quiz-02.png",
      });
      expect(child_process.spawnSync).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ image: background.path }), expect.any(String));
    });

    it("renders a drifting gradient when there is no art", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join("tmp", "bg_gradient.mp4"));

      const background = prepareQuizBackground("tmp", 30);

      expect(background).toEqual({
        path: path.join("tmp", "bg_gradient.mp4"),
        kind: "video",
        hasPanel: false,
        source: "gradient",
      });
      const args = vi.mocked(child_process.spawnSync).mock.calls[0]![1] as string[];
      expect(args.join(" ")).toContain("gradients=s=1188x2112");
      expect(args.join(" ")).toContain("vignette=PI/5");
      expect(args).toEqual(expect.arrayContaining(["-crf", "18"]));
    });

    it("falls back to the static image when the gradient render fails", () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: Buffer.from("boom") } as any);
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes("neon.png"));

      const background = prepareQuizBackground("tmp", 30);

      expect(background).toEqual({
        path: path.resolve("assets/backgrounds/neon.png"),
        kind: "image",
        hasPanel: false,
        source: "neon.png",
      });
      expect(logger.warn).toHaveBeenCalledWith({ stderr: "boom" }, expect.stringContaining("fallback"));
    });

  it("reuses a fallback image that was already generated", () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: Buffer.from("boom") } as any);
      const fallback = path.join("tmp", "bg_default.jpg");
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === fallback);

      const background = prepareQuizBackground("tmp", 60);

      expect(background).toMatchObject({ path: fallback, kind: "image" });
      expect(child_process.spawnSync).toHaveBeenCalledTimes(1);
    });

    it("generates a last-resort image when neon.png is missing too", () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: undefined } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const background = prepareQuizBackground("tmp", 60);

      expect(background.path).toBe(path.join("tmp", "bg_default.jpg"));
      expect(background.kind).toBe("image");
      expect(vi.mocked(child_process.spawnSync).mock.calls[1]![1]).toEqual([
        "-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1", "-frames:v", "1",
        expect.any(String),
      ]);
    });
  });
});
