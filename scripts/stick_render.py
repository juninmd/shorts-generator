#!/usr/bin/env python3
"""Render one animated stick-figure chapter to MP4 (or a poster PNG).

Usage: python stick_render.py <spec.json>
Spec: { out, width, height, fps, durationSec, pose, prop, title, audio?, poster? }.
With "poster" set, writes frame 0 to that path and exits. Without "audio", writes silence.
"""
import functools
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

from stick_pose import joints_for

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "assets", "fonts", "Poppins-ExtraBold.ttf")
INK, ACCENT, DANGER = (245, 247, 250), (61, 220, 151), (255, 90, 95)
BG_TOP, BG_BOT = (11, 16, 32), (26, 20, 58)


@functools.lru_cache(maxsize=None)
def font(size: int):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def background(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        k = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    return img


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and draw.textlength(trial, font=fnt) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    return lines + ([cur] if cur else [])


def draw_prop(d: ImageDraw.ImageDraw, prop: str, t: float, w: int) -> None:
    cx, cy = int(w * 0.74), 880
    pulse = 1 + 0.04 * math.sin(2 * math.pi * t * 1.5)
    if prop == "database":
        rx = 150 * pulse
        for k in range(3):
            y0 = cy - 200 + k * 130
            d.ellipse([cx - rx, y0 - 40, cx + rx, y0 + 40], outline=DANGER, width=12)
            d.line([(cx - rx, y0), (cx - rx, y0 + 130)], fill=DANGER, width=12)
            d.line([(cx + rx, y0), (cx + rx, y0 + 130)], fill=DANGER, width=12)
    elif prop == "warning":
        d.polygon([(cx, cy - 190), (cx - 200, cy + 150), (cx + 200, cy + 150)], outline=DANGER, width=16)
        d.line([(cx, cy - 90), (cx, cy + 40)], fill=DANGER, width=26)
        d.ellipse([cx - 16, cy + 84, cx + 16, cy + 116], fill=DANGER)
    elif prop == "shield":
        pts = [(cx, cy - 180), (cx + 160, cy - 120), (cx + 140, cy + 60),
               (cx, cy + 180), (cx - 140, cy + 60), (cx - 160, cy - 120)]
        d.polygon(pts, outline=ACCENT, width=16)
        d.line([(cx - 70, cy), (cx - 15, cy + 60), (cx + 80, cy - 60)], fill=ACCENT, width=22, joint="curve")


def draw_figure(d: ImageDraw.ImageDraw, j: dict) -> None:
    lw = 22
    d.line([j["neck"], j["hip"]], fill=INK, width=lw)
    for chain in (("sh_l", "el_l", "ha_l"), ("sh_r", "el_r", "ha_r"),
                  ("hip_l", "kn_l", "ft_l"), ("hip_r", "kn_r", "ft_r")):
        pts = [j[name] for name in chain]
        d.line(pts, fill=INK, width=lw, joint="curve")
        for p in pts:
            d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=INK)
    hx, hy = j["head"]
    d.ellipse([hx - 70, hy - 70, hx + 70, hy + 70], outline=INK, width=16)
    d.ellipse([hx - 26, hy - 14, hx - 16, hy - 4], fill=INK)
    d.ellipse([hx + 16, hy - 14, hx + 26, hy - 4], fill=INK)


def make_frame(spec: dict, base: Image.Image, t: float) -> Image.Image:
    w, h = spec["width"], spec["height"]
    img = base.copy()
    d = ImageDraw.Draw(img)
    d.text((w / 2, 150), "ANTONIO CODE", font=font(64), fill=ACCENT, anchor="mm")
    draw_prop(d, spec.get("prop", "none"), t, w)
    draw_figure(d, joints_for(spec.get("pose", "idle"), t, w * 0.34, 1000))
    body = font(66)
    lines = wrap(d, spec.get("title", ""), body, int(w * 0.84))
    for i, line in enumerate(lines):  # bottom-anchored so longer titles grow upward
        d.text((w / 2, 1860 - (len(lines) - 1 - i) * 84), line, font=body, fill=INK, anchor="mm")
    return img


def encode(spec: dict, base: Image.Image) -> None:
    w, h, fps = spec["width"], spec["height"], spec.get("fps", 30)
    dur = float(spec["durationSec"])
    audio = spec.get("audio")
    audio_in = ["-i", audio] if audio else ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", *audio_in,
           "-map", "0:v", "-map", "1:a", "-af", "apad", "-t", f"{dur:.3f}",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps),
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", spec["out"]]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(max(1, round(dur * fps))):
            proc.stdin.write(make_frame(spec, base, i / fps).tobytes())
    except BrokenPipeError:
        pass  # ffmpeg exited early; its non-zero code below reports the failure
    finally:
        proc.stdin.destroy()  # no flush: a dead ffmpeg must not raise a second error here
    if proc.wait() != 0:
        sys.exit(f"ffmpeg failed for {spec['out']}")


def main() -> None:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        spec = json.load(f)
    base = background(spec["width"], spec["height"])
    if spec.get("poster"):
        make_frame(spec, base, 0.0).save(spec["poster"])
        return
    encode(spec, base)


if __name__ == "__main__":
    main()
