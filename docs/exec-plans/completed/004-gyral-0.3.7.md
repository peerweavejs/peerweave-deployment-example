# Upgrade the web app to Gyral 0.3.7

Status: complete, 2026-10-28.

Gyral 0.3.7 is a patch release with three behavior changes: a client-rendered component's
`init` commands start after its first render, a light-DOM component's first render replaces the
children the page's HTML gave it, and template rule 16 rejects capitals in an attribute name on a
custom element. It also makes reserved prop names (`state`, `send`, `drivers`, `stores`,
`initialMessages` and the custom-element callbacks) a type and development error.

- [x] Pin `@gyral/core` and `@gyral/testing` to exactly 0.3.7 and refresh the lockfile.
- [x] Move the `minimumReleaseAgeExclude` entries from 0.3.6 to 0.3.7 (published the same day).
- [x] Check the app against each behavior change and the new checks.
- [x] Run the full gate.

No app source changed. Each page's entry builds its element in code, assigns its drivers, then
replaces the `#app` placeholder's children with it, so drivers exist before the element connects
and its `init` commands run. The four light-DOM components are created empty; the `<noscript>`
fallback lives in the plain `#app` placeholder, not inside a component. Templates place no custom
elements, so rule 16 has nothing to check, and the only prop, `initialRoom`, is not reserved.
The entries could now import components statically and connect page elements, but the working
boot code was kept.

Only the two Gyral entries changed in `pnpm-lock.yaml`; one copy of `@gyral/core` is installed.
Frozen installation passed. `pnpm check` passed lint, repository invariants, builds, strict
types, all 42 unit/model/request cases, all 18 browser cases and the built app smoke. Coverage is
unchanged: 98.31% statements, 94.42% branches, 97.43% functions and 100% lines. No assertions,
retries or skipped cases changed.
