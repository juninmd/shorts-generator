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
 * Find the start of the closest segment at or just before the target time.
 * Prefers starting at a sentence boundary rather than mid-sentence.
 */
function findClosestSegmentStart(
    targetTime: number,
    segments: TranscriptSegment[],
): number {
    let best = segments[0]!.start;
    let bestDist = Math.abs(targetTime - best);

    for (const seg of segments) {
        const dist = Math.abs(seg.start - targetTime);
        if (dist < bestDist) {
            best = seg.start;
            bestDist = dist;
        }
        // Once we're well past the target, stop searching
        if (seg.start > targetTime + 5) break;
    }

    return best;
}

/**
 * Find the end of the closest segment at or just after the target time.
 * Prefers ending at a sentence boundary rather than mid-sentence.
 */
function findClosestSegmentEnd(
    targetTime: number,
    segments: TranscriptSegment[],
): number {
    let best = segments[segments.length - 1]!.end;
    let bestDist = Math.abs(targetTime - best);

    for (const seg of segments) {
        const dist = Math.abs(seg.end - targetTime);
        if (dist < bestDist) {
            best = seg.end;
            bestDist = dist;
        }
    }

    return best;
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
