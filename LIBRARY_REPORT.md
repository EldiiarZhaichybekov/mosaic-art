# Project flow and content library report — 2026-09-22

## Project/source UX

1. The empty state now has exactly three equal first-class choices: upload an
   image, ready silhouettes, and Prismosaic photos.
2. The working sidebar and properties panel are hidden until a project exists.
   The old center/right duplicate source controls are hidden compatibility
   adapters, not customer-facing actions.
3. An active project shows its source name, source type, and one **Change source**
   action. It opens the same three-choice flow from Result 1, 2, or 3.
4. A library card only selects an item. The source is committed after **Select**.
   **Back** returns from a first-time library visit to Home; **Cancel** returns
   from replacement to the unchanged current project.
5. The logo is an accessible Home button. Home navigation preserves the current
   in-memory project and exposes **Continue current project**.
6. Canvas size, 30×40 orientation, language, and existing UI state are not reset
   by Home navigation, source-choice cancellation, or source replacement.
7. Every new customer-facing string is present in RU, EN, and ZH.

## Shared library and scaling

1. One `AssetLibraryUI` and one modal/sheet serve silhouette and photo modes.
   Search, populated categories, cards, confirmation, lazy thumbnails, and the
   24-card page size are shared.
2. Upload is a source type, not an `Uploaded` silhouette category.
3. The catalog contains **38 silhouettes** and **2 photos** (40 selectable
   assets total). No placeholder count is reported as customer content.
4. Silhouette counts by category: insects 3, animals 3, symbols 11, birds 2,
   marine 2, nature 6, transport 3, flowers 3, architecture 3, objects 2.
5. Photo counts by category: nature 2.
6. The 24 new silhouettes are original company-owned geometric shapes. The two
   photos retain explicit provenance: Sprinno / CC0 1.0 and Paolo Neo / public
   domain. No random web images or user uploads were added.
7. `scripts/import-library-batch.cjs` imports a versioned JSON batch, creates
   silhouette source/thumbnail files or copies approved photo files, validates
   and merges metadata, and updates the manifest. The example batch is
   `library/batches/prismosaic-owned-shapes.json`.
8. To reach the approximate 100 + 100 target, **62 silhouettes** and **98
   licensed/owned photos** remain. The content target did not block the UX and
   scalable import infrastructure.

## Processing boundaries

1. All 14 original preset geometries still compare exactly with the legacy
   presets. Imported silhouettes use the existing preset-compatible UI path.
2. Curated photos use the existing decoded-image, contour endpoint, optimized
   worker, and physical-layout handoff. Optional prepared Result 1/2 data remains
   supported; missing or incompatible data falls back to normal processing.
3. Result 1 server/refinement/renderer/export checks are unchanged.
4. Result 2 algorithms and worker are unchanged.
5. Result 3, DeepSeek, physical inventory, solver, collision rules, canvas
   physics, mounting plan, and exports are unchanged.

## Verification

- `npm test`: 18/18 test files passed, including frozen processing fingerprints.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Chromium project-flow test passed: three sources, both library Back paths,
  confirm, Home/Continue, Change source/Cancel, 30×40 preservation, RU/EN/ZH,
  and desktop/mobile layouts.
- Chromium mobile-library test passed at 390, 430, 375, and 360 px widths plus a
  short viewport and desktop transition; no covered final cards or page overflow.
- A test-only 500-record catalog continues to validate pagination/search without
  loading full source files into the grid.

Production deployment and its smoke-test URL are recorded in the final handoff
for the commit containing this report. Unrelated `.DS_Store` files are excluded.

## Known limitations

- The content catalog has not yet reached 100 silhouettes and 100 photos.
- The two licensed photos are intentionally marked challenging and are not a
  claim that every arbitrary photograph produces a perfect contour.
- A physical iPhone acceptance pass remains recommended even though the mobile
  viewport behavior is covered by Chromium/WebKit-oriented browser tests.
