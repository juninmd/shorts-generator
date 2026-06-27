#!/usr/bin/env python3
"""Detect the dominant speaker's horizontal position in a video clip.

Samples a handful of frames across the requested time window and reports the
median horizontal center (0.0 = left edge, 1.0 = right edge) of the largest
detected face. Prints a single float to stdout. On any failure (missing
OpenCV, no faces, unreadable video) it prints nothing and exits non‑zero so the
caller can fall back to a centered crop.

Usage: detect_face.py <input> <start_seconds> <duration_seconds>
"""
import sys


def main() -> int:
    if len(sys.argv) < 4:
        return 1
    path = sys.argv[1]
    start = float(sys.argv[2])
    duration = float(sys.argv[3])

    try:
        import cv2  # type: ignore
    except Exception:
        return 1

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return 1

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        cap.release()
        return 1

    samples = 9
    centers = []
    for i in range(samples):
        ts = start + (duration * (i + 0.5) / samples)
        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        h, w = frame.shape[:2]
        if w == 0:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5,
                                         minSize=(60, 60))
        if len(faces) == 0:
            continue
        # Largest face wins (closest / main speaker).
        fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])
        centers.append((fx + fw / 2.0) / w)

    cap.release()
    if not centers:
        return 1
    centers.sort()
    median = centers[len(centers) // 2]
    print(f"{max(0.0, min(1.0, median)):.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
