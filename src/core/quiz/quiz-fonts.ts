import fs from "node:fs";
import { logger } from "../logger.js";

/** Heavy geometric sans bundled with the repo (OFL); the caption engine already ships it. */
export const BUNDLED_FONT = "assets/fonts/Poppins-ExtraBold.ttf";

/** Copies a bold platform font into `assets/fonts` when the bundled one is absent. */
export const ensureFont = (): string => {
  const fontFile = "assets/fonts/arialbd.ttf";
  if (!fs.existsSync(fontFile)) {
    fs.mkdirSync("assets/fonts", { recursive: true });
    const tryCopy = (src: string) => {
      try {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, fontFile);
          return true;
        }
      } catch (e) {
        logger.warn({ err: e, src }, "Falha ao copiar a fonte");
      }
      return false;
    };

    let copied = false;
    if (process.platform === "win32") {
      copied = tryCopy("C:/Windows/Fonts/arialbd.ttf");
    } else {
      copied = tryCopy("/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf");
      if (!copied) {
        const candidates = [
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        ];
        for (const c of candidates) {
          if (tryCopy(c)) {
            copied = true;
            break;
          }
        }
      }
    }
    if (!copied) {
      logger.warn("Não foi possível copiar automaticamente a fonte Arial.");
    }
  }
  return fontFile;
};

/**
 * Font for the quiz frame: the bundled Poppins when it is there (reads better on
 * video at these sizes than Arial), otherwise the platform Arial `ensureFont()` copies.
 */
export const resolveQuizFont = (): string => (fs.existsSync(BUNDLED_FONT) ? BUNDLED_FONT : ensureFont());
