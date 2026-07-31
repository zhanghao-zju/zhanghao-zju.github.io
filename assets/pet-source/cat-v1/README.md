# Cat v1 production sources

This directory is intentionally outside `public/` and is never deployed.

- `core/` contains the 19 required `1024x1536` RGBA PNG layers on one untrimmed,
  top-left-origin canvas.
- `walk/` contains the eight `384x512` RGBA walk frames plus their review material. The
  production frames are named `walk-01.png` through `walk-08.png` and share one baseline.
- `extras/mouth-yawn.png` is an optional source expression that is not referenced by the current
  runtime manifest.
- `arrival/` contains the source-only recall transition: a slower reuse of the eight walk frames,
  an independently layered blue-book materialization, two jump keys, ten full-canvas transition
  frames, and light/dark/continuity QA. See `arrival/README.md` for its canvas and timing contract.
- Local-only `qa/`, `reviews/`, `layers/`, `concepts/`, and `masters/` folders preserve the
  production and review trail when available. They are ignored by Git because the final source
  layers above are sufficient to reproduce the deployed runtime.

To revise the runtime, first set `public/pet/cat-v1/manifest.json` to `ready: false`, update the
PNG sources without trimming or recentering any layer, and run:

```sh
npm run prepare:pet-runtime
npm run check:pet
```

After light/dark, expression, motion, walk, desktop-size, mobile, and high-DPR QA pass, set
`ready: true`, run `npm run check:pet:ready`, and rebuild the site. The browser must load only the
WebP files under `public/pet/cat-v1/runtime/`; production sources must stay here.
