# Result 2: physical tile layout

## Result 1 freeze

The contour server implementation is unchanged from e2cd489 (only explicit local
routes for three new static JS files were appended). contour_geometry.py is byte
identical. The existing canvas renderer and SVG/JPG export functions are byte
identical and protected by SHA-256 regression tests. Result 2 has its own canvas,
physical format and orientation state; switching back restores the original
Detailed geometry and its original sheet. Missing optional physical UI assets
do not prevent Result 1 initialization. No AI/model/dependency was added.

## Architecture and hard constraints

The original API geometry is cloned into a Web Worker. tile-layout.js fits it
proportionally into physical millimetres, then builds separate TargetPath and
TilePlacement arrays. The latter is the source of truth, not SVG paths. Every
placement has id, xMm/yMm (center), angleDeg, lengthMm=30, widthMm=3, role,
sourcePathId and sequenceIndex. The same module runs generation, editor checks
and export validation.

Supported sheets: 400×400, 300×400 and 400×300 mm. Fit uses full aspect ratio,
without object rotation; clearance includes the mandatory 15 mm margin plus
half width and the emergency deviation reserve. Every actual rectangle corner
is separately checked against the 15 mm safe area. Auto evaluates both 30×40
orientations and compares feasible fits, simplification, fidelity and tile cost.
Changing a physical format/orientation recomputes from source, never stretches
tiles. Result 1 sheet settings are independent.

Tile count is capped at 150 in generation, editing and export. Oriented-rectangle
SAT rejects area overlap, including skeleton/outer conflicts. Exact edge contact
is allowed. Outer consecutive distances (including closure) are actual rectangle
distances in [0,2] mm; the objective prefers 1 mm. Final validation also checks
centerline-to-target deviation and target coverage, both bounded by 3 mm. Distance
sampling uses a Lipschitz half-interval allowance, not just endpoint checks.
The 3 mm bound is against the **simplified Result 2 target**, not the original
photographic contour. No exported tile is shortened, bent or split.

## Search and target simplification

The optimizer is a deterministic layered beam search. It searches tile counts,
phase, along-path position, normal offset and orientation alternatives. Full
rectangle collisions, bounds, gap and deviation violations reject candidates;
they cannot win through a soft penalty. The beam retains alternative endings,
checks all previously placed rectangles and explicitly closes the outer cycle.
Local tangents before/after corners allow end-to-side/T-like corner arrangements.
This is not a fixed 31 mm sampling placement rule.

The outer contour receives budget first. The search tries small RDP tolerances,
then physical-scale target opening/closing for sub-tile spikes/slots. This optional
target operation uses 1 mm cells **after physical fitting**, not photograph pixels
that are later rescaled into tiles. It guards retained area before taking the
largest loop. Stronger target simplification is attempted only after earlier
physical searches fail. Thus thin antennae and local wiggles can disappear while
the major silhouette remains. The original Result 1 stays available for comparison.

The search is bounded, not a complete mathematical solver. LAYOUT_NOT_FEASIBLE
means it did not find a validated solution under its search policy; it is not a
proof that no arrangement could exist. No partial invalid layout is returned.

## Skeleton and allocation

Only accepted Result 1 paths are considered. Compatible exact endpoints are
rejoined; isolated paths shorter than 60 mm and small closed details are removed.
Remaining paths are ranked by spatial extent per estimated tile cost. Candidate
windows retain reproducible long portions and omit tight local bends. Weak fits,
near-parallel redundant placements and every physical collision are rejected.
Internal dashed targets are clipped to observed spans supported by accepted full
tiles, so unsupported intricate middle sections are not retained as decoration.
The less important branch can end before an intersection instead of crossing it.
No fixed budget percentage is reserved and spare capacity is not filled for its
own sake. Small circles are not replaced with crosses or invented symbols.

## UI, editor and mounting plan

Large Result 1 / Result 2 buttons sit above the result. Result 2 provides prominent
Layout / Mounting Plan buttons, physical format and Auto/Portrait/Landscape controls,
and total/outer/skeleton counts. Target paths are gray dashed lines; tiles are red
filled rectangles. Technical threshold controls, legacy packing dimensions and
old canvas hints are hidden only in Result 2.

The editor supports selection, pointer dragging, numeric center and free-angle
rotation, deletion/addition, Undo/Redo and optional target/endpoint/side snapping.
Alt bypasses snapping during pointer editing. Invalid rectangle moves are rejected
with visible notifications. Selecting without dragging does not modify geometry.
New tiles inherit the nearest target direction and role; outer insertions enter
the installation sequence so a deleted outer tile can be replaced, not only undone.
Untouched numeric fields retain their full precision rather than rounding a
contact into a collision. Add is disabled at 150 and the model also rejects it.

Removing an outer tile can create an explicitly marked draft with a gap; export
is blocked until full validation passes again. Recomputations reset edits with a
notice. Edits are session-local, not persisted across reload. Number IDs are stable
during editing/Undo; initial numbering follows outer sequence then skeleton.

Mounting view adds numbering and physical sheet/orientation/margin/count metadata.
A coordinate table and CSV use top-left origin, X right/Y down, clockwise angles
and tile centers. SVG has true mm dimensions, red 30×3 rectangles, target dashed
geometry, safe area and optional numbering. JPG uses the same draw model at 6 px/mm.
Every export is validated again; invalid drafts cannot be exported.

## Verification and measured fixtures

- 17 existing Python tests pass.
- 12 physical JS test groups cover dimensions, count, corners/safe area, SAT
  contact/overlap, closed outer gaps, conservative deviation, corner strategies,
  small-detail rejection, retained major skeleton, crossing avoidance, Auto and
  forced orientations, manual limits/Undo/Redo/snapping, SVG and Result 1 freeze.
- Existing client HTTP/JSON/abort/network/recovery checks pass.
- JS syntax checks and git diff --check pass. No separate project lint,
  typecheck or production-build configuration exists; Vercel serves static JS
  and the existing Python endpoint without a new bundler/build dependency.
- Local butterfly: **68 tiles (42 outer + 26 skeleton)**, about 14 seconds on the
  development machine. Visually inspected the real physical contour and skeleton.
- Local bat: **LAYOUT_NOT_FEASIBLE**, no tiles emitted, about 7 seconds. It is not
  claimed solved. This is covered by the physical fixture check.
- Generated circle/control PNG: 44 tiles on 400×400; physical 30×40 Auto selected
  landscape (33 tiles), portrait recomputed to 32. Desktop and 390 px mobile
  checked; body scroll width was 390 px (no horizontal overflow).
- Browser checked real upload, both views, numbering, numeric move/rotation,
  rejected safe-area violation, delete/add/Undo/Redo, orientation reset notices
  and returning to unchanged Result 1. Final normal-flow console had no errors.
- Downloaded SVG was parsed: 44 exact-size rectangles passed the physical
  validator. Downloaded JPG was 2400×2400 for a 400×400 mm sheet.

tests/smoke_tiles.cjs checks the production API using a synthetic image, compares
all three deployed JS assets byte-for-byte with the release sources, generates
the resulting physical layout and validates it before checking mounting SVG.

## Known limitations

Complex narrow silhouettes can fail despite an existing human-designed solution;
the bat fixture currently does. Some characteristic fine exterior details are
removed in stronger target simplification. Geometry-based skeleton importance is
not semantic recognition. Large complex inputs can take longer on mobile; work
runs off the UI thread and is cancelled on recomputation. Physical controls are
currently Russian; the frozen Result 1 localization remains unchanged. Material
manufacturing tolerances and print scaling still require a real-world check;
0 mm contact is allowed by the requested mathematical model.
