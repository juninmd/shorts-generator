"""B1 · Minimal Line Art: warm paper with a faint grid, fine irregular pen figure, crayon props."""
from PIL import Image, ImageDraw

from . import line_ui
from .face import draw_face
from .pen import arc, oval, quad, rot, stroke, wobble

INK, PAPER = (28, 28, 30), (253, 253, 252)
LAYOUT = {"width": 1080, "height": 1920, "home_x": 330, "ground_y": 1470, "head_r": 82, "grid_until": 1600,
          "slots": {"right": (790, 1010, 210), "top": (770, 640, 190), "low": (800, 1380, 170), "left": (300, 1000, 190)}}


def background(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), PAPER)
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    step, limit = 96 * w / 1080, LAYOUT["grid_until"] * h / 1920
    color = (76, 90, 105, 12)
    x = step
    while x < w:
        g.line([(x, 0), (x, limit)], fill=color, width=1)
        x += step
    y = step
    while y < limit:
        g.line([(0, y), (w, y)], fill=color, width=1)
        y += step
    return Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")


def _pen(d, pts, r, seed, w=0.062):
    stroke(d, wobble(pts, 0.035 * r, seed, step=0.25 * r), w * r, INK)


def draw_character(d, ch, S):
    j, r, t = ch["j"], ch["r"], ch["t"]
    gx = j["hip"][0]
    ground = max(j["foot_l"][1], j["foot_r"][1]) + 0.12 * r
    _pen(d, [(gx - 2.4 * r, ground), (gx + 2.6 * r, ground + 0.03 * r)], r, 90, w=0.045)
    _pen(d, [j["hip"], j["shoulder"], j["neck"]], r, 1)
    for i, s in enumerate(("l", "r")):
        _pen(d, [j["hip"], j[f"knee_{s}"], j[f"foot_{s}"]], r, 10 + i)
        foot = j[f"foot_{s}"]
        oval(d, (foot[0] + 0.14 * r, foot[1] - 0.04 * r), 0.24 * r, 0.11 * r, fill=PAPER, outline=INK, w=0.055 * r)
        _pen(d, [j[f"shoulder_{s}"], j[f"elbow_{s}"], j[f"hand_{s}"]], r, 20 + i)
        oval(d, j[f"hand_{s}"], 0.14 * r, 0.12 * r, fill=PAPER, outline=INK, w=0.055 * r)
    head, tilt = j["head"], j["tilt"]
    oval(d, head, r, r * 0.97, fill=PAPER)
    stroke(d, wobble(arc(head, r, r * 0.97, -80, 285, 40), 0.03 * r, 7, step=0.3 * r), 0.06 * r, INK)
    for k, (dx, dy) in enumerate(((-0.25, -0.55), (0.05, -0.7), (0.3, -0.55))):  # hair tufts
        base = rot((head[0] + dx * r, head[1] - 0.95 * r), head, tilt)
        tip = rot((head[0] + (dx + dy * 0.3) * r, head[1] - (0.95 - dy * 0.5) * r), head, tilt)
        stroke(d, quad(base, ((base[0] + tip[0]) / 2 + 0.1 * r, (base[1] + tip[1]) / 2), tip, 8), 0.05 * r, INK)
    draw_face(d, head, r, tilt, ch["face"], t, ch["talk"], ch["look"], INK, 0.06 * r, mouth_fill=(90, 40, 40))


def draw(d, scene, t, S):
    for p in scene.props(t):
        line_ui.draw_prop(d, p, LAYOUT, S)
    draw_character(d, scene.character(t, S), S)
    line_ui.heading(d, scene.spec, t, S)
    line_ui.caption(d, scene, t, S)
