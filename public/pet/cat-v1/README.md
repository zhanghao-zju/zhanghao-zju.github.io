# Cat companion asset contract

The site starts in a non-rendering loading state. The CSS fallback is enabled only when the
manifest is not ready or a formal asset fails to load or validate. Do not enable the formal
renderer until the complete package passes `npm run check:pet:ready`.

## Source and runtime canvases

- The preserved PNG production sources use one transparent `1024x1536` canvas and top-left
  origin. Their directory is recorded by `source.coreDirectory` as a repository-relative path,
  never as a browser `/pet/` URL. Source paths may not contain `..` or resolve outside the repo.
- The browser loads only the WebP files under `runtime/`. All 20 runtime layers use one
  transparent `384x576` canvas and top-left origin.
- Never trim, independently crop, recenter, or independently resize a source or runtime layer.
- Generate every runtime layer together with `npm run prepare:pet-runtime`. The script uses the
  same Lanczos resize for all core layers, lossless WebP for eye/eyelid/mouth patches, and
  quality-88 WebP with alpha quality 100 for the remaining core and walk artwork. Arrival frames
  use quality 86 with alpha quality 100 to preserve a safe margin under the full-package budget.
- Normalized anchors and hit areas apply unchanged after uniform resizing.
- The live static renderer, walk sequence, and arrival handoff use one visual rectangle on every
  page and viewport: `172x258` CSS pixels. Tablet, mobile, and article routes must not override
  that rendered character size; only the user-controlled fixed position may change.

## Required layers

- Base order: `shadow`, `book`, `tail`, `body`, `head`, `ear-left`, `ear-right`, eyes,
  mouths, then `paw`. The body source contains no book pixels.
- Eyes: `eye-base-left`, `eye-base-right`, `pupil-left`, `pupil-right`.
- Eyelids: left/right variants for both `half` and `closed`.
- Mouths: `closed`, `small`, `open`, and `smile`.

The eye bases stay still, pupils follow gaze, half eyelids express mood, and closed eyelids
perform blinking. All mouth images must cover the same muzzle region so switching shapes does
not expose seams or the original mouth underneath.

The book pivots at normalized `52.2461% 70.8333%`, rotates no more than `±1.5deg`, and rises no
more than `1.5px` in the runtime canvas while following gaze. The source-reviewed
`--pet-book-scale` defaults to `1.05` so the book reads slightly larger without breaking paw contact.

## Walk cycle

- Preserve exactly eight PNG source frames as `walk-01.png` through `walk-08.png` under the
  directory recorded by `source.walk.directory`.
- Walk sources use their own transparent `source.walk.canvas`; the current sequence is
  `384x512` with a top-left origin. It does not need to match the static-layer source canvas.
- Browser-ready walk frames live under `runtime/walk/` and must match `walk.canvas` exactly.
- Keep a shared ground baseline and registration point across all eight frames so playback does
  not wobble or jump.
- The cat faces right in every frame. Direction reversal is handled by the renderer, not by a
  second set of assets.
- Never trim, independently crop, recenter, or independently resize one walk frame. If the walk
  sequence is optimized, transform every frame together and update `walk.canvas` in the same
  change.
- `walk.frameDurationMs` must remain between 90 and 140 milliseconds; `110` milliseconds is the
  previous playback contract; the arrival sequence uses `135` milliseconds per walk frame.

## Arrival sequence

- Preserve exactly ten `384x576` PNG source frames under `source.arrival.directory`; runtime
  WebP frames live under `runtime/arrival/` and match `arrival.canvas`.
- Composite each `384x512` walk frame into the arrival coordinate space at `(0, 64)` before
  playing the ten arrival frames with `arrival.durationsMs`.
- The sequence is slow walk, blue-book magic, jump, landing, and stable sitting. Frame 10 must
  visually match the neutral layered static composite so the handoff to live layers has no visible jump.
- With reduced motion, skip directly to frame 10 and fade into the live composite over the
  configured `arrival.reducedMotionFadeMs` interval.

## Activation checklist

1. Export all 20 PNG source layers at `source.canvas`, all 8 source walk frames at
   `source.walk.canvas`, and all 10 source arrival frames at `source.arrival.canvas`.
2. Run `npm run prepare:pet-runtime` to create the 38 WebP runtime files without overwriting the
   PNG sources.
3. Run `npm run check:pet` while iterating. It checks both source and runtime sets for file type,
   dimensions, alpha, non-empty pixels, and transparent canvas area.
4. Confirm the neutral composite plus open/closed eyes, every mouth, ear/tail/paw extremes, and
   the complete walk cycle on light and dark backgrounds at desktop size and high DPR.
5. Set `ready` to `true` only after visual QA, then run `npm run check:pet:ready` and
   `npm run build`.

The build validates both preserved PNG sources and optimized WebP runtime files, normalized
metadata, the 300 KiB first-visible runtime budget for the 20 core layers, and the 800 KiB
full-package runtime budget. A missing or mismatched runtime asset causes a safe fallback to the
CSS cat rather than a partially assembled character.

Only `manifest.json`, this README, and the exact WebP files referenced under `runtime/` may appear
in the deployed `dist/pet/` tree. Production PNGs, concepts, masters, reviews, QA images, and
temporary files stay under the repository's non-deployed `assets/pet-source/cat-v1/` tree.
