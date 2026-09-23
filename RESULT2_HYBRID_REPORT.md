# Result 2 hybrid refinement and automatic processing

## Implementation

The existing Result 1 extraction and deterministic Result 2 baseline are unchanged.
`optimized-ui.js` now awaits the baseline, a single `/api/result2` DeepSeek request,
and a cancellable geometry/physical validation worker before publishing Result 2.
Cached library Result 2 data is a **baseline**, not a bypass around refinement.

DeepSeek uses the existing server-only configuration and client. The model remains
centralized in `server/deepseek-config.cjs`; no Gemini dependency was introduced.
The input contains the original photo (or preset vector rendering), a numbered
baseline rendering and bounded path metadata. No image or key is written to logs.

The model returns at most 12 structured, non-conflicting operations referencing
observed paths, never arbitrary coordinates or a generated raster:

- Remove short, low-importance internal noise; capped at 15% of internal length.
- Restore a missing observed Result 1 path, at least 10 source mm, inside the outline
  and not a near-duplicate.
- Simplify an internal path within a 1 mm bidirectional deviation bound, preserving
  endpoints and at least 90% of its length.
- Bridge two aligned internal endpoints at most 6 mm apart, inside the outline,
  away from other paths. No unsupported external contour modifications.

The external silhouette is immutable in this initial version. These limits are
deliberately conservative; they do not guarantee perceptual improvement.
Inputs exceeding 96 baseline paths use the deterministic fallback.

Unsafe individual edits are discarded in one local filtering pass. If any remain,
the unchanged physical solver computes baseline and candidate layouts for the
current format/orientation. Candidate acceptance requires nonempty valid stock,
collision/safe-area compliance, no outer-coverage loss over 1 percentage point and
no retained-path coverage loss over 10 points. Failure returns the baseline; there
is no automatic model retry. Existing final physical/export validation still runs.
Physical validity is **not** a claim of complete contour coverage or visual fidelity.

Both physical workers now require the final supplied Result 2; neither regenerates
it. Result 3 follows that exact geometry after its existing fit transform. Changes
to format/orientation keep the same Result 2 and rerun the original physical solver.
Result 1 algorithms, baseline Result 2 math, tile solver, inventories and export
renderers remain unchanged and are protected by existing/focused regression tests.

## Workflow and cancellation

Selecting an image/preset starts Result 1 → final Result 2 → Result 3 and opens the
finished layout. No stage-tab click is required. A single existing modal shows
stages 1/3, 2/3 and 3/3, a spinner and Cancel. No fabricated percentage is shown.
Source revisions, abortable fetch and terminated workers prevent stale completion.
Existing results are invalidated on source replacement. Completed stages remain
viewable after later-stage failure; recompute retries explicitly.

Limits: DeepSeek request 30 s on the server, client request/body 40 s, geometry
workers 120 s; Vercel function maxDuration 50 s. No unbounded retry loop.
`DEEPSEEK_RESULT2_ENABLED=0` is the server kill switch; production defaults on,
local/preview require explicit `=1`. A disabled/unavailable/invalid AI response
produces a visible fallback notice and retains the deterministic geometry.

## Verification (2026-09-23)

- `npm run typecheck`, `npm run lint`, `npm run build` passed.
- `npm test`: 31 passing test entries, 1 real-provider integration test skipped.
- New tests cover all edit operations, immutable input/outline, unknown IDs,
  coordinate injection, retained coverage, exact worker handoff, four canvas modes,
  API validation/errors/redaction, client errors, timeout, abort and recovery.
- Browser: preset butterfly and cached apple reached Result 3 automatically with
  AI unavailable. Full noncached blue-butterfly photo passed real local extraction,
  mathematical optimization and layout; delayed mock transport returned no edits.
- Visible progress/cancel/recompute verified on desktop and a 390 × 844 viewport.
- No browser console errors in these scenarios. Real model quality is **not tested**.

`npm run visual:result2` creates `/private/tmp/prismosaic-result2-regression/` with
four baseline/edited/physical comparisons and JSON metrics. The decisions are
explicitly synthetic, not AI measurements. The browser blocked opening its local
file URL; the generated comparison report has not been visually reviewed here.

Local UI delay fixture: run `PORT=8094 RESULT2_TEST_MODE=delayed-noop node
tests/serve_hybrid.cjs`. The page is prominently marked NO REAL AI. This test-only
transport is not present in the production endpoint.

Real API test: securely provide `DEEPSEEK_API_KEY` to the process, set
`RUN_DEEPSEEK_INTEGRATION=1` and `RESULT2_REQUEST_FIXTURE` to a JSON request file
containing `{context, images:{source,result2}}`, then run
`node --test tests/test_result2_adaptation.cjs`. Do not commit photographic request
fixtures or credentials. A missing key/fixture explicitly skips this test.

## Deployment status and remaining verification

Not published in this task. Existing Vercel project `mosaic-art` was verified;
Production lists encrypted `DEEPSEEK_API_KEY`. `vercel env run -e production`
did not inject its value into the local test process. No key was exposed and the
CLI-created `.env.local` was removed; `.vercel` contains ignored project metadata.

Before claiming improved AI composition: run the new endpoint in an authenticated
Vercel environment with that secret, inspect actual accepted edits on butterfly,
animal and architectural photos, compare recognition and coverage, and check the
fallback diagnostics. Neither mocked responses nor physical checks substitute for
this real-provider visual acceptance step.
