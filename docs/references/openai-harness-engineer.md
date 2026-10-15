# Harness engineering reference

Source: [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/),
Ryan Lopopolo, OpenAI, February 11, 2026. Consult the original article for its complete text;
this file records how its approach is applied in this repository.

## Applied here

- Keep `AGENTS.md` a short navigation map into versioned architecture, product, security and test docs.
- Record decisions, execution plans, measured quality and remaining debt alongside the application.
- Enforce important boundaries with executable repository checks instead of relying only on prose.
- Make the app runnable on isolated local ports and expose health, structured startup logs and screenshots.
- Use deterministic tests plus real browser/container checks; distinguish local evidence from external acceptance.
- Improve a failing workflow by adding the missing capability or invariant, then verify it.

The implementation is deliberately small: no unused database schema, account service or full
observability cluster is scaffolded. See [architecture](../../ARCHITECTURE.md),
[plans](../PLANS.md), [testing](../TESTING.md) and [quality](../QUALITY_SCORE.md).

The original article remains the author's work under its original terms. It is linked rather
than reproduced or included in this project's MIT grant.
