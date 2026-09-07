# Deterministic line-art pipeline

## Findings and changes

The previous path was decode → resize → alpha/LAB–GrabCut → external contour →
three-scale Canny → strict persistence gate → component score → diagnostic line-art.
Useful lines were lost **before scoring** when dense images required all three
scales. Fixed 7-pixel silhouette exclusion and minimum component sizes compounded
this. Final composition itself removed no lines.

`contour_geometry.py` replaces only internal-line selection. Segmentation, the
external contour, physical dash conversion and export geometry are unchanged.
GrabCut's random seed is now fixed for reproducible repeated requests. Baseline
contour and dash arrays were verified equal with identical RNG initialization.
It uses bilateral noise suppression, LAB gradients, three relative blur scales,
local RMS contrast normalization, and edge thinning (not a mask skeleton).
Chains terminate at graph endpoints/junctions. Scores combine length, curvature,
scale persistence, local edge evidence, component support, junctions and reflected
support. Weak contrast or absence at a coarse scale alone no longer vetoes a line.
Tiny spurs still need adequate length. No polygon simplification is applied.

Most spatial parameters depend on the object bounding-box diagonal: blur scale,
boundary exclusion, tangent measurement span, gap limit (1.8%), local contrast
window, chain length normalization and minimum spur length (0.4%). Pixel floors
remain where discrete raster operations require them. Confidence thresholds are
module constants `OBSERVED_THRESHOLD` and `RECONSTRUCTION_THRESHOLD`.

Geometry metadata includes centroid, bounding box, PCA axes/orientation, mask
components, approximate reflection overlap, and observed-edge graph endpoints
and junctions. Both PCA axes are tested. Symmetry contributes at most 5% to a
score, only with adequate mask overlap; it never generates mirrored geometry.
Mask skeleton branches were not used: medial axes do not reliably correspond to
photographic drawing lines. Large shape branches are not separately classified.

## Reconstruction safeguards

Only endpoints of two existing accepted chains can propose a short straight
tangent bridge. Both tangents must agree (cosine ≥ .85), the gap must stay inside
the allowed mask, and at least 70% of its interior must have gradient evidence.
Endpoint pixels do not count as that evidence. Mean edge evidence and combined
confidence must also pass. Endpoints are used once; crossing an existing stroke
is rejected. Proposals are not fed recursively into reconstruction. The algorithm
does not invent large parts or repair fully blank regions. Straight interpolation
is deliberately conservative; large curved gaps remain open.

## Diagnostics and reliability

`api/contour.py` returns original, mask, external contour, raw edges, candidates,
rejected, observed, proposed/accepted repairs and combined final line-art, plus
the prior tiny-dash preview. `debug` contains chain scores/reasons/coordinates,
geometry, thresholds and stage times. At most 2,000 longest chain records and
1,000 bridge records are returned; truncation and original counts are explicit.
Preview images are compressed diagnostic rasters; internal paths are not yet
part of the physical SVG export.

The API keeps a 3 MiB original-file limit and adds a body cap and response budget.
Pillow reads dimensions before OpenCV allocates decoded pixels (24 MP limit).
PNG/JPEG/WebP encoding, request shape and finite canvas dimensions are checked.
Malformed input gets structured 400/413/415 errors. Unexpected failures retain
their stage and traceback in server logs. Request IDs are sanitized; JSON logs
contain sizes, MIME and timings, never image bodies. No external models, API
requests or subprocess inference are present.

The browser distinguishes HTML 413/504 responses, malformed JSON, abort during
body reading, transport errors and invalid response geometry. The existing
25-second browser abort remains; it does **not** kill server-side OpenCV. Vercel's
actual execution/memory limits are deployment settings and were not inferred
from local tests. Abrupt platform kills require platform logs. Historical failed
production requests were unavailable, so their precise causes remain unproven.

Existing reusable toasts handle info/success/warning/error; errors have alert
semantics and manual close. Outdated responses cannot replace newer uploads or
presets. The same file can be selected again after a failure. No automatic retry.

## Verification

Run from the repository root with installed requirements:

    python -m unittest discover -s tests -v
    node tests/test_client.cjs
    PYTHONPATH=. python tests/preview_contour.py /private/tmp

Regression cases cover evidence-only bridging, outside-mask rejection, configurable
confidence, no invention from symmetry, weak lines at two sizes, malformed images,
unsupported MIME, invalid canvas, large body, injected pipeline failure, and recovery.
Client mocks cover HTTP 413/504/500, invalid JSON shape, body abort, network error,
large file and successful subsequent request. These are not full browser UI tests.

Local bat and butterfly previews were inspected and iterated to reduce texture.
Full processing was approximately 0.6 seconds per image locally, not a cloud SLA.
No original dragonfly image was available. Generalization to people, leaves,
flowers, cars and household objects remains unvalidated on photographs. Geometry
rules have no object-class branches, but that alone does not prove universality.

## Remaining limitations / next step

Some real fine texture survives; double edges and short gaps remain. Single-view
gradient evidence cannot always distinguish texture from important structure.
PCA reflection is approximate and less informative for round or asymmetric shapes.
Graph scores remain heuristics requiring a diverse regression corpus. Obtain the
original dragonfly and representative annotated examples across subject types,
then compare edge precision/recall and connectivity at multiple resolutions.
Separately validate vectorization/physical dashes after the line selection stage
has met visual acceptance criteria.

Changed implementation files: `contour_geometry.py`, `api/contour.py`, `index.html`,
`requirements.txt`; regression tooling is in `tests/`.
