---
name: migrate-to-nuxt
description: Use when migrating a Next.js/React frontend and/or an Express/Node/Flask/FastAPI backend into a full Nuxt 4 app — including when the frontend is already Nuxt and only the backend is being folded into Nitro. Drives a phased, branch-based, two-pass (faithful then idiomatic) migration with contract fixtures, plan files for multi-session work, and confirmation gates; delegates framework detail to the nuxt, vue, shadcn-vue, vueuse, and pnpm skills. Triggers on "migrate this Next.js app to Nuxt", "port this React/Flask app to Vue/Nuxt", "move our Express backend into Nitro/Nuxt server routes", "consolidate frontend and backend into one Nuxt app", "rewrite to Nuxt 4".
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
6. **The unit of work is one plan file, one commit, one gate.** Anything bigger than a session gets decomposed into `plans/NN-*.md` files indexed from `NUXT_MIGRATION.md`, each independently verifiable and each executable by a *fresh* session. Opus plans and reviews; Sonnet executes the mechanical units — but only once a real gate exists (`references/plan-files.md`). Both large documented AI migrations (Airbnb: 3,500 files, 97% automated; Google: 595 changes, ~75% LLM edits) worked this way: decompose → validate → re-prompt with the error → human reviews every landed diff.
7. **Baseline before you touch, then verify contracts — not compilation.** Run the existing suite on the untouched original and record which tests *already* fail; the bar is **no new failures**, not all green, or you'll misattribute pre-existing bugs to the migration and churn code that was never broken. Then, because typecheck+build catch almost nothing in a backend port, record request/response fixtures against the *still-running* original and replay them. No baseline + no fixtures → no cheap-model execution (`references/verification.md`).
8. **Library swaps are Pass 2, always.** Porting and re-platforming at once means a failure has two causes and you can't bisect it. Faithful first, swap after (`references/package-swaps.md`). A **runtime** change (Bun) is probed early and cheaply — if it just works, take it; if it needs real work, it waits until parity passes and gets its own branch and gate (`references/bun.md`). The unbending part is never debugging a runtime incompatibility and a port bug simultaneously.
9. **Copy, don't rewrite. Write no comments.** Same language → **`git mv`/`cp` the file**, then `Edit` only the lines that touch the framework. Regenerating a file the target language already accepts costs ~2× its tokens, risks transcription drift, and produces nothing a copy wouldn't. Only a genuine language/paradigm change (JSX→SFC, Python→TS) earns a full rewrite. A copied file is *provably* faithful — `diff` is a free parity proof. New code gets **zero comments** unless it truly can't explain itself, and excessive comments in the source are dropped rather than ported (`references/conventions.md`).
10. **Check current docs for every package — never code from memory.** Not just Nuxt: the ORM, auth lib, validation lib, UI kit, test runner, deploy SDK. Fetch fresh docs when planning (training data lags; a stale pattern chosen at planning time propagates into every unit) **and** before writing against any API you haven't verified this session, including ones you're confident about. But write code against the **installed** majors using version-qualified sources — a Nitro 3/h3 v2 snippet is simply wrong in a Nitro 2 project. Wanting a newer major is an explicit, separately-gated upgrade unit, never smuggled into a port (`references/assess.md` §load current docs).

## Phase -1 — preflight (run once, before anything)

`node <skill>/scripts/preflight.mjs` reports MCP servers, plugins and binaries. Cross-check the
companion **skills** against your *own* available-skills listing (authoritative — a disk check gives
false alarms). Report anything genuinely absent and **ask whether to install before starting**; each
one removes a class of avoidable error, and the two that matter most:

- **`context7` MCP** — the difference between *checked* and *remembered* APIs. Without it you will
  code from training data that lags the ecosystem.
- **`context-mode` plugin** — keeps large tool output out of context (below).
- **`chrome-devtools` MCP** — real-browser verification; the only thing that catches a white screen.

The migration works without them. Say so, don't block on it.

**Planning runs on opus at high effort; execution runs on sonnet at medium.** Don't economise on the
strategy, the plan files, or the audit — a wrong call there multiplies across every unit. The port
agents ship pinned (`sonnet`/`medium`); the auditor ships pinned (`opus`/`high`).

**Open the browser instead of guessing.** When a check fails or you're unsure a feature works, use
Chrome DevTools MCP: console errors, network requests, a screenshot, click the actual flow. One look
beats three hypotheses, and console output is the *only* place hydration and auto-import failures
appear (`references/verification.md` §real-browser checks).

## Token discipline — this migration is long, context is the budget

A migration reads far more than it writes. Four rules, in order of savings:

1. **Copy, don't rewrite** (principle 9) — the single biggest one.
2. **Use `context-mode` when available for anything bulky**: repo inventories, dead-code greps, test-suite
   and build output, dependency trees, `git log`, doc fetches. Derive the answer in the sandbox and
   surface only the conclusion — raw bytes never enter context. This is exactly the migration's shape
   (huge inputs, small verdicts). Use plain Bash/Read only for short fixed output or when you're about
   to `Edit` the file you read.
3. **`grep` to decide, `Read` to edit.** Never read a file to find out whether it's dead or
   framework-touching — that's a grep. Read whole files only when you're changing them.
4. **Delegate bulky reads to subagents.** A `port-endpoint`/`port-component` agent's file reads stay in
   *its* context, not yours — often the larger half of the saving.

## Pick the entry mode first

Detect what actually exists before assuming a greenfield Next→Nuxt job. Check for `nuxt` in the frontend's `package.json`.

| Mode | When | Phases |
|---|---|---|
| **A — Full migration** | React/Next frontend + non-Nuxt backend | All phases as written |
| **B — Frontend only** | Next/React frontend, backend stays put | Skip backend refs; keep the proxy |
| **C — Backend only** | **Frontend is already Nuxt**; an Express/Flask service is being folded into Nitro | **Skip phases 3 and the React/Next refs entirely.** Assess → configure → *contract-fixture harness* → strangler-fig port → deploy. `references/express-to-nitro.md` is the primary reference |

Mode C is common and the most likely to be mishandled: the temptation is to scaffold something. Do not. The Nuxt app exists; you are adding `server/` routes behind an existing proxy. State the detected mode back to the user before proceeding.

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
| 1 | **Assess** — detect entry mode; **resolve installed versions and load *current* docs before deciding anything**; inventory routes/components/data/auth/backend; **dead-code audit (grep import sites)**; decide rebuild-vs-incremental and keep-vs-port **per endpoint group** | ✅ confirm scope | `references/assess.md` |
| 2 | **Configure** — the stack questionnaire (auth, DB+ORM, Tailwind method, shadcn prefix/dir, package manager, target structure, runtime, **JS→TS level**) | ✅ **hard gate — ask before any code** | `references/assess.md`, `references/js-to-ts.md` |
| 3 | **Scaffold + tooling** — fresh Nuxt 4; wire Tailwind v4, shadcn-vue, fonts, aliases per answers. **Skip entirely in mode C** | ✅ confirm scaffold | `references/setup.md` |
| 4 | **Verification harness** — **run the existing test suite on the untouched original first and commit the baseline** (which tests already fail); then typecheck, build, **contract fixtures recorded against the still-running original**, smoke tests. Build this *before* the first ported file | — | `references/verification.md` |
| 4b | **Plan files** — decompose into `plans/NN-*.md`, index them in `NUXT_MIGRATION.md`, assign a model per unit; then **run the `audit-migration-plan` agent and resolve every Critical before porting** | ✅ confirm decomposition + audit verdict | `references/plan-files.md` |
| 5 | **Pass 1 — faithful port** — foundation → primitives → shared types/composables → leaf components → stateful core → pages → server routes. Backend: facade first, then strangle group by group | ✅ confirm before pass 2 | `references/express-to-nitro.md`, `references/flask-fastapi-to-nitro.md`, `references/react-to-vue.md`, `references/next-to-nuxt.md` |
| 6 | **Pass 2 — idiomatic polish + library swaps** — per-feature, verified as refactor vs pass-1 baseline | ✅ confirm scope | `references/react-to-vue.md` §idiomatic, `references/package-swaps.md`, `vueuse` skill |
| 7 | **Deploy** — detect & regenerate deploy config; set Nitro preset; handle hybrid (Nuxt + retained backend) topology | ✅ confirm topology | `references/deployment.md` |
| 7b | **Runtime switch (optional)** — Bun or another preset. **Probe feasibility back in Phase 1** (minutes); if trivial, adopt then. If it needs real work, it happens here as its own branch with its own gate | ✅ confirm + gate results | `references/bun.md` |
| 8 | **Final parity audit + cleanup** — independent diff vs original; then delete `reference/` | ✅ confirm before deleting original | `references/verification.md` |

**Build order within Pass 1 (critical):** config → CSS/tokens → UI primitives → shared types/composables → leaf components → the big stateful component → pages. This makes conventions (alias paths, ui-import style, types location, emits contract) concrete *before* anything depends on them.

**Backend build order (mode C):** proxy facade → `server/utils/**` move (`git mv`, no rewrite) → health/public GETs → authed GETs → writes → uploads → auth → **streaming last** → workers (or never). Each endpoint group is one plan file, one commit, and the Express route is deleted in the *same* commit that adds the Nitro one — two live implementations of one endpoint is the classic strangler failure.

**Parallelize the mechanical, keep the subtle yourself.** Self-contained presentational components → **`port-component`** subagent; fixture-gated endpoint groups → **`port-endpoint`** subagent (both pinned to Sonnet, so dispatching them switches model automatically — see `references/plan-files.md` §how the model actually switches). Hand each the source file + `references/conventions.md` + the plan file. The interconnected stateful core, auth, and streaming stay under your direct control.

**Audit the plan before trusting it.** Run **`audit-migration-plan`** at the 4b gate and again before each pass. It is adversarial by design: it enumerates the real source surface and subtracts what the plan covers, flags units whose only gate is typecheck+build as *unverifiable*, and refuses a READY verdict while any unit is both unverifiable and assigned to a cheaper model. A plan that reads as thorough is the normal state of a plan about to fail.

**Ship deterministic checks, don't re-derive them.** `scripts/fixtures.mjs` (no deps, Node ≥18) records HTTP contract fixtures against the original server and replays them against the new one, exiting non-zero on drift. Use it instead of hand-rolling curl comparisons per session.

## The four un-guessable pitfalls — keep these in mind the whole time

These cost the most time and you will not infer them. Full guide in `references/pitfalls.md`; Express-specific ones in `references/express-to-nitro.md` §traps — above all: **an h3 guard that `return`s instead of throwing is a no-op that typechecks.**

1. **Auto-import shadowing.** Nuxt/Nitro auto-imports `useStorage`, `useState`, `useFetch`, `useError`, `useCookie` — these **shadow VueUse** and mean something totally different (`useState` = cross-request SSR state, *not* `ref`). Import VueUse ones explicitly: `import { useStorage } from '@vueuse/core'`.
2. **`runtimeConfig` bakes defaults at build time.** At runtime Nuxt only overrides from a **`NUXT_`-prefixed** env var. Plain `AUTH_COOKIE_SECRET` is ignored → you ship the baked default. Either rename to `NUXT_*`, or read `process.env.X` directly in server handlers. Never put secrets in `runtimeConfig.public`.
3. **HttpOnly auth must live in `server/middleware/`.** A client `defineNuxtRouteMiddleware` can never read an HttpOnly cookie. Next edge middleware → Nitro `server/middleware/auth.ts`. Allowlist Nuxt internals (`/_nuxt`, `/__nuxt`, `/_ipx`) or you white-screen the app.
4. **Dropped `next/font` → ugly serif.** Removing `next/font/google` while CSS still references the family (`--font-sans: 'Geist','Geist Fallback'`) leaves it unresolvable → browser default serif. Self-host via `@nuxt/fonts` and replace `*-Fallback` names with a real system chain.

## Reference index

- `references/assess.md` — inventory, dead-code audit, decision trees, the config questionnaire, `NUXT_MIGRATION.md` template.
- `references/plan-files.md` — decomposing into plan files, session splitting, which model does which work.
- `references/express-to-nitro.md` — Express/Node → Nitro: strangler-fig facade, mechanical mapping, the seven Express traps, SSE, jobs, strangle order.
- `references/js-to-ts.md` — JS→TS levels (ask first), deriving types from real runtime output, Zod v4 validation + its v3 breaking changes.
- `references/package-swaps.md` — using Context7 to pick replacements (better-auth, zod, Nitro tasks…), version-pinning trap, the auth cutover sequence.
- `references/conventions.md` — the project "Nuxt Way" doc you hand to every port agent.
- `references/react-to-vue.md` — hooks→composables, JSX→SFC, props/emits, idiomatic-pass checklist.
- `references/next-to-nuxt.md` — routing, data fetching (SWR→`useAsyncData`), middleware/auth, the proxy, aliases & structure.
- `references/flask-fastapi-to-nitro.md` — backend decision tree + endpoint/auth mapping.
- `references/setup.md` — tooling setup order + the gotchas the live skills don't flag.
- `references/deployment.md` — Docker/CI, Nitro presets, hybrid topology, env vars.
- `references/bun.md` — Bun as target runtime: the three independent decisions, decision tree, `preset: 'bun'`, the empirical gate, rollback.
- `references/verification.md` — layered verification + parity audit.
- `references/pitfalls.md` — the full symptom→cause→fix field guide.
- `scripts/preflight.mjs` — report available MCP servers / plugins / binaries before starting.
- `scripts/fixtures.mjs` — record/replay HTTP contract fixtures (`record|replay <manifest> <baseUrl>`; manifest format in its header comment).

## Agents

- **`port-component`** (sonnet) — one React/Next component → one Vue SFC, faithfully.
- **`port-endpoint`** (sonnet) — one fixture-gated endpoint group → Nitro routes, contract-preserving.
- **`audit-migration-plan`** — adversarial gap-finder over `NUXT_MIGRATION.md` + `plans/*.md` vs the real source. Read-only; returns a severity-ranked gap list and a READY / NOT READY verdict.