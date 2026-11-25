"""Easing, cue timing and the per-chapter beat timeline shared by every style."""
import math
import unicodedata

TRANSITION = 0.38  # seconds a pose change takes


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def lerp(a: float, b: float, k: float) -> float:
    return a + (b - a) * k


def ease_in_out(k: float) -> float:
    k = clamp(k)
    return 4 * k ** 3 if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2


def ease_out_back(k: float, s: float = 1.6) -> float:
    k = clamp(k) - 1
    return 1 + (s + 1) * k ** 3 + s * k ** 2


def ease_out(k: float) -> float:
    return 1 - (1 - clamp(k)) ** 3


def _fold(text: str) -> str:
    raw = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in raw if c.isalnum() and not unicodedata.combining(c))


def cue_time(beat: dict, words: list, duration: float) -> float:
    """A beat fires when its cue word is spoken, else at its `at` fraction of the chapter."""
    cue = _fold(beat.get("cue", ""))
    if cue:
        for w in words:
            if _fold(w["word"]).startswith(cue):
                return max(0.0, float(w["start"]) - 0.12)  # land just before the word
    return clamp(float(beat.get("at", 0.0))) * duration


class Timeline:
    """Resolves beats (pose, face, prop, state) into times once, then answers per-frame queries."""

    def __init__(self, beats: list, words: list, duration: float):
        self.duration = duration
        self.words = words
        timed = sorted(((cue_time(b, words, duration), i, b) for i, b in enumerate(beats)), key=lambda x: (x[0], x[1]))
        self.beats = [(t, b) for t, _, b in timed]

    def track(self, key: str, default):
        return [(t, b[key]) for t, b in self.beats if key in b] or [(0.0, default)]

    def value_at(self, key: str, default, t: float):
        """Returns (previous, current, blend 0..1) for a key so styles can tween between states."""
        track = self.track(key, default)
        fired = [i for i, (bt, _) in enumerate(track) if bt <= t]
        if not fired:
            return default, default, 1.0
        i = fired[-1]
        prev = track[i - 1][1] if i else default
        return prev, track[i][1], ease_in_out((t - track[i][0]) / TRANSITION)

    def props(self, t: float) -> list:
        """Every prop beat already fired, with seconds since it appeared."""
        return [(b["prop"], t - bt, b) for bt, b in self.beats if "prop" in b and bt <= t]

    def events(self) -> list:
        return [(bt, b) for bt, b in self.beats if "prop" in b or "sfx" in b]

    def speaking(self, t: float) -> float:
        """Mouth openness 0..1 from word timings: open-close once per syllable-ish."""
        for w in self.words:
            s, e = float(w["start"]), float(w["end"])
            if s <= t <= e:
                span = max(e - s, 0.08)
                syllables = max(1, round(len(w["word"]) / 3))
                return 0.25 + 0.75 * abs(math.sin(math.pi * syllables * (t - s) / span))
        return 0.0
