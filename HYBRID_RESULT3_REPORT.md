# Result 3 hybrid experiment — implementation status

This is an **experimental implementation, not a verified visual-quality release**. The user approved publishing the experiment without replacing the ordinary Result 3. Deployment and live test outcomes are reported separately in the delivery message.

## Configuration and security

- The historical `api/trace.js` used `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL`. The user confirmed the Production key exists in Vercel project `mosaic-art 2`.
- `server/deepseek-config.cjs` is the sole model configuration source: `process.env.DEEPSEEK_MODEL` overrides its Vision-capable default. The API key is read only server-side. Gemini is not imported or called.
- Following publication approval, the experimental API is enabled in Vercel Production by default; the main UI still requires `?hybrid=1`. `DEEPSEEK_RESULT3_ENABLED=0` is the server kill switch. Local/preview environments require `DEEPSEEK_RESULT3_ENABLED=1`. This is a rollout switch, not another secret.
- `.env`, `.env.*` and `.vercel/` are ignored. No secret value was read, printed, requested or committed.
- `/api/result3` limits payloads, inline image sizes, compact geometry, route count, anchors, output size and request duration. It has best-effort per-instance burst limiting. This is **not a distributed account quota or authentication mechanism**; add durable rate limiting/access control before broad public rollout.

## Implemented architecture

Original image + Result 2 + numbered secondary Result 1 paths → DeepSeek JSON plan → validated manufacturable polylines → sequential whole-tile follower → DeepSeek visual QA → at most one local repair.

- `result3-hybrid.js`: bounded stable path IDs; long outer boundaries split into short routes before compression; plan/context/QA validators; target conversion; three-tile lookahead with beam width four; physical checks; local repair; exact-rectangle SVG; bounded two-call orchestration and old-solver fallback.
- `server/result3-prompts.cjs`: composition-first system prompt, essential features, intentional deviation, no unrelated invention and no direct tile coordinates. QA evaluates recognition, silhouette, clarity and balance instead of accepting physical validity alone.
- `server/deepseek-client.cjs`: DeepSeek-only server request, JSON mode, thinking disabled, 12-second timeout, no automatic retries. Authentication, timeout, network, rate-limit, image/model, truncated or invalid JSON errors are distinct.
- `api/result3.js`: request validation, provider invocation, server-side response validation, safe structured responses, request IDs and timing/route metrics. No image data or provider response text is logged.
- `result3-lab.js` + `tests/hybrid_inspector.html`: source / optimized / target / actual tiles / old deterministic comparison, numbered map and diagnostic plan/QA/initial/final data; SVG/JPG exports. Customer-like status strings use RU/EN/ZH entries in the existing TileMessages catalog. Developer-only labels remain English.
- `result3-worker.js` and opt-in `?hybrid=1` integrate the experiment into the existing Result 3 controls, editor, mounting plan and exports. Without the flag, the existing worker is used unchanged. `?hybrid=1&debug=1` adds numbered input, target, restored/omitted routes, initial/final tiles and plan/QA diagnostics. Manual edits invalidate prior AI visual approval; undo restores the earlier review state.

The planner can choose simplify, shortcut, bridge, continue, reroute, restore and symmetry-assisted routes. Its route anchors are normalized bounded design coordinates, never final tile coordinates. The old 3 mm restriction relative to Result 2 is not used. Actual strips remain 30 × 3 mm, at most 150, SAT non-overlapping, with their complete oriented rectangles inside the 15 mm safe area.

Visual status is separate: `UNREVIEWED`, `AI_ACCEPTED`, `AI_REJECTED`, `REPAIR_NEEDS_REVIEW`. A repaired result is **not falsely marked AI-approved**, since no third AI call is allowed. Current local QA repair actions are simplify/omit, preserving unaffected placements; restoring features is available in the initial plan, not yet in QA repair. A rejected/no-repair result remains a reviewable experiment, not a production success.

## Verification performed

- 25 hybrid test groups pass, including mocked transport/error cases, editor/export integration and bounded orchestration. `tests/test_result3_api.cjs` separately exercises the server endpoint, schema/body errors, configuration, authentication and safe responses. Mock AI responses are explicitly identified as mocks.
- Existing physical, structural, optimized and client suites pass. Frozen SHA checks cover Result 1 geometry and all three Result 2 implementation files. No Result 1/2 implementation was edited.
- Four offline follower fixtures pass physical validation. These use explicit synthetic FOLLOW plans, **not AI plans**: bat 34 tiles / 4 ms; butterfly 90 / 11 ms; supplied drawing 43 / 9 ms; asymmetric geometry 32 / 1 ms (final local run). These measurements exclude optimization, network/model calls and visual review. Model context is capped at 96 paths with at most 10 sampled, rounded points each.
- Visual inspection of offline comparisons caught excessive whole-silhouette compression, which was corrected by splitting the outer route before compacting. Offline follower results still have missing sections and awkward transitions. They are not evidence that hybrid output is superior.
- Browser experiment upload with the supplied drawing succeeds; missing/disabled local AI invokes the existing deterministic solver safely. No working primary mode was replaced.
- `node tests/integration_deepseek.cjs` reports **SKIP** without both a securely supplied environment key and `RUN_DEEPSEEK_INTEGRATION=1`. Its live scope is connectivity only; full visual inference is tested separately through the lab.
- JavaScript syntax checks and `git diff --check` pass. The repository has no configured separate TypeScript, lint or production-build command.

## Run and next verification

1. Run the existing Flask contour server on port 5059, then `node tests/serve_hybrid.cjs`.
2. Open `http://127.0.0.1:8088/tests/hybrid_inspector.html`.
   The existing interface is also available at `http://127.0.0.1:8088/?hybrid=1&debug=1&lang=ru`.
3. Without local credentials, test upload/error/fallback and offline fixtures. Do not copy the Production key into chat or committed files.
4. In a securely configured test deployment, enable `DEEPSEEK_RESULT3_ENABLED=1` with the existing server key. The lab is independent of the main application.
5. Run real planning + QA on the supplied bat, existing butterfly/manual reference, asymmetric subject and simple silhouette. Record real timing, costs, rejection rates and side-by-side visual judgments. Tune before enabling the hybrid path as normal Result 3.

## Remaining work / release gate

Real AI composition and full latency have **not been measured**; local credentials are unavailable. Hybrid superiority has not been established. The existing manual editor and mounting exports are integrated behind the explicit experiment flag and tested. Automated regression examples include an asymmetric synthetic fixture, not a supplied asymmetric photograph. QA-directed restore/re-route repairs, durable endpoint quotas, and promotion to the default remain follow-up work after real visual testing. Experimental automatic canvas orientation uses the subject's aspect ratio without making a second planning call; the ordinary deterministic auto-orientation behavior is unchanged.

Publication is limited to the opt-in experiment at https://mosaic-art-rho.vercel.app/?hybrid=1. Default promotion still requires real visual-quality evaluation. The ordinary Result 3 remains deterministic.
