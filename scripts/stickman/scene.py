"""Per-frame scene state shared by the styles: pose, face, gaze, props with states, captions."""
from . import captions
from .motion import Timeline, ease_out, ease_out_back, lerp
from .rig import add_life, joints, pose_at


class Scene:
    def __init__(self, spec: dict, layout: dict):
        self.spec = spec
        self.layout = layout
        self.duration = float(spec.get("durationSec") or 6.0)
        self.words = spec.get("words") or []
        self.timeline = Timeline(spec.get("beats") or [], self.words, self.duration)
        self.phrases = captions.phrases(self.words)
        self.enter = bool(spec.get("enter"))

    def character(self, t: float, S: float) -> dict:
        lay = self.layout
        talk = self.timeline.speaking(t)
        angles, walked = pose_at(self.timeline, t, self.enter)
        angles = add_life(angles, t, talk)
        home = lay["home_x"]
        x = lerp(-0.18 * lay["width"], home, ease_out(walked)) if self.enter else home
        r = lay["head_r"] * S
        j = joints(angles, x * S, lay["ground_y"] * S, r, lay.get("shoulder_w", 0.0))
        prev, cur, k = self.timeline.value_at("face", "neutral", t)
        face = cur if k > 0.5 else prev
        props = self.props(t)
        look = 0.0
        if props:
            slot = lay["slots"].get(props[-1]["slot"], (home, 0, 0))
            look = max(-1.0, min(1.0, (slot[0] - home) / 300))
        return {"j": j, "r": r, "face": face, "talk": talk, "look": look, "t": t}

    def props(self, t: float) -> list:
        """Visible props with entrance progress, current state and seconds since that state was set."""
        sets = [(bt, b["set"]) for bt, b in self.timeline.beats if "set" in b and bt <= t]
        out = []
        for kind, age, beat in self.timeline.props(t):
            pid = beat.get("id", kind)
            state, since = beat.get("state", ""), age
            for bt, change in sets:
                if change.get("id") == pid:
                    state, since = change.get("state", state), t - bt
            out.append({"kind": kind, "age": age, "beat": beat, "state": state, "since": since,
                        "slot": beat.get("slot", "right"), "appear": ease_out_back(age / 0.45), "alpha": ease_out(age / 0.3)})
        return out

    def caption(self, t: float):
        return captions.active(self.phrases, t)

    def sfx_cues(self, prop_sound: str) -> list:
        cues = []
        for bt, b in self.timeline.beats:
            if "sfx" in b:
                cues.append((bt, b["sfx"]))
            elif "prop" in b:
                cues.append((bt, prop_sound))
            if "set" in b:
                state = b["set"].get("state", "")
                cues.append((bt, "alarm" if state == "danger" else "ding"))
        return cues
