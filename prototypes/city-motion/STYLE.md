# Style (edit when you edit `src/style.css`)

Vertical 1080x1920, 30 fps. Deterministic render: no rAF, CSS animation, Date or Math.random.

| token | hex | role |
|---|---|---|
| `--bg` | `#0b1020` | background, blue-black |
| `--panel` | `#18213d` | map land, boxes |
| `--ink` | `#f5f0e6` | text, warm white |
| `--acc` | `#ffc233` | the one accent: the city, the number, the spoken word |
| `--dim` | `#8492b4` | labels, borders, other cities |
| `--hot` | `#ff5a4f` | alert only (unused so far) |

- Type: Poppins ExtraBold (bundled, OFL) uppercase for headline, numbers and captions; system sans for labels (28-30 px, tracked caps) and body (40-46 px). Source note 24 px is chrome.
- Layout: series chip y=120; kicker y=280; headline y=340 (fits 952 px, 112 px max); free area 952x640 at y=670; captions y=1410; source y=1620; nothing below 1700 (platform UI).
- Accent means "this city": only the episode's city, its number and the word being spoken are yellow.
- Rhythm: 120 BPM, beat 0.5 s; scene length = narration rounded up to a beat; transition overlap one beat (`rise`, `wipe` alternating).
- Visuals land on the narrated word (`cue()` in `scenes/captions.js`): a year, a number.
- Easing: `outExpo` entrances and counters, `outCubic` fades and fills, `inOutCubic` camera, `outBack` dots and caption pop.
- Content: every number on screen comes from `data/<code>.json` (IBGE) and every scene shows its source.
