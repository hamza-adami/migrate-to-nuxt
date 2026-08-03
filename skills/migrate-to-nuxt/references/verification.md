# Verification & parity audit

Phases 4 & 8. The verification backbone is what makes "faithful" a provable claim rather than a hope.

## Why this is its own phase

Large AI migrations that succeeded (Bun, Google's code-migration system) leaned on a **strong existing test suite** + automated compile/test validation with a repair loop. **Most Next.js frontends have thin or no tests** — so you must *establish* the verification harness in Phase 4, before Pass 1, or "behavior-faithful" is unverifiable.

## Step 0 — baseline the existing suite BEFORE touching anything

If the repo has any tests (`jest`, `vitest`, `supertest`, `pytest`, a `test` script), run the **whole
suite on the untouched original** and commit the result as `tests/BASELINE.md`. Do this in Phase 4,
before the first ported file.

```bash
pnpm test 2>&1 | tee /tmp/baseline.txt   # or jest --ci, vitest run, pytest -q
# record: total / passed / failed / skipped, and the NAME of every already-failing test
```

Why this is not optional:

- **A suite you never baselined cannot prove anything.** "3 tests fail" is meaningless without
  knowing whether 3 failed yesterday. Migrations reliably surface *pre-existing* bugs (a faithful port
  starts correctly exercising an endpoint nothing hit before), and without a baseline every one of
  them gets misattributed to the migration and "fixed" — churning code that was never broken.
- **It sets the actual bar:** the rule becomes *no new failures*, not *all green*. Do not "fix" the
  pre-existing reds as part of the migration; list them in `NUXT_MIGRATION.md` under Blockers as
  pre-existing and out of scope.
- **It tells you how much you can delegate.** A repo with a real suite can hand mechanical units to a
  cheaper model safely; a repo with 4 smoke tests cannot until you've recorded contract fixtures.
- Baseline **coverage** too if it's cheap (`--coverage`, summary only). Ported endpoints that end up
  with less coverage than their originals are where the regressions will be.

Then run the suite **after every unit**, and diff against the baseline names — not against zero. Any
test the migration must legitimately change (it asserted on an Express-specific detail) gets its
change in the **same commit as the port**, called out in the commit message. Never silently edit or
skip a failing test to land a unit; that is how a migration ships a regression with a green build.

When the tests are inherited from the old backend, keep them running against the ported routes for as
long as possible — a supertest suite pointed at the Nitro server (or at the facade URL) is the
cheapest contract test you will ever get.

## Verify in layers (cheapest → most thorough)

0. **Existing suite vs baseline** — no *new* failures (see above).
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
4. **API contract parity** — recorded request/response fixtures replayed against the new server. For a backend migration this is **the** gate, not an extra; see below.
5. **Real-browser verification** — for anything with a UI, and whenever a check disagrees with what you expect. `curl` proves routing; it cannot prove the app *works*. Use **Chrome DevTools MCP** to load the page and assert on reality (below).
6. **Independent parity audit** — a separate agent diffs the new app against the **preserved original** (`reference/` or `git show <orig-branch>:…`), screen by screen and contract by contract, listing behavioral deltas. Keep the original reachable until this passes.

## Real-browser checks (Chrome DevTools MCP)

A build that passes typecheck and returns 200s can still be a white screen. Use the browser when the
question is "does this actually work?" and **always when you're about to guess** — one look beats three
hypotheses:

- **Console errors** — the single fastest signal. Hydration mismatches, auto-import resolution failures,
  and missing-module errors surface here and *nowhere else*. A clean-looking port with red console
  output is not done.
- **Network panel** — did the request go where you think? Right method, right headers, cookie actually
  attached, `set-cookie` accepted? This catches proxy and auth-forwarding bugs that fixtures can miss
  because fixtures don't run a browser's cookie policy.
- **Screenshot / snapshot** — the fastest way to catch the whole class of styling regressions, including
  the dropped-font serif fallback (`pitfalls.md` §7), which no automated check will tell you about.
- **Interact for real** — click through the ported flow: submit the form, upload the file, complete the
  login. Emits/props wiring bugs and `v-model`-on-a-prop mistakes are invisible to a build.
- **Streaming** — watch chunks arrive in the network panel over time. A buffered stream returns the
  right bytes and is still broken.
- **Performance trace / Lighthouse** — only if the migration is expected to change perf, or to compare
  old vs new before claiming a win.

Use it as the **debugging escalation** too: when a check fails and the cause isn't obvious, open the
browser before forming a third theory. It is far cheaper than a hypothesis loop, and it's how you avoid
"fixing" the wrong side of a proxy.

Record what you verified in browser per unit — a screenshot plus "console clean" is a legitimate,
cheap parity artifact for a UI unit that has no tests.

Run build+typecheck (and smoke where possible) **after each unit** in Pass 1, with an auto-repair retry on failure — don't batch verification to the end.

## Contract fixtures — mandatory for any backend port

Typecheck and build do **not** catch backend migration bugs. A ported Express handler with the wrong
status code, a dropped header, an h3-shaped error envelope, or a guard that `return`s instead of
throwing all compile perfectly (see `express-to-nitro.md` trap 2). If the only gate is "it builds",
you have no gate.

Record fixtures **against the original server while it still runs** — a Phase-4 task, not optional.
Use the bundled script rather than re-inventing a recorder each session (`scripts/fixtures.mjs`, no
dependencies, Node ≥18):

```bash
# 1. write a manifest per endpoint group (see the header comment in fixtures.mjs)
# 2. record against the OLD server, then COMMIT the output
node <skill>/scripts/fixtures.mjs record tests/fixtures/projects.json http://localhost:3001
# 3. after porting, replay against the NEW server — exits 1 on any drift
node <skill>/scripts/fixtures.mjs replay tests/fixtures/projects.json http://localhost:3000
```

Wire step 3 into a `test:contract` script so plan files can reference one stable command. The script
compares status, a checked header subset (`content-type`, `location`, `set-cookie` with multiplicity),
and the **body shape** — key sets, types, array lengths, and non-volatile leaf values. Fields that
legitimately vary (ids, timestamps) go in `volatile` and are checked for presence and type but not
value. That catches the ports that typecheck: a renamed key, a dropped field, a `number` returned as
a `"string"`, a `null` that became absent, a 200 that became a 302.

Assert on:

- **status code** — exact
- **body shape** — key names and nesting; normalize genuinely volatile fields (ids, timestamps) with
  an explicit allowlist, never by loosening the whole comparison
- **error envelope** for the 4xx/5xx cases — the most commonly broken thing in an Express→Nitro port
- **`set-cookie`** name and flags
- **content-type**, and for streams the **inter-chunk timing** (equal bodies with different timing is
  a regression — a buffered stream is a broken stream)

Rules: fixtures are recorded **before** porting a group, committed, and never edited to make a test
pass. If the new response is genuinely better, that is a Pass-2 change with its own commit and an
explicitly re-recorded fixture. Groups without fixtures do not get ported by a cheaper model — see
`plan-files.md`.

This is what makes "don't break anything" a checkable claim. Both large documented AI migrations
(Airbnb's 3,500 test files, Google's 595 changes) were gated on real test execution with a
re-prompt-on-failure loop, not on the model's confidence.

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