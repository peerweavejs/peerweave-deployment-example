# Quality score and evidence

Measured locally and in GitHub CI on 2026-10-15. The private single-host reference is implemented. Public/network
and real-device acceptance remains external work; this is not an availability or public-service claim.

| Area | Status | Observed evidence |
| --- | --- | --- |
| Consumer boundary | Verified locally | Four private 0.1.0 archives, SHA-256/source provenance, frozen install, no source aliases, explicit artifact refresh |
| Authorization | Verified locally | Missing identity, room membership, invalid Origin/header/method, bounded issuance/session and fail-closed configuration tests |
| Browser app | Verified locally | All four built pages; denied ICE opens no signaling; native video/chat/hangup and exact accepted file bytes |
| Edge/images | Verified locally | Two app images; actual supplied non-root Traefik; HTTPS/WSS, authenticated ICE, Docker API restrictions and repeatable ACME initialization |
| TURN | Verified locally | UDP/TCP/TLS, REST credentials, wrong/expired auth and blocked loopback/metadata peers; relay-only bytes and ICE restart |
| Complete relay path | Verified locally | Built app fetched ICE credentials and selected relay candidates for video/chat/file transfer through Traefik SNI TURN/TLS |
| Harness/lifecycle | Verified locally | Docs/import/artifact/Compose checks, strict types, structured startup, per-worktree ports, clean shutdown and temporary Docker cleanup |
| Public reachability | Pending external acceptance | Real DNS/ACME/NAT/firewall, mobile/Safari hardware and restrictive networks |

`pnpm check` passed 42 unit/model/request tests plus the native application smoke, builds, types,
lint and repository checks. Coverage over server source (excluding process entrypoint) and the
client ICE boundary: statements **98.31%**, branches **94.42%**, functions **97.43%**, lines **100%**.
The enforced floor is 85% for each metric. These numbers do not cover every UI/controller line.
A deliberate forwarded-payload mutation was caught and restored. No skipped cases or retries
were introduced. Screenshots in `.artifacts/app-call.png` and `.artifacts/app-transfer.png` were inspected.

`pnpm build:images`, `pnpm test:deployment` and `pnpm test:turn:deployment` passed. The TURN
fixture uses temporary self-signed certificates and a test-only loopback exception; production
policy is unchanged. All fixture containers/networks/volumes/credentials were removed. The
actual `pnpm dev` launcher served four routes and ICE API on overridden ports and closed both
ports on shutdown. Frozen install and artifact refresh also passed.

The framework independently passed its full gate, all existing browser regressions and retained
UDP/TCP TURN contract after production assets moved out. No framework API changes were needed.
See the [completed plan](exec-plans/completed/001-bootstrap.md) for the test-first sequence.

The public repository is [peerweavejs/peerweave-deployment-example](https://github.com/peerweavejs/peerweave-deployment-example).
[GitHub CI passed](https://github.com/peerweavejs/peerweave-deployment-example/actions/runs/38757877341)
the complete app gate, both image builds, actual authenticated Traefik HTTPS/WSS and controlled
Coturn UDP/TCP/TLS/SNI checks at commit `ffb27fd1e886a93c116193f89cb13c3a00cdbead`.
Source was committed and pushed; no package publication or production deployment was performed.
Provide production hostnames, credentials, membership, secret/certificate files and external
acceptance evidence using the [deployment guide](webrtc-production.md).

## Rich-app regression ownership (2026-10-15)

This repository now solely owns the four richer Gyral pages and their original browser/model/
protocol regressions. The framework keeps one separate vanilla TypeScript video page. All 126
browser assertion statements across 18 cases were verified unchanged by AST comparison; only
fixture paths, explicit development room memberships and the ICE API proxy changed. The three
existing model/protocol files match byte-for-byte. No app runtime source, packaged library or
production deployment configuration changed.

The updated `pnpm check` passed all 42 unit/model/request cases, all 18 migrated browser cases,
and the built native app smoke. Browser checks include the four routes in both themes across
Chromium, Firefox and WebKit, mobile layout, keyboard navigation, 200% zoom and axe. Coverage
remains the values above. The complete workflow runs these checks before its existing image,
Traefik and Coturn gates. See the [completed plan](exec-plans/completed/003-browser-regressions.md).

## Gyral 0.3.7 upgrade (2026-10-28)

`@gyral/core` and `@gyral/testing` moved from 0.3.6 to 0.3.7 with no app source change. `pnpm check`
passed all 42 unit/model/request cases, all 18 browser cases and the built app smoke, with the
coverage values above unchanged. Image and Docker deployment checks were not rerun for this
dependency change. See the [completed plan](exec-plans/completed/004-gyral-0.3.7.md).
