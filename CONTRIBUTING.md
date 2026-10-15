# Contributing to the deployment example

Contributions to application behavior, docs, reproducible deployment checks and operating guidance
are welcome. Follow the [code of conduct](CODE_OF_CONDUCT.md) and report vulnerabilities privately
through [SECURITY.md](SECURITY.md).

## Scope

This repo owns authentication, room policy, ICE credential issuance, its web application, images,
Traefik/Coturn configuration and operations. Library/API/negotiation changes belong in
[Peerweave](https://github.com/peerweavejs/peerweave). Do not import a sibling checkout to work around
a missing package API; discuss the framework change, then update its reviewed artifacts here.

## Development

Use Node 24+ and the pinned pnpm version. Fork, clone and create a focused branch:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm dev
```

Use room `hello` locally. Override `PEERWEAVE_PORT` and `PEERWEAVE_DEMO_PORT` for parallel worktrees.
Read [`AGENTS.md`](AGENTS.md), [architecture](ARCHITECTURE.md) and [development](docs/DEVELOPMENT.md).

Write a failing behavioral test before implementing a change. Keep model state serializable,
resources disposable and authorization fail-closed. Do not skip, loosen or delete regression
assertions. Update relevant security/configuration guidance and measured evidence with the change.

```sh
pnpm check
pnpm build:images
pnpm test:deployment
pnpm test:turn:deployment
```

The Docker checks require Linux, Docker/Compose and local Unix-socket access. Use disposable local
fixtures rather than a production Docker host or real credentials. Public DNS, ACME, NAT, hardware
and restrictive-network checks remain distinct from the local suite. Report exactly what ran.

## Pull requests

Describe the concrete problem and resulting behavior; include the test commands/results and any
configuration, migration or operational risks. Keep unrelated refactors separate. Conventional
subjects (`fix:`, `feat:`, `docs:`, `test:`) make the history easier to navigate.

For dependency/artifact updates, preserve the checksum/source manifest and lockfile. Never publish
TURN secrets, password hashes, TLS keys, production policy or real user data in commits, logs,
screenshots, issue reports or CI artifacts. Keep Compose image-only and health checks bounded.

No CLA or signed-off-by requirement is currently configured. Contributions are licensed under
[MIT](LICENSE); preserve third-party notices and font licenses. Maintainers review contributions,
and opening a PR does not promise acceptance or a support deadline.
