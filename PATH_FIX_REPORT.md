# Path-aware line-art implementation and verification

The measured failure was individual rejection of short candidate fragments,
including already connected coherent structures. The large canvas also displayed
external dashes only. Both paths are now addressed.

## Implementation

`rescue_paths` indexes existing candidate chain endpoints by vertex. At each
junction, deterministic best-angle pairings connect at most two compatible ends
(35° limit). This creates paths, not component-wide acceptance. Only already
observed pixels participate. Path curvature is measured over 1.2% of the object
diagonal; tangent estimation uses 0.6%. This avoids treating raster stair steps
as independent path turns. Closed candidate loops are retained by individual
scoring but are not arbitrarily paired into other paths.

Individual threshold remains .56. A rescue path must be at least 5.5% of the
object diagonal, have continuity ≥ .7, mean/median evidence ≥ .25/.2, and weighted
path score ≥ .68. Scale persistence contributes to that score without independently
vetoing coherent fine-scale-only evidence. Individual fragments still need local
evidence ≥ .15. The path layer supplies context before short fragments are finally
rejected; it does not lower the global minimum length or score.

Actual missing gaps are left to the existing bounded evidence/tangent bridge
pass after observed-path rescue. Large, unsupported, out-of-mask or crossing gaps
are not reconstructed. No detector/segmentation change or class-specific rule.

The known regression fragments 4441 and 4605 remain individually rejected but
are now accepted by their coherent path. The bat has 119 rescued segments; the
butterfly has 63. Whole components are not retained.

## Canvas/export contract

API `internal_lines` traces the final observed + path-rescued + reconstructed
raster graph and transforms it with the same pixel-to-mm mapping as the outline.
`finalLineArt(data)` closes the external contour and appends these internal paths.
Main canvas, SVG and JPG all use this same geometry. Uploaded photos now display
continuous final line-art; old physical 30-mm external dashes remain an API field
and preset behavior but are not the final photo rendering. This is the intentional
render/export change requested in this phase, not physical plate optimization.

Verbose previews and score metadata require `?debug=1`; the normal API response
omits diagnostic images and metadata. Debug includes individual, rescued, rejected,
reconstructed layers, path IDs/scores and individual decisions. The diagnostic
instrumentation is retained. `SEGMENT_DIAGNOSIS.md` records the historical baseline.

## Reliability and checks

Existing structured errors, bounded upload size, dimensions-before-decode check,
request IDs, stage/stack logging and persistent closable error toasts remain.
The prior HTTP/body-abort/invalid-response distinctions and upload generation
guard are retained. No automatic retry was introduced.

Commands: `python -m unittest discover -s tests -q`, `node tests/test_client.cjs`,
`git diff --check`. The project has no configured typecheck/lint/build toolchain;
JavaScript parsing, Python test imports and whitespace checks are run instead.
Tests cover fragmented-path rescue, rejection of attached spurs/isolated noise,
no whole-component rescue, evidence/orientation/gap safety, instrumentation parity,
final SVG composition and API failures/recovery.

Six available local fixtures were exercised: bat_source.webp, test_butterfly.webp,
and synth_busy/thin/dark_on_light/light_on_dark.png. Runtime ~0.2–2.2 seconds locally.
Bat path analysis ~72 ms; total ~0.7 seconds. Timings separately expose edges,
candidate thinning, graph, individual scoring, path scoring, reconstruction,
vectorization and diagnostics. Cloud timings are not inferred from these numbers.

Browser: local upload produced visible internal line-art on the main canvas;
success toast appeared and no warning/error console logs were captured. SVG/JPG
downloads succeeded; downloaded SVG contains 299 paths (outline + 298 internal).
At 390 px viewport, canvas width was 368 px with no horizontal body overflow.
Timeout/network/invalid/large-file/recovery cases are exercised by automated
client/API tests; not every error was manually induced through the browser.

Production smoke uses a generated geometric PNG (`tests/smoke_deployed.py`), not
a private photograph. The endpoint reports pipeline version and deployment SHA
at GET /api/contour for version verification.

## Limits

The original dragonfly remains unavailable and is not claimed verified. Some
texture, double edges and fragmented curves remain. The path mechanism is
conservative at ambiguous junctions. Dense texture can still be accepted by the
unchanged individual baseline; the new path stage is not a general denoising
solution. Segmentation limitations and the upload size cap remain. Physical plate
packing and 30-mm dash optimization are outside this implementation.
