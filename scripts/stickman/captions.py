"""Single-line semantic captions: words grouped into short phrases at punctuation and length limits."""

MAX_WORDS, MAX_CHARS, HOLD = 4, 24, 0.35


def phrases(words: list) -> list:
    groups, cur = [], []
    for w in words:
        cur.append(w)
        text = " ".join(x["word"] for x in cur)
        if len(cur) >= MAX_WORDS or len(text) >= MAX_CHARS or w["word"][-1:] in ".,!?:;":
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def active(groups: list, t: float):
    """(phrase words, index of the word being spoken or -1) for time t, or (None, -1) between phrases."""
    for i, g in enumerate(groups):
        start = float(g[0]["start"])
        nxt = float(groups[i + 1][0]["start"]) if i + 1 < len(groups) else float("inf")
        end = min(float(g[-1]["end"]) + HOLD, nxt)
        if start - 0.05 <= t < end:
            spoken = [j for j, w in enumerate(g) if float(w["start"]) <= t]
            return g, spoken[-1] if spoken else -1
    return None, -1
