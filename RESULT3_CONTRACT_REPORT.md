# Result 3 contract repair

## 2026-09-14: align strategy anchors with existing target geometry

The model choice remains unchanged: the centralized default is still `deepseek-v4-flash-vision-exp`, with `process.env.DEEPSEEK_MODEL` as the only override. The reported distinction between `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` is treated as a model-family/capability distinction, not as an instruction to switch models.

The remaining live failure after 8124c1e was caused by an over-narrow Result 3 contract, not by the DeepSeek connection. The deterministic target builder already treats `viaAnchors: []` as "reuse the selected source geometry" for every strategy:

```js
const input = r.viaAnchors.length ? r.viaAnchors : r.sourcePathIds.flatMap(...)
```

The contract, however, only allowed empty anchors for FOLLOW/RESTORE. A valid composition intent such as FOLLOW_SIMPLIFIED, CUT_CORNER or BRIDGE with selected source paths and no custom anchors was therefore rejected before target generation, causing deterministic fallback.

The provider and local schemas now allow `viaAnchors: []` for any strategy. If the model supplies custom design anchors, it must still provide 2..24 normalized coordinate pairs. A single anchor remains invalid. No coordinates are invented, no route strategy is rewritten, and semantic failures such as unknown IDs, duplicate routes, selected-and-omitted paths, invalid Result 1 restoration, or missing outer route are still rejected without retry.

Updated tests verify that every strategy accepts either source-following empty anchors or 2..24 design anchors, rejects single/oversized anchor arrays, preserves derived omissions, and keeps previously captured target geometry unchanged.

## 2026-09-14: remove redundant model omission decisions

After publishing bdecfc1, request `696c061b-d715-4d20-a25f-3f670811187c` failed at `/routes/3/sourcePathIds/0`: the model both selected and omitted the same source path (8,192 ms wall). This was a real semantic contradiction, not an API availability failure.

The provider contract is now `planningSchema(context)`, mechanically derived from the same shared application schema but **without the omissions property**. It is sent to the model and validated as-is by `acceptPlanningValue`. After successful wire validation, the server derives omissions as available source IDs minus all selected sourcePathIds. The internal application response retains its existing omissions field, so UI, worker, target, solver and exports keep their interfaces. Routes, coordinates, priorities, strategies and reasons are preserved exactly. This only changes diagnostic omission metadata to the full complement of selected sources.

A model-supplied omissions field is rejected as an unexpected property, never silently filtered. Syntax correction remains bounded to one attempt; semantic failures are still not retried. The provider example no longer contains omissions. Tests verify exact transmitted schema, complement calculation, no input mutation, rejection of contradictory supplied omissions, and identical target geometry from the previously captured accepted plan. Earlier schema examples below describe the **internal** application object; omit omissions for the current model-facing object. This simplification implements the original requirement not to ask the model for fields the deterministic layer can derive.

Live check of 8124c1e, request `b6add7a5-0cb2-46bc-bba8-1b16a136864f`: completed JSON response but invalid anchor/strategy combinations at routes 0, 1, 2, 9, despite their explicit JSON Schema constraint; 9,906 ms wall, fallback used. Thus this revision is **not verified as a stable no-fallback AI pipeline**. Do not treat the earlier successful single request as evidence of current reliability. The provider's failure to honor this schema remains unresolved; constraints must not be bypassed or coordinates silently invented.

Current official documentation (checked 2026-09-14) documents `deepseek-flash` for image input through Responses: https://api-docs.deepseek.com/guides/responses_api/ . The user-specified default remains `deepseek-v4-flash-vision-exp`; it was not changed. Testing the currently documented model is a proposed next diagnostic experiment, not a proven remedy, and requires user approval to change the explicit model choice.

Contract/API/hybrid and existing tile/optimized/client tests pass. Production synthetic contour smoke passed (568 outer points, 1 internal line) using Sharp; the old Python smoke command could not start because local cv2 is missing, not because the deployed endpoint failed. Result 1/2 and solver/export implementations remain unchanged.

## Follow-up: missing design anchors

The user's next failure reported AI_PLAN_SEMANTIC_INVALID at `/routes/0/viaAnchors`, attempt 1: the selected strategy required at least two coordinate anchors. The excerpt does not contain the strategy name or exact array length, so neither is inferred. Root cause: the server enforced the strategy/anchor relationship after parsing, while the native schema allowed 0–24 anchors independently of strategy. The prompt mentioned the condition, but the schema did not enforce it.

The route schema now uses two small `anyOf` constraints: either FOLLOW/RESTORE with zero anchors, or any existing strategy with 2–24 anchors. The custom validator handles these same constraints locally. This preserves precisely the previously accepted combinations, including FOLLOW/RESTORE with explicit anchors. Missing design anchors remain a semantic failure with no automatic retry; no points or strategies are substituted. Tests cover all nine strategies at 0, 1, 2, 24 and 25 anchors and replay the previously accepted production plan unchanged. This is a contract correction, not a solver or composition change.

Live verification of c19496f: plan request `187f872a-9671-490f-b06b-d3b970f203a8` passed anchor and semantic validation, with one format correction for an unexpected `/routes/2/sourcePathIds_alt` property. QA request `8fb1dc24-91a5-41b6-b93c-6604b397b27e` then returned the schema itself (root type/properties/required/additionalProperties), not an assessment, causing fallback. Native schema submission does not replace local validation. The plan prompt's ambiguous “Return the exact composition JSON Schema” wording was corrected to request a populated object conforming to the schema; QA now explicitly requests assessment values, never schema definitions. The visual assessment criteria are unchanged, and no QA retry was added.

Next live test of d2c19a0: plan `491a66b7-bb27-4813-a19d-c206039934c0` passed first attempt (6,648 ms server); QA `8a615169-af96-407d-9df2-39dbad1f2d0b` passed structural validation but failed an undifferentiated legacy semantic check. The exact failing repair was not retained, so its cause is not guessed. QA validation now uses the shared contract and reports specific unknown route, duplicate repair, forbidden outer omission, or accept-with-repairs paths with AI_QA_SEMANTIC_INVALID. Its provider schema now includes the existing permitted route IDs, action/role restriction and accept/repairs relationship. These are existing constraints, not new repair actions or changes to visual judgment. Duplicate repair IDs remain a local semantic check. No fallback or solver behavior was changed.

## Observed cause

Production request `d6844574-90fd-48a8-903a-5f8a8319280c` completed in 13,753 ms wall time. DeepSeek returned a completed (`stop`) string containing valid JSON, with the expected root fields and 34 routes. Validation rejected priorities of 2–4 (allowed: 0–1), objectAnalysis length 415 (maximum 400), and two omissions entries of length 76 and 56 (maximum 40). This was not an authentication or JSON parsing failure. The old JSON-mode prompt did not communicate all of these constraints precisely.

Sanitized evidence: `tests/fixtures/deepseek-schema-failure.json`. Raw assistant prose and images were not retained. Unknown IDs were not established as part of that failure: schema validation stopped before reference validation.

## Contract

`result3-contract.js` exports the sole plan JSON Schema and `schemaForContext(context)`, which binds sourcePathIds and omissions enums to the actual available IDs. That exact schema is sent through DeepSeek Responses `text.format: {type: "json_schema", name: "result3_composition_plan", schema}` and consumed by the local/server validator. The JavaScript project has no TypeScript type layer. The validator is a small in-project JSON Schema subset implementation, **not Ajv**; it implements every keyword used by these schemas and does not coerce or strip data.

Required root fields: version (1), objectAnalysis (string ≤400), essentialFeatures (≤12 strings ≤160), globalIntent (string ≤400), complexityBudget (integer 3–150), routes (1–48), omissions (≤160 source IDs ≤40 chars). Extra properties and nulls are rejected.

Each route requires id (alphanumeric/underscore/hyphen, 1–40), role (outer/structural/characteristic), priority (0–1), sourcePathIds (1–12 known IDs), source (result2/result1-restored/ai-reconstructed), strategy, viaAnchors (0–24 normalized coordinate pairs), and reason (≤400). Strategy enums are unchanged: FOLLOW, FOLLOW_SIMPLIFIED, CUT_CORNER, MERGE_AND_CONTINUE, BRIDGE, REROUTE, SYMMETRY_ASSIST, RESTORE, TERMINATE. See the exported schema for the exact machine-readable definition.

Minimal valid example, assuming r2_0 is an available source:

```json
{"version":1,"objectAnalysis":"Subject","essentialFeatures":["Main silhouette"],"globalIntent":"Preserve identity","complexityBudget":100,"routes":[{"id":"outer_1","role":"outer","priority":1,"sourcePathIds":["r2_0"],"source":"result2","strategy":"FOLLOW","viaAnchors":[],"reason":"Main boundary"}],"omissions":[]}
```

Syntax errors are separate from semantic errors (unknown source IDs, duplicate route IDs, selected-and-omitted paths, invalid restoration references, missing coordinate anchors, no outer route). This contract has **coordinate pairs, not named anchor IDs**; malformed anchors are schema errors and missing required anchors are semantic errors. No artificial anchor-ID mechanism was added to geometry.

## Bounded correction and diagnostics

`server/result3-planner.cjs` allows one text-only correction after AI_JSON_PARSE_ERROR or AI_SCHEMA_INVALID. It sends the invalid text, exact errors, schema and allowed IDs, without images. It never retries unknown-ID/semantic, auth, timeout or empty-content failures. `planning_attempts` is 1 or 2. A second failure uses the existing fallback; the fallback algorithm is unchanged. Visual QA does not get a format retry.

Provider timeout: 30 seconds, correction: 10 seconds, client per-request: 45 seconds, Vercel function: 50 seconds. These are ceilings, not performance claims. Raw assistant text exists only in server memory for correction; logs and debug responses contain bounded shapes, field paths and validation reasons, never images or keys.

`?hybrid=1` exposes diagnostics even without `debug=1`. Ordinary UI stays unchanged. The model default is still centralized in server/deepseek-config.cjs and may be overridden by DEEPSEEK_MODEL. No Gemini calls are added.

## Verification

Contract, endpoint, hybrid, physical tile, optimized contour and client tests pass locally. Mocked results are not real DeepSeek measurements. Result 1/2 frozen checks pass. Solver, fallback geometry and composition philosophy are unchanged. Real production verification of this repair is recorded below after deployment.

First structured-output test, request `135bc186-a0f9-456c-9718-168fc6f04b53`: completed Responses output, valid JSON and base schema, but `/omissions/1` referenced an unknown ID. Wall time 14,298 ms; fallback was used. This is new evidence of an ID error, distinct from the original numeric/string-length failure. The next contract revision binds both source reference arrays to context-specific enums; unknown-reference violations retain AI_UNKNOWN_PATH_ID classification and are not automatically retried.

### Successful live contract verification (2026-09-10)

Production revision `dc5c73a769749b77aaed2fedf07f2ed2221f538f` at https://mosaic-art-rho.vercel.app/?hybrid=1&lang=ru.

- Plan request `c8306101-a13b-472b-b84d-2f7d6c97f088`: HTTP 200, 6,405 ms server / 7,617 ms wall, planning_attempts=1. Model responded; JSON, context-bound schema and semantic checks passed.
- QA request `fcb6c7ff-8959-49a0-9e0c-ae2661787df7`: HTTP 200, 1,444 ms server / 2,260 ms wall; QA contract passed.
- Actual AI plan generated 9 manufacturable target routes and 44 whole tiles. Physical validation: valid, zero errors. Mode AI_HYBRID, **fallback NOT used**, two provider calls, no format correction and no local repair.
- End-to-end hybrid run: 9,905 ms. This is one measured test, not a latency guarantee.
- Visual QA returned AI_REJECTED (recognizability .18, silhouette .20, cleanliness .25, composition .22), with no repair proposals. This is **not** a visual-quality success. Improving composition is the next separately scoped task.
- Sanitized accepted plan retained in `tests/fixtures/deepseek-accepted-plan.json`; offline replay verifies identical route/tile counts and physical validity. Text is redacted; source IDs/coordinates are preserved. These replay tests do not make another API call.
- Production `/api/contour` smoke also passed: 564 external points, 1 internal line; normal pipeline unchanged.

Full validation commands: `node tests/test_result3_contract.cjs`, `node tests/test_result3_api.cjs`, `node tests/test_hybrid.cjs`, `node tests/test_tiles.cjs`, `node tests/test_optimized.cjs`, `node tests/test_client.cjs`, `node tests/test_structures.cjs`, `node tests/check_hybrid_fixtures.cjs`. Real opt-in test: `node tests/smoke_hybrid_deployed.cjs https://mosaic-art-rho.vercel.app /path/to/the/authorized/download.png` with Sharp available via NODE_PATH. It uploads the authorized fixture and incurs real model calls; it must not be treated as an offline unit test.
