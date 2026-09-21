# Prismosaic shared content library

## Architecture and scope

`asset-library.js` is the data/source boundary. `createRepository({load})` exposes
`getAssets`, `getCategories`, `getAsset`; the default loader reads
`/library/manifest.json`. Swap this boundary for a CMS/server repository later;
the card UI must not import the manifest. `asset-library.d.ts` defines the public
metadata contract. `asset-library-ui.js` implements BOTH modes in the existing
modal created by `workspace-refinement.js`.

Upload / silhouette / photo are available from the start screen. The properties
panel can replace the image or open either library mode. Native preset selection
remains hidden as a compatibility adapter, not a customer-facing dropdown.

No R1/R2 processing algorithms, R3/DeepSeek, physical constraints, inventory or
exports changed. The only processing integration hooks are optional prepared
input in `handleFile` and `OptimizedUI.loadPrecomputed`. Result 3 still receives
the same R1 data through its original source adapter and computes as needed.
It does not use a new photo-specific solver.

## Content in this revision

- 14 existing silhouettes, exact original coordinates; geometry equality tested.
- 2 openly licensed PHOTO SAMPLES, not a finished curated commercial collection.
- No generated/fake 150-item customer catalog. Large catalogs exist only in tests.
- All titles and 12 category definitions have RU/EN/ZH values. Only populated
  categories are shown. Translation fallback: requested language → EN → RU → first.
- Apple: Sprinno, CC0 1.0. Source:
  https://commons.wikimedia.org/wiki/File:Red_apple_on_white_background.jpg
  License: https://creativecommons.org/publicdomain/zero/1.0/
- Egg: Paolo Neo, released to public domain (PD-author). Source/rights:
  https://commons.wikimedia.org/wiki/File:Egg_on_white_background.jpg
- These samples were resized/re-encoded, not synthesized. No people, trademarks,
  private uploaded files or credentials are included. Originals are self-hosted.
- Curation review: recognizable outer shape, clean background, but the FROZEN
  pipeline still extracts surface texture. Both carry `conversionQuality:difficult`
  and a localized challenging-sample label. Neither is rated excellent. A first,
  more textured apple candidate by Amada44 was rejected and is not shipped.

**Additional curated/licensed photo assets are still required.** The same is true
of the 66–136 additional silhouette designs needed to reach an 80–150 collection.
Do not change algorithms or silently hand-edit cached geometry to improve a sample.

## Add a silhouette (no UI code edits)

1. Create `library/silhouettes/<unique-id>/source.json` with
   `{"schemaVersion":1,"polys":[[[x,y],[x,y],[x,y]]]}`; at least 3 finite points per
   polygon. Use a clean closed silhouette, no scripts or arbitrary SVG input.
2. Add a monochrome `thumb.svg`, with a suitable viewBox, or optimized WebP.
3. Append manifest metadata: id, type=`silhouette`, localized title, categoryId,
   tags, thumbnailUrl, sourceUrl. Optional featured/sortOrder/difficulty/recommendedCanvas.
4. Do NOT add a `presetId` for new content. Existing presetId entries deliberately
   use the frozen, fastest original geometry path. New entries load polygons and
   feed the existing `setShape`/`run` path; no image analysis or AI call is needed.
5. Test shape selection, all canvas formats and physical/export behavior.

## Add a photo

1. Verify rights FIRST. Record author, sourceName, license, licenseUrl, sourcePage.
   Rights must cover intended commercial use; account for people/trademarks and
   attribution/share-alike restrictions. Public sources are not automatically free.
2. Store `library/photos/<unique-id>/source.jpg` (PNG/WebP also supported), ≤3 MiB.
   Keep enough resolution for the existing pipeline; no unnecessary upscaling.
   Create `thumb.webp`, normally ≤480 px wide, reasonable compression. The small
   CC0 apple source is 281×303 and deliberately is not upscaled.
3. Add localized metadata and search tags to the manifest. Set suitability
   honestly: conversionQuality=`excellent|good|difficult`, difficulty=`easy|medium|hard`.
4. Review actual R1/R2 and a physical layout, not just the source thumbnail.
5. Optional `recommendedCanvas` is metadata only: never automatically changes the
   customer's canvas or orientation.
6. Optional prepared output: follow below. Without it the normal upload path runs.
7. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; browser tests;
   commit/publish only after content review. Empty categories stay hidden.

## Prepared R1/R2 and invalidation

Run from project root with the existing Python dependencies installed:

```
PYTHON=/path/to/venv/bin/python node scripts/prepare-library-photo.cjs <photo-id>
```

This calls the UNMODIFIED Flask contour endpoint via its test client, then the
UNMODIFIED `OptimizedContour.generate`. No external model request. It writes real
outputs, source SHA-256, canvas, asset ID, schemaVersion, processingVersion to
`library/photos/<id>/precomputed.json`. Add
`"precomputed":{"url":"/library/photos/<id>/precomputed.json"}` to that asset.
Current preparation targets 400×400 mm only. Other canvas sizes safely take the
normal path; no geometric rescaling of cached coordinates. Result 2 may be omitted
from the bundle: Result 1 loads and Result 2 is computed on demand.

`scripts/library-version.cjs` fingerprints R1/R2 source dependencies plus the
requirements file. `library/processing-version.json` is the current fingerprint.
The static build rejects an out-of-date fingerprint. On algorithm changes,
regenerate it (preparation does this), then regenerate/review caches or let them
fall back. A runtime/dependency upgrade can also alter results: update requirements
or the fingerprint input list/epoch and re-review. This is not a claim of identical
OpenCV floating point output across operating systems.

The browser validates version, source bytes, asset ID, dimensions and path shapes.
Missing cache, bad JSON, timeout, hash/version/canvas mismatch → original source
goes through `handleFile` and `/api/contour`. Never shows a fake processing result.
20-second bounded fetches, 4 MiB JSON budget and 3 MiB photo budget apply. Cache
diagnostics contain asset ID/reason only. No source pixels/base64 or secrets logged.

## Performance and mobile

24 catalog cards per page plus optional uploaded-image card. Search is NFKC/case
normalized substring matching across translated titles, tags and category label;
100ms input debounce. `Show more` is explicit; double requests are blocked. Only
lazy thumbnails load in the grid; originals/precomputed data load on selection.
500-entry benchmarks are in unit/browser tests, not the production manifest.

One modal shell, monochrome selection, keyboard buttons, focus trap, Escape close,
safe error dialog and retry. Mobile retains 16px search/no autofocus, visual
viewport tracking, page-scroll restoration, separately scrollable grid and bottom
safe-area footer. Categories form a horizontally scrollable rail within the sheet.
Pinch zoom is NOT disabled. Desktop keeps its centered modal.

## Verification and build

`npm ci --ignore-scripts` installs development-only ESLint/TypeScript.
`npm run typecheck` checks the library metadata/repository contract and typed usage,
not the entire historical inline-JS application. `npm run lint` lints the new
library modules/tooling and parses the existing entry scripts.
This is a static, unbundled project: `npm run build` validates production scripts,
asset references, manifest and fingerprint in place; it is NOT a Vercel serverless
build. Existing Vercel Python/Node deployment stays separate.

Browser tests use Playwright installed in the developer environment:

```
PORT=8092 node tests/serve_hybrid.cjs
BASE_URL=http://127.0.0.1:8092 node tests/browser_asset_library.cjs
BASE_URL=http://127.0.0.1:8092 node tests/browser_library_viewport.cjs
BASE_URL=http://127.0.0.1:8092 node tests/browser_library_mobile.cjs
```

Set NODE_PATH/BROWSER_PATH/PLAYWRIGHT_BROWSERS_PATH for installed browsers as
needed. Real fallback processing requires the existing Flask service on port5059.
WebKit viewport simulation does not prove behavior on every physical iPhone;
retain a real-device acceptance check for keyboard, Safari zoom and safe areas.
No real DeepSeek call is required or claimed by these library tests.
