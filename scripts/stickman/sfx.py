"""Small synthesized, rights-free sound effects placed on the chapter timeline (48 kHz mono WAV)."""
import array
import math
import random
import wave

RATE = 48000


def _tone(dur, fn):
    n = int(dur * RATE)
    return [fn(i / RATE, i / max(n - 1, 1)) for i in range(n)]


def _noise(seed):
    rnd = random.Random(seed)
    return lambda: rnd.uniform(-1, 1)


def pop(seed=0):
    return _tone(0.11, lambda t, k: math.sin(2 * math.pi * (700 + 1400 * k) * t) * math.exp(-9 * k) * 0.55)


def ding(seed=0):
    return _tone(0.5, lambda t, k: (math.sin(2 * math.pi * 1320 * t) + 0.5 * math.sin(2 * math.pi * 1980 * t)) * math.exp(-6 * k) * 0.3)


def alarm(seed=0):
    return _tone(0.42, lambda t, k: (1 if math.sin(2 * math.pi * 140 * t) > 0 else -1) * (0.5 + 0.5 * math.sin(2 * math.pi * 9 * t)) * (1 - k) * 0.18)


def scribble(seed=0):
    n, last = _noise(seed), [0.0]

    def fn(t, k):
        last[0] = 0.82 * last[0] + 0.18 * n()  # low-passed noise reads as pencil on paper
        return last[0] * (0.6 + 0.4 * math.sin(2 * math.pi * 23 * t)) * math.sin(math.pi * k) * 1.4
    return _tone(0.32, fn)


def whoosh(seed=0):
    n, last = _noise(seed + 7), [0.0]

    def fn(t, k):
        last[0] = 0.9 * last[0] + 0.1 * n()
        return last[0] * math.sin(math.pi * k) ** 2 * 2.2
    return _tone(0.38, fn)


SOUNDS = {"pop": pop, "ding": ding, "alarm": alarm, "scribble": scribble, "whoosh": whoosh}


def write_track(path: str, duration: float, cues: list) -> None:
    """cues: [(time_sec, sound_name)]. Overlaps are summed and clipped."""
    buf = [0.0] * (int(duration * RATE) + 1)
    for i, (at, name) in enumerate(cues):
        start = int(max(at, 0) * RATE)
        for j, s in enumerate(SOUNDS.get(name, pop)(seed=i)):
            if start + j < len(buf):
                buf[start + j] += s
    pcm = array.array("h", (int(max(-1.0, min(1.0, s)) * 32767) for s in buf))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
