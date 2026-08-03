---
description: Migrate a Next.js / Express / Flask / FastAPI project into a full Nuxt 4 app (phased, two-pass, contract-verified, with confirmation gates)
argument-hint: "[path to source app or notes, optional]"
---

Invoke the **migrate-to-nuxt** skill and drive the migration workflow.

Context from the user (optional): $ARGUMENTS

Follow the skill exactly:

1. **Detect the entry mode first.** Is the frontend already Nuxt? If so this is a **mode-C backend-only** migration — skip the scaffold phase and the React/Next references entirely. State the detected mode back to me before proceeding.
2. **Phase 0–1 (Assess).** Inspect the source app. Do the dead-code audit (grep actual import sites) before anything. Inventory routes/components/data/auth/backend/deploy, and record the nuxt/nitro/h3 majors. Decide keep-vs-port **per endpoint group** (a table, not one verdict) and the strangle order. **Then STOP and confirm strategy + scope with me.**
3. **Load current docs before deciding anything.** Resolve the installed nuxt/nitro/h3/vue versions and record them, then fetch **current** docs (Context7 with version-qualified ids, plus the `nuxt`/`vue` companion skills) for the target stack. Plan from fresh docs; write code against the installed majors. Do not plan from memory.
4. **Phase 2 (Configure — hard gate).** Ask me the stack questionnaire (auth, DB+ORM, Tailwind method, shadcn prefix/dir, package manager, target structure, SSR mode, **target runtime: Node or Bun**, target framework version) using AskUserQuestion. **Write the answers into `NUXT_MIGRATION.md`. Do not write any code until I've answered.**
5. Create the migration branch and `NUXT_MIGRATION.md` + a project `CONVENTIONS.md` before scaffolding.
6. **Phase 4 (Verification harness) — before the first ported file.** Run the existing test suite on the untouched original and commit `tests/BASELINE.md` (which tests already fail — the bar is *no new failures*, not all green). Record contract fixtures against the still-running original for every group you're about to port.
7. **Phase 4b (Plan files).** Decompose into `plans/NN-*.md`, one unit per session, indexed in `NUXT_MIGRATION.md` with a model assigned per unit. Confirm the decomposition with me.
8. Proceed through Scaffold (skip in mode C) → **Pass 1 (faithful)** → confirm → **Pass 2 (idiomatic + library swaps)** → Deploy → final parity audit, confirming at each gate.
9. Use the `port-component` subagent for parallel leaf-component ports and `port-endpoint` for fixture-gated endpoint groups; keep the stateful core, auth, and streaming under direct control.
10. Keep `NUXT_MIGRATION.md` updated after every unit of work so the migration is resumable.

Do not skip the confirmation gates. Do not mix the faithful and idiomatic passes. Do not swap a library (auth, validation, jobs) during Pass 1. Do not delete an old route without deleting it in the same commit that adds its replacement.