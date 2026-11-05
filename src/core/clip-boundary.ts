
import type { TranscriptSegment, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { sentenceStartIndex } from "./sentence-start.js";

interface RawClipTimestamps {
    startTime: number;
    endTime: number;
}

/**
 * Snap clip timestamps to the nearest Whisper segment (sentence) boundaries.
 * 
 * AGGRESSIVE SNAP: Prioritizes segments ending with strong punctuation (., !, ?).
 */
export function snapToSentenceBoundaries(
    clip: RawClipTimestamps,
    segments: TranscriptSegment[],
    config: PipelineConfig,
): { startTime: number; endTime: number } {
    if (segments.length === 0) {
        return { startTime: clip.startTime, endTime: clip.endTime };
    }

    // 1. Find the best START (beginning of a segment)
    const snappedStart = findBestSegmentStart(clip.startTime, segments);
    
    // 2. Find the best END (end of a segment, preferring strong punctuation)
    const snappedEnd = findBestSegmentEnd(clip.endTime, segments);

    let finalStart = snappedStart;
    let finalEnd = snappedEnd;

    // Ensure end > start
    if (finalEnd <= finalStart) {
        return { startTime: clip.startTime, endTime: clip.endTime };
    }

    // 3. Respect duration constraints (minShortDuration–maxShortDuration, default 15–59s)
    let duration = finalEnd - finalStart;

    if (duration < config.minShortDuration) {
        // Expand end first, then start to meet min duration
        const expanded = expandToMeetMinDuration(finalStart, finalEnd, segments, config.minShortDuration);
        finalStart = expanded.startTime;
        finalEnd = expanded.endTime;
    }

    if (finalEnd - finalStart > config.maxShortDuration) {
        // Shrink from the end to meet max duration
        finalEnd = shrinkToMeetMaxDuration(finalStart, segments, config.maxShortDuration);
    }

    logger.debug(
        {
            original: { start: clip.startTime, end: clip.endTime },
            snapped: { start: finalStart, end: finalEnd },
            finalDuration: finalEnd - finalStart,
        },
        "Snapped clip to strong sentence boundaries",
    );

    return { startTime: finalStart, endTime: finalEnd };
}

function isStrongPunctuation(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?");
}

/**
 * Snaps to the start of the sentence containing the target time.
 */
function findBestSegmentStart(targetTime: number, segments: TranscriptSegment[]): number {
    let index = segments.findIndex((seg) => seg.start <= targetTime && targetTime < seg.end);
    if (index < 0) index = segments.findIndex((seg) => seg.start >= targetTime);
    if (index < 0) return segments[0].start;
    // Open on the beginning of the sentence, not a mid-thought Whisper split.
    return segments[sentenceStartIndex(segments, index)]!.start;
}

/**
 * Snaps to the end of a segment, actively searching for strong punctuation
 * within a 5-second window of the target time.
 */
function findBestSegmentEnd(targetTime: number, segments: TranscriptSegment[]): number {
    // Look for a segment near the target time that ends with punctuation
    const candidates = segments.filter(
        (s) => s.end >= targetTime - 5 && s.end <= targetTime + 5
    );

    // Prefer the latest candidate that has strong punctuation
    const strongMatch = [...candidates].reverse().find((s) => isStrongPunctuation(s.text));
    if (strongMatch) return strongMatch.end;

    // Fallback: just use the nearest segment end
    for (const seg of segments) {
        if (seg.end >= targetTime) return seg.end;
    }
    return segments[segments.length - 1].end;
}

function expandToMeetMinDuration(
    start: number,
    end: number,
    segments: TranscriptSegment[],
    minDuration: number,
): { startTime: number; endTime: number } {
    let currentStart = start;
    let currentEnd = end;

    const segsAfter = segments.filter((s) => s.start >= currentEnd);
    const segsBefore = segments.filter((s) => s.end <= currentStart);

    // Prioritize expanding at segments with strong punctuation
    while (currentEnd - currentStart < minDuration && segsAfter.length > 0) {
        const next = segsAfter.shift()!;
        currentEnd = next.end;
        if (isStrongPunctuation(next.text)) break; // Stop as soon as we hit a full sentence
    }

    while (currentEnd - currentStart < minDuration && segsBefore.length > 0) {
        const prev = segsBefore.pop()!;
        currentStart = prev.start;
    }

    return { startTime: currentStart, endTime: currentEnd };
}

function shrinkToMeetMaxDuration(
    start: number,
    segments: TranscriptSegment[],
    maxDuration: number,
): number {
    const maxEnd = start + maxDuration;
    const candidates = segments.filter((s) => s.start >= start && s.end <= maxEnd);

    if (candidates.length === 0) return maxEnd;

    // Prefer the last segment that ends with strong punctuation within the limit
    const strongMatch = [...candidates].reverse().find((s) => isStrongPunctuation(s.text));
    return strongMatch ? strongMatch.end : candidates[candidates.length - 1].end;
}
