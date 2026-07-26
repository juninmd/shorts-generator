import type { ShortClip, TranscriptWord } from "../types.js";

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function groupWords(words: TranscriptWord[], targetSize = 4): TranscriptWord[][] {
  const phrases: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    current.push(word);
    const next = words[index + 1];
    const gap = next ? next.start - word.end : 0;
    const naturalPause = gap > 0.3;
    const hardPause = gap > 0.65;
    if (index === words.length - 1 || hardPause
      || (current.length >= targetSize && naturalPause)
      || current.length >= targetSize + 1) {
      phrases.push(current);
      current = [];
    }
  }
  const tail = phrases.at(-1);
  const previous = phrases.at(-2);
  if (tail && previous && tail.length < 3
    && tail[0]!.start - previous.at(-1)!.end <= 0.3) {
    const combined = [...previous, ...tail];
    const splitAt = Math.ceil(combined.length / 2);
    phrases.splice(-2, 2, combined.slice(0, splitAt), combined.slice(splitAt));
  }
  return phrases;
}

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
Style: Highlight,sans-serif,${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1
Style: Watermark,sans-serif,28,&H80FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,3,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const watermark = watermarkText
    ? `Dialogue: 0,${formatASSTime(0)},${formatASSTime(clip.duration)},Watermark,,0,0,0,,${escapeAssText(watermarkText)}\n`
    : "";
  const events = wordEvents(clip.words.length > 0 ? clip.words : estimatedWords(clip));
  return `${header}${watermark}${events}\n`;
}
