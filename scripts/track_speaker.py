#!/usr/bin/env python3
"""Track the active speaker's horizontal position across a video clip.

Samples the clip every STEP seconds. On each sample it detects faces (OpenCV
Haar cascade, on a wide-enough frame to catch the small faces of wide
podcast shots) and measures mouth activity per face: the mean absolute pixel
change in the lower part of the face box across a burst of frames.

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
import sys

STEP = 0.5
MAX_SAMPLES = 160
BURST_GAPS = (0.0, 0.08, 0.16, 0.24)
TALK_THRESHOLD = 1.5
SWITCH_RATIO = 1.5
SMOOTHING = 0.6
SCALE_WIDTH = 960
SEAT_TOLERANCE = 0.07
MIN_PRESENCE = 0.3


def mouth_activity(cv2, grays, box):
    """Mean absolute change of the mouth area across consecutive frames."""
    x, y, w, h = box
    top, left, right = y + int(h * 0.60), x + int(w * 0.20), x + int(w * 0.80)
    regions = [g[top:y + h, left:right] for g in grays]
    if regions[0].size == 0 or any(r.shape != regions[0].shape for r in regions):
        return 0.0
    diffs = [float(cv2.absdiff(a, b).mean()) for a, b in zip(regions, regions[1:])]
    return sum(diffs) / len(diffs)


def assign_seats(per_sample):
    """Cluster detections by x into seats; returns [(center_x, size)] kept."""
    seats = []
    for faces in per_sample:
        for fx, size, _ in faces:
            near = min(seats, key=lambda s: abs(s["x"] - fx), default=None)
            if near is None or abs(near["x"] - fx) > SEAT_TOLERANCE:
                near = {"x": fx, "size": size, "seen": 0}
                seats.append(near)
            near["x"] = (near["x"] * near["seen"] + fx) / (near["seen"] + 1)
            near["size"] = max(near["size"], size)
            near["seen"] += 1
    floor = MIN_PRESENCE * len(per_sample)
    kept = [s for s in seats if s["seen"] >= floor]
    return kept or ([max(seats, key=lambda s: s["seen"])] if seats else [])


def follow_speaker(per_sample, seats):
    """Per sample, the seat position of the active speaker (hysteresis + smoothing)."""
    energy = [0.0] * len(seats)
    held = None
    chosen = []
    for faces in per_sample:
        for i, seat in enumerate(seats):
            hits = [a for fx, _, a in faces if abs(fx - seat["x"]) <= SEAT_TOLERANCE]
            new = max(hits) if hits else 0.0
            energy[i] = SMOOTHING * new + (1 - SMOOTHING) * energy[i]
        best = max(range(len(seats)), key=lambda i: energy[i])
        if held is None:
            held = best if energy[best] >= TALK_THRESHOLD else max(
                range(len(seats)), key=lambda i: seats[i]["size"])
        elif (best != held and energy[best] >= TALK_THRESHOLD
                and energy[best] > SWITCH_RATIO * max(energy[held], 0.1)):
            held = best
        chosen.append(seats[held]["x"])
    return chosen


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
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if cascade.empty():
        cap.release()
        return 1

    def grab(ts):
        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        height, width = frame.shape[:2]
        scale = min(1.0, SCALE_WIDTH / float(width))
        small = cv2.resize(frame, (int(width * scale), int(height * scale)))
        return cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)

    count = min(MAX_SAMPLES, max(1, int(duration / STEP)))
    offsets, per_sample = [], []
    for i in range(count):
        offset = duration * (i + 0.5) / count
        grays = [grab(start + offset + gap) for gap in BURST_GAPS]
        if any(g is None for g in grays):
            continue
        width = grays[0].shape[1]
        found = cascade.detectMultiScale(
            grays[0], scaleFactor=1.1, minNeighbors=5, minSize=(max(24, width // 40),) * 2)
        offsets.append(round(offset, 2))
        per_sample.append([
            ((fx + fw / 2.0) / width, fw * fh,
             mouth_activity(cv2, grays, (fx, fy, fw, fh)))
            for fx, fy, fw, fh in found])
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
