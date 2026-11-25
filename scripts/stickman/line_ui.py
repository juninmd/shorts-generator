"""B1 hand-drawn UI: crayon-filled props drawn stroke by stroke, handwritten heading and captions."""
from .motion import ease_out
from .pen import partial, stroke, wobble
from .props import shapes_for
from .typo import fit, font, wrap

CAVEAT = "Caveat.ttf"
INK, RED, GRAY = (28, 28, 30), (220, 53, 45), (70, 70, 74)
ROLES = {"ink": INK, "fill": (246, 199, 74), "paper": (255, 255, 255), "danger": (224, 69, 58),
         "ok": (98, 184, 104), "accent": (90, 160, 240), "muted": (214, 222, 230)}


def draw_prop(d, p, layout, S):
    cx, cy, size = layout["slots"].get(p["slot"], layout["slots"]["right"])
    scale = size * S
    tf = lambda q, off=0.0: ((cx + off) * S + q[0] * scale, (cy + off * 0.8) * S + q[1] * scale)
    draw = ease_out(p["age"] / 0.7)  # outline being drawn
    fill = ease_out((p["age"] - 0.35) / 0.4)  # crayon colour follows the pen
    for i, shape in enumerate(shapes_for(p["kind"], p["beat"], p["state"])):
        if shape[0] == "poly" and fill > 0:
            role = shape[2]
            color = ROLES[role] + (int((150 if role == "paper" else 225) * fill),)
            d.polygon([tf(q, 7) for q in shape[1]], fill=color)  # off-register like crayon over ink
        elif shape[0] == "line":
            pts = wobble([tf(q) for q in shape[1]], 0.012 * scale, i + 3, step=0.12 * scale)
            stroke(d, partial(pts, draw), 0.03 * scale, ROLES[shape[2]])
        elif shape[0] == "text" and draw > 0.6:
            _, pos, text, rel, role = shape
            anchor = "lm" if p["kind"] in ("terminal", "checklist") else "mm"
            d.text(tf(pos), text, font=font(CAVEAT, int(rel * scale * 1.35), "Bold"), fill=ROLES[role], anchor=anchor)


def heading(d, spec, t, S):
    text = spec.get("heading", "").upper()
    if not text:
        return
    fnt = font(CAVEAT, int(104 * S), "Bold")
    lines = wrap(d, text, fnt, 900 * S)
    emph = set(spec.get("emphasis", "").upper().split())
    total = sum(len(word) + 1 for line in lines for word in line.split())
    shown = int(total * ease_out(t / 0.55))  # written on, letter by letter
    y = 150 * S
    for line in lines:
        x = 72 * S
        for word in line.split():
            visible = word[: max(0, shown)]
            shown -= len(word) + 1
            color = RED if word.strip(".,!?:") in emph else INK
            if visible:
                d.text((x, y), visible, font=fnt, fill=color, anchor="ls")
            w = d.textlength(word, font=fnt)
            if color == RED and len(visible) == len(word):
                k = ease_out((t - 0.55) / 0.35)
                under = wobble([(x - 4 * S, y + 22 * S), (x + w + 6 * S, y + 18 * S)], 4 * S, len(word), step=30 * S)
                stroke(d, partial(under, k), 7 * S, RED)
            x += w + d.textlength(" ", font=fnt)
        y += 112 * S


def caption(d, scene, t, S):
    group, _ = scene.caption(t)
    if not group:
        return
    text = " ".join(w["word"] for w in group)
    fnt = fit(d, text, CAVEAT, int(76 * S), 960 * S, "Bold")
    d.text((540 * S, 1745 * S), text, font=fnt, fill=GRAY, anchor="mm")
