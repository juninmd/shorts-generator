"""Measured eases adapted from motionmaxxing (Apache-2.0, runtime/motion.js): curves fitted to
human-made motion films. Every curve maps 0 -> 0 and 1 -> 1; durations are frames at 30 fps."""
import math


def _guard(f):
    return lambda t: 0.0 if t <= 0 else 1.0 if t >= 1 else f(t)


def _expo_out(k):
    d = 1 - math.exp(-k)
    return lambda t: (1 - math.exp(-k * t)) / d


def _spring(c, om):
    def f(t):
        return 1 - math.exp(-c * t) * (math.cos(om * t) + (c / om) * math.sin(om * t))
    n = f(1)
    return lambda t: f(t) / n


def _snap_ramp(w, tau):
    n = w * (1 - math.exp(-1 / tau)) + (1 - w)
    return lambda t: (w * (1 - math.exp(-t / tau)) + (1 - w) * t) / n


def _smooth(p):
    return lambda t: t ** p / (t ** p + (1 - t) ** p)


soft_land = _guard(_expo_out(3.41))  # workhorse: text, panels, limbs settling
snap_settle = _guard(_snap_ramp(0.942, 0.118))  # hero entry: ~54% of travel in the first 10% of time
pop_over = _guard(_spring(2.67, 4.36))  # late overshoot, peak ~1.08 at t~0.72: use once per beat
soft_in_out = _guard(_smooth(1.42))  # symmetric S for opacity
accel_exit = _guard(lambda t: t ** 2.6)  # the leaving curve

FRAMES = {"soft_land": 12, "snap_settle": 11, "pop_over": 15, "soft_in_out": 9, "accel_exit": 13}
