# Testing

`pnpm test` runs deterministic app-model and request-level tests. `pnpm test:coverage` records
server and deployment-boundary coverage with enforced floors. `pnpm test:e2e` runs the rich-app
browser regressions and the built consumer app in two native Chromium tabs. `pnpm check` also
checks lint, docs/package boundaries, builds and types. Install engines locally with
`pnpm exec playwright install chromium firefox webkit` (add `--with-deps` on a fresh Linux host).

App screenshots are written to `.artifacts/app-call.png` and `.artifacts/app-transfer.png` for
visual inspection. Startup logs are structured JSON; health and local API responses are directly
queryable. Ports can be overridden per worktree without sharing a development server.

New observable behavior is test-first: see the expected failure, implement it, run the relevant
suite, refactor on green. Do not change existing assertions to get green. No retries or skipped
cases establish acceptance. Capture test-first evidence and limits in the execution plan.

Linux/Docker checks are `pnpm build:images`, `pnpm test:deployment` and
`pnpm test:turn:deployment`. They use unique temporary projects and clean up their own containers,
networks, volumes and test credentials. Public DNS/ACME/firewall/NAT and real mobile hardware
remain external checks. See the [production guide](webrtc-production.md) and [quality](QUALITY_SCORE.md).

Framework unit/native/cross-browser and low-level TURN protocol tests remain in Peerweave.

## Rich-app browser regression ownership

`pnpm test:browser` runs the 18 original framework-app cases against this app and its own
authorized development backend. All 126 browser assertion statements are preserved; only
fixture imports, explicit test room memberships and the ICE API proxy changed. The existing
three Gyral model/protocol test files were already byte-identical. `pnpm test:e2e` runs these
cases, then the built application smoke. CI installs Chromium, Firefox and WebKit for the
four-route theme/layout/accessibility checks. No assertions were skipped or relaxed.
