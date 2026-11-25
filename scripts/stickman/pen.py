"""Drawing primitives on a supersampled Pillow canvas: round-capped strokes, curves, wobble, reveal."""
import math


def rot(p, c, deg):
    a = math.radians(deg)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


def quad(p0, p1, p2, n=18):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


def arc(c, rx, ry, a0, a1, n=28):
    return [(c[0] + rx * math.cos(math.radians(a)), c[1] + ry * math.sin(math.radians(a)))
            for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))]


def length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def partial(pts, frac):
    """The first `frac` of a polyline by arc length: strokes appear as if being drawn."""
    if frac >= 1 or len(pts) < 2:
        return pts
    budget, out = length(pts) * max(frac, 0.0), [pts[0]]
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg >= budget:
            k = budget / seg if seg else 0
            out.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))
            return out
        out.append(b)
        budget -= seg
    return out


def wobble(pts, amp, seed, step=14):
    """Hand-drawn irregularity: subdivide and push points sideways with smooth, seeded noise."""
    out = []
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        seg = math.dist(a, b)
        n = max(1, int(seg / step))
        nx, ny = (-(b[1] - a[1]) / seg, (b[0] - a[0]) / seg) if seg else (0, 0)
        for j in range(n):
            k = j / n
            u = seed * 1.7 + i * 2.3 + k * 3.1
            off = amp * (math.sin(u) * 0.6 + math.sin(u * 2.7 + 1.3) * 0.4) * math.sin(math.pi * k + 0.2)
            out.append((a[0] + (b[0] - a[0]) * k + nx * off, a[1] + (b[1] - a[1]) * k + ny * off))
    out.append(pts[-1])
    return out


def stroke(d, pts, w, color):
    if len(pts) < 2:
        return
    d.line(pts, fill=color, width=max(1, round(w)), joint="curve")
    rad = w / 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - rad, p[1] - rad, p[0] + rad, p[1] + rad], fill=color)


def dot(d, p, rad, color):
    d.ellipse([p[0] - rad, p[1] - rad, p[0] + rad, p[1] + rad], fill=color)


def oval(d, c, rx, ry, fill=None, outline=None, w=0, angle=0):
    pts = [rot(q, c, angle) for q in arc(c, rx, ry, 0, 360, 36)]
    d.polygon(pts, fill=fill)
    if outline:
        stroke(d, pts, w, outline)


def arrow(d, pts, w, color, frac=1.0):
    """Curved arrow drawn along `pts`; the head appears once the shaft is complete."""
    shaft = partial(pts, frac)
    stroke(d, shaft, w, color)
    if frac >= 0.98:
        tip, prev = pts[-1], pts[-4]
        ang = math.degrees(math.atan2(tip[1] - prev[1], tip[0] - prev[0]))
        for side in (150, -150):
            a = math.radians(ang + side)
            stroke(d, [tip, (tip[0] + 6 * w * math.cos(a), tip[1] + 6 * w * math.sin(a))], w, color)
