import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { wrapText, ensureFont, prepareBackground, prepareTextFiles } from "../../../src/core/quiz/quiz-assets.service.js";
import child_process from "node:child_process";
import path from "node:path";
import * as utils from "../../../src/core/quiz/quiz-assets.service.js";
import { logger } from "../../../src/core/logger.js";

vi.mock("node:child_process");
vi.mock("node:fs");
vi.mock("../../../src/core/logger.js", () => ({ logger: { warn: vi.fn() } }));

describe("quiz-assets.service", () => {
  describe("wrapText", () => {
    it("wraps text correctly based on maxLen", () => {
      expect(wrapText("abc def ghi", 4)).toBe("abc\ndef\nghi");
      expect(wrapText("abc def ghi", 7)).toBe("abc def\nghi");
      expect(wrapText("abc def ghi", 20)).toBe("abc def ghi");
      expect(wrapText("", 4)).toBe("");
    });
  });

  describe("ensureFont", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("returns existing font if it exists", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
    });

    it("copies font on win32", () => {
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "C:/Windows/Fonts/arialbd.ttf") return true;
        return false;
      });
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      ensureFont();
      expect(fs.mkdirSync).toHaveBeenCalledWith("assets/fonts", { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith("C:/Windows/Fonts/arialbd.ttf", "assets/fonts/arialbd.ttf");
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it("copies font on linux", () => {
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return true;
        return false;
      });
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      ensureFont();
      expect(fs.copyFileSync).toHaveBeenCalledWith("/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf", "assets/fonts/arialbd.ttf");
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it("tries alternatives on linux if msttcorefonts not found", () => {
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") return true;
        return false;
      });
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      ensureFont();
      expect(fs.copyFileSync).toHaveBeenCalledWith("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "assets/fonts/arialbd.ttf");
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it("warns if copy fails", () => {
        vi.spyOn(fs, "existsSync").mockImplementation((p) => {
          if (p === "assets/fonts/arialbd.ttf") return false;
          if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return true;
          return false;
        });
        vi.spyOn(fs, "copyFileSync").mockImplementation(() => { throw new Error("Copy error"); });
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux' });
        ensureFont();
        expect(logger.warn).toHaveBeenCalledWith(expect.anything(), "Falha ao copiar a fonte");
        expect(logger.warn).toHaveBeenCalledWith("Não foi possível copiar automaticamente a fonte Arial.");
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe("prepareBackground", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("renders gradient video and returns it", () => {
      vi.spyOn(child_process, "spawnSync").mockReturnValue({ status: 0, stderr: Buffer.from(""), stdout: Buffer.from(""), pid: 1, signal: null, output: [] });
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
          if (p.toString().endsWith("bg_gradient.mp4")) return true;
          return false;
      });
      const bg = prepareBackground("temp", 60);
      expect(bg.endsWith("bg_gradient.mp4")).toBe(true);
      expect(child_process.spawnSync).toHaveBeenCalled();
    });

    it("falls back to neon.png if video render fails", () => {
      vi.spyOn(child_process, "spawnSync").mockReturnValue({ status: 1, stderr: Buffer.from("error"), stdout: Buffer.from(""), pid: 1, signal: null, output: [] });
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
          if (p.toString().endsWith("neon.png")) return true;
          return false;
      });
      const bg = prepareBackground("temp", 60);
      expect(bg.endsWith("neon.png")).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(expect.anything(), "Fundo animado falhou — usando fallback estático");
    });

    it("falls back to bg_default.jpg if neon.png missing", () => {
        vi.spyOn(child_process, "spawnSync").mockReturnValue({ status: 1, stderr: Buffer.from("error"), stdout: Buffer.from(""), pid: 1, signal: null, output: [] });
        vi.spyOn(fs, "existsSync").mockImplementation((p) => {
            if (p.toString().endsWith("bg_default.jpg")) return true;
            return false;
        });
        const bg = prepareBackground("temp", 60);
        expect(bg.endsWith("bg_default.jpg")).toBe(true);
    });

    it("generates fallback image using ffmpeg if missing", () => {
        vi.spyOn(child_process, "spawnSync").mockReturnValue({ status: 1, stderr: Buffer.from("error"), stdout: Buffer.from(""), pid: 1, signal: null, output: [] });
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        const bg = prepareBackground("temp", 60);
        expect(bg.endsWith("bg_default.jpg")).toBe(true);
        expect(child_process.spawnSync).toHaveBeenCalledTimes(2); // First gradient, second fallback image
    });
  });

  describe("prepareTextFiles", () => {
    it("creates text files for questions, options, outro and hook", () => {
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      const quiz = {
        tema: "test",
        titulo_youtube: "title",
        hook: "hook text",
        perguntas: [
          { pergunta: "q1", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" }
        ],
        fato_curioso: "curious fact",
        tags: []
      };

      const res = prepareTextFiles(quiz, "temp");
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1 + 4 + 1 + 1); // 1 q + 4 opt + 1 outro + 1 hook
      expect(res.questions.length).toBe(1);
      expect(res.outroTxtPath.endsWith("outro.txt")).toBe(true);
      expect(res.hookTxtPath.endsWith("hook.txt")).toBe(true);
    });
  });

  describe("normalizePath, rel, esc", () => {
      it("normalizes path", () => {
          expect(utils.normalizePath("a\\b")).toContain("a/b");
      });
      it("escapes path", () => {
          expect(utils.esc("C:/a")).toBe(utils.rel("C:/a").replace(/:/g, "\\:"));
      });
  });
});
