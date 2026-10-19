#!/usr/bin/env python3
"""Track the active speaker's horizontal position across a video clip.

Samples the clip every STEP seconds. On each sample it detects faces (OpenCV
Haar cascade) and measures mouth activity per face: the mean absolute pixel
change in the lower part of the face box between two frames a few
milliseconds apart. The face with the most mouth motion is the active speaker;
when nobody is clearly talking the previous speaker is kept, and a new speaker
only takes over when clearly more active (hysteresis), so the crop does not
jitter between people.

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
MOTION_GAP = 0.12
TALK_THRESHOLD = 1.5
SWITCH_RATIO = 1.5
SCALE_WIDTH = 640


def pick_speaker(faces, activity, previous_x):
    """Choose the (center_x, is_talking) of the active speaker, or None."""
    if not faces:
        return None
    ranked = sorted(range(len(faces)), key=lambda i: activity[i], reverse=True)
    best = ranked[0]
    if previous_x is None:
        if activity[best] >= TALK_THRESHOLD:
            return faces[best][0], True
        largest = max(range(len(faces)), key=lambda i: faces[i][1])
        return faces[largest][0], False
    held = min(range(len(faces)), key=lambda i: abs(faces[i][0] - previous_x))
    if (activity[best] >= TALK_THRESHOLD
            and activity[best] > SWITCH_RATIO * max(activity[held], 0.1)):
        return faces[best][0], True
    return faces[held][0], activity[held] >= TALK_THRESHOLD


def mouth_activity(cv2, gray_a, gray_b, box):
    x, y, w, h = box
    top = y + int(h * 0.60)
    left = x + int(w * 0.20)
    region_a = gray_a[top:y + h, left:x + int(w * 0.80)]
    region_b = gray_b[top:y + h, left:x + int(w * 0.80)]
    if region_a.size == 0 or region_a.shape != region_b.shape:
        return 0.0
    return float(cv2.absdiff(region_a, region_b).mean())


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
    samples = []
    previous_x = None
    for i in range(count):
        offset = duration * (i + 0.5) / count
        first, second = grab(start + offset), grab(start + offset + MOTION_GAP)
        if first is None or second is None:
            continue
        found = cascade.detectMultiScale(
            first, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        width = first.shape[1]
        faces = [((fx + fw / 2.0) / width, fw * fh) for fx, fy, fw, fh in found]
        activity = [mouth_activity(cv2, first, second, tuple(box)) for box in found]
        chosen = pick_speaker(faces, activity, previous_x)
        if chosen is None:
            continue
        previous_x = chosen[0]
        samples.append([round(offset, 2), round(previous_x, 4)])
    cap.release()
    if not samples:
        return 1
    print(json.dumps(samples))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(1)
