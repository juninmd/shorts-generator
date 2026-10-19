import type { ShortClip, TranscriptWord } from "../types.js";
import { loadBrandTemplate, type BrandTemplate } from "./brand-template.js";
import { pickEmphasis } from "./caption-emphasis.js";
import { buildAssHeader } from "./subtitle-header.js";
import { karaokeEvents } from "./subtitle-karaoke.js";
import {
  escapeAssText, formatASSTime, groupWords, resolveSubtitleStyle, type SubtitleStyle,
} from "./subtitle-format.js";
import { ctaEvent, hookEvent, lowerThirdEvent } from "./subtitle-overlays.js";

function wordEvents(words: TranscriptWord[]): string {
  return groupWords(words).flatMap((phrase) => phrase.map((word, index) => {
    const end = index < phrase.length - 1 ? phrase[index + 1]!.start : phrase.at(-1)!.end;
    const text = phrase.map((item, itemIndex) => {
      const safeWord = escapeAssText(item.word);
      return itemIndex === index
        ? `{\\c&H00FFFF&\\b1}${safeWord}{\\c&HFFFFFF&\\b0}`
        : safeWord;
    }).join(" ");
    return `Dialogue: 0,${formatASSTime(word.start)},${formatASSTime(end)},Default,,0,0,0,,${text}`;
  })).join("\n");
}

function speechWeight(word: string): number {
  const vowelGroups = word.normalize("NFD").match(/[aeiouy]+/gi)?.length ?? 1;
  const pause = /[.!?]["']?$/.test(word) ? 0.8 : /[,;:]["']?$/.test(word) ? 0.35 : 0;
  return vowelGroups + pause;
}

function estimatedWords(clip: ShortClip): TranscriptWord[] {
  return clip.transcript.flatMap((segment) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    const weights = words.map(speechWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let consumedWeight = 0;
    return words.map((word, index) => {
      const start = segment.start
        + (segment.end - segment.start) * (consumedWeight / totalWeight);
      consumedWeight += weights[index]!;
      const end = index === words.length - 1
        ? segment.end
        : segment.start + (segment.end - segment.start) * (consumedWeight / totalWeight);
      return { word, start, end };
    });
  });
}

/** Title card, presenter name tag and closing CTA, as enabled by the brand template. */
function overlayEvents(clip: ShortClip, height: number, brand: BrandTemplate): string[] {
  return [
    brand.hook && clip.title ? hookEvent(clip.title, brand) : "",
    brand.lowerThird && clip.presenter ? lowerThirdEvent(clip.presenter, height) : "",
    brand.cta && clip.duration > 8 ? ctaEvent(clip.duration, brand) : "",
  ].filter(Boolean);
}

export function generateASSSubtitles(
  clip: ShortClip,
  width = 1080,
  height = 1920,
  watermarkText?: string,
  style: SubtitleStyle = resolveSubtitleStyle(),
  brand: BrandTemplate = loadBrandTemplate(),
): string {
  const watermark = watermarkText
    ? `Dialogue: 0,${formatASSTime(0)},${formatASSTime(clip.duration)},Watermark,,0,0,0,,${escapeAssText(watermarkText)}\n`
    : "";
  const words = clip.words.length > 0 ? clip.words : estimatedWords(clip);
  const events = style === "karaoke"
    ? karaokeEvents(words, { brand, emphasis: pickEmphasis(words, clip.keywords) })
    : wordEvents(words);
  const overlays = overlayEvents(clip, height, brand).map((line) => `${line}\n`).join("");
  return `${buildAssHeader(clip.title, width, height, brand)}${watermark}${overlays}${events}\n`;
}
