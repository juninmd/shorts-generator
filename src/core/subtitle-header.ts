import type { BrandTemplate } from "./brand-template.js";
import { assStyleColor } from "./subtitle-format.js";

const FORMAT = "Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";

/** Weights that are already bold must not also ask libass for Bold (it would fake-embolden them). */
const isHeavyFont = (font: string): boolean => /bold|black|heavy/i.test(font);

/** ASS script header: caption styles follow the brand template; overlay styles are fixed-layout. */
export function buildAssHeader(
  title: string,
  width: number,
  height: number,
  brand: BrandTemplate,
): string {
  const fontSize = Math.round(height * 0.068 * brand.fontScale);
  const outlineWidth = Math.max(3, Math.round(fontSize * 0.055));
  const bold = isHeavyFont(brand.font) ? 0 : -1;
  const center = brand.captionPosition === "center";
  const alignment = center ? 5 : 2;
  const marginV = center ? 0 : Math.round(height * 0.32);
  const text = assStyleColor(brand.textColor);
  const highlight = assStyleColor(brand.highlightColor);
  const outline = assStyleColor(brand.outlineColor);
  const caption = (name: string, primary: string, secondary: string) =>
    `Style: ${name},${brand.font},${fontSize},${primary},${secondary},${outline},&H80000000,${bold},0,0,0,100,100,1,0,1,${outlineWidth},3,${alignment},50,50,${marginV},1`;
  const hookSize = Math.round(height * 0.046);
  return `[Script Info]
Title: ${title.replace(/\r?\n/g, " ")}
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: ${FORMAT}
${caption("Default", text, "&H000000FF")}
${caption("Karaoke", highlight, text)}
${caption("Highlight", highlight, "&H000000FF")}
Style: Watermark,${brand.font},28,&H80FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,3,20,20,20,1
Style: Hook,${brand.font},${hookSize},${highlight},&H000000FF,&HC8000000,&H00000000,${bold},0,0,0,100,100,0,0,3,18,0,8,60,60,${Math.round(height * 0.1)},1
Style: Cta,${brand.font},${Math.round(height * 0.05)},&H00000000,&H000000FF,${highlight},&H00000000,${bold},0,0,0,100,100,0,0,3,16,0,2,60,60,${Math.round(height * 0.14)},1
Style: LowerThird,${brand.font},${Math.round(height * 0.032)},&H00000000,&H000000FF,${highlight},&H00000000,${bold},0,0,0,100,100,0,0,3,14,0,1,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}
