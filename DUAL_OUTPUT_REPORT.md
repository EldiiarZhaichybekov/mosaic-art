# Detailed and refined contour outputs

## Contract and implementation

Result 1 retains the existing contour and `internal_lines` contract. Comparison
against deployed commit ab75da3 on bat_source.webp and test_butterfly.webp found
exactly identical outer and internal coordinates. No detector thresholds changed.

Result 2 is a subset of Result 1's internal paths. `refined.indices` references
those paths instead of duplicating the payload. Both outputs use the exact same
outer contour, millimetre transform, canvas, renderer and SVG/JPG functions.
The result selector changes preview/export locally without another API request.
Filenames include detailed/refined. An exception or malformed optional refinement
leaves the detailed result usable, with a persistent warning and disabled Result 2.

`contour_refinement.py` reuses tangent-compatible graph continuations. Importance:
0.40 × normalized length + 0.20 × continuity + 0.25 × inherited edge evidence
+ 0.15 × junction participation − a local density penalty. Separate gates reject
tiny unsupported paths and weak paths. Short connectors can survive as part of
a coherent structure; no automatic whole-component acceptance occurs.

Orientation-aware raster NMS suppresses a weaker neighbor only when ≥80% of its
pixels lie within 0.5% of the object diagonal of retained lines with directions
within 20°. Crossing directions are not duplicates. A spatial cell load gate
suppresses low-value short detail in crowded regions; there is no global line
count cap. No vertices move, no smoothing or new bridging is introduced.
Summary counts and refinement time are returned; verbose path decisions are
debug-only and bounded to 1,000 groups.

## Measured local fixtures (internal paths only)

| Fixture | Detailed | Refined | Refinement time |
| --- | ---: | ---: | ---: |
| bat_source.webp | 298 | 92 | ~50 ms |
| test_butterfly.webp | 212 | 110 | ~51 ms |
| synth_busy.png | 3090 | 4 | ~135 ms |
| synth_thin.png | 0 | 0 | <1 ms |
| synth_dark_on_light.png | 0 | 0 | <1 ms |
| synth_light_on_dark.png | 0 | 0 | <1 ms |

Every output also has the unchanged external outline. Zero internal paths is
valid for a simple silhouette. These are local timings, not cloud guarantees.
`tests/check_variants.py` reproduces measurements and creates /private/tmp previews.
The available butterfly was tested; it is not assumed to be the exact PNG that
triggered the user's earlier failure. That failing PNG was not attached here.

## Failure diagnosis and fixes

The client used a contrast recommendation as its generic fallback, including
INTERNAL_ERROR, HTTP errors and invalid API responses. Contrast was not diagnosed.
That recommendation is removed. NO_FOREGROUND and NO_VALID_CONTOUR now have
specific messages; INVALID_IMAGE, UNSUPPORTED_FORMAT, IMAGE_TOO_LARGE,
PROCESSING_TIMEOUT, NETWORK_ERROR and INTERNAL_ERROR retain structured handling.
REFINEMENT_ERROR is an optional-result failure, not a failed contour request.

Reproduced against the old server: high-contrast 16-bit RGBA PNG caused an OpenCV
bilateralFilter unsupported-depth exception. Normalize uint16 colour and alpha
to uint8 using the encoding range (not contrast stretching) before segmentation
and structural extraction. Decoder exceptions map to INVALID_IMAGE.

Uniform semitransparency previously selected the full image as an alpha mask.
Alpha now requires actual transparent-background separation; uniform alpha uses
the existing colour segmentation. Fully transparent inputs yield NO_FOREGROUND.
Empty/tiny contours no longer become generic RuntimeError/500 failures.

If baseline segmentation produces no usable contour, deterministic Otsu polarity
fallbacks must pass background-border coverage, foreground area and contour-area
checks. Uniform images are rejected rather than returned as a frame contour.
Successful baseline masks are not retuned. Logs include request ID, method,
alpha coverage, area, bbox, components, border contact and perimeter. Existing
stage timings and server exception stacks remain; no image bytes are logged.

This establishes concrete defects, not the cause of every historical incident.
Exact diagnosis of another failure still requires its request ID and server logs.

## Verification

17 Python unittest tests pass; Node client tests and JS syntax parsing pass;
git diff --check passes. No separate lint/typecheck/build configuration exists.
Tests include RGB/RGBA/16-bit PNG, JPEG, uniform alpha, inverted/low-contrast
backgrounds, fallback sanity, actual error categories, parallel NMS, crossings,
density suppression, short connector retention, refinement failure isolation,
instrumentation parity and existing contour regressions.

Browser: uploaded local butterfly, switched Detailed (213 total paths) to Refined
(111), visually inspected the actual canvas, clicked SVG and JPG for both variants
with success notifications and no console errors. Download files were not exposed
at the expected local Downloads path, so file existence is not claimed. Shared
SVG geometry is checked automatically. A generated 16-bit RGBA PNG also completed
in-browser without a fake contrast warning. Production smoke uses synthetic data
only and checks both output contracts (`tests/smoke_deployed.py`).

## Limitations

The refined variant is conservative geometric selection, not semantic recognition.
Some double edges remain; strong nearby genuine parallel details may be suppressed.
Dense microtexture can be heavily reduced. Missing lines and segmentation defects
in Detailed are not repaired by Refined. A simple silhouette can legitimately
produce identical variants. Existing upload and processing limits remain.
