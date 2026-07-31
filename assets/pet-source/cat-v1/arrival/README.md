# Cat v1 arrival source package

This directory contains source-only artwork for the hidden-companion recall sequence. It is not
deployed directly and does not modify `public/pet`, the runtime manifest, or application code.

## Coordinate contract

- All `frames/arrival-01.png` through `arrival-10.png` files are untrimmed `384x576` RGBA PNGs
  using a top-left origin.
- The existing `walk/walk-01.png` through `walk-08.png` files remain `384x512`. For this sequence,
  paste them at `(0, 64)` on the arrival canvas. Their shared source foot baseline at `y=480`
  therefore becomes `y=544`.
- Generated book and pose masters ending in `-source.png` remain untrimmed `1024x1536` RGBA PNGs.
  Their `-384x576.png` derivatives use the arrival canvas and must not be trimmed or recentered.
- `frames/arrival-10.png` is pixel-identical to the current normal-open layered static composite
  scaled to `384x576`. Integration can swap to the live layered renderer after this frame without
  a visual jump.

Recommended anchors on the arrival canvas:

- character/root: `(192, 544)` during the walk and takeoff;
- blue book center: `(200, 408)`;
- book upper-cover contact: approximately `y=386`;
- final static root: `(192, 553)`.

## Recommended sequence

Play the existing eight walk frames first at `135 ms` per frame for a slower, softer entrance.
Then play the ten arrival frames with these durations:

| Frame | Duration | Meaning |
| --- | ---: | --- |
| `arrival-01.png` | 120 ms | final walk pose; faint book glow begins |
| `arrival-02.png` | 105 ms | soft crouch; book reaches 44% opacity |
| `arrival-03.png` | 95 ms | deeper takeoff crouch; book reaches 76% opacity |
| `arrival-04.png` | 90 ms | airborne high key; book is fully materialized |
| `arrival-05.png` | 90 ms | airborne lower key |
| `arrival-06.png` | 105 ms | front paws land on the upper cover |
| `arrival-07.png` | 110 ms | blue-white magic flash masks the redraw handoff |
| `arrival-08.png` | 120 ms | seated pose settles at 97% scale |
| `arrival-09.png` | 100 ms | small downward overshoot |
| `arrival-10.png` | 160 ms | exact normal layered resting pose |

The walk plus transition takes about `2.18 s`. For reduced-motion mode, skip the walk and frames
01–09, fade directly to frame 10 over 160–220 ms.

## Source files

- `book/book-standalone-source.png`: isolated blue book, `1024x1536` RGBA production master.
- `book/book-standalone-384x576.png`: full arrival-canvas book derivative.
- `book/book-magic-01.png` through `book-magic-04.png`: independently usable book reveal layers.
- `poses/jump-air-source.png`: isolated airborne production master.
- `poses/jump-land-source.png`: isolated landing/crouch production master.
- `poses/jump-air-high-384x576.png`, `jump-air-low-384x576.png`, and
  `jump-land-384x576.png`: positioned full-canvas transition keys.
- Files ending in `-green.png` are retained chroma-key generation masters, not integration assets.
- `frames/arrival-01.png` through `arrival-10.png`: ready-to-integrate source frames.

## Review and validation

- `review/arrival-preview.gif`: timing preview on a light background.
- `review/arrival-frames-light.png` and `arrival-frames-dark.png`: adjacent-frame continuity and
  transparent-edge review sheets.
- `review/book-magic-light.png` and `book-magic-dark.png`: isolated book reveal review.
- `review/eyes-before-after-light.png`, `eyes-before-after-dark.png`,
  `eyes-face-closeup-light.png`, and `eyes-face-closeup-dark.png`: eye-state comparison.
- `review/eyes-display-size.png`: normal, half, and closed states at the desktop display size.
- `review/mechanical-report.json`: dimensions, alpha bboxes, transparent-corner checks, walk
  baselines, low-alpha chroma spill counts, and final-frame equality.

Regenerate review material and derivatives with:

```sh
python assets/pet-source/cat-v1/arrival/build_preview.py
```

The generator writes only inside `assets/pet-source/cat-v1`.
