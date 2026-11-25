"""Kokoro timing, measured eases and video QA: `python -m unittest discover -s tests/python`."""
import os
import subprocess
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

import kokoro_tts  # noqa: E402
import video_qa  # noqa: E402
from stickman import eases  # noqa: E402


class KokoroTimingTest(unittest.TestCase):
    def test_clauses_keep_punctuation_and_drop_empty_fragments(self):
        self.assertEqual(kokoro_tts.split_clauses("Olá,  dev!  Tudo bem? ..."), ["Olá,", "dev!", "Tudo bem?"])

    def test_decimal_commas_and_thousand_dots_do_not_split_a_clause(self):
        self.assertEqual(kokoro_tts.split_clauses("Custa R$ 2,50 e 1.000 usos. Fim"), ["Custa R$ 2,50 e 1.000 usos.", "Fim"])

    def test_words_fill_the_clause_in_order_without_overlap(self):
        words = kokoro_tts.word_times("Um DROP em produção.", 1.0, 2.0)
        self.assertEqual([w["word"] for w in words], ["Um", "DROP", "em", "produção."])
        self.assertAlmostEqual(words[0]["start"], 1.0 + kokoro_tts.EDGE)
        self.assertAlmostEqual(words[-1]["end"], 3.0 - kokoro_tts.EDGE, places=2)
        self.assertTrue(all(a["end"] <= b["start"] + 1e-6 for a, b in zip(words, words[1:])))

    def test_longer_words_get_more_time(self):
        a, b = kokoro_tts.word_times("é inconstitucionalissimamente", 0, 3)
        self.assertGreater(b["end"] - b["start"], 3 * (a["end"] - a["start"]))

    def test_sentence_end_pauses_longer_than_a_comma(self):
        self.assertGreater(kokoro_tts.pause_for("fim."), kokoro_tts.pause_for("meio,"))


class EaseTest(unittest.TestCase):
    def test_every_curve_starts_at_zero_and_lands_on_one(self):
        for name in eases.FRAMES:
            f = getattr(eases, name)
            self.assertEqual((f(0), f(-1), f(1), f(2)), (0.0, 0.0, 1.0, 1.0), name)

    def test_pop_over_overshoots_about_eight_percent_late(self):
        peak_t = max(range(101), key=lambda i: eases.pop_over(i / 100)) / 100
        self.assertAlmostEqual(eases.pop_over(peak_t), 1.08, delta=0.02)
        self.assertTrue(0.6 < peak_t < 0.85)

    def test_soft_land_front_loads_travel_and_exit_back_loads_it(self):
        self.assertGreater(eases.soft_land(0.3), 0.6)
        self.assertLess(eases.accel_exit(0.3), 0.1)


class VideoQaTest(unittest.TestCase):
    def test_frozen_tail_and_cut_are_detected(self):
        diffs = np.array([5.0] * 30 + [0.0] * 30)  # 2 s of motion, then 2 s frozen
        dists = np.zeros(60)
        dists[14] = 0.9  # hard cut at frame 15 (1 s)
        report = video_qa.analyse_motion(diffs, dists, fps=15)
        self.assertEqual(report["cuts_sec"], [1.0])
        self.assertEqual(report["final_hold_sec"], 2.0)
        self.assertFalse(video_qa.gate({**report, "mean_volume_db": -20})["final_hold_sec"])

    def test_quiet_audio_fails_and_a_lively_clip_passes(self):
        report = video_qa.analyse_motion(np.array([3.0] * 45), np.zeros(45), fps=15)
        self.assertTrue(all(video_qa.gate({**report, "mean_volume_db": -18}).values()))
        self.assertFalse(video_qa.gate({**report, "mean_volume_db": -60})["mean_volume_db"])

    def test_end_to_end_on_a_synthetic_render(self):
        with tempfile.TemporaryDirectory() as tmp:
            clip = os.path.join(tmp, "c.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=108x192:d=2:r=15",
                            "-f", "lavfi", "-i", "sine=f=440:d=2", "-shortest", "-pix_fmt", "yuv420p", clip], check=True)
            frames = video_qa.read_frames(clip)
            report = video_qa.analyse_motion(*video_qa.frame_metrics(frames))
            self.assertEqual(report["final_hold_sec"], 0.0)
            self.assertGreater(video_qa.mean_volume(clip), -35)


if __name__ == "__main__":
    unittest.main()
