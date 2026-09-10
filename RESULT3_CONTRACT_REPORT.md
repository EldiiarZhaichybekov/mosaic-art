# Result 3 contract repair

## Observed cause

Production request `d6844574-90fd-48a8-903a-5f8a8319280c` completed in 13,753 ms wall time. DeepSeek returned a completed (`stop`) string containing valid JSON, with the expected root fields and 34 routes. Validation rejected priorities of 2–4 (allowed: 0–1), objectAnalysis length 415 (maximum 400), and two omissions entries of length 76 and 56 (maximum 40). This was not an authentication or JSON parsing failure. The old JSON-mode prompt did not communicate all of these constraints precisely.

Sanitized evidence: `tests/fixtures/deepseek-schema-failure.json`. Raw assistant prose and images were not retained. Unknown IDs were not established as part of that failure: schema validation stopped before reference validation.

## Contract

`result3-contract.js` exports the sole plan JSON Schema, sent verbatim through DeepSeek Responses `text.format: {type: "json_schema", name: "result3_composition_plan", schema}` and consumed by the local/server validator. The JavaScript project has no TypeScript type layer. The validator is a small in-project JSON Schema subset implementation, **not Ajv**; it implements every keyword used by these schemas and does not coerce or strip data.

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
