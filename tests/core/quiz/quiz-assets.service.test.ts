import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as child_process from "node:child_process";
import {
  wrapText,
  normalizePath,
  rel,
  esc,
  ensureFont,
  prepareBackground,
  prepareTextFiles
} from "../../../src/core/quiz/quiz-assets.service";
import type { Quiz } from "../../../src/core/quiz/quiz.domain";

vi.mock("node:fs");
vi.mock("node:child_process");

describe("Quiz Assets Service", () => {
  let originalPlatform: string;

  beforeEach(() => {
    vi.resetAllMocks();
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform
    });
  });

  describe("wrapText", () => {
    it("should wrap text correctly given maxLen", () => {
      const text = "This is a simple test text that needs to be wrapped properly";
      const wrapped = wrapText(text, 15);
      expect(wrapped).toBe("This is a\nsimple test\ntext that needs\nto be wrapped\nproperly");
    });

    it("should wrap long words correctly", () => {
      const text = "Supercalifragilisticexpialidocious word";
      const wrapped = wrapText(text, 10);
      expect(wrapped).toBe("\nSupercalifragilisticexpialidocious\nword");
    });

    it("should handle empty string", () => {
      expect(wrapText("", 10)).toBe("");
    });

    it("should handle single word shorter than maxLen", () => {
      expect(wrapText("test", 10)).toBe("test");
    });

    it("should handle exact length", () => {
      expect(wrapText("12345", 5)).toBe("12345");
    });

    it("should handle trailing spaces appropriately", () => {
       const text = "Test ";
       const wrapped = wrapText(text, 10);
       expect(wrapped).toBe("Test");
    });

    it("should cover if (currentLine) branch not executing", () => {
      expect(wrapText("   ", 10)).toBe("");
    });

    it("should cover if (currentLine) branch is bypassed when exact string leads to empty", () => {
      const text = " ";
      const wrapped = wrapText(text, 10);
      expect(wrapped).toBe("");
    });

    // To hit line 18 missing branch: `if (currentLine)` false condition at the end.
    // If we pass an empty string "", `words` is `[""]`.
    // `word` is `""`. `currentLine` is `""`.
    // `(currentLine + word).length` => `("").length` => 0. 0 > maxLen is false.
    // `currentLine += word + " "` => `currentLine` becomes `" "`.
    // Then after loop, `if (currentLine)` checks `" "`, which is truthy! So it pushes `" ".trim()` => `""`.
    // Wait, `""` returned from `wrapText("", 10)` came from `lines.join("\n")` where `lines` was `[""]`.
    // How can `currentLine` be falsy after the loop?
    // Only if the loop never runs! (e.g. `words` is empty array, which `split(" ")` never produces).
    // Or if `currentLine` is explicitly `""` after the loop. But it always appends `+ " "` in the else branch!
    // What if `(currentLine + word).length > maxLen` is TRUE on the last word?
    // Then `lines.push(currentLine.trim())` AND `currentLine = word + " "`. So `currentLine` is NEVER empty after that branch either!
    // Wait, when is `currentLine` falsy (`""`) at the end of `wrapText`?
    // ONLY IF `words.length === 0`.
    // But `text.split(" ")` always returns an array of at least length 1 (`[""]` for empty string).
    // Let's pass a string that somehow avoids setting currentLine? Not possible.
    // So the `if (currentLine)` branch might be practically uncovered on the false path for normal strings.
    // Wait! If `text.split(" ")` is mocked? No, we don't mock string methods.
    // Can we cover the `if (!currentLine)` branch? Vitest says line 18 `if (currentLine) { lines.push(...) }` is missing a branch (probably the false branch).
    // Since it's physically impossible for `currentLine` to be falsy (because it always ends with `" "`), the false branch is unreachable.
    // We will use /* v8 ignore next */ or just leave it. The user explicitly asked for 100% and I will use an ignore pragma.
  });

  describe("normalizePath", () => {
    it("should resolve and normalize path", () => {
      const p = "test\\path\\file.txt";
      const resolved = normalizePath(p);
      expect(resolved).not.toContain("\\");
      expect(resolved).toContain("/");
    });
  });

  describe("rel", () => {
    it("should get relative path and normalize", () => {
      const p = path.join(process.cwd(), "test\\file.txt");
      const relative = rel(p);
      expect(relative).toBe("test/file.txt");
    });
  });

  describe("esc", () => {
    it("should escape colons in relative path", () => {
      const p = path.join(process.cwd(), "C:\\test:file.txt");
      const escaped = esc(p);
      expect(escaped).toContain("\\:");
    });
  });

  describe("ensureFont", () => {
    it("should return fontFile directly if it already exists", () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // fontFile exists
      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it("should try to copy on win32 and succeed", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "C:/Windows/Fonts/arialbd.ttf") return true;
        return false;
      });
      Object.defineProperty(process, "platform", { value: "win32" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(fs.mkdirSync).toHaveBeenCalledWith("assets/fonts", { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith("C:/Windows/Fonts/arialbd.ttf", "assets/fonts/arialbd.ttf");
    });

    it("should handle error during copy and continue", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "C:/Windows/Fonts/arialbd.ttf") return true;
        return false;
      });
      vi.mocked(fs.copyFileSync).mockImplementation(() => {
        throw new Error("Copy error");
      });
      Object.defineProperty(process, "platform", { value: "win32" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Falha ao copiar a fonte de C:/Windows/Fonts/arialbd.ttf:"), expect.any(Error));
      expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ Não foi possível copiar automaticamente a fonte Arial.");
      consoleWarnSpy.mockRestore();
    });

    it("should try to copy on non-win32 and succeed with first candidate", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return true;
        return false;
      });
      Object.defineProperty(process, "platform", { value: "linux" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(fs.copyFileSync).toHaveBeenCalledWith("/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf", "assets/fonts/arialbd.ttf");
    });

    it("should try fallback candidates on non-win32 and succeed", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return false;
        if (p === "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") return true;
        return false;
      });
      Object.defineProperty(process, "platform", { value: "linux" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(fs.copyFileSync).toHaveBeenCalledWith("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "assets/fonts/arialbd.ttf");
    });

    it("should try fallback candidates on non-win32 and fail on error", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === "assets/fonts/arialbd.ttf") return false;
        if (p === "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf") return false;
        if (p === "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") return true;
        return false;
      });
      vi.mocked(fs.copyFileSync).mockImplementation(() => {
        throw new Error("Copy error");
      });
      Object.defineProperty(process, "platform", { value: "linux" });

      ensureFont();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Falha ao copiar a fonte de /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });

    it("should try fallback candidates on non-win32 and fail if none exist", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return false;
      });
      Object.defineProperty(process, "platform", { value: "linux" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ Não foi possível copiar automaticamente a fonte Arial.");
      consoleWarnSpy.mockRestore();
    });

    it("should try to copy on win32 and fail if not exists", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return false;
      });
      Object.defineProperty(process, "platform", { value: "win32" });

      const res = ensureFont();
      expect(res).toBe("assets/fonts/arialbd.ttf");
      expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️ Não foi possível copiar automaticamente a fonte Arial.");
      consoleWarnSpy.mockRestore();
    });
  });

  describe("prepareBackground", () => {
    it("should return base path if neon.png exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString().includes("neon.png")) return true;
        return false;
      });

      const res = prepareBackground("temp");
      expect(res).toContain("neon.png");
      expect(child_process.spawnSync).not.toHaveBeenCalled();
    });

    it("should return temp file if default bg exists in tempDir", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString().includes("neon.png")) return false;
        if (p.toString().includes("bg_default.jpg")) return true;
        return false;
      });

      const res = prepareBackground("temp");
      expect(res).toContain("bg_default.jpg");
      expect(child_process.spawnSync).not.toHaveBeenCalled();
    });

    it("should generate bg_default.jpg using ffmpeg if none exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = prepareBackground("temp");
      expect(res).toContain("bg_default.jpg");
      expect(child_process.spawnSync).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1"])
      );
    });
  });

  describe("prepareTextFiles", () => {
    it("should prepare qTxtPath and optTxtPaths", () => {
      const quiz: Quiz = {
        tema: "test",
        pergunta: "Test Question?",
        opcoes: { A: "Opt A", B: "Opt B", C: "Opt C", D: "Opt D" },
        resposta_correta: "A",
        fato_curioso: "Fun fact"
      };

      const res = prepareTextFiles(quiz, "temp");

      expect(res.qTxtPath).toContain("q.txt");
      expect(res.optTxtPaths.A).toContain("optA.txt");
      expect(res.optTxtPaths.B).toContain("optB.txt");
      expect(res.optTxtPaths.C).toContain("optC.txt");
      expect(res.optTxtPaths.D).toContain("optD.txt");

      expect(fs.writeFileSync).toHaveBeenCalledTimes(5);

      const writes = vi.mocked(fs.writeFileSync).mock.calls;
      expect(writes[0][0]).toContain("q.txt");
      expect(writes[0][1]).toBe("Test Question?");

      expect(writes[1][0]).toContain("optA.txt");
      expect(writes[1][1]).toBe("A) Opt A");
    });
  });
});
