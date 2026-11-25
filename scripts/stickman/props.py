"""Prop geometry in a unit box (-1..1), shared by every style; each style paints the shapes its own way.

A shape is ("poly", points, role) | ("line", points, role) | ("text", (x, y), text, size, role).
Roles map to style colours: ink, fill, danger, ok, accent, paper, muted.
"""
from .pen import arc


def _rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]


def terminal(spec, state):
    lines = spec.get("lines", ["$ agent run"])
    shapes = [("poly", _rect(-1, -0.72, 1, 0.72), "paper"), ("line", _rect(-1, -0.72, 1, 0.72), "ink"),
              ("line", [(-1, -0.46), (1, -0.46)], "ink")]
    shapes += [("poly", arc((-0.86 + i * 0.13, -0.59), 0.045, 0.045, 0, 360, 12), r) for i, r in enumerate(("danger", "fill", "ok"))]
    for i, text in enumerate(lines[:4]):
        role = "danger" if state == "danger" and i == len(lines) - 1 else "ink"
        shapes.append(("text", (-0.88, -0.3 + i * 0.27), text, 0.15, role))
    return shapes


def database(spec, state):
    fill = "danger" if state == "danger" else "fill"
    body = arc((0, 0.55), 0.7, 0.2, 0, 180) + [(-0.7, -0.6)] + arc((0, -0.6), 0.7, 0.2, 180, 360) + [(0.7, 0.55)]
    shapes = [("poly", body, fill), ("poly", arc((0, -0.6), 0.7, 0.2, 0, 360), "paper")]
    shapes += [("line", arc((0, y), 0.7, 0.2, 0, 180), "ink") for y in (-0.2, 0.18)]
    shapes += [("line", [(-0.7, -0.6), (-0.7, 0.55)], "ink"), ("line", [(0.7, -0.6), (0.7, 0.55)], "ink"),
               ("line", arc((0, 0.55), 0.7, 0.2, 0, 180), "ink"), ("line", arc((0, -0.6), 0.7, 0.2, 0, 360), "ink")]
    if state == "danger":
        shapes += [("line", [(-0.5, -0.25), (-0.1, 0.05), (-0.3, 0.2), (0.15, 0.5)], "ink")]
    shapes.append(("text", (0, 0.95), spec.get("label", "produção"), 0.2, "danger" if state == "danger" else "ink"))
    return shapes


def shield(spec, state):
    pts = [(0, -0.92), (0.76, -0.62), (0.7, 0.18), (0, 0.92), (-0.7, 0.18), (-0.76, -0.62), (0, -0.92)]
    return [("poly", pts, "ok"), ("line", pts, "ink"), ("line", [(-0.32, 0.0), (-0.06, 0.28), (0.4, -0.28)], "paper"),
            ("text", (0, 1.15), spec.get("label", ""), 0.2, "ink")]


def warning(spec, state):
    tri = [(0, -0.86), (0.92, 0.76), (-0.92, 0.76), (0, -0.86)]
    return [("poly", tri, "fill"), ("line", tri, "danger"), ("line", [(0, -0.34), (0, 0.24)], "ink"),
            ("poly", arc((0, 0.5), 0.07, 0.07, 0, 360, 12), "ink")]


def checklist(spec, state):
    items = spec.get("items", [])
    shapes = [("poly", _rect(-0.8, -0.95, 0.8, 0.95), "paper"), ("line", _rect(-0.8, -0.95, 0.8, 0.95), "ink")]
    for i, text in enumerate(items[:4]):
        y = -0.62 + i * 0.42
        shapes.append(("line", _rect(-0.66, y - 0.1, -0.46, y + 0.1), "ink"))
        shapes.append(("line", [(-0.66, y - 0.02), (-0.57, y + 0.08), (-0.4, y - 0.18)], "ok"))
        shapes.append(("text", (-0.34, y - 0.09), text, 0.16, "ink"))
    return shapes


def approval(spec, state):
    shapes = [("poly", _rect(-1, -0.6, 1, 0.6), "paper"), ("line", _rect(-1, -0.6, 1, 0.6), "ink"),
              ("text", (0, -0.36), spec.get("title", "Executar em produção?"), 0.15, "ink")]
    for x, label, role in ((-0.5, "Negar", "danger"), (0.5, "Aprovar", "ok")):
        box = _rect(x - 0.4, 0.02, x + 0.4, 0.4)
        shapes += [("poly", box, role if state == label.lower() else "paper"), ("line", box, role),
                   ("text", (x, 0.1), label, 0.15, "ink")]
    return shapes


def robot(spec, state):
    head = _rect(-0.62, -0.45, 0.62, 0.45)
    eyes = "danger" if state == "danger" else "accent"
    return [("poly", head, "muted"), ("line", head, "ink"), ("line", [(0, -0.45), (0, -0.75)], "ink"),
            ("poly", arc((0, -0.82), 0.09, 0.09, 0, 360, 12), eyes),
            ("poly", arc((-0.26, -0.08), 0.11, 0.11, 0, 360, 14), eyes), ("poly", arc((0.26, -0.08), 0.11, 0.11, 0, 360, 14), eyes),
            ("line", [(-0.25, 0.22), (0.25, 0.22)], "ink"), ("text", (0, 0.7), spec.get("label", "agente"), 0.2, "ink")]


def lock(spec, state):
    body = _rect(-0.55, -0.08, 0.55, 0.78)
    return [("line", arc((0, -0.08), 0.36, 0.48, 180, 360), "ink"), ("poly", body, "fill"), ("line", body, "ink"),
            ("poly", arc((0, 0.3), 0.09, 0.09, 0, 360, 12), "ink"), ("line", [(0, 0.3), (0, 0.52)], "ink")]


def strike(spec, state):
    return [("line", [(-0.85, -0.85), (0.85, 0.85)], "danger"), ("line", [(0.85, -0.85), (-0.85, 0.85)], "danger")]


KINDS = {"terminal": terminal, "database": database, "shield": shield, "warning": warning, "checklist": checklist,
         "approval": approval, "robot": robot, "lock": lock, "x": strike}


def shapes_for(kind: str, spec: dict, state: str):
    return KINDS.get(kind, warning)(spec, state)
