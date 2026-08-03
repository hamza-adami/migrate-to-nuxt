# migrate-to-nuxt

A Claude Code plugin that migrates **Next.js (React)** frontends and/or **Express/Node, Flask, FastAPI** backends into a full **Nuxt 4** app — using a phased, **two-pass (faithful → idiomatic)** workflow with contract fixtures, plan files for multi-session work, and confirmation gates, delegating framework detail to the `nuxt`, `vue`, `shadcn-vue`, `vueuse`, and `pnpm` skills.

Three entry modes are detected automatically: **A** full migration, **B** frontend only, **C** backend only — *the frontend is already Nuxt and an Express service is being folded into Nitro* (no scaffold, strangler-fig port).

## What's inside

```
migrate-to-nuxt/
├── .claude-plugin/
│   ├── plugin.json            # plugin manifest
│   └── marketplace.json       # marketplace manifest (installable as a local marketplace)
├── commands/
│   └── migrate-to-nuxt.md     # /migrate-to-nuxt slash command
├── agents/
│   ├── port-component.md      # subagent (sonnet): faithful parallel leaf-component ports
│   ├── port-endpoint.md       # subagent (sonnet): fixture-gated endpoint-group ports
│   └── audit-migration-plan.md # subagent: adversarial gap-finder over the plan vs the real source
└── skills/
    └── migrate-to-nuxt/
        ├── SKILL.md           # the orchestrator workflow spine
        ├── scripts/
        │   ├── fixtures.mjs   # record/replay HTTP contract fixtures (no deps, Node >=18)
        │   └── preflight.mjs  # report available MCP servers / plugins / binaries
        └── references/        # loaded progressively, per phase
            ├── assess.md                  # inventory, dead-code audit, config gate, NUXT_MIGRATION.md template
            ├── plan-files.md              # decomposition, session splitting, which model does which work
            ├── conventions.md             # the project "Nuxt Way" handed to port agents
            ├── react-to-vue.md            # hooks→composables, JSX→SFC, props/emits, idiomatic checklist
            ├── next-to-nuxt.md            # routing, data fetching, middleware/auth, the proxy, aliases
            ├── express-to-nitro.md        # strangler-fig facade, Express→h3 mapping, the 7 traps, SSE, jobs
            ├── flask-fastapi-to-nitro.md  # Python keep-vs-port decision tree + endpoint mapping
            ├── package-swaps.md           # Context7-verified replacements, version trap, auth cutover
            ├── setup.md                   # tooling setup order + gotchas
            ├── deployment.md              # Docker/CI, Nitro presets, hybrid topology
            ├── js-to-ts.md                # JS->TS levels, type derivation, Zod v4
            ├── bun.md                     # Bun target runtime: 3 decisions, preset, empirical gate
            ├── verification.md            # test baseline, contract fixtures, layered verification, parity audit
            └── pitfalls.md                # full symptom→cause→fix field guide
```

## Install

```
/plugin marketplace add hamza-adami/migrate-to-nuxt
/plugin install migrate-to-nuxt
```

## Use

```
/migrate-to-nuxt
```

or just ask: *"migrate this Next.js app to Nuxt 4"* / *"move our Express backend into Nitro"*. The skill runs preflight, assesses the source against **current** docs, **stops to confirm the stack** (auth, DB, Tailwind, shadcn, package manager, runtime, JS→TS level), records a test baseline and contract fixtures, decomposes the work into plan files, audits that plan adversarially, then ports faithfully — verifying each unit against the fixtures and, for UI, in a real browser.

## Design principles

- **Two passes, never mixed** — faithful (correct primitives, verified vs the original) then idiomatic (VueUse, `useAsyncData`, composables — verified as a refactor). Skipping the idiomatic pass is how AI migrations accrue debt.
- **Branch + `NUXT_MIGRATION.md`** — every migration runs on a branch and tracks state in a markdown file, so it's resumable across sessions.
- **Ask at phase gates** — the stack (auth/DB/structure) is confirmed before any code; AI drifts to framework defaults otherwise.
- **Baseline first, then verify contracts** — the existing suite is run on the *untouched* original and committed as a baseline, so the bar is "no new failures" rather than "all green"; a migration that surfaces a pre-existing bug shouldn't get blamed for it. Backend ports are gated on recorded request/response fixtures, because a wrong Express→Nitro port typechecks and builds cleanly.
- **Strangler fig, never big-bang** — a Nitro catch-all proxies to the still-running backend; endpoints move one group at a time, and the old route is deleted in the same commit that adds the new one. Deleting the new file is the rollback.
- **Plan files + model split** — work bigger than one context window becomes `plans/NN-*.md` units, each executable by a fresh session. Opus plans and reviews, Sonnet executes the mechanical units — but only behind a real gate. The switch is automatic: the port subagents are pinned to `sonnet`/`medium` and the auditor to `opus`/`high`, so dispatching them shifts model *and* reasoning effort with no user action. Modeled on [Airbnb's 3,500-file test migration](https://medium.com/airbnb-engineering/accelerating-large-scale-test-migration-with-llms-9565c208023b) and [Google's code-migration pipeline](https://arxiv.org/abs/2504.09691).
- **The plan gets audited before it's trusted** — `audit-migration-plan` enumerates the real source surface, subtracts what the plan covers, and refuses a READY verdict while any unit is both unverifiable and assigned to a cheaper model.
- **Hybrid is first-class** — a heavy backend (OCR/ML/async, native deps) is *kept*, with a Nitro BFF proxy in front. "Full Nuxt" doesn't mean deleting Python, and it doesn't mean one process.
- **Library swaps are Pass 2, runtime swaps later still** — better-auth, zod, Nitro tasks are all good targets, but never while porting: two simultaneous changes means a failure with two causes. **Bun** (`nitro.preset: 'bun'`) is supported as a target: feasibility is probed early and cheaply, and if it just works you take it — if it needs real work it waits until parity passes. Either way it's gated on replaying the contract fixtures against the Bun-run output.
- **Copy, don't rewrite** — same language means `git mv` + targeted edits, not regeneration. Only a real paradigm change (JSX→SFC, Python→TS) earns a rewrite. Roughly halves the token cost and makes copied files *provably* faithful, since `diff` is a free parity proof. Plan files mark every item MOVE or REWRITE, and the auditor flags any REWRITE that should have been a MOVE. Alongside it: no gratuitous comments, `context-mode` for bulky output, `grep` to decide and `Read` only to edit, bulky reads delegated to subagents.
- **Plan from current docs, code against installed versions** — planning fetches fresh docs (training data lags; APIs move), while implementation pins to version-qualified sources, because a Nitro 3 / h3 v2 snippet is simply wrong in a Nitro 2 project. Wanting a newer major is an explicit upgrade unit, never smuggled into a port.
- **Delegate tooling** — exact setup commands come from the live skills; this plugin owns workflow + the un-guessable gotchas.

The pitfalls are drawn from real production Next.js → Nuxt 4 migrations. The four that cost the most time: auto-import shadowing (`useStorage`/`useState`), the `runtimeConfig` build-time / `NUXT_` env trap, HttpOnly auth belonging in `server/middleware`, and the dropped-`next/font` serif fallback.