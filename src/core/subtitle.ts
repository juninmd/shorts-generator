import type { ShortClip, TranscriptWord } from "../types.js";
import { karaokeEvents } from "./subtitle-karaoke.js";
import {
  escapeAssText, formatASSTime, groupWords, resolveSubtitleStyle, type SubtitleStyle,
} from "./subtitle-format.js";

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

export function generateASSSubtitles(
  clip: ShortClip,
  width = 1080,
  height = 1920,
  watermarkText?: string,
  style: SubtitleStyle = resolveSubtitleStyle(),
): string {
  const fontSize = Math.round(height * 0.058);
  const marginV = Math.round(height * 0.32);
  const header = `[Script Info]
Title: ${clip.title.replace(/\r?\n/g, " ")}
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,sans-serif,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1
Style: Karaoke,sans-serif,${fontSize},&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1
Style: Highlight,sans-serif,${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1
Style: Watermark,sans-serif,28,&H80FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,3,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const watermark = watermarkText
    ? `Dialogue: 0,${formatASSTime(0)},${formatASSTime(clip.duration)},Watermark,,0,0,0,,${escapeAssText(watermarkText)}\n`
    : "";
  const words = clip.words.length > 0 ? clip.words : estimatedWords(clip);
  const events = style === "karaoke" ? karaokeEvents(words) : wordEvents(words);
  return `${header}${watermark}${events}\n`;
}
