#!/usr/bin/env python3
"""Deterministic QA for a rendered short: shot cuts, frozen stretches, final hold and audio level.

    python scripts/video_qa.py <video.mp4> [--json out.json]

Ideas adapted (no code copied) from rea-video (histogram-distance shot cuts, frozen-frame detection),
motionmaxxing look.py (no dead holds, final hold <= 1.4 s) and stickman-video-director's QA
(main character idle <= 2.5 s, a visual change every 2-3 s). Needs ffmpeg/ffprobe and numpy.
Exit code 0 = every gate passed, 2 = a gate failed, 1 = could not analyse.
"""
import json
import re
import subprocess
import sys

import numpy as np

W, H, FPS = 54, 96, 15  # analysis proxy: tiny frames are enough for cuts and motion
STATIC_DIFF = 0.6  # mean absolute luma change (0-255) below which two frames count as frozen
CUT_DISTANCE = 0.35  # Bhattacharyya distance between colour histograms that marks a hard cut
# longest_shot_sec is reported, not gated: a single-set animation legitimately has no hard cuts
GATES = {"longest_static_sec": 2.5, "final_hold_sec": 1.4, "mean_volume_db": -35.0}


def read_frames(path: str) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo",
           "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True, timeout=600).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32)


def histogram(frame: np.ndarray) -> np.ndarray:
    h = np.concatenate([np.histogram(frame[..., c], bins=16, range=(0, 256))[0] for c in range(3)])
    return h / max(1, h.sum())


def bhattacharyya(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(max(0.0, 1 - np.sum(np.sqrt(a * b)))))


def frame_metrics(frames: np.ndarray) -> tuple:
    """Per-transition luma change and histogram distance between consecutive frames."""
    luma = frames @ np.array([0.299, 0.587, 0.114], np.float32)
    diffs = np.abs(np.diff(luma, axis=0)).mean(axis=(1, 2)) if len(luma) > 1 else np.zeros(0)
    hists = [histogram(f) for f in frames]
    dists = np.array([bhattacharyya(hists[i], hists[i + 1]) for i in range(len(hists) - 1)])
    return diffs, dists


def runs(mask: np.ndarray) -> list:
    """(start, length) of every run of True values."""
    out, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - start))
            start = None
    return out


def analyse_motion(diffs: np.ndarray, dists: np.ndarray, fps: float = FPS) -> dict:
    static = diffs < STATIC_DIFF
    static_runs = runs(static)
    cuts = [i + 1 for i, d in enumerate(dists) if d > CUT_DISTANCE]
    bounds = [0] + cuts + [len(diffs) + 1]
    shots = [b - a for a, b in zip(bounds, bounds[1:])]
    tail = static_runs[-1][1] if static_runs and sum(static_runs[-1]) == len(diffs) else 0
    return {
        "cuts_sec": [round(c / fps, 2) for c in cuts],
        "longest_shot_sec": round(max(shots) / fps, 2) if shots else 0.0,
        "longest_static_sec": round(max((n for _, n in static_runs), default=0) / fps, 2),
        "final_hold_sec": round(tail / fps, 2),
        "moving_ratio": round(float(1 - static.mean()), 3) if len(static) else 0.0,
    }


def mean_volume(path: str) -> float:
    """ffmpeg volumedetect mean level in dB; -91 means silence or no audio stream."""
    proc = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"],
                          capture_output=True, text=True, timeout=600)
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", proc.stderr)
    return float(m.group(1)) if m else -91.0


def gate(report: dict) -> dict:
    """Upper bounds for the motion gates, a lower bound for loudness."""
    out = {}
    for key, limit in GATES.items():
        value = report[key]
        out[key] = value >= limit if key == "mean_volume_db" else value <= limit
    return out


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__, file=sys.stderr)
        return 1
    path = args[0]
    out_json = args[args.index("--json") + 1] if "--json" in args else None
    try:
        frames = read_frames(path)
    except (subprocess.SubprocessError, ValueError) as err:
        print(f"cannot read {path}: {err}", file=sys.stderr)
        return 1
    report = {"video": path, "duration_sec": round(len(frames) / FPS, 2), **analyse_motion(*frame_metrics(frames)),
              "mean_volume_db": mean_volume(path)}
    report["gates"] = gate(report)
    report["passed"] = all(report["gates"].values())
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if out_json:
        with open(out_json, "w", encoding="utf-8") as f:
            f.write(text)
    print(text)
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    sys.exit(main())
