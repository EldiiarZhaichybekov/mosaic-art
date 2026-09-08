# Result 2 corrective pass

## Scope and root cause

Result 1 geometry, internal selection, renderer and SVG/JPG exporters remain
unchanged; both existing SHA-256 guards pass. API changes add request metadata,
alpha logging, exception classification and a local static route only.

The previous physical skeleton joined exact endpoints only at degree-two nodes,
discarded paths shorter than 60 mm before understanding junction continuations,
then greedily placed independent tiles and clipped the target into 36 mm spans.
This both lost useful fragments and concealed missing structure in the target.

## Structural and physical changes

Result 2 retains all accepted candidates until endpoint/tangent assembly. A
spatial endpoint grid selects deterministic best continuations, including graph
junctions; each endpoint is consumed only once. Small aligned gaps require
observed geometry on both sides, enough combined length, tangent compatibility
and samples inside the original silhouette. Gaps above 4 mm (maximum 7 mm)
also require observed edge support or a supported reflected counterpart.

Generic horizontal/vertical/PCA-axis reflection is scored using boundary
agreement and sampled mask IoU. Only confidence >=0.85 enables assistance.
Reflection can support an existing partial path but never synthesizes an absent
branch. OBSERVED / RECONSTRUCTED / SYMMETRY_ASSISTED origins, constituent IDs,
scores, support, length, tile cost and rejection reasons are retained.

Minor paths and small loops are rejected after assembly. Major paths are ranked
by physical extent per tile cost with supported symmetry confidence. An
eight-state, three-phase bounded placement search rewards coherent contacts and
coverage. Full major target paths remain intact rather than being clipped to
individual tiles. Missing portions of these targets therefore remain honestly
visible; a drawn target is not a guarantee that every internal millimeter is tiled.

Outer placement remains first. Additional physical-scale regularization and
coarse target passes resolve the previous bat failure. If all passes fail, two
smaller centered fits are tried without rotating/stretching the object. These
are deterministic geometry fallbacks, not HTTP retries. Optional structural
analysis failure permits an outer-only result and never discards Result 1.

Every accepted/exported layout still passes exact 30x3 mm dimensions, <=150,
oriented-rectangle SAT, full-corner 15 mm safe area, cyclic outer gaps 0–2 mm,
and conservative <=3 mm centerline deviation against the Result 2 target.
Contact and T-junctions remain allowed. Targets and placements remain separate.

## Human reference and measurements

The supplied file in Downloads was verified as an Adobe Illustrator export,
inspected as XML and rendered locally for visual review. Its unmodified SVG is
`tests/fixtures/human-400x400mm.svg`. Production code never reads this fixture.
It contains 131 target paths and 104 red manual lines. Their lengths are about
29.98–30.56 mm; normalizing to rigid 30x3 mm reveals 3 overlapping pairs. Thus it
is a structural direction, not a physically certified layout to copy.

Benchmark: same butterfly source and unchanged Result 1; bounding-box alignment
to the human reference. 49 manual lines qualify as internal (>7 mm from the
original outer contour). Their 1 mm samples are compared with generated skeleton
tile centerlines at a 6 mm reference-comparison tolerance. This is separate from
the hard 3 mm tile-to-target tolerance.

| Measurement | Before | After |
| --- | ---: | ---: |
| Total physical tiles | 68 | 96 |
| Outer tiles | 42 | 42 |
| Skeleton tiles | 26 | 54 |
| Major reference sample coverage | 44.0% | 68.3% |
| Reference internal tiles with >=80% coverage | 17/49 | 29/49 |
| Physical validator | pass | pass |
| Bat fixture | no layout | 40 valid tiles |

Visual review confirms substantially more large internal directions; it does
not establish parity with the manual reference. Some loops/corners and branch
ends are still imperfect. Outer antennae remain lost in the coarse physical
target; source-to-target p95 boundary distance on this example is 44.67 mm.
The unchanged original silhouette is available in Result 1. This source
deviation must NOT be confused with the <=3 mm placement-to-target bound.
The naive same-group adjacent contact ratio is 87.5% before / 71.1% after,
but groups changed from clipped fragments to whole reconstructed paths, so this
is not evidence of improved continuous coverage. Complete long-path fidelity
still needs improvement; increased tile count alone is not a success criterion.

## Reliability, threshold and localization

No format-specific intermittent server failure was reproduced. Full endpoint
tests cover JPEG, RGB PNG, opaque RGBA, meaningful transparent background,
partial alpha, light/dark backgrounds, lower contrast, both aspect ratios and
2400x1800 input, plus invalid-input recovery. Existing upload/body/pixel limits
remain 3 MiB / 4,250,000 bytes / 24 million pixels; processing max side 1024.
Client timeout remains 25 seconds; there are no external model/API calls and no
new blind retry. Deployment-level timeout/resource termination can still happen
outside Python; the client retains HTTP/network/timeout distinctions.

Client diagnostics now carry request ID, MIME, bytes, duration and HTTP status
to Result 2. Non-network browser failures no longer become NETWORK_ERROR.
Server logs add decoded alpha/dtype and preserve stage timings and stack traces;
MemoryError and uncaught OpenCV errors have separate codes. No image bytes are
logged. Error responses remain safe, with localizable notices for size, format,
foreground, contour, timeout, network, response parsing, client and resource errors.

Threshold was never sent to the server; its handler explicitly skips server
geometry. It and the related trace selector are hidden when server geometry is
active, and always hidden for Result 2. Legacy client behavior is preserved.

`tile-i18n.js` extends the existing I18N catalog for RU/EN/ZH. Physical controls,
status, editor, errors, orientation, mounting header/footer, export notices and
developer layer labels are localized. Numeric CSV column IDs remain a stable
machine-readable schema. Existing Result 1 translations were not rewritten.
One existing reusable toast service handles all notices; no alerts/library added.

Opt-in `?debug=1` exposes observed, reconstructed, symmetry-supported, rejected,
target skeleton, outer, tiles and collision-rejection layers plus downloadable
geometry diagnostics. Normal exports ignore debug layer selection.

## Verification and files

Run from the repository root:

    node tests/test_tiles.cjs
    node tests/test_structures.cjs
    node tests/test_client.cjs
    /private/tmp/mosaic-contour-env/bin/python -m unittest discover -s tests -q
    /private/tmp/mosaic-contour-env/bin/python tests/prepare_tile_fixtures.py
    node tests/check_physical_fixtures.cjs
    node tests/check_golden.cjs

26 JS physical/structural groups, client error/recovery checks and 18 Python
tests (including the multi-format matrix). Real butterfly and bat layouts plus
generic leaf, vehicle and star geometries pass. There is no configured separate
typecheck/linter/bundler build; JS parsing, Python tests and diff checks apply to
the existing static-site/Python architecture.

Browser QA: uploaded butterfly, both outputs, 96 tiles, RU/EN/ZH, mounting plan,
select/reject unsafe move/delete/undo, SVG download matching all 96 placements,
and 30x40 Auto choosing landscape (75 tiles). Manual portrait recomputes to 59
tiles on 300x400 mm. Mobile viewport 390 px had no horizontal overflow; the
normal browser console had no warnings/errors.

Changed: tile-layout.js, tile-ui.js, tile-worker.js, new tile-i18n.js, index.html,
api/contour.py, tests/fixtures and new structural/upload/golden tests, existing
fixture/smoke scripts and reports. No new runtime dependency or AI service.

## Remaining limitations

This is a bounded heuristic optimizer, not a proof of feasibility for every
processable image. Exceptionally narrow/complex silhouettes can still fail
after all passes, and are reported honestly with Result 1 retained. No fabricated
ellipse or generic substitute is returned. Coarse fallback can sacrifice
recognizable small exterior features; golden outer fidelity is not yet solved.
Some long internal paths remain partly uncovered near tight bends/collisions.
Manual edits remain session-local. These limitations mean the complete aspirational
golden-reference quality target has not yet been reached, despite the measured
and physically validated improvement in this corrective release.

Publication uses the existing GitHub → Vercel workflow; no Sites migration.
