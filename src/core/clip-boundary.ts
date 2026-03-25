import type { TranscriptSegment, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

interface RawClipTimestamps {
    startTime: number;
    endTime: number;
}

/**
 * Snap clip timestamps to the nearest Whisper segment (sentence) boundaries.
 *
 * - Start: snaps to the beginning of the nearest segment at or after startTime.
 * - End: snaps to the end of the nearest segment at or before endTime.
 * - Respects min/max duration constraints, expanding slightly if needed.
 */
export function snapToSentenceBoundaries(
    clip: RawClipTimestamps,
    segments: TranscriptSegment[],
    config: PipelineConfig,
): { startTime: number; endTime: number } {
    if (segments.length === 0) {
        return { startTime: clip.startTime, endTime: clip.endTime };
    }

    const snappedStart = findClosestSegmentStart(clip.startTime, segments);
    const snappedEnd = findClosestSegmentEnd(clip.endTime, segments);

    let finalStart = snappedStart;
    let finalEnd = snappedEnd;

    // Ensure end > start
    if (finalEnd <= finalStart) {
        return { startTime: clip.startTime, endTime: clip.endTime };
    }

    const duration = finalEnd - finalStart;

    // If too short after snapping, try expanding outward
    if (duration < config.minShortDuration) {
        const expanded = expandToMeetMinDuration(
            finalStart, finalEnd, segments, config.minShortDuration,
        );
        finalStart = expanded.startTime;
        finalEnd = expanded.endTime;
    }

    // If too long after snapping, shrink inward from end
    if (finalEnd - finalStart > config.maxShortDuration) {
        finalEnd = shrinkToMeetMaxDuration(
            finalStart, segments, config.maxShortDuration,
        );
    }

    logger.debug(
        {
            original: { start: clip.startTime, end: clip.endTime },
            snapped: { start: finalStart, end: finalEnd },
        },
        "Snapped clip to sentence boundaries",
    );

    return { startTime: finalStart, endTime: finalEnd };
}

/**
 * Find the start of the sentence that contains or immediately follows the target time.
 *
 * - If target is inside a segment → snap to that segment's start (clean sentence open).
 * - If target is in a gap between sentences → snap to the next sentence start.
 * This guarantees the clip never begins mid-sentence.
 */
function findClosestSegmentStart(
    targetTime: number,
    segments: TranscriptSegment[],
): number {
    // Prefer the segment that contains the target time (exclusive end boundary —
    // if target == seg.end we're at the sentence boundary, so use the next sentence)
    for (const seg of segments) {
        if (seg.start <= targetTime && targetTime < seg.end) return seg.start;
    }
    // Target is in a gap — use the next sentence start
    for (const seg of segments) {
        if (seg.start >= targetTime) return seg.start;
    }
    // Target is beyond all segments — use the last sentence start
    return segments[segments.length - 1]!.start;
}

/**
 * Find the end of the first segment that ends AT OR AFTER the target time.
 * This guarantees the clip always ends at a complete sentence — never mid-phrase.
 */
function findClosestSegmentEnd(
    targetTime: number,
    segments: TranscriptSegment[],
): number {
    for (const seg of segments) {
        if (seg.end >= targetTime) return seg.end;
    }
    // Target is beyond all segments — use the last segment's end
    return segments[segments.length - 1]!.end;
}

/**
 * Expand boundaries outward to meet minimum duration.
 * Tries adding one segment before start or after end.
 */
function expandToMeetMinDuration(
    start: number,
    end: number,
    segments: TranscriptSegment[],
    minDuration: number,
): { startTime: number; endTime: number } {
    let currentStart = start;
    let currentEnd = end;

    // Find segments just outside current range
    const segsBefore = segments.filter((s) => s.end <= currentStart);
    const segsAfter = segments.filter((s) => s.start >= currentEnd);

    // Prefer expanding at the end first (more natural)
    while (currentEnd - currentStart < minDuration && segsAfter.length > 0) {
        const next = segsAfter.shift()!;
        currentEnd = next.end;
    }

    // If still too short, expand at the start
    while (currentEnd - currentStart < minDuration && segsBefore.length > 0) {
        const prev = segsBefore.pop()!;
        currentStart = prev.start;
    }

    return { startTime: currentStart, endTime: currentEnd };
}

/**
 * Shrink end boundary inward to meet max duration,
 * snapping to the last segment that ends within the limit.
 */
function shrinkToMeetMaxDuration(
    start: number,
    segments: TranscriptSegment[],
    maxDuration: number,
): number {
    const maxEnd = start + maxDuration;

    const validSegments = segments.filter(
        (s) => s.start >= start && s.end <= maxEnd,
    );

    if (validSegments.length === 0) return maxEnd;

    return validSegments[validSegments.length - 1]!.end;
}
