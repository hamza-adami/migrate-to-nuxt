# migrate-to-nuxt

A Claude Code plugin that migrates **Next.js (React)** and/or **Flask/FastAPI** projects to a full **Nuxt 4** app — using a phased, **two-pass (faithful → idiomatic)** workflow with confirmation gates, and delegating framework detail to the `nuxt`, `vue`, `shadcn-vue`, `vueuse`, and `pnpm` skills.

## What's inside

```
migrate-to-nuxt/
├── .claude-plugin/
│   ├── plugin.json            # plugin manifest
│   └── marketplace.json       # marketplace manifest (installable as a local marketplace)
├── commands/
│   └── migrate-to-nuxt.md     # /migrate-to-nuxt slash command
├── agents/
│   └── port-component.md      # subagent: faithful parallel leaf-component ports
└── skills/
    └── migrate-to-nuxt/
        ├── SKILL.md           # the orchestrator workflow spine
        └── references/        # loaded progressively, per phase
            ├── assess.md                  # inventory, dead-code audit, config gate, NUXT_MIGRATION.md template
            ├── conventions.md             # the project "Nuxt Way" handed to port agents
            ├── react-to-vue.md            # hooks→composables, JSX→SFC, props/emits, idiomatic checklist
            ├── next-to-nuxt.md            # routing, data fetching, middleware/auth, the proxy, aliases
            ├── flask-fastapi-to-nitro.md  # backend keep-vs-port decision tree + endpoint mapping
            ├── setup.md                   # tooling setup order + gotchas
            ├── deployment.md              # Docker/CI, Nitro presets, hybrid topology
            ├── verification.md            # layered verification + parity audit
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

or just ask: *"migrate this Next.js app to Nuxt 4"*. The skill will assess the source, **stop to confirm the stack** (auth, DB, Tailwind, shadcn, package manager), scaffold a fresh Nuxt 4 app, do a faithful port (verified against the original), then an idiomatic pass, then handle deployment.

## Design principles

- **Two passes, never mixed** — faithful (correct primitives, verified vs the original) then idiomatic (VueUse, `useAsyncData`, composables — verified as a refactor). Skipping the idiomatic pass is how AI migrations accrue debt.
- **Branch + `NUXT_MIGRATION.md`** — every migration runs on a branch and tracks state in a markdown file, so it's resumable across sessions.
- **Ask at phase gates** — the stack (auth/DB/structure) is confirmed before any code; AI drifts to framework defaults otherwise.
- **Hybrid is first-class** — a heavy Python backend (OCR/ML/async) is *kept*, with a Nitro BFF proxy in front. "Full Nuxt" doesn't mean deleting Python.
- **Delegate tooling** — exact setup commands come from the live skills; this plugin owns workflow + the un-guessable gotchas.

The pitfalls are drawn from real production Next.js → Nuxt 4 migrations. The four that cost the most time: auto-import shadowing (`useStorage`/`useState`), the `runtimeConfig` build-time / `NUXT_` env trap, HttpOnly auth belonging in `server/middleware`, and the dropped-`next/font` serif fallback.