# Quality score and evidence

Measured locally on 2026-10-15. The private single-host reference is implemented. Public/network
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

CI was configured, not run remotely. No remote repository, commit, push, package publication or
production deployment was performed. Provide production hostnames, credentials, membership,
secret/certificate files and external acceptance evidence using the [deployment guide](webrtc-production.md).
