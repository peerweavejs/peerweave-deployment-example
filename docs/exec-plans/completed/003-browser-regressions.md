# Own the richer app's existing browser regressions

Status: complete, 2026-10-15.

The framework sample is becoming a minimal vanilla TypeScript video page. Preserve the rich
app's 18 existing browser cases here, including the original call/readiness assertions. Only
fixture paths and backend/ICE proxy setup change; the production app behavior stays unchanged.

- [x] Confirm the existing 42 unit/model/request cases pass and copied model/protocol tests match.
- [x] Move all 18 browser cases and run them against this repo's own app/backend.
- [x] Include the suite in the normal gate and CI, with three-engine accessibility/layout checks.
- [x] Record measured results and update the framework/application boundary documentation.

An AST comparison verified all 126 original browser assertion statements match; the three
existing model/protocol files match byte-for-byte. Tests use this repo's production backend in
development mode with explicit room memberships and an ICE API proxy. No runtime app source or
Peerweave archive changed. A missing proxy in one migrated fixture was corrected without
changing assertions. All 18 migrated cases pass, with no retries or skipped cases.

Full `pnpm check` passed builds, strict types, lint, repository invariants, 42 unit/model/request
cases, all 18 browser cases and the built app smoke (four routes, denied ICE, native video/chat,
hangup and exact file bytes). Coverage remains 98.31% statements, 94.42% branches, 97.43%
functions and 100% lines. CI installs all three engines and runs the migrated suite as part of
the normal gate before its existing image/Traefik/Coturn checks. The framework independently
passed its full gate with nine new minimal-page cases and unchanged library/native contracts.

Frozen installation passed. The final migration audit includes awaited assertions (126 total);
the initial 102 count omitted awaited statements. Every compared assertion matches.
