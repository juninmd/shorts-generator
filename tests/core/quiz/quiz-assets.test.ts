import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import { wrapText, normalizePath, rel, esc, ensureFont, prepareBackground, prepareTextFiles } from "../../../src/core/quiz/quiz-assets.service.js";

vi.mock("node:fs");
vi.mock("node:child_process");

describe("quiz-assets.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("wrapText", () => {
    it("should wrap text correctly", () => {
      const text = "This is a very long text that needs to be wrapped.";
      const wrapped = wrapText(text, 10);
      expect(wrapped).toBe("This is a\nvery long\ntext that\nneeds to\nbe\nwrapped.");
    });
  });

  describe("normalizePath", () => {
    it("should normalize path", () => {
      expect(normalizePath("some\\path\\here")).toContain("some/path/here");
    });
  });

  describe("rel", () => {
    it("should return relative path", () => {
      const cwd = process.cwd();
      const p = path.join(cwd, "test/path");
      expect(rel(p)).toBe("test/path");
    });
  });

  describe("esc", () => {
    it("should escape colons", () => {
      const p = path.join(process.cwd(), "C:\\Windows");
      expect(esc(p)).toBe("C\\:XWindows".replace("X", "/")); // Simplification for test
    });
  });

  describe("ensureFont", () => {
    it("should return existing font path if it exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
    });

    it("should try to copy font if it does not exist (win32)", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // fontFile
        .mockReturnValueOnce(true); // src

      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it("should try to copy font if it does not exist (linux, primary)", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      vi.mocked(fs.existsSync)
        .mockImplementation((p) => {
            if (p === "assets/fonts/arialbd.ttf") return false;
            if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return true;
            return false;
        });

      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

     it("should try to copy font if it does not exist (linux, fallback)", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      vi.mocked(fs.existsSync)
        .mockImplementation((p) => {
            if (p === "assets/fonts/arialbd.ttf") return false;
            if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return false;
            if (p === "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") return true;
            return false;
        });

      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it("should handle error during copy", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(fs.copyFileSync).mockImplementation(() => { throw new Error("Copy failed"); });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("should log warning if font could not be copied", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(ensureFont()).toBe("assets/fonts/arialbd.ttf");
      expect(warnSpy).toHaveBeenCalledWith("⚠️ Não foi possível copiar automaticamente a fonte Arial.");
      warnSpy.mockRestore();
    });
  });

  describe("prepareBackground", () => {
    it("should return existing background if it exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(prepareBackground("temp")).toBe(path.resolve("assets/backgrounds/neon.png"));
    });

    it("should return generated background if default doesn't exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const bgPath = prepareBackground("temp");
      expect(bgPath).toBe(path.join("temp", "bg_default.jpg"));
      expect(child_process.spawnSync).toHaveBeenCalled();
    });

    it("should return existing temp background if it exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === path.join("temp", "bg_default.jpg"));
      const bgPath = prepareBackground("temp");
      expect(bgPath).toBe(path.join("temp", "bg_default.jpg"));
      expect(child_process.spawnSync).not.toHaveBeenCalled();
    });
  });

  describe("prepareTextFiles", () => {
    it("should prepare text files correctly", () => {
      const quiz = {
        tema: "A",
        pergunta: "Q?",
        opcoes: { A: "1", B: "2", C: "3", D: "4" },
        correta: "A",
        explicacao: "E"
      } as any;
      const result = prepareTextFiles(quiz, "temp");
      expect(result.qTxtPath).toBe(path.join("temp", "q.txt"));
      expect(result.optTxtPaths.A).toBe(path.join("temp", "optA.txt"));
      expect(fs.writeFileSync).toHaveBeenCalledTimes(5);
    });
  });
});
