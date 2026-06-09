---
description: Migrate a Next.js / Flask / FastAPI project to a full Nuxt 4 app (phased, two-pass, with confirmation gates)
argument-hint: "[path to source app or notes, optional]"
---

Invoke the **migrate-to-nuxt** skill and drive the migration workflow.

Context from the user (optional): $ARGUMENTS

Follow the skill exactly:

1. **Phase 0–1 (Assess).** Inspect the source app. Do the dead-code audit (grep actual import sites) before anything. Inventory routes/components/data/auth/backend/deploy. Decide rebuild-vs-incremental and keep-Python-vs-port. **Then STOP and confirm strategy + scope with me.**
2. **Phase 2 (Configure — hard gate).** Ask me the stack questionnaire (auth, DB+ORM, Tailwind method, shadcn prefix/dir, package manager, target structure, SSR mode) using AskUserQuestion. **Write the answers into `NUXT_MIGRATION.md`. Do not write any code until I've answered.**
3. Create the migration branch and `NUXT_MIGRATION.md` + a project `CONVENTIONS.md` before scaffolding.
4. Proceed through Scaffold → Verification harness → **Pass 1 (faithful)** → confirm → **Pass 2 (idiomatic)** → Deploy → final parity audit, confirming at each gate.
5. Use the `port-component` subagent for parallel leaf-component ports; keep the stateful core under direct control.
6. Keep `NUXT_MIGRATION.md` updated after every unit of work so the migration is resumable.

Do not skip the confirmation gates. Do not mix the faithful and idiomatic passes.