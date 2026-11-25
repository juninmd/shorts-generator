"""A2 · Modern Pop: high-key white studio, perspective grid, beanie stick figure (red beanie, yellow tee)."""
from PIL import Image, ImageDraw, ImageFilter

from . import pop_ui
from .face import draw_face
from .pen import arc, oval, rot, stroke

INK, SKIN = (17, 17, 17), (255, 255, 255)
BEANIE, BEANIE_DARK, TEE, TEE_DARK, SHORTS = (220, 38, 38), (176, 24, 30), (250, 204, 21), (202, 150, 6), (31, 41, 55)
LAYOUT = {"width": 1080, "height": 1920, "home_x": 330, "ground_y": 1500, "head_r": 84, "horizon": 1140, "shoulder_w": 0.4,
          "slots": {"right": (765, 1010, 175), "top": (765, 590, 160), "low": (770, 1370, 150), "left": (300, 640, 150)}}


def background(w: int, h: int) -> Image.Image:
    sx, sy = w / 1080, h / 1920
    hz = LAYOUT["horizon"] * sy
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        k = y / hz if y < hz else (y - hz) / (h - hz)
        top, bot = ((250, 251, 253), (236, 240, 245)) if y < hz else ((244, 246, 249), (226, 231, 238))
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * k) for a, b in zip(top, bot)))
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    vp, step = (w / 2, hz - 520 * sy), 18 * sy
    y = hz + step
    while y < h:
        g.line([(0, y), (w, y)], fill=(196, 204, 216, int(70 + 110 * (y - hz) / (h - hz))), width=max(1, round(2 * sy)))
        step *= 1.32
        y += step
    for i in range(-9, 10):
        bx = w / 2 + i * 210 * sx
        k = (hz - vp[1]) / (h - vp[1])
        g.line([(vp[0] + (bx - vp[0]) * k, hz), (bx, h)], fill=(196, 204, 216, 150), width=max(1, round(2 * sx)))
    for x0, x1, top in ((-40, 230, 760), (880, 1120, 700)):  # white studio blocks on the back wall
        g.polygon([(x0 * sx, top * sy), (x1 * sx, top * sy), (x1 * sx, hz), (x0 * sx, hz)], fill=(247, 248, 250, 255))
        g.polygon([(x0 * sx, top * sy), (x1 * sx, top * sy), ((x1 - 30) * sx, (top - 40) * sy), ((x0 + 30) * sx, (top - 40) * sy)], fill=(253, 253, 254, 255))
        g.line([(x0 * sx, hz), (x1 * sx, hz)], fill=(214, 220, 228, 255), width=max(1, round(3 * sy)))
    glow = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    ImageDraw.Draw(glow).ellipse([w * 0.1, -h * 0.12, w * 0.9, h * 0.22], fill=(255, 255, 255, 190))
    img = Image.alpha_composite(img.convert("RGBA"), grid)
    return Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(90 * sx))).convert("RGB")


def _tee(d, j, r):
    up = (j["neck"][0] - j["hip"][0], j["neck"][1] - j["hip"][1])
    n = (up[0] ** 2 + up[1] ** 2) ** 0.5
    px, py = -up[1] / n, up[0] / n
    top, hip = j["shoulder"], j["hip"]
    body = [(top[0] + px * 0.5 * r, top[1] + py * 0.5 * r), (hip[0] + px * 0.46 * r, hip[1] + py * 0.46 * r - 0.1 * r),
            (hip[0] - px * 0.46 * r, hip[1] - py * 0.46 * r - 0.1 * r), (top[0] - px * 0.5 * r, top[1] - py * 0.5 * r)]
    d.polygon(body, fill=TEE)
    stroke(d, body + [body[0]], 0.07 * r, INK)
    stroke(d, [hip, (hip[0] + up[0] * 0.25, hip[1] + up[1] * 0.25)], 0.05 * r, TEE_DARK)


def _limb(d, a, b, c, r, sleeve=None):
    stroke(d, [a, b, c], 0.15 * r, INK)
    if sleeve:
        cut = (a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3)
        stroke(d, [a, cut], 0.42 * r, INK)
        stroke(d, [a, cut], 0.3 * r, sleeve)


def draw_character(d, ch):
    j, r, t = ch["j"], ch["r"], ch["t"]
    feet = ((j["foot_l"][0] + j["foot_r"][0]) / 2, max(j["foot_l"][1], j["foot_r"][1]))
    oval(d, (feet[0], feet[1] + 0.08 * r), 1.7 * r, 0.26 * r, fill=(15, 23, 42, 38))
    for s in ("l", "r"):
        _limb(d, j["hip"], j[f"knee_{s}"], j[f"foot_{s}"], r)
        stroke(d, [j["hip"], ((j["hip"][0] + j[f"knee_{s}"][0]) / 2, (j["hip"][1] + j[f"knee_{s}"][1]) / 2)], 0.42 * r, SHORTS)
        oval(d, (j[f"foot_{s}"][0] + 0.16 * r, j[f"foot_{s}"][1] - 0.05 * r), 0.27 * r, 0.13 * r, fill=INK)
    _tee(d, j, r)
    for s in ("l", "r"):
        _limb(d, j[f"shoulder_{s}"], j[f"elbow_{s}"], j[f"hand_{s}"], r, sleeve=TEE)
        oval(d, j[f"hand_{s}"], 0.17 * r, 0.17 * r, fill=INK)
    head, tilt = j["head"], j["tilt"]
    oval(d, head, r, r, fill=SKIN, outline=INK, w=0.08 * r)
    dome = [rot(p, head, tilt) for p in arc((head[0], head[1] - 0.12 * r), 1.05 * r, 1.02 * r, 180, 360)]
    d.polygon(dome, fill=BEANIE)
    stroke(d, dome + [dome[0]], 0.07 * r, INK)
    band = [rot(p, head, tilt) for p in ((head[0] - 1.08 * r, head[1] - 0.12 * r), (head[0] + 1.08 * r, head[1] - 0.12 * r),
                                         (head[0] + 1.04 * r, head[1] - 0.42 * r), (head[0] - 1.04 * r, head[1] - 0.42 * r))]
    d.polygon(band, fill=BEANIE_DARK)
    stroke(d, band + [band[0]], 0.06 * r, INK)
    for k in (-0.5, 0.0, 0.5):
        stroke(d, [rot((head[0] + k * r, head[1] - 0.5 * r), head, tilt), rot((head[0] + k * 0.8 * r, head[1] - 0.95 * r), head, tilt)], 0.04 * r, BEANIE_DARK)
    draw_face(d, rot((head[0], head[1] + 0.12 * r), head, tilt), r * 0.86, tilt, ch["face"], t, ch["talk"], ch["look"], INK, 0.075 * r)


def draw(d, scene, t, S):
    for p in scene.props(t):
        pop_ui.draw_prop(d, p, LAYOUT, S, t)
    draw_character(d, scene.character(t, S))
    pop_ui.heading(d, scene.spec, t, S)
    pop_ui.caption(d, scene, t, S)
