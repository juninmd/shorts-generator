import fs from "node:fs";
import path from "node:path";

/** Per-channel caption/overlay look. Colors are "#RRGGBB". */
export interface BrandTemplate {
  font: string;
  textColor: string;
  highlightColor: string;
  keywordColor: string;
  outlineColor: string;
  fontScale: number;
  captionPosition: "lower" | "center";
  /** Title card in the first seconds. */
  hook: boolean;
  hookSeconds: number;
  /** Closing call to action; empty disables it. */
  cta: string;
  ctaSeconds: number;
  /** Presenter name tag when the speaker is known. */
  lowerThird: boolean;
  emoji: boolean;
  pop: boolean;
}

export const DEFAULT_BRAND: BrandTemplate = {
  font: "sans-serif",
  textColor: "#FFFFFF",
  highlightColor: "#FFFF00",
  keywordColor: "#FF8A00",
  outlineColor: "#000000",
  fontScale: 1,
  captionPosition: "lower",
  hook: true,
  hookSeconds: 2.8,
  cta: "",
  ctaSeconds: 2.5,
  lowerThird: true,
  emoji: false,
  pop: true,
};

function readTemplateFile(file: string): Partial<BrandTemplate> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const slug = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Template resolution: built-in defaults < `<BRAND_TEMPLATES_DIR>/default.json`
 * < the first matching `<dir>/<channel id or name slug>.json` < env switches
 * (CAPTION_EMOJI, HOOK_OVERLAY, LOWER_THIRD, CTA_TEXT).
 */
export function loadBrandTemplate(channelKeys: Array<string | undefined> = []): BrandTemplate {
  const dir = process.env.BRAND_TEMPLATES_DIR || "brand-templates";
  const keys = channelKeys.filter((key): key is string => Boolean(key)).map(slug).filter(Boolean);
  const channelFile = keys.map((key) => path.join(dir, `${key}.json`)).find((file) => fs.existsSync(file));
  const brand: BrandTemplate = {
    ...DEFAULT_BRAND,
    ...readTemplateFile(path.join(dir, "default.json")),
    ...(channelFile ? readTemplateFile(channelFile) : {}),
  };
  if (process.env.CAPTION_EMOJI) brand.emoji = process.env.CAPTION_EMOJI === "true";
  if (process.env.HOOK_OVERLAY) brand.hook = process.env.HOOK_OVERLAY !== "false";
  if (process.env.LOWER_THIRD) brand.lowerThird = process.env.LOWER_THIRD !== "false";
  if (process.env.CTA_TEXT) brand.cta = process.env.CTA_TEXT;
  return brand;
}
