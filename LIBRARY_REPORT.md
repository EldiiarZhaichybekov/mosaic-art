# Content library implementation report — 2026-09-21

1. **Architecture:** one versioned public content library, separate from processing.
2. **Shared implementation:** one `AssetLibraryUI`, one existing modal shell; no
   duplicate photo/silhouette dialogs.
3. **Repository:** `createRepository`, `getAssets`, `getCategories`, `getAsset`;
   static JSON loader can be replaced without rebuilding cards.
4. **Start:** upload, ready silhouettes, choose photo. Existing upload unchanged.
5. **Migration:** original metadata and polygon sources are in `library/`; all
   14 geometries compare exactly with legacy PRESETS. Legacy fast path preserved.
6. **Photos:** become normal decoded source images; same source event, contour
   endpoint, optimized worker and physical-layout handoff as ordinary uploads.
7. **Silhouettes available:** 14, not 150 artificial placeholders.
8. **Photos available:** 2 licensed samples. Both visibly marked challenging;
   these are not claims of commercial-grade conversion quality.
9. **Categories:** 12 reusable localized categories; only nonempty categories
   shown for each mode. Uploaded source remains available in silhouette mode.
10. **Search:** localized titles, tags, category label; normalized substring,
    debounce, no AI or expensive fuzzy search.
11. **Mobile:** viewport-bounded sheet, 16px search/no autofocus, two-column grid,
    horizontal category rail, bottom safe-area footer, page-scroll restoration.
    Tested in WebKit and Chromium; real iPhone keyboard testing still recommended.
12. **Prepared outputs:** real R1 and R2 caches for both samples at 400×400 mm.
    R2 may be absent. Different canvas → ordinary processing, not stretched cache.
13. **Cache:** schema + algorithm fingerprint + source SHA-256 + asset + canvas
    + shape validation. Missing/invalid/stale artifacts fail back to normal upload.
14. **Provenance:** author/source/license/rights URL stored for both photos;
    Sprinno CC0 apple; Paolo Neo public-domain egg. No private uploaded images used.
15. **Import:** documented in `LIBRARY.md`. Source + thumbnail + manifest metadata;
    prepared results optional. No UI code edits required for a new silhouette.
16. **Performance:** 24 assets/page, lazy thumbnails, originals only on selection.
    A local 500-record/100-search run measured 18 ms; browser search including
    100ms debounce measured 122 ms. These are local measurements, not phone SLAs.
17. **Localization:** RU/EN/ZH new strings, titles and categories; documented
    deterministic fallback for future incomplete translations.
18. **Result 1:** server/refinement/renderer/export source checks unchanged.
19. **Result 2:** algorithm and worker hashes unchanged. Only a cache-loading UI
    method was added; the frozen UI test strips exactly this hook before hashing.
20. **Result 3:** solver/hybrid/DeepSeek source unchanged, existing handoff verified.
    No real model inference measurements are claimed by this task.
21. **Verification:** npm test; typecheck (library contract scope); ESLint (new
    library/tooling scope); static production-input build validation; 18 Python
    tests. Browser coverage: upload, preset, photo, R1/R2/R3, prepared/fallback,
    categories/search, localization, source error, mobile viewport/footer,
    existing exports, sizes/orientations, timeout and retry. Cache/catalog failures
    in tests are intentionally injected; ordinary processing calls the real API.
22. **Files:** `asset-library.js`, `asset-library-ui.js`, `asset-library.d.ts`,
    `library/**`, `scripts/{library-version,prepare-library-photo,check-static}.cjs`,
    `LIBRARY.md`, this report, package/lock/ESLint config; integration edits in
    `index.html`, `optimized-ui.js`, `workspace-refinement.js/.css`; library unit,
    type and browser tests; async waits in three existing browser tests; local
    test-server asset routes; frozen-hook check; ignore node_modules.
23. **Commit:** local commit containing this report (hash supplied in handoff).
    Unrelated `.DS_Store` files excluded.
24. **Deployment:** this change has NOT been pushed or deployed. Existing
    production is https://prismosaic.com; no production serverless build or
    production smoke test is claimed here. `npm run build` validates the static
    application's production inputs, not Vercel's Python/Node packaging.
25. **Remaining content:** more curated/licensed photographs and approved
    silhouettes are needed. The frozen photo processing still detects texture;
    samples are honestly marked difficult. A deployment/content review and a
    physical-iPhone acceptance check remain before broad customer rollout.

## Scope boundary

The reusable infrastructure is implemented and locally verified. A large curated
customer collection and universally clean photo conversion are not delivered by
this change. Neither fabricated content nor algorithm modifications were used to
hide that limitation.
