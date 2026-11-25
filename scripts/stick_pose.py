"""Procedural stick-figure poses: joint positions for a named pose at time t (seconds)."""
import math

TAU = 2 * math.pi
UPPER, LOWER, THIGH, SHIN = 210, 190, 280, 280

# Per-pose arm angles (degrees from hanging straight down, + swings outward) and elbow bends.
def _arm_params(pose: str, t: float) -> dict:
    s = lambda k, ph=0.0: math.sin(TAU * t * k + ph)
    if pose == "talk":
        return dict(ra=35 + 22 * s(1.4), rb=30 + 20 * s(1.4, 1), la=18 + 8 * s(0.7), lb=10, lean=0)
    if pose == "point":
        return dict(ra=95, rb=5, la=20, lb=10, lean=4)
    if pose == "alarm":
        return dict(ra=160 + 8 * s(2), rb=10, la=-160 - 8 * s(2, 0.5), lb=-10, lean=0)
    if pose == "typing":
        return dict(ra=70 + 6 * s(4), rb=60, la=-70 - 6 * s(4, 1.5), lb=-60, lean=6)
    return dict(ra=14 + 3 * s(0.5), rb=5, la=-14 - 3 * s(0.5), lb=-5, lean=0)


def _limb(origin, angle_deg, bend_deg, upper, lower):
    a = math.radians(angle_deg)
    elbow = (origin[0] + upper * math.sin(a), origin[1] + upper * math.cos(a))
    b = math.radians(angle_deg + bend_deg)
    return elbow, (elbow[0] + lower * math.sin(b), elbow[1] + lower * math.cos(b))


def joints_for(pose: str, t: float, cx: float, hip_y: float) -> dict:
    """Return named joints; a small breathing bob keeps the figure alive while idle."""
    p = _arm_params(pose, t)
    bob = 6 * math.sin(TAU * t)
    hip = (cx, hip_y)
    neck = (cx + p["lean"], hip_y - 300 + bob)
    sh_l, sh_r = (neck[0] - 55, neck[1] + 25), (neck[0] + 55, neck[1] + 25)
    el_r, ha_r = _limb(sh_r, p["ra"], p["rb"], UPPER, LOWER)
    el_l, ha_l = _limb(sh_l, p["la"], p["lb"], UPPER, LOWER)
    return {
        "neck": neck,
        "head": (neck[0], neck[1] - 95),
        "hip": hip,
        "sh_l": sh_l, "el_l": el_l, "ha_l": ha_l,
        "sh_r": sh_r, "el_r": el_r, "ha_r": ha_r,
        "hip_l": (hip[0] - 30, hip[1]), "kn_l": (hip[0] - 30, hip[1] + SHIN),
        "ft_l": (hip[0] - 30, hip[1] + THIGH + SHIN),
        "hip_r": (hip[0] + 30, hip[1]), "kn_r": (hip[0] + 30, hip[1] + SHIN),
        "ft_r": (hip[0] + 30, hip[1] + THIGH + SHIN),
    }
