"""Seat clustering and active-speaker selection for track_speaker.py."""

TALK_THRESHOLD = 1.5
SWITCH_RATIO = 1.5
SMOOTHING = 0.5
SWITCH_HOLD = 3
SEAT_TOLERANCE = 0.07
MIN_PRESENCE = 0.3


def assign_seats(per_sample):
    """Cluster detections by x into seats; returns [(center_x, size)] kept."""
    seats = []
    for faces in per_sample:
        for fx, size, _ in faces:
            near = min(seats, key=lambda s: abs(s["x"] - fx), default=None)
            if near is None or abs(near["x"] - fx) > SEAT_TOLERANCE:
                near = {"x": fx, "size": size, "seen": 0}
                seats.append(near)
            near["x"] = (near["x"] * near["seen"] + fx) / (near["seen"] + 1)
            near["size"] = max(near["size"], size)
            near["seen"] += 1
    floor = MIN_PRESENCE * len(per_sample)
    kept = [s for s in seats if s["seen"] >= floor]
    return kept or ([max(seats, key=lambda s: s["seen"])] if seats else [])


def follow_speaker(per_sample, seats):
    """Per sample, the seat position of the active speaker.

    Smoothed mouth energy per seat, hysteresis against the held speaker, and a
    minimum dwell: a challenger must keep winning for SWITCH_HOLD samples
    before the crop moves, then the switch is back-dated to when it started
    leading so the crop does not arrive late on a real change of speaker.
    """
    energy = [0.0] * len(seats)
    held = None
    challenger, streak = None, 0
    chosen, held_at = [], []
    for faces in per_sample:
        for i, seat in enumerate(seats):
            hits = [a for fx, _, a in faces if abs(fx - seat["x"]) <= SEAT_TOLERANCE]
            new = max(hits) if hits else 0.0
            energy[i] = SMOOTHING * new + (1 - SMOOTHING) * energy[i]
        best = max(range(len(seats)), key=lambda i: energy[i])
        if held is None:
            held = best if energy[best] >= TALK_THRESHOLD else max(
                range(len(seats)), key=lambda i: seats[i]["size"])
        elif (best != held and energy[best] >= TALK_THRESHOLD
                and energy[best] > SWITCH_RATIO * max(energy[held], 0.1)):
            streak = streak + 1 if best == challenger else 1
            challenger = best
            if streak >= SWITCH_HOLD:
                for k in range(len(chosen) - (streak - 1), len(chosen)):
                    chosen[k] = best
                held, challenger, streak = best, None, 0
        else:
            challenger, streak = None, 0
        chosen.append(held)
        held_at.append(faces)
    return [_face_x(seats[seat], faces) for seat, faces in zip(chosen, held_at)]


def _face_x(seat, faces):
    """Where the seat's face actually is in this sample, else the seat's mean."""
    near = [fx for fx, _, _ in faces if abs(fx - seat["x"]) <= SEAT_TOLERANCE]
    return min(near, key=lambda fx: abs(fx - seat["x"])) if near else seat["x"]
