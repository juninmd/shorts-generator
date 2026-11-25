---
name: shorts-frame-critic
description: Critique rendered frames, captions and narration copy of a vertical short before it ships (design + pt-BR copy). Use for "revisa o visual", "o vídeo está bom?", "critica esses frames", "isso parece feito por IA?".
---

# Shorts frame critic

Rubric adapted from taste-skill (MIT) and impeccable (Apache-2.0) to 1080x1920 video. Extract stills
first: `ffmpeg -ss <t> -i out.mp4 -frames:v 1 still-<t>.png` at the hook, two mid points and the CTA.
Score each check 0-2, report the total /20 and the fixes, highest impact first. Deterministic gates
come from `scripts/video_qa.py`; this skill covers what needs judgement.

## Frame (design)

1. **Safe zones**: no text in the top 10% (status bar) or bottom 20% (Shorts UI); captions sit above it.
2. **Hierarchy**: one dominant element per frame; type steps ≥ 1.3x (e.g. 260/96/52 px).
3. **Contrast**: main text ≥ 7:1, secondary ≥ 4.5:1; captions over imagery sit on a solid box.
4. **Colour**: neutral base plus one accent covering < ~3% of the frame; the accent marks the spoken
   word or the key number, nothing else.
5. **Line length**: ≤ 3 caption words per page, ≤ ~20 characters per heading line.
6. **Motion**: every entry eases out (soft_land), every exit eases in (accel_exit); at most one
   overshoot per beat; nothing frozen > 2.5 s; nothing moving constantly just to move.

## Copy (pt-BR narration and on-screen text)

7. **Hook**: the first sentence is a question or a stake, not "Olá"/"Fala galera" padding.
8. **AI tells to cut**: "Não é X, é Y" more than once; "no mundo de hoje", "revolucionário",
   "desbloqueie", "mergulhar", "jornada"; em dashes in narration; three-adjective lists.
9. **Claims**: every date, number and name is verifiable; no invented percentages.
10. **CTA**: one action, ≤ 8 words, said and shown.

## Anti-patterns (fail on sight)

Gradient text, glow on everything, emoji as decoration, centred paragraphs > 2 lines, more than two
type families, purple-blue "AI" gradients, stock "robot hand" imagery, captions that cover a face.

## Output

A table `check | score | evidence (timestamp/still) | fix`, then the 3 fixes worth doing now.
