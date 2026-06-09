---
name: migrate-to-nuxt
description: Use when migrating a Next.js (React) frontend and/or a Flask/FastAPI backend to a full Nuxt 4 application. Drives a phased, branch-based, two-pass (faithful then idiomatic) migration with confirmation gates, and delegates framework detail to the nuxt, vue, shadcn-vue, vueuse, and pnpm skills. Triggers on requests like "migrate this Next.js app to Nuxt", "port this React/Flask app to Vue/Nuxt", "rewrite to Nuxt 4".
license: MIT
---

# Migrate to Nuxt 4

You are running a **framework migration to Nuxt 4**. This skill is the **orchestrator**: it owns the *workflow, sequencing, decisions, and pitfalls*. It does **not** re-teach Nuxt/Vue — delegate framework detail to the companion skills below.

## Core principles — read before doing anything

1. **Two passes, never mixed.** **Pass 1 = behavior-faithful** (use the *correct* Vue primitive, never a literal line-for-line port, never replicate React anti-patterns), verified against the **original running app**. **Pass 2 = idiomatic polish** (VueUse, `useAsyncData`, composable/layer extraction, drop redundant reactivity), verified as a *refactor* against the pass-1 baseline. Doing both at once means you can't tell a translation bug from an idiom bug. (Evidence: Bun's Zig→Rust AI port shipped 13k `unsafe` blocks vs ~73 hand-written — the cost of skipping the idiomatic pass.)
2. **Branch + tracking file.** Never migrate on `main`. Create a migration branch and maintain `NUXT_MIGRATION.md` (template in `references/assess.md`) as the single source of truth — it makes the migration **resumable across sessions** and is where every decision and checkbox lives.
3. **Ask, don't assume — at phase gates.** Confirm at each phase boundary and on genuine ambiguity (auth, DB, target structure, destructive deletes). AI drifts to the target framework's *default* conventions unless told otherwise ("don't ask, don't get"). Do **not** prompt for every file — the tracking file carries the small decisions.
4. **Keep the original reachable** (a `reference/` copy or `git show <orig-branch>:...`) until parity is verified, so the final audit can diff 1:1. Then delete.
5. **Delegate exact tooling to the live skills.** Their setup commands stay current; this skill supplies the *workflow + the gotchas the skills don't emphasize* (`references/setup.md`, `references/pitfalls.md`).

## Companion skills — invoke as needed

- **`nuxt`** — server routes, routing, middleware, composables, `nuxt.config`, Nitro.
- **`vue`** — Composition API, `<script setup>`, props/emits, composables.
- **`shadcn-vue`** — Reka-UI components, Tailwind wiring, CLI, `components.json`.
- **`vueuse`** — check here before writing any custom composable (pass 2).
- **`pnpm`** — workspaces, catalogs, lockfiles, CI.
- Optional: **`nuxt-better-auth`** (auth), **`nuxthub`** (DB/Drizzle/KV/blob), **`nuxt-seo`**, **`nuxt-content`**.

## The workflow

Run phases in order. Each `→` points to the reference file to load **at that phase only** (progressive disclosure — do not load everything up front).

| # | Phase | Gate? | Load |
|---|-------|-------|------|
| 0 | **Branch + tracking** — create migration branch; write `NUXT_MIGRATION.md`; copy original to `reference/` (or note the source ref) | — | `references/assess.md` |
| 1 | **Assess** — inventory routes/components/data/auth/backend; **dead-code audit (grep import sites)**; decide rebuild-vs-incremental and keep-Python-vs-port | ✅ confirm scope | `references/assess.md` |
| 2 | **Configure** — the stack questionnaire (auth, DB+ORM, Tailwind method, shadcn prefix/dir, package manager, target structure) | ✅ **hard gate — ask before any code** | `references/assess.md` |
| 3 | **Scaffold + tooling** — fresh Nuxt 4; wire Tailwind v4, shadcn-vue, fonts, aliases per answers | ✅ confirm scaffold | `references/setup.md` |
| 4 | **Verification harness** — establish how "faithful" will be proven (typecheck, build, curl smoke tests, parity audit). Frontends usually lack tests — build this first | — | `references/verification.md` |
| 5 | **Pass 1 — faithful port** — foundation → primitives → shared types/composables → leaf components → stateful core → pages → server/proxy/auth | ✅ confirm before pass 2 | `references/react-to-vue.md`, `references/next-to-nuxt.md`, `references/flask-fastapi-to-nitro.md` |
| 6 | **Pass 2 — idiomatic polish** — per-feature, verified as refactor vs pass-1 baseline | ✅ confirm scope | `references/react-to-vue.md` §idiomatic, `vueuse` skill |
| 7 | **Deploy** — detect & regenerate deploy config; set Nitro preset; handle hybrid (Nuxt + retained Python) topology | ✅ confirm topology | `references/deployment.md` |
| 8 | **Final parity audit + cleanup** — independent diff vs original; then delete `reference/` | ✅ confirm before deleting original | `references/verification.md` |

**Build order within Pass 1 (critical):** config → CSS/tokens → UI primitives → shared types/composables → leaf components → the big stateful component → pages. This makes conventions (alias paths, ui-import style, types location, emits contract) concrete *before* anything depends on them.

**Parallelize leaf ports, keep the core yourself.** Self-contained presentational components port well via the **`port-component` subagent** — hand each one the source file + `references/conventions.md`. The interconnected stateful core (e.g. the main dashboard) stays under your direct control.

## The four un-guessable pitfalls — keep these in mind the whole time

These cost the most time and you will not infer them. Full guide in `references/pitfalls.md`.

1. **Auto-import shadowing.** Nuxt/Nitro auto-imports `useStorage`, `useState`, `useFetch`, `useError`, `useCookie` — these **shadow VueUse** and mean something totally different (`useState` = cross-request SSR state, *not* `ref`). Import VueUse ones explicitly: `import { useStorage } from '@vueuse/core'`.
2. **`runtimeConfig` bakes defaults at build time.** At runtime Nuxt only overrides from a **`NUXT_`-prefixed** env var. Plain `AUTH_COOKIE_SECRET` is ignored → you ship the baked default. Either rename to `NUXT_*`, or read `process.env.X` directly in server handlers. Never put secrets in `runtimeConfig.public`.
3. **HttpOnly auth must live in `server/middleware/`.** A client `defineNuxtRouteMiddleware` can never read an HttpOnly cookie. Next edge middleware → Nitro `server/middleware/auth.ts`. Allowlist Nuxt internals (`/_nuxt`, `/__nuxt`, `/_ipx`) or you white-screen the app.
4. **Dropped `next/font` → ugly serif.** Removing `next/font/google` while CSS still references the family (`--font-sans: 'Geist','Geist Fallback'`) leaves it unresolvable → browser default serif. Self-host via `@nuxt/fonts` and replace `*-Fallback` names with a real system chain.

## Reference index

- `references/assess.md` — inventory, dead-code audit, decision trees, the config questionnaire, `NUXT_MIGRATION.md` template.
- `references/conventions.md` — the project "Nuxt Way" doc you hand to every port agent.
- `references/react-to-vue.md` — hooks→composables, JSX→SFC, props/emits, idiomatic-pass checklist.
- `references/next-to-nuxt.md` — routing, data fetching (SWR→`useAsyncData`), middleware/auth, the proxy, aliases & structure.
- `references/flask-fastapi-to-nitro.md` — backend decision tree + endpoint/auth mapping.
- `references/setup.md` — tooling setup order + the gotchas the live skills don't flag.
- `references/deployment.md` — Docker/CI, Nitro presets, hybrid topology, env vars.
- `references/verification.md` — layered verification + parity audit.
- `references/pitfalls.md` — the full symptom→cause→fix field guide.