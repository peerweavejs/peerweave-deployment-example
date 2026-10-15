# Working in Peerweave Deployment Example

This application pnpm workspace is an application consuming Peerweave's packaged public APIs.
The framework and its lightweight samples live in the separate Peerweave repository.

## Start here

- [Architecture](ARCHITECTURE.md): boundaries, ownership and request paths.
- [Design index](docs/design-docs/index.md) and [principles](docs/design-docs/core-beliefs.md).
- [Product scope](docs/product-specs/index.md): intended users and explicit limits.
- [Plans](docs/PLANS.md): active work, completed decisions and known debt.
- [Development](docs/DEVELOPMENT.md), [frontend](docs/FRONTEND.md), [testing](docs/TESTING.md).
- [Deployment](docs/webrtc-production.md), [security](docs/SECURITY.md),
  [reliability](docs/RELIABILITY.md) and [quality evidence](docs/QUALITY_SCORE.md).
- [Harness reference](docs/references/openai-harness-engineer.md).

## Commands

- Use the pnpm version pinned in `package.json` and Node 24 or newer.
- `pnpm install --frozen-lockfile` installs the checked-in dependency graph.
- `pnpm dev` runs a loopback-only development server and the four-page web app.
- `pnpm check` runs formatting/lint, repository checks, build, types, coverage and native app checks.
- `pnpm build:images` builds images; Compose files must never contain `build`.
- `pnpm test:deployment` and `pnpm test:turn:deployment` require Linux/Docker.

## Invariants

- Import Peerweave only through installed package exports. No sibling source aliases or symlinks.
- Keep application auth, rooms, credential issuance and deployment out of the framework packages.
- Production identity comes only through the trusted authenticated proxy; publish no backend port.
- Authorize both signaling membership and credential requests against the same room policy.
- Never expose shared TURN secrets, password hashes, private keys or credentials in logs/bundles.
- Parse untrusted inputs at boundaries. Bound queues, message sizes, sessions and credential lifetimes.
- Pure UI models hold serializable state; disposable controllers own native browser resources.
- Browser resources are created on explicit actions. Dispose owned resources and preserve borrowed tracks.
- See a new behavioral test fail before implementation. Preserve existing regression assertions.
- Never skip, loosen or delete tests to get green. Record limitations instead of claiming readiness.
- Keep this map short (under 100 lines). Keep plans, documentation and measured quality current.
- No push, publication or production deployment without the user's authorization.
