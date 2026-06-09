# Verification & parity audit

Phases 4 & 8. The verification backbone is what makes "faithful" a provable claim rather than a hope.

## Why this is its own phase

Large AI migrations that succeeded (Bun, Google's code-migration system) leaned on a **strong existing test suite** + automated compile/test validation with a repair loop. **Most Next.js frontends have thin or no tests** — so you must *establish* the verification harness in Phase 4, before Pass 1, or "behavior-faithful" is unverifiable.

## Verify in layers (cheapest → most thorough)

1. **Typecheck** — `nuxi typecheck` (`vue-tsc`; it checks template expressions too).
2. **Build** — `pnpm build`. Must pass before any runtime claim.
3. **Runtime smoke tests** — start the app, `curl` the critical paths. A 502 with the backend down still proves routing + gating work:
   ```bash
   # auth gate redirects unauthenticated
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/        # expect 302
   curl -s -o /dev/null -w '%{http_code}' -X POST .../api/auth/login    # 200 / 401
   curl -s -o /dev/null -w '%{http_code}' -b 'session=…' http://localhost:3000/  # 200 authed
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/proxy/health # proxy forwards
   ```
4. **API parity** — if a backend was involved, diff the new API surface against the original (an OpenAPI/spec comparison, or recorded request/response fixtures). Add this early, not at the end.
5. **Independent parity audit** — a separate agent diffs the new app against the **preserved original** (`reference/` or `git show <orig-branch>:…`), screen by screen and contract by contract, listing behavioral deltas. Keep the original reachable until this passes.

Run build+typecheck (and smoke where possible) **after each unit** in Pass 1, with an auto-repair retry on failure — don't batch verification to the end.

## Faithful (Pass 1) vs refactor (Pass 2)

- **Pass 1** is verified against the **original app** (behavior parity).
- **Pass 2** is verified as a **refactor against the pass-1 baseline** — behavior must NOT change. VueUse swaps especially can silently change behavior (debounce timing, storage serialization, SSR edge cases), so verify each swap; don't rewrite freely.

## Commit & review discipline

- **Small, reviewable commits per feature** — one giant commit is unreviewable (Bun's 600K-line deletion PR was auto-flagged "AI slop" and closed; it had to be re-submitted in reviewable chunks).
- Pass 1 and Pass 2 get **separate commits** so the diff documents "what changed for idiom" and a bad idiom swap is trivially revertible.
- Update `NUXT_MIGRATION.md` checkboxes + session log before stopping, so the next session resumes cleanly.

## New errors ≠ migration bugs

A faithful migration can surface **pre-existing backend bugs** (the new frontend correctly hits a previously-unexercised endpoint). Identify which side owns the error before fixing it, and record it in `NUXT_MIGRATION.md`.

## Phase 8 — cleanup

Only after the parity audit passes: delete `reference/` (and any leftover source artifacts), confirm the tree is clean, and do a final `pnpm build` + smoke pass.