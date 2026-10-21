#!/usr/bin/env python3
"""Track the active speaker's horizontal position across a video clip.

Samples the clip every STEP seconds. On each sample it detects faces
(speaker_faces.py: YuNet, Haar fallback; on a wide-enough frame to catch the
small faces of wide podcast shots) and measures mouth activity per face: the
mean absolute pixel change around the mouth across a burst of frames.

Faces are clustered into seats across the whole clip. Seats that are only
seen briefly (a face playing on a screen in the middle of the frame, a false
positive) are dropped; real people keep their seat even when a frame misses
their face, so a lost detection never hands the crop to the other guest. The
seat with the most smoothed mouth motion is the active speaker; when nobody
is clearly talking the previous speaker is kept, and a new speaker only takes
over when clearly more active (hysteresis), so the crop does not jitter.

Prints a JSON list of [seconds_from_clip_start, center_x] pairs, where
center_x is 0.0 (left edge) to 1.0 (right edge). On any failure (missing
OpenCV, unreadable video, no faces) it prints nothing and exits non-zero so
the caller falls back to the static or centered crop.

Usage: track_speaker.py <input> <start_seconds> <duration_seconds>
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from speaker_faces import FaceFinder  # noqa: E402
from speaker_seats import assign_seats, follow_speaker  # noqa: E402

STEP = 0.5
MAX_SAMPLES = 160
BURST_GAPS = (0.0, 0.08, 0.16, 0.24)
DETECT_WIDTH = 1280


def mouth_activity(cv2, grays, mouth):
    """Mean absolute change of the mouth area across consecutive frames."""
    x, y, w, h = mouth
    x, y = max(0, x), max(0, y)
    regions = [g[y:y + h, x:x + w] for g in grays]
    if regions[0].size == 0 or any(r.shape != regions[0].shape for r in regions):
        return 0.0
    diffs = [float(cv2.absdiff(a, b).mean()) for a, b in zip(regions, regions[1:])]
    return sum(diffs) / len(diffs)


def main() -> int:
    if len(sys.argv) < 4:
        return 1
    path, start, duration = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    try:
        import cv2  # type: ignore
    except Exception:
        return 1
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return 1
    finder = FaceFinder(cv2)
    if not finder.available:
        cap.release()
        return 1

    def grab(ts):
        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        scale = DETECT_WIDTH / float(frame.shape[1])
        return cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    count = min(MAX_SAMPLES, max(1, int(duration / STEP)))
    offsets, per_sample = [], []
    for i in range(count):
        offset = duration * (i + 0.5) / count
        frames = [grab(start + offset + gap) for gap in BURST_GAPS]
        if any(f is None for f in frames):
            continue
        grays = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (5, 5), 0) for f in frames]
        width = frames[0].shape[1]
        offsets.append(round(offset, 2))
        per_sample.append([
            ((box[0] + box[2] / 2.0) / width, box[2] * box[3],
             mouth_activity(cv2, grays, mouth))
            for box, mouth in finder.find(frames[0])])
    cap.release()
    seats = assign_seats(per_sample)
    if not seats:
        return 1
    xs = follow_speaker(per_sample, seats)
    print(json.dumps([[t, round(x, 4)] for t, x in zip(offsets, xs)]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(1)
