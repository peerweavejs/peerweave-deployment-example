# Bootstrap the independent deployment example

Status: complete. Date: 2026-10-15.

## Scope

Create an independent consumer repo using the supplied harness-engineering reference. Keep the
framework sample and native/TURN contracts in Peerweave; relocate production assets and app
checks here. Preserve user changes and the user's legacy-demo deletion. Initialize local Git;
do not create a remote, publish packages or deploy production infrastructure.

## Acceptance list

- [x] Install/build through pinned package archives without sibling source aliases.
- [x] Keep the four reference pages functional and dispose native resources.
- [x] Deny anonymous/unauthorized ICE requests and room joins; bound production configuration.
- [x] Fetch authorized ICE leases before connecting, handle errors/cancellation and lease expiry.
- [x] Build images separately and verify app/Traefik/Coturn behavior with isolated cleanup.
- [x] Supply short agent map, indexed docs, decisions, plans, quality/debt and mechanical checks.
- [x] Remove production-only assets/gates from the framework; preserve its samples and contracts.
- [x] Run both repositories' relevant gates and record results/remaining external checks.

## Decisions and evidence

- Harness reference found at `~/Downloads/openai-harness-engineer.md` (plural directory).
- Keep the first deployment private; recommend BasicAuth plus explicit operator room membership.
- A local Git repository is authorized; commits, remote creation and production deployment are not performed.

## Test-first checkpoints

- Framework baseline: `pnpm test` passed 155 cases before separation.
- Consumer baseline: `pnpm test` passed 27 copied model/issuer cases.
- Anonymous API: expected 401, initially received 404; implementation then passed.
- Member ICE lease: expected 200, initially received 404; room-restricted issuance then passed.
- Anonymous WebSocket: expected 403, initially received 101; upgrade authentication then passed.
- Non-member join: expected error, initially received ready; shared membership policy then passed.
- Issuance bound: expected 429 on request three with a two-request test limit, initially received
  200; the per-subject window then passed, including reset with an injected clock.
- Session bound: expected close code 1008, initially observed no close; expiry then passed.
- Production configuration: a stub resolved instead of rejecting missing configuration; actual
  file/schema/origin/secret validation then passed. Explicit loopback development mode was added separately.
- Client lease: initial stub returned null; HTTP fetch then passed. Null/expired/malformed responses,
  pending cancellation and expiry callback each failed before implementation and then passed.
- Native app: before controller integration, zero ICE requests were observed instead of one.
  All three peer pages now reject unauthorized rooms without opening WebSockets.
- Existing copied relay behavior was characterized through actual WebSockets. A temporary mutation
  replacing forwarded payload with null was caught by the exact-payload assertion and restored.
- Gear: Obvious Implementation for the known HTTP/protocol rules; no fake constants remain.
- Full consumer `pnpm check` passed 42 unit/model cases, builds/types/boundary checks and the native
  four-page app smoke. Both application images built; actual Traefik/ICE/WSS deployment smoke passed.
- Full framework `pnpm check` passed after extraction: 163 combined coverage cases, 18 shared browser
  cases and all 18 unchanged end-to-end cases, plus packed-consumer validation and bundle budgets.

## Final verification and limits

- `pnpm install --frozen-lockfile` passed independently. All four private archives have verified
  SHA-256 hashes and source revision; the explicit vendor refresh command passed and updated
  dependency/override metadata. No source alias or sibling runtime dependency is required.
- `pnpm check` passed: lint, package/docs/deployment boundary checks, builds, strict types,
  42 unit/model/request cases and built native app smoke. Boundary coverage: statements 98.31%,
  branches 94.42%, functions 97.43%, lines 100%. This measures server and ICE-boundary source,
  not all copied UI/controller code. The four-metric floor is 85%.
- Both final app runtime images built using the standalone shell script. `pnpm test:deployment`
  passed actual private Traefik routing, authenticated/denied ICE, WSS/native media/chat and
  Docker discovery restrictions. No production containers were launched.
- `pnpm test:turn:deployment` passed UDP/TCP/TLS REST allocation, invalid/expired credential and
  restricted-destination checks, verified TLS, relay-only package data and ICE restart, shared-IP
  Traefik SNI passthrough, and the built app's actual API-fetched relay-only video/chat/file flow.
  Local self-signed certificates and a temporary loopback exception are test fixtures only.
- Native app screenshots were inspected. The development launcher served all four routes and
  ICE API on overridden ports 15173/18787, then stopped cleanly with both ports closed.
- Framework full gate passed with 163 coverage cases, 18 browser contracts and 18 unchanged
  end-to-end cases. Its retained `pnpm test:turn` passed UDP/TCP and ICE restart.
- All temporary deployment resources were removed; unrelated Docker workloads were retained.
  Source/framework regressions were preserved; issuer/deployment tests moved to their app owner.
- CI is configured but not executed remotely. No commits, remote, push, package publication,
  production deployment, public ACME/DNS/NAT/firewall check or real-device claim was made.
