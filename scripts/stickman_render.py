#!/usr/bin/env python3
"""Animated stick-figure chapter renderer (styles: pop = A2 Modern Pop, line = B1 Minimal Line Art).

Usage: python stickman_render.py <spec.json>
Spec: { style, out | poster, width, height, fps, durationSec, audio?, words[], heading, emphasis, enter, beats[] }.
Beats fire on a spoken cue word (`cue`) or a chapter fraction (`at`) and may set
`pose`, `face`, `prop` (+ `slot`, `id`, `lines`, `items`, `label`), `set` {id, state} or `sfx`.
"""
import sys

from stickman.render import main

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: stickman_render.py <spec.json>")
    main(sys.argv[1])
