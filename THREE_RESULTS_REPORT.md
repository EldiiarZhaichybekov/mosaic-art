# DrawACRL: three results

## Architecture and preservation

1. Result 1 remains the detailed extraction; Result 2 is an independent optimized vector drawing; the former physical Result 2 is now Result 3.
2. Result 1 extraction, defaults, accepted internal paths, renderer and exports are unchanged. The existing frozen renderer/export source test passed. `contour_geometry.py` is unchanged. Server changes only expose new static files for local development.
3. Result 2 normalizes to object scale, assembles fragments before filtering, retains the outer silhouette with a small scale-relative simplification tolerance, then removes isolated micro-detail, compact minor loops, repeated short hatching and near-duplicate paths. It does not run the physical tile solver.
4. Coherent path selection uses endpoint proximity, tangent agreement, combined length, spatial extent, connectivity and whole-path duplicate support. Long narrow closed structures are protected by a dedicated regression test.
5. Reconstruction uses the existing bounded geometric assembler. Short aligned gaps must stay inside the silhouette; longer allowed gaps additionally require observed or symmetry support. Unsupported branches are not generated.
6. Symmetry is confidence-gated and only supports observed geometry; arbitrary asymmetric subjects are not mirrored. Path metadata includes observed/reconstructed/symmetry-assisted origin, contributing IDs, bridges, importance and continuity.
7. AI is **stubbed, not enabled**: `requestPlan(graph, provider)` and `validatePlan` define a provider-injection interface and validate numbered-path decisions. Missing/invalid providers fall back deterministically. No credentials, AI image generation or external model requests are used. Live server/environment configuration remains future work. Only validated whole-path removal currently affects selection; suggested relations cannot bypass geometric validation.
8. Result 3 retains the existing 30 × 3 mm solver, editor, mounting plan, exports and validation. Its input remains Result 1 for compatibility. `asPhysicalInput` supplies a cloned optimized-input adapter for a future explicit migration.
9. The threshold is a legacy client-only control. It does not affect server extraction and remains hidden for uploaded server-contour results. No default extraction behavior was changed.
10. Existing server tests pass for JPEG, RGB/RGBA PNG, meaningful transparency, opaque backgrounds, varying image sizes, invalid images and resource/timeout failures. Result 2 runs in an isolated worker and cannot mutate the retained Result 1 input.

## Visual observations and timing

The comparison page is `/tests/optimized_inspector.html`. It displays Result 1 geometry beside Result 2 using the same neutral stroke; it does not replace the production Result 1 renderer. Fixtures contain vectors only, not uploaded image data.

| Fixture | Internal paths before → after | Local optimization |
| --- | --- | --- |
| Original bat | 298 → 57 | 2.36 s |
| Butterfly | 212 → 28 | 1.28 s |
| Supplied drawing | 108 → 34 | 0.29 s |
| Asymmetric geometry | 7 → 3 | 0.01 s |

11. Visual comparison shows reduced clutter, preserved silhouettes and major internal paths. Butterfly decorative circles are substantially reduced; bat wing divisions remain recognizable. Some double edges, jagged source geometry and short remnants remain. This is not a claim of hand-drawn-quality abstraction for every input. The asymmetric fixture is synthetic, not a broad real-world dataset.
12. Passed: 17 optimized checks, four optimized fixtures, existing physical/structural/client suites, 18 Python tests, physical fixture and golden checks, JavaScript syntax checks and `git diff --check`. This static/Flask project has no separate configured typecheck, lint or production build command. Existing physical fixtures remain butterfly 96 and bat 40 tiles. Browser upload → detailed → optimized → physical → detailed was checked with the supplied PNG; physical output was 50 validated tiles. SVG/JPG export actions were exercised; optimized SVG is separately checked to contain the exact path coordinates and no raster embedding.
13. New strings use the existing RU/EN/ZH catalog. All three languages were checked in the browser. Mobile-width three-button selection remains usable. Existing legacy Result 1 labels are deliberately not rewritten here.
14. Files: `optimized-contour.js`, `optimized-worker.js`, `optimized-ui.js`; integration in `index.html`, `tile-ui.js`, `tile-layout.js`, `tile-i18n.js`; static routes in `api/contour.py`; new optimized tests, vector fixtures, comparison page and fixture preparer; expanded production smoke script.
15. Production: https://mosaic-art-rho.vercel.app/ (existing GitHub → Vercel workflow).
16. Deployed revision is reported by GET `/api/contour` and in the delivery message. The smoke script checks exact deployed JS contents, the image endpoint, optimized vectors and physical validation.
17. Limitations: deterministic geometric importance is not semantic understanding; no live AI/environment provider is wired; physical Result 3 intentionally still consumes the original detailed geometry; inherited Result 1 limitations remain. Download completion depends on the browser's download handling, while exported geometry is covered programmatically.

## Diagnostics and exports

Open the app with `?debug=1` for input, candidate, merged, rejected, reconstructed, symmetry and final layers. Major-path metadata and stage timings are inspectable. Reconstruction timing includes fragment merging; render time is captured separately by the UI. Normal users see only the optimized drawing, status, recompute and exports.

Result 2 SVG serializes its actual vector paths; JPG and preview draw the same final geometry. Debug-layer selection never changes the exported geometry. Result 2 errors use the shared notification service and preserve Result 1, with a recompute action available.
