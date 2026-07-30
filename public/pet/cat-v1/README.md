# Cat companion asset contract

The site keeps the CSS fallback renderer active while `manifest.json` has `"ready": false`.
Do not enable the formal renderer until the complete package passes `npm run check:pet:ready`.

## Source and runtime canvases

- The preserved PNG production sources use one transparent `1024x1536` canvas and top-left
  origin. Their directory is recorded by `source.coreDirectory` as a repository-relative path,
  never as a browser `/pet/` URL. Source paths may not contain `..` or resolve outside the repo.
- The browser loads only the WebP files under `runtime/`. All 19 runtime layers use one
  transparent `384x576` canvas and top-left origin.
- Never trim, independently crop, recenter, or independently resize a source or runtime layer.
- Generate every runtime layer together with `npm run prepare:pet-runtime`. The script uses the
  same Lanczos resize for all core layers, lossless WebP for eye/eyelid/mouth patches, and
  quality-88 WebP with alpha quality 100 for the remaining artwork.
- Normalized anchors and hit areas apply unchanged after uniform resizing.

## Required layers

- Base: `shadow`, `tail`, `body`, `head`, `ear-left`, `ear-right`, `paw`.
- Eyes: `eye-base-left`, `eye-base-right`, `pupil-left`, `pupil-right`.
- Eyelids: left/right variants for both `half` and `closed`.
- Mouths: `closed`, `small`, `open`, and `smile`.

The eye bases stay still, pupils follow gaze, half eyelids express mood, and closed eyelids
perform blinking. All mouth images must cover the same muzzle region so switching shapes does
not expose seams or the original mouth underneath.

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
  current playback contract.

## Activation checklist

1. Export all 19 PNG source layers at `source.canvas` and all 8 source walk frames at
   `source.walk.canvas`.
2. Run `npm run prepare:pet-runtime` to create the 27 WebP runtime files without overwriting the
   PNG sources.
3. Run `npm run check:pet` while iterating. It checks both source and runtime sets for file type,
   dimensions, alpha, non-empty pixels, and transparent canvas area.
4. Confirm the neutral composite plus open/closed eyes, every mouth, ear/tail/paw extremes, and
   the complete walk cycle on light and dark backgrounds at desktop size and high DPR.
5. Set `ready` to `true` only after visual QA, then run `npm run check:pet:ready` and
   `npm run build`.

The build validates both preserved PNG sources and optimized WebP runtime files, normalized
metadata, the 300 KiB first-visible runtime budget for the 19 core layers, and the 800 KiB
full-package runtime budget. A missing or mismatched runtime asset causes a safe fallback to the
CSS cat rather than a partially assembled character.

Only `manifest.json`, this README, and the exact WebP files referenced under `runtime/` may appear
in the deployed `dist/pet/` tree. Production PNGs, concepts, masters, reviews, QA images, and
temporary files stay under the repository's non-deployed `assets/pet-source/cat-v1/` tree.
