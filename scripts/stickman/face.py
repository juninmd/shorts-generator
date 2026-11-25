"""Expressions (brows, eyes, mouth, sweat) with blinking and word-driven lip movement."""
from .pen import oval, quad, rot, stroke

EXPRESSIONS = {
    "neutral":    dict(brow=0, lift=0.0, mouth="smile", eye=1.0, sweat=False),
    "happy":      dict(brow=10, lift=0.05, mouth="grin", eye=1.0, sweat=False),
    "worried":    dict(brow=20, lift=0.06, mouth="wavy", eye=1.05, sweat=True),
    "shocked":    dict(brow=24, lift=0.16, mouth="o", eye=1.35, sweat=True),
    "angry":      dict(brow=-24, lift=-0.04, mouth="frown", eye=0.95, sweat=False),
    "determined": dict(brow=-14, lift=0.0, mouth="flat", eye=1.0, sweat=False),
    "smug":       dict(brow=-8, lift=0.02, mouth="smirk", eye=0.9, sweat=False),
}


def blinking(t: float) -> bool:
    cycle = t % 3.7
    return cycle < 0.11 or (int(t / 3.7) % 3 == 1 and 0.22 < cycle < 0.31)


def _mouth(d, expr, c, r, ink, w, talk, mouth_fill):
    kind = expr["mouth"]
    if talk > 0.05 and kind != "o":
        h = r * (0.05 + 0.22 * talk)
        oval(d, (c[0], c[1] + h * 0.3), r * 0.2, h, fill=mouth_fill, outline=ink, w=w * 0.8)
        return
    x0, x1, y = c[0] - r * 0.24, c[0] + r * 0.24, c[1]
    if kind == "o":
        oval(d, (c[0], y + r * 0.05), r * 0.13, r * 0.18, fill=mouth_fill, outline=ink, w=w * 0.8)
    elif kind == "grin":
        pts = quad((x0 - r * 0.05, y - r * 0.04), (c[0], y + r * 0.38), (x1 + r * 0.05, y - r * 0.04))
        d.polygon(pts, fill=mouth_fill)
        stroke(d, pts + [pts[0]], w * 0.8, ink)
    elif kind == "frown":
        stroke(d, quad((x0, y + r * 0.1), (c[0], y - r * 0.12), (x1, y + r * 0.1)), w, ink)
    elif kind == "wavy":
        stroke(d, quad((x0, y + r * 0.05), (c[0] - r * 0.1, y - r * 0.08), (c[0], y + r * 0.02))
               + quad((c[0], y + r * 0.02), (c[0] + r * 0.12, y + r * 0.12), (x1, y - r * 0.02)), w, ink)
    elif kind == "flat":
        stroke(d, [(x0 + r * 0.04, y + r * 0.02), (x1 - r * 0.04, y)], w, ink)
    elif kind == "smirk":
        stroke(d, quad((x0 + r * 0.05, y + r * 0.04), (c[0] + r * 0.05, y + r * 0.1), (x1 + r * 0.04, y - r * 0.08)), w, ink)
    else:
        stroke(d, quad((x0, y), (c[0], y + r * 0.2), (x1, y)), w, ink)


def draw_face(d, head, r, tilt, name, t, talk, look, ink, w, mouth_fill=(120, 30, 40), sweat=(110, 180, 235)):
    """Draws in head-local coordinates then rotates with the head tilt; `look` shifts the eyes -1..1."""
    expr = EXPRESSIONS.get(name, EXPRESSIONS["neutral"])
    cx, cy = head
    tf = lambda x, y: rot((cx + x * r, cy + y * r), head, tilt)
    ex, ey = 0.32, -0.08 - expr["lift"] * 0.3
    for side in (-1, 1):
        eye = tf(side * ex + look * 0.12, ey)
        if blinking(t):
            stroke(d, [tf(side * ex - 0.1 + look * 0.12, ey), tf(side * ex + 0.1 + look * 0.12, ey)], w * 0.8, ink)
        else:
            oval(d, eye, r * 0.085 * expr["eye"], r * 0.13 * expr["eye"], fill=ink, angle=tilt)
        inner, outer = side * 0.16, side * 0.46
        rise = expr["brow"] / 100.0
        by = -0.38 - expr["lift"]
        stroke(d, [tf(inner + look * 0.1, by - rise), tf(outer + look * 0.1, by + rise * 0.6)], w * 0.9, ink)
    _mouth(d, expr, tf(look * 0.08, 0.42), r, ink, w, talk, mouth_fill)
    if expr["sweat"]:
        drop = [tf(0.78, -0.55), tf(0.7, -0.33), tf(0.86, -0.33)]
        d.polygon(drop, fill=sweat)
        oval(d, tf(0.78, -0.33), r * 0.08, r * 0.08, fill=sweat)
