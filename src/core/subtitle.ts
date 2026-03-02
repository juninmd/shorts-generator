import type { ShortClip, TranscriptWord } from "../types.js";

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle file content with
 * word-by-word highlight effect — similar to CapCut/TikTok style captions.
 */
export function generateASSSubtitles(
  clip: ShortClip,
  width: number = 1080,
  height: number = 1920,
): string {
  const playResX = width;
  const playResY = height;

  // Style definitions
  const header = `[Script Info]
Title: ${clip.title}
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,200,1
Style: Highlight,Arial Black,72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = generateWordByWordEvents(clip);
  return header + events;
}

/**
 * Generate phrase-based subtitle events with word highlighting.
 * Groups words into readable phrases (3-6 words) and shows them
 * with the current word highlighted.
 */
function generateWordByWordEvents(clip: ShortClip): string {
  const words = clip.words;
  if (words.length === 0) {
    // Fallback to segment-based subtitles
    return generateSegmentEvents(clip);
  }

  const phrases = groupWordsIntoPhrases(words, 4);
  const lines: string[] = [];

  for (const phrase of phrases) {
    const phraseStart = phrase[0]!.start;
    const phraseEnd = phrase[phrase.length - 1]!.end;

    // Show phrase with word-by-word highlight
    for (let i = 0; i < phrase.length; i++) {
      const word = phrase[i]!;
      const wordStart = word.start;
      const wordEnd = i < phrase.length - 1 ? phrase[i + 1]!.start : phraseEnd;

      // Build text with highlight on current word
      const textParts = phrase.map((w, idx) => {
        if (idx === i) {
          return `{\\c&H00FFFF&\\b1}${w.word}{\\c&HFFFFFF&\\b0}`;
        }
        return w.word;
      });

      const text = textParts.join(" ");
      const start = formatASSTime(wordStart);
      const end = formatASSTime(wordEnd);

      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Fallback: generate subtitle events from transcript segments.
 */
function generateSegmentEvents(clip: ShortClip): string {
  const lines: string[] = [];

  for (const seg of clip.transcript) {
    const start = formatASSTime(seg.start);
    const end = formatASSTime(seg.end);
    // Split long segments into multiple lines
    const text = seg.text.length > 40
      ? splitIntoLines(seg.text, 35).join("\\N")
      : seg.text;
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Group words into readable phrases of approximately `size` words,
 * breaking at natural pause points when possible.
 */
function groupWordsIntoPhrases(
  words: TranscriptWord[],
  targetSize: number,
): TranscriptWord[][] {
  const phrases: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  for (let i = 0; i < words.length; i++) {
    current.push(words[i]!);

    const isLast = i === words.length - 1;
    const nextWord = words[i + 1];
    const hasNaturalPause =
      nextWord && nextWord.start - words[i]!.end > 0.3;

    if (
      isLast ||
      (current.length >= targetSize && hasNaturalPause) ||
      current.length >= targetSize + 2
    ) {
      phrases.push([...current]);
      current = [];
    }
  }

  if (current.length > 0) {
    phrases.push(current);
  }

  return phrases;
}

/**
 * Format seconds to ASS timestamp: H:MM:SS.CC
 */
function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Split text into lines of approximately maxChars length.
 */
function splitIntoLines(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }

  if (current) lines.push(current.trim());
  return lines;
}
