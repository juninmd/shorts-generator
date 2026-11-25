"""A2 holographic UI: glass panels with glow, props in cyan line art, heading pill and captions."""
import math

from .motion import ease_out
from .pen import partial, stroke
from .props import shapes_for
from .typo import fit, font, mono

POPPINS = "Poppins-ExtraBold.ttf"
NAVY, BLUE, CYAN = (15, 23, 42), (37, 99, 235), (34, 211, 238)
ROLES = {"ink": (8, 145, 178), "fill": (125, 211, 252), "paper": (224, 247, 255), "danger": (239, 68, 68),
         "ok": (34, 197, 94), "accent": (56, 189, 248), "muted": (186, 230, 253)}
FILL_ALPHA = {"paper": 120, "fill": 110, "muted": 110, "accent": 230, "danger": 200, "ok": 190, "ink": 230}


def _rgba(role, a):
    return ROLES[role] + (int(a),)


def draw_prop(d, p, layout, S, t):
    cx, cy, size = layout["slots"].get(p["slot"], layout["slots"]["right"])
    bob = 7 * math.sin(2 * math.pi * 0.45 * t + cx)
    shake = 10 * math.sin(t * 70) * max(0.0, 1 - p["since"] / 0.5) if p["state"] == "danger" else 0
    scale = (0.55 + 0.45 * p["appear"]) * size * S
    alpha = p["alpha"]
    ox, oy = (cx + shake) * S, (cy + bob) * S
    tf = lambda q: (ox + q[0] * scale, oy + q[1] * scale)
    pad = 1.22  # glass card behind every hologram
    card = [tf((-pad, -pad)), tf((pad, -pad)), tf((pad, pad)), tf((-pad, pad))]
    for grow, a in ((0.05, 26), (0.025, 40)):
        g = [tf((-pad - grow, -pad - grow)), tf((pad + grow, -pad - grow)), tf((pad + grow, pad + grow)), tf((-pad - grow, pad + grow))]
        d.rounded_rectangle([g[0], g[2]], radius=0.2 * scale, outline=CYAN + (int(a * alpha),), width=round(0.05 * scale))
    d.rounded_rectangle([card[0], card[2]], radius=0.16 * scale, fill=(240, 252, 255, int(150 * alpha)),
                        outline=CYAN + (int(220 * alpha),), width=max(2, round(0.022 * scale)))
    typed = ease_out(max(0.0, p["age"] - 0.3) / 1.2)
    for shape in shapes_for(p["kind"], p["beat"], p["state"]):
        if shape[0] == "poly":
            d.polygon([tf(q) for q in shape[1]], fill=_rgba(shape[2], FILL_ALPHA[shape[2]] * alpha))
        elif shape[0] == "line":
            pts = partial([tf(q) for q in shape[1]], ease_out(p["age"] / 0.6))
            stroke(d, pts, 0.07 * scale, _rgba(shape[2], 60 * alpha))
            stroke(d, pts, 0.032 * scale, _rgba(shape[2], 255 * alpha))
        else:
            _, pos, text, rel, role = shape
            shown = text[: max(0, int(len(text) * typed))] if p["kind"] == "terminal" else text
            size = int(rel * scale)
            if p["kind"] == "terminal":  # shrink long commands to stay inside the window
                while size > 10 and d.textlength(text, font=mono(size)) > 1.76 * scale:
                    size -= 2
            fnt = mono(size) if p["kind"] == "terminal" else font(POPPINS, size)
            anchor = "lm" if p["kind"] in ("terminal", "checklist") else "mm"
            d.text(tf(pos), shown, font=fnt, fill=NAVY + (int(255 * alpha),) if role == "ink" else _rgba(role, 255 * alpha), anchor=anchor)


def _words(d, x, y, words, fnt, colors, anchor_w):
    cur = x - anchor_w / 2
    for word, color in zip(words, colors):
        d.text((cur, y), word, font=fnt, fill=color, anchor="lm")
        cur += d.textlength(word + " ", font=fnt)


def heading(d, spec, t, S):
    text = spec.get("heading", "")
    if not text:
        return
    k = ease_out(t / 0.4)
    y = (215 - 40 * (1 - k)) * S
    fnt = fit(d, text, POPPINS, int(60 * S), 860 * S)
    width = d.textlength(text, font=fnt)
    box = [(540 * S - width / 2 - 44 * S, y - 66 * S), (540 * S + width / 2 + 44 * S, y + 66 * S)]
    d.rounded_rectangle(box, radius=66 * S, fill=(255, 255, 255, int(215 * k)), outline=CYAN + (int(230 * k),), width=round(4 * S))
    emph = spec.get("emphasis", "").lower().split()
    words = text.split()
    colors = [(BLUE if w.lower().strip(".,!?:") in emph else NAVY) + (int(255 * k),) for w in words]
    _words(d, 540 * S, y, words, fnt, colors, width)


def caption(d, scene, t, S):
    group, spoken = scene.caption(t)
    if not group:
        return
    words = [w["word"] for w in group]
    text = " ".join(words)
    pop = ease_out((t - float(group[0]["start"])) / 0.16)
    fnt = fit(d, text, POPPINS, int(66 * S * (0.92 + 0.08 * pop)), 940 * S)
    width = d.textlength(text, font=fnt)
    y = 1715 * S
    d.rounded_rectangle([(540 * S - width / 2 - 34 * S, y - 58 * S), (540 * S + width / 2 + 34 * S, y + 58 * S)],
                        radius=30 * S, fill=(255, 255, 255, 225), outline=(203, 213, 225, 255), width=round(2 * S))
    colors = [(BLUE if i == spoken else NAVY) + (255,) for i in range(len(words))]
    _words(d, 540 * S, y, words, fnt, colors, width)
