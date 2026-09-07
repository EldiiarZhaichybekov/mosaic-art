# Diagnosis only: where internal lines disappear

No detector, scoring weight, threshold, reconstruction rule, segmentation rule,
external contour or compositor was changed. Instrumentation is opt-in and local.
Production behavior is unchanged; this diagnostic work is not deployed.

## Scope and reproducibility

The original dragonfly is NOT present in the supplied files. Its precise failure
cannot be proven without that image. The measurements below concern the existing
`bat_source.webp` regression (processed 1024×550, frame hash `8153260d93b4`) and
`test_butterfly.webp` (804×626, hash `0d61f8941424`). They demonstrate actual failure
modes in this code, not a diagnosis of an unavailable photo. OpenCV 5.0.0.

Run from the site directory:

    PYTHONPATH=. python tests/diagnose_segments.py ../bat_source.webp /private/tmp/bat-audit
    PYTHONPATH=. python tests/diagnose_segments.py ../test_butterfly.webp /private/tmp/butterfly-audit
    PYTHONPATH=. python tests/audit_path.py

Each run emits complete JSON (no 2,000-record truncation), original-resolution PNG
layers and a standalone HTML inspector. Click a candidate or enter its numeric ID
to inspect metrics, adjacent segments, cluster lengths and near-endpoint geometry.
Stable IDs hash the processed image plus the direction-normalized pixel chain;
they are repeatable for the same image/runtime and unchanged segmentation, not
cross-resolution or cross-version tracking identifiers.

## Actual stage graph

    raw = scales[0]
      → thin_edges(raw)
      → candidate pixel graph
      → chains cut wherever vertex degree != 2
      → per-chain length gate AND weighted-score gate
      → observed
      → optional evidence-gated short bridges
      → final = observed | reconstructed

`Structural Lines` in the UI is `final` WITHOUT the external contour.
`Observed Lines` is the earlier accepted observed-edge layer. It is not another
filter after Structural Lines. `Final Line-Art` paints `final` and then the external
contour. There are no additional structural/observed pruning passes.

The LARGE main canvas separately calls `drawDashes(data.dashes)`. Those dashes are
computed from the EXTERNAL contour only. Internal line-art has never entered this
main canvas/export path. If the complaint concerns that canvas, absence of internal
lines follows directly from the rendering contract, independently of scoring.

## Measured losses

| Stage / check | Bat | Butterfly |
|---|---:|---:|
| Raw edge pixels | 26,632 | 22,356 |
| Thinned candidate pixels | 22,001 | 15,847 |
| Raw → candidate components (8-connected) | 245 → 245 | 181 → 181 |
| Traced chains | 4,956 | 1,760 |
| Candidate pixels not assigned to any chain | 84 | 22 |
| Accepted chains | 468 | 396 |
| Rejected by length ONLY | 382 | 302 |
| Rejected by score ONLY | 1,402 | 557 |
| Rejected by BOTH | 2,704 | 505 |
| Observed pixels | 6,910 | 9,977 |
| Candidate pixels absent from observed | 15,091 (68.6%) | 5,870 (37.0%) |
| Reconstructed pixels | 235 | 30 |
| Final internal pixels | 7,145 | 10,007 |
| Observed pixels lost at final union | **0** | **0** |
| Final internal pixels lost in full-resolution composition | **0** | **0** |

Pixel loss during thinning is not equivalent to deleting structural information:
thinning removes stroke thickness. Component count remains unchanged in these two
images, though this alone does not prove every local path/topological detail is
unchanged. Isolated candidate pixels have no graph edge and hence no chain (84/22).
They do not explain missing long structures.

## Exact conditions

Each chain must satisfy BOTH:

    length >= max(2, object_diagonal * .004)
    score >= .56

Bat minimum length is **3.935520 px**, median chain length is **3 px**.
Length reward reaches its maximum only at **88.549207 px** (.09 × diagonal).
Every junction divides a continuous-looking structure into separately scored
chains; the parent path's length does not enter that length reward.

The unchanged score is:

    .24 * normalized_length + .20 * scale_persistence
    + .18 * normalized_local_strength + .16 * continuity
    + .13 * component_support + .04 * has_junction + .05 * symmetry

Curvature uses every sixth point for the bat. With at most two sampled points,
the code does not measure it and substitutes continuity **0.5**. This happens to
**4,559 / 4,956** chains (92%). Long fragments can also fail the score gate.

`component_support` is min(1, component_pixels / (.18 × diagonal)). **4,596** bat
chains already have the maximum 1.0. It describes shared component size, not
tangent-compatible continuation or the length of a meaningful path. There is no
connected-component pruning rule, and connectivity is not entirely absent; its
existing signal is coarse and frequently saturated.

## Concrete lost network and eight segment records

Bat component **154**, on the descending internal boundary near the outer portion
of the right wing, contains **132 candidate pixels**, **11 chains**, **5 junctions**
and **138.456 px total chain length**. Its measured geodesic diameter lower bound
is **84.556 px**. Every chain is rejected; accepted length and final pixel coverage
are both zero. The inspector shows the precise region; not every attached spur is
asserted to be useful.

A particularly clear connected subpath is **4441 → 4586 → 4605**:

- Total length **76.142 px**, all present in Candidates, none present in Final.
- The long-chain endpoints are 1.414 px apart, with that interval occupied by
  candidate #4586: there is **no missing raster gap** to reconstruct.
- Directions from six-pixel endpoint neighborhoods differ by **16.260°**.
- Chains touch through junctions but their combined path is never evaluated.

Representative records from that network (edge = normalized local strength,
continuity = exp(-curvature) or the current 0.5 default):

| ID | Length px | Mean gradient | Edge | Continuity | Connectivity | Score | Rejection |
|---|---:|---:|---:|---:|---:|---:|---|
| 4441 | 20.243 | 30.603 | .671 | .817 | .745 | .509802 | score < .56 |
| 4497 | 25.828 | 40.953 | .722 | .770 | .745 | .531780 | score < .56 |
| 4549 | 4.828 | 18.571 | .575 | .500 default | .745 | .400235 | score < .56 |
| 4585 | 2.828 | 27.568 | .741 | .500 default | .745 | .424566 | length < 3.936 AND score < .56 |
| 4605 | 54.485 | 25.451 | .616 | .598 | .745 | .557690 | score < .56 |
| 4622 | 8.000 | 36.610 | .970 | .500 default | .745 | .479915 | score < .56 |
| 4672 | 9.828 | 23.086 | .528 | .500 default | .745 | .405299 | score < .56 |
| 4673 | 2.000 | 26.448 | .782 | .500 default | .745 | .429709 | length < 3.936 AND score < .56 |

All eight have Structural/Observed/Final coverage **0%**. The complete JSON records
include stable ID, component ID, exact endpoints/path/bbox, median gradient and
edge evidence, distance to contour, score terms and neighbors. This table samples
fragments of a lost network, not eight independently proven semantically useful
structures. Other inspected losses include bat #179 (34.071 px, score .557771)
and #4392 (44.243 px, score .539438); visual inspection shows some rejected lines
are shading/texture, so simply restoring all rejected segments is not justified.

## Counterexample: rejection is not always pixel destruction

A separate strong wing-boundary path from (731,217) to (718,277) has **69.728 px**
length, 67 pixels and eight chains. Three chains (#3015, #4180, #4408) are rejected,
yet only **2/67 pixels** disappear in Observed: endpoints overlap neighboring
accepted chains. #4180 is rejected despite score .617498 because its length is
1 px, but all of its pixels survive. The report therefore measures actual pixel
coverage rather than treating rejected chain count as the amount of lost drawing.

## Diagnostic connectivity findings

Largest bat clusters:

| Component | Fragments | Sum of lengths | Accepted lengths | Junctions | Geodesic diameter lower bound |
|---|---:|---:|---:|---:|---:|
| 1 | 2,022 | 8,846.235 | 2,560.377 | 1,266 | 805.090 |
| 90 | 1,655 | 8,215.725 | 2,941.685 | 1,028 | 799.563 |
| 58 | 418 | 1,960.678 | 512.752 | 260 | 473.409 |
| 154 | 11 | 138.456 | 0 | 5 | 84.556 |

These large components contain both structural boundaries and texture. Component
membership alone does not identify a useful line. The diagnostic nearest-endpoint
search within 3.936 px finds 1,972 endpoint pairs with gap/tangent alignment > .85;
these include duplicates/texture and are **not** automatically added or merged.
The evidence supports testing path-aware evaluation at junctions, not retaining
entire connected components or treating all near endpoints as valid continuations.

## Hypotheses A–I

| Hypothesis | Evidence / verdict |
|---|---|
| A: score threshold | Direct cause: #4605 is .002310 below .56; many others fail. A universally excessive threshold is not proven without labeled desired/noise examples. |
| B: fragmentation | Proven: chains terminate at degree ≠ 2; minimum chain gate is above median length; component 154's coherent subpath is evaluated in pieces. |
| C: component pruning | No such pruning pass. Component-size reward affects score and often saturates. |
| D: skeleton/pruning | Edge thinning removes thickness; equal component counts on both tests. Isolated pixels are untraced. Hard chain-length pruning is separately proven. |
| E: morphology breaks structures | No loss-causing dilation between candidate selection and score: dilation measures scale/symmetry support. Pre-raw denoising cannot explain lines already in raw. Local thinning effects remain inspectable, not universally exonerated. |
| F: simplification/merge | No simplification/merge removes accepted internal paths in this code. Reconstruction is additive. |
| G: Structural filtering | Not a separate filter: displayed Structural is observed OR reconstructed. |
| H: Observed filtering | This is exactly where score/length rejection happens, not a later pass. |
| I: compositor | Zero accepted-pixel loss in full-resolution final composition. Main canvas uses only external dashes; compressed debug preview additionally reduces fine-line visibility. |

The production preview is resized from 1024×550 to 420×226 and JPEG encoded at
quality 80, then displayed in a small two-column grid. That reduces visibility of
one-pixel lines; it is not deletion from the internal geometry. Full-resolution
PNG and actual JPEG are provided side by side in the inspector for this distinction.

## Smallest justified NEXT step — not implemented

1. Test evaluating the already detected tangent-compatible path #4441/#4586/#4605
   before per-fragment length/scoring. Its evidence is present; new detection or
   reconstruction cannot solve a path that was entirely rejected beforehand.
2. Test replacing the hard length veto and undefined-short-curvature default only
   for such supported continuations. Use #3015/#4180 as controls and distinguish
   real pixel loss from overlapping rejected endpoints.
3. Keep whole-component acceptance out of that experiment: components 1/90 mix
   texture with structure and the current component reward is already saturated.

Do not lower the global threshold merely to admit #4605. The smallest justified
experiment is on path evaluation, with desired/noise annotations and unchanged
detectors. Before claiming this fixes the user's case, run this exact instrumented
pipeline on the missing original dragonfly and identify its lost paths explicitly.

## Changed files and checks

- `contour_geometry.py`: optional audit sink only; it captures existing arrays and
  pre-truncation records. Default API output and decisions remain unchanged.
- `tests/diagnose_segments.py`, `tests/segment_inspector.html`: complete segment
  tracing, component/near-path diagnostics and local interactive visualization.
- `tests/audit_path.py`, `tests/audit_examples.py`: reproducible analyst-selected
  measurements and crops of the available regressions.
- `tests/test_audit.py`: byte-identical stage arrays and identical decisions with
  instrumentation enabled/disabled, plus observed→final inclusion.

No final fix, threshold tuning, deployment or UI refactor was performed.
