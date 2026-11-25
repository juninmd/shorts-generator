"""Stick-figure skeleton: named poses, blending, idle life, walk cycle and forward kinematics.

Angles are degrees in screen space: 0 points down, +90 to screen right, 180 up.
Arms/legs: shoulder (hip) angle, then elbow (knee) bend relative to it. Lengths are in head radii.
"""
import math

from .motion import lerp

KEYS = ("lean", "tilt", "la", "le", "ra", "re", "ll", "lk", "rl", "rk")
TORSO, NECK, UPPER, FORE, THIGH, SHIN = 3.0, 1.2, 1.55, 1.45, 1.9, 1.9

POSES = {
    "stand":    dict(lean=0, tilt=0, la=-10, le=-6, ra=10, re=6, ll=-7, lk=2, rl=7, rk=-2),
    "talk":     dict(lean=2, tilt=4, la=-14, le=-10, ra=48, re=55, ll=-7, lk=2, rl=8, rk=-2),
    "explain":  dict(lean=0, tilt=-3, la=-50, le=-62, ra=50, re=62, ll=-8, lk=2, rl=8, rk=-2),
    "point":    dict(lean=4, tilt=7, la=-12, le=-6, ra=97, re=-4, ll=-9, lk=3, rl=6, rk=-2),
    "present":  dict(lean=3, tilt=5, la=-10, le=-5, ra=62, re=75, ll=-7, lk=2, rl=8, rk=-2),
    "alarm":    dict(lean=0, tilt=0, la=-120, le=-88, ra=120, re=88, ll=-12, lk=8, rl=12, rk=-8),
    "facepalm": dict(lean=3, tilt=-12, la=-12, le=-8, ra=110, re=128, ll=-6, lk=2, rl=7, rk=-2),
    "think":    dict(lean=-2, tilt=9, la=-20, le=-70, ra=95, re=143, ll=-6, lk=2, rl=7, rk=-2),
    "shrug":    dict(lean=0, tilt=10, la=-70, le=-95, ra=70, re=95, ll=-8, lk=2, rl=8, rk=-2),
    "type":     dict(lean=7, tilt=10, la=30, le=58, ra=42, re=55, ll=-6, lk=4, rl=8, rk=-4),
    "cheer":    dict(lean=0, tilt=-4, la=-160, le=-10, ra=160, re=10, ll=-10, lk=0, rl=10, rk=0),
    "thumbs":   dict(lean=2, tilt=6, la=-12, le=-8, ra=45, re=130, ll=-7, lk=2, rl=8, rk=-2),
    "stop":     dict(lean=-3, tilt=-4, la=-12, le=-8, ra=88, re=-80, ll=-9, lk=2, rl=9, rk=-2),
}


def walk_pose(t: float) -> dict:
    phase = 2 * math.pi * 1.7 * t
    s, c = math.sin(phase), math.cos(phase)
    return dict(lean=4, tilt=2, la=-6 + 22 * s, le=18, ra=6 - 22 * s, re=18,
                ll=24 * s, lk=-28 * (1 - c) / 2, rl=-24 * s, rk=-28 * (1 + c) / 2)


def blend(a: dict, b: dict, k: float) -> dict:
    return {key: lerp(a[key], b[key], k) for key in KEYS}


def add_life(p: dict, t: float, talking: float) -> dict:
    """Breathing sway always; beat gestures and head nods only while words are spoken."""
    out = dict(p)
    out["lean"] += 0.9 * math.sin(2 * math.pi * t / 3.4)
    out["tilt"] += 2.5 * talking * math.sin(2 * math.pi * 2.1 * t)
    out["ra"] += 5 * talking * math.sin(2 * math.pi * 1.6 * t)
    out["re"] += 6 * talking * math.sin(2 * math.pi * 1.6 * t + 0.7)
    return out


def _ray(origin, angle, length):
    a = math.radians(angle)
    return (origin[0] + length * math.sin(a), origin[1] + length * math.cos(a))


def joints(p: dict, hip_x: float, ground_y: float, r: float, shoulder_w: float = 0.0) -> dict:
    """Forward kinematics, then shift vertically so the lowest foot rests on the ground."""
    hip = (0.0, 0.0)
    lean = math.radians(p["lean"])
    up = (math.sin(lean), -math.cos(lean))
    neck = (hip[0] + TORSO * r * up[0], hip[1] + TORSO * r * up[1])
    shoulder = (neck[0] - 0.22 * r * up[0], neck[1] - 0.22 * r * up[1])
    tilt = math.radians(p["lean"] + p["tilt"])
    head = (neck[0] + NECK * r * math.sin(tilt), neck[1] - NECK * r * math.cos(tilt))
    j = {"hip": hip, "neck": neck, "shoulder": shoulder, "head": head, "tilt": p["lean"] + p["tilt"]}
    for side, sign in (("l", -1), ("r", 1)):
        root = (shoulder[0] + sign * shoulder_w * r * math.cos(lean), shoulder[1] + sign * shoulder_w * r * math.sin(lean))
        j[f"shoulder_{side}"] = root
        j[f"elbow_{side}"] = _ray(root, p[f"{side}a"], UPPER * r)
        j[f"hand_{side}"] = _ray(j[f"elbow_{side}"], p[f"{side}a"] + p[f"{side}e"], FORE * r)
        j[f"knee_{side}"] = _ray(hip, p[f"{side}l"], THIGH * r)
        j[f"foot_{side}"] = _ray(j[f"knee_{side}"], p[f"{side}l"] + p[f"{side}k"], SHIN * r)
    drop = ground_y - max(j["foot_l"][1], j["foot_r"][1])
    return {k: (v[0] + hip_x, v[1] + drop) if isinstance(v, tuple) else v for k, v in j.items()}


def pose_at(timeline, t: float, enter: bool) -> tuple:
    """(angles, x-progress 0..1 of the entrance walk). Entrances walk in before the first pose."""
    prev, cur, k = timeline.value_at("pose", "stand", t)
    target = blend(POSES.get(prev, POSES["stand"]), POSES.get(cur, POSES["stand"]), k)
    walk_for = 1.3 if enter else 0.0
    if t < walk_for:
        settle = max(0.0, (t - (walk_for - 0.3)) / 0.3)
        return blend(walk_pose(t), target, settle), t / walk_for
    return target, 1.0
