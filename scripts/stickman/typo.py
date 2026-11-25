"""Font loading (cached, with variable-weight support) and simple fitting/wrapping helpers."""
import functools
import os

from PIL import ImageFont

FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "fonts")
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


@functools.lru_cache(maxsize=256)
def font(name: str, size: int, weight: str = ""):
    path = name if os.path.isabs(name) else os.path.join(FONTS, name)
    try:
        f = ImageFont.truetype(path, max(size, 6))
    except OSError:
        return ImageFont.truetype(os.path.join(FONTS, "Poppins-ExtraBold.ttf"), max(size, 6))
    if weight:
        try:
            f.set_variation_by_name(weight)
        except (OSError, ValueError):
            pass  # static face: its own weight is used
    return f


def mono(size: int):
    return font(MONO if os.path.exists(MONO) else "Poppins-ExtraBold.ttf", size)


def fit(d, text: str, name: str, size: int, max_w: float, weight: str = ""):
    """Largest font not above `size` whose rendering of `text` fits in `max_w`."""
    while size > 12 and d.textlength(text, font=font(name, size, weight)) > max_w:
        size = int(size * 0.92)
    return font(name, size, weight)


def wrap(d, text: str, fnt, max_w: float, max_lines: int = 2) -> list:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and d.textlength(trial, font=fnt) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    lines.append(cur)
    return lines[:max_lines]
