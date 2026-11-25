"""Renders one chapter spec to MP4 (or a poster PNG): supersampled frames in parallel, piped to ffmpeg."""
import json
import multiprocessing as mp
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

from . import sfx, style_line, style_pop
from .scene import Scene

STYLES = {"pop": (style_pop, "pop"), "line": (style_line, "scribble")}
SS = int(os.environ.get("STICK_SUPERSAMPLE", "2"))
_STATE = {}


def _init(spec: dict) -> None:
    module, _ = STYLES.get(spec.get("style", "pop"), STYLES["pop"])
    _STATE.update(spec=spec, module=module, scene=Scene(spec, module.LAYOUT),
                  base=module.background(spec["width"], spec["height"]).convert("RGBA"))


def frame(t: float) -> Image.Image:
    spec, module, scene = _STATE["spec"], _STATE["module"], _STATE["scene"]
    w, h = spec["width"], spec["height"]
    S = SS * w / module.LAYOUT["width"]
    layer = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    module.draw(ImageDraw.Draw(layer, "RGBA"), scene, t, S)
    out = _STATE["base"].copy()
    out.alpha_composite(layer.resize((w, h), Image.LANCZOS))
    return out.convert("RGB")


def _frame_bytes(i: int) -> bytes:
    return frame(i / _STATE["spec"].get("fps", 30)).tobytes()


def _audio_args(spec: dict, sfx_path: str) -> list:
    if spec.get("audio"):
        graph = ("[1:a]aresample=48000,aformat=channel_layouts=stereo[v];[2:a]aformat=channel_layouts=stereo,volume=0.8[s];"
                 "[v][s]amix=inputs=2:normalize=0:duration=longest,apad[a]")
        return ["-i", spec["audio"], "-i", sfx_path, "-filter_complex", graph]
    return ["-i", sfx_path, "-filter_complex", "[1:a]aformat=channel_layouts=stereo,apad[a]"]


def encode(spec: dict) -> None:
    w, h, fps, dur = spec["width"], spec["height"], spec.get("fps", 30), float(spec["durationSec"])
    _, prop_sound = STYLES.get(spec.get("style", "pop"), STYLES["pop"])
    with tempfile.TemporaryDirectory() as tmp:
        sfx_path = os.path.join(tmp, "sfx.wav")
        cues = Scene(spec, STYLES[spec.get("style", "pop")][0].LAYOUT).sfx_cues(prop_sound)
        if spec.get("style") == "pop" and spec.get("heading"):
            cues.append((0.0, "whoosh"))
        sfx.write_track(sfx_path, dur, cues)
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
               "-i", "-", *_audio_args(spec, sfx_path), "-map", "0:v", "-map", "[a]", "-t", f"{dur:.3f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(fps),
               "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", spec["out"]]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        workers = max(1, min(int(os.environ.get("STICK_WORKERS", os.cpu_count() or 1)), 8))
        try:
            with mp.get_context("fork").Pool(workers, initializer=_init, initargs=(spec,)) as pool:
                for data in pool.imap(_frame_bytes, range(max(1, round(dur * fps))), chunksize=4):
                    proc.stdin.write(data)
        except BrokenPipeError:
            pass  # ffmpeg died early; its exit code below reports it
        finally:
            try:
                proc.stdin.close()
            except BrokenPipeError:
                pass  # flushing into a dead ffmpeg; the exit code below is the real signal
        if proc.wait() != 0:
            sys.exit(f"ffmpeg failed for {spec['out']}")


def main(spec_path: str) -> None:
    with open(spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)
    if spec.get("poster"):
        _init(spec)
        frame(_STATE["scene"].duration * 0.98).save(spec["poster"])
        return
    encode(spec)
