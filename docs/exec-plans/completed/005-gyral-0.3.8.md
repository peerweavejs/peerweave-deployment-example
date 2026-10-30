# Upgrade the web app to Gyral 0.3.8

Status: complete, 2026-10-29.

Gyral 0.3.8 is a patch release with three behavior changes: a component renders only when its
state, a declared prop or a declared store's value changes; Gyral's packages take `@gyral/core`
as an exact-version peer; and `gyralDevServer` builds the app once per server-module version. It
adds typed driver provision (driver lists, `token.provide(run)`, `subscription(token, …)`),
`on(event, parser)`, the `gyral()` Vite plugin list, and two ESLint rules, `gyral/intent-event`
and `gyral/prefer-built-in`.

- [x] Pin `@gyral/core` and `@gyral/testing` to exactly 0.3.8 and refresh the lockfile.
- [x] Replace the 0.3.7 `minimumReleaseAgeExclude` entries with 0.3.8 ones, which end on 2026-11-12.
- [x] Run `npx @gyral/codemod@0.3.8 0.3.8` and migrate by hand what it left.
- [x] Check every view for reads outside its state and props.
- [x] Run Gyral's ESLint rules once, outside the Biome gate.
- [x] Run the full gate, the image build and both Docker deployment checks.

The codemod changed nothing and left one candidate: `vite.config.ts` used `preset` twice. It is
now `plugins: [gyral({ clientOnly: true })]`. The preset's `optimizeDeps.include` was empty, so
pre-bundling is unchanged. The codemod rewrites driver records and `subscription('name', …)` only
inside the module that declares the token, so it could not see `bindRuntime`, which serves
tokens declared in the component modules. That was migrated by hand:

- `bindRuntime` returns a driver list, not a record keyed by driver name. Its state feed is
  `subscription(events, …)` over the page's own `example-events` token, passed in by the entry.
  A runtime whose state type differs from the component's now fails to compile; before, the two
  were linked only by the string.
- The action driver stays `defineDriver({ name, run, toError })`. `token.provide(run)` would take
  `toError` from the component's tokens, which have none, so failures would lose `errorText`. The
  support page also sends two action types through that one driver.
- The transfer page's file parser is `on("change", ({ files }) => …)` instead of reading `files`
  from a target it checks with `instanceof`.

Kept: `reportClock` stays `subscription("report-clock", …)`. It is its own implementation, with
no token or provider, and 0.3.8 still documents that form for such a driver. The checkbox and
select parsers that read `target.checked` and `target.name` are unchanged; no rule flags them.

Render skipping: every view reads only its state (the one prop, `initialRoom`, only seeds
`init`), and the media hooks re-run on the snapshot's `revision`, which is state. Development checks
(G0017) were run in the browser suites with a temporary, uncommitted Vite setting that
pre-bundles core with its `development` condition: a Gyral 0.3.8 bug (gyral-3pv) otherwise turns
them off in Vite dev for an app that installs core from npm. A deliberately impure view failed
that check, and the real views logged no browser warning or error. The controllers publish
inside `act()`, so most messages that keep state change it again in the same flush; only the
media page's device listing skips a render.

Peer change: `@gyral/testing` now lists `@gyral/core` 0.3.8 as an exact peer, and one copy of
core is installed. Gyral's ESLint rules (`gyral/intent-event`, `gyral/prefer-built-in`) found
nothing before or after the change; Biome remains the repository's linter.

Frozen installation passed. `pnpm check` passed lint, repository invariants, builds, strict
types, all 42 unit/model/request cases, all 18 browser cases and the built app smoke. Coverage is
unchanged: 98.31% statements, 94.42% branches, 97.43% functions and 100% lines. `pnpm
build:images`, `pnpm test:deployment` and `pnpm test:turn:deployment` passed. The built JavaScript
and CSS grew from 62,152 to 62,994 bytes gzipped (+842): 0.3.8's runtime adds 323 and `on()` adds
512 to the transfer page. No assertions, retries or skipped cases changed.
