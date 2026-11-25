"""Stick-figure renderer checks: `python -m unittest discover -s tests/python` (needs Pillow)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from stickman import captions, pen  # noqa: E402
from stickman.motion import Timeline, cue_time  # noqa: E402
from stickman.render import main  # noqa: E402
from stickman.rig import POSES, joints  # noqa: E402

WORDS = [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, w in enumerate("Um DROP no banco de produção.".split())]


class MotionTest(unittest.TestCase):
    def test_cue_fires_just_before_the_spoken_word_ignoring_case_and_accents(self):
        self.assertAlmostEqual(cue_time({"cue": "producao"}, WORDS, 10), 2.5 - 0.12)
        self.assertAlmostEqual(cue_time({"cue": "drop"}, WORDS, 10), 0.5 - 0.12)

    def test_unmatched_cue_falls_back_to_the_chapter_fraction(self):
        self.assertEqual(cue_time({"cue": "nada", "at": 0.5}, WORDS, 10), 5.0)

    def test_pose_tweens_from_the_previous_state(self):
        tl = Timeline([{"at": 0, "pose": "talk"}, {"cue": "banco", "pose": "alarm"}], WORDS, 4)
        prev, cur, k = tl.value_at("pose", "stand", 1.5)
        self.assertEqual((prev, cur), ("talk", "alarm"))
        self.assertGreater(k, 0)

    def test_mouth_moves_only_while_a_word_is_spoken(self):
        tl = Timeline([], WORDS, 4)
        self.assertEqual(tl.speaking(0.45), 0.0)
        self.assertGreater(tl.speaking(0.7), 0.0)


class RigTest(unittest.TestCase):
    def test_every_pose_keeps_the_lowest_foot_on_the_ground(self):
        for name, pose in POSES.items():
            j = joints(pose, 300, 1500, 80, 0.4)
            self.assertAlmostEqual(max(j["foot_l"][1], j["foot_r"][1]), 1500, msg=name)


class CaptionTest(unittest.TestCase):
    def test_phrases_are_short_and_break_at_punctuation(self):
        groups = captions.phrases(WORDS)
        self.assertTrue(all(len(g) <= captions.MAX_WORDS for g in groups))
        self.assertEqual(groups[-1][-1]["word"], "produção.")

    def test_partial_stroke_is_drawn_by_arc_length(self):
        half = pen.partial([(0, 0), (10, 0), (10, 10)], 0.5)
        self.assertEqual(half[-1], (10, 0))


class PosterTest(unittest.TestCase):
    def test_both_styles_render_a_full_size_poster(self):
        from PIL import Image
        for style in ("pop", "line"):
            with tempfile.TemporaryDirectory() as tmp:
                spec = {"style": style, "width": 1080, "height": 1920, "heading": "Acesso demais", "emphasis": "demais",
                        "poster": os.path.join(tmp, "p.png"),
                        "beats": [{"at": 0, "pose": "point"}, {"at": 0.2, "prop": "database", "id": "db"},
                                  {"at": 0.5, "set": {"id": "db", "state": "danger"}}]}
                with open(os.path.join(tmp, "s.json"), "w", encoding="utf-8") as f:
                    json.dump(spec, f)
                main(os.path.join(tmp, "s.json"))
                self.assertEqual(Image.open(spec["poster"]).size, (1080, 1920))


if __name__ == "__main__":
    unittest.main()
