# Development

Use Node 24+ and the pnpm version in `package.json`. Run `pnpm install --frozen-lockfile`, then
`pnpm dev`. The launcher starts loopback-only backend/web processes and tears down siblings on
exit. Override `PEERWEAVE_PORT` and `PEERWEAVE_DEMO_PORT` for parallel worktrees.

Development uses one explicit local identity and the `hello` room. It does not impersonate a
production identity provider. Production mode requires the proxy identity boundary and private
room/secret files; it must not silently fall back to development access.

The [vendor manifest](../vendor/peerweave/manifest.json) records package hashes and source revision.
`pnpm vendor:peerweave /absolute/path/to/peerweave` builds/packs public artifacts, updates provenance
and refreshes dependency versions, overrides and the lockfile. Package sources must be clean so
the recorded revision identifies the snapshot. Review the archive/lockfile changes, then run all checks. Normal
install/build never reads the framework checkout. Each repo has an independent lockfile and CI.

Generated logs/screenshots go in `.artifacts`; secrets/certificates stay in ignored private
paths. Use [testing](TESTING.md) for fast and full feedback loops.
