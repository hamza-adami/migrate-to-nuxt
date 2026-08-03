# Bun as the target runtime

Nitro ships a first-class **`bun` preset**, so "migrate to Nuxt on Bun" is a supported target, not a
hack. But Bun is a **deployment/toolchain decision, orthogonal to the framework migration** — and
bundling the two is how you end up unable to tell a port bug from a runtime-compat bug.

## Probe feasibility FIRST — early, cheap, before planning around it

Do not defer the *question*; defer the *work*. Run the probe during Phase 1–2, because the answer
changes the plan and it costs minutes. **Never plan a Bun target without having proven it runs.**

```bash
bun --version || echo "bun not installed"
# 1. does the dep tree even load? the decisive test, and the fastest.
bun -e 'await import("<each server-side dep>")'     # or a generated import-all script
# 2. do the native/binary deps work, not just import?
bun -e 'const m = await import("<native dep>"); /* call one real function */'
# 3. does the built output boot and answer?
bun run ./.output/server/index.mjs &   # after a normal build
curl -sf localhost:3000/api/health && echo BOOTS
```

Then classify the result — this, not dogma, decides the sequencing:

| Probe result | Verdict |
|---|---|
| Everything imports, output boots, fixtures replay green | **Trivial — adopt now.** One config line. Set `nitro.preset: 'bun'`, note it, move on. No separate pass needed for something this small |
| Works after a small, contained change (one dep swapped for a maintained alternative, one polyfill, a config flag) | **Adopt now, but land the change as its own commit** so it's revertible independently of the migration |
| Needs real work (a native dep to replace, a sidecar to extract, streaming or crypto behaving differently) | **Defer to a post-parity pass.** Complete the migration on Node, pass fixtures + parity audit, then switch on its own branch with its own gate |
| A dep genuinely can't run under Bun and can't be replaced | **Stay on Node**, or keep that work in a Node sidecar the Bun app calls. Record it as a KEEP with the reason |

The one rule that never bends: **do not debug a runtime incompatibility and a port bug at the same
time.** If the probe says trivial, adopting early is fine and cheap. If it says anything else, the
migration finishes on Node first — because a failing test then has one suspect instead of two.

Record the probe output in `NUXT_MIGRATION.md`. A "we think Bun works" that nobody ran is not a
decision, it's an assumption with a deadline.

## Three independent decisions — do not conflate them

Most "should we use Bun?" confusion is these three being treated as one. Decide and record each
separately in `NUXT_MIGRATION.md`:

| # | Decision | Risk | Reversibility |
|---|---|---|---|
| 1 | **Package manager** — `bun install` instead of pnpm/npm | Low–medium: lockfile + workspace protocol change, CI change, patched-dependency and override syntax differ | Easy — regenerate the old lockfile |
| 2 | **Production runtime** — `preset: 'bun'`, run the built output with Bun | Medium: this is where native deps and Node-API gaps bite | Easy — one config line + rebuild |
| 3 | **Dev runtime** — run `nuxi dev` under Bun | Highest, lowest payoff. Least-exercised path; dev-only breakage costs the whole team's day | Easy, but discover it late and you've burned days |

Recommended default: **adopt 2, consider 1, skip 3.** Production runtime is where Bun's speed
actually pays and where the output is a single built artifact you can smoke-test as a unit. Dev under
Bun buys startup time you won't notice and risks a class of bugs nobody else has hit.

## Decision tree

```
Does any dependency load a native/binary addon (.node), a platform-specific
prebuild, or a Node-internal API? (ML runtimes, image processing, OCR,
headless browsers, some DB drivers, some crypto/compression libs)
├─ YES, in the Nuxt server bundle
│    → Do NOT switch the runtime yet. Test that dep under Bun in isolation first
│      (a 10-line script that imports it and calls it). If it fails: stay on Node,
│      or keep that work in a Node sidecar service the Bun app calls.
└─ NO / only in a separate kept service
     → Bun preset is a reasonable target. Verify empirically (below), don't assume.

Does the deploy target actually run Bun?
├─ Own Docker image / VM / Fly / Railway → yes, change the base image
└─ Serverless/edge with a fixed runtime (Lambda Node, Workers, Vercel Node)
     → the preset for THAT platform wins. `bun` preset is irrelevant there;
       you'd only be using Bun as the package manager/build tool.
```

## Wiring it (verify against your installed Nitro major)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: { preset: 'bun' },
})
```

```bash
# build (on Node or Bun), then run the output with Bun
bun run ./.output/server/index.mjs
```

The preset sets `exportConditions: ['bun']` so packages resolve their Bun-specific entry points, and
serves static assets from the output. It is a **build-output** choice — you can build with Node and
run with Bun. `NITRO_PORT` / `NITRO_HOST` still apply.

Nitro's docs state Nitro is fully compatible with Bun and that the dedicated preset gives better
optimization than running the plain Node output under Bun. Treat "fully compatible" as *the framework
layer is fine* — **your dependencies are the variable**, and they are what you must test.

## Full gate — required before adopting in production

The probe above answers "is this feasible?". This answers "is it correct?" — run it before shipping,
whether you adopted early or deferred. Compatibility claims are per-dependency and no doc can answer
them for your dep tree:

1. **Import smoke test** — a script that imports every server-side dependency and calls one real
   function on each. This finds the `.node`-addon and Node-internal failures in seconds instead of in
   production.
2. **Replay the contract fixtures against the Bun-run output.** This is the whole reason the fixtures
   exist and it makes the runtime switch a *checkable* claim rather than a vibe:
   ```bash
   bun run ./.output/server/index.mjs &
   node scripts/fixtures.mjs replay tests/fixtures/<group>.json http://localhost:3000
   ```
   Do this for **every** recorded group, not a sample. A runtime swap can change behavior anywhere.
3. **Exercise the sharp edges specifically** — they're where runtimes diverge and where a passing
   fixture suite can still be lying:
   - **streaming / SSE**: check inter-chunk *timing*, not just the final body
   - **multipart uploads**, large bodies
   - **file system + path handling**, temp dirs, `__dirname` shims
   - **crypto / hashing** used by auth (a different hash output logs everyone out)
   - **timers and long-running tasks**; scheduled tasks firing at all
   - **graceful shutdown** on SIGTERM (deploys depend on it)
   - **process metrics / APM / error reporting** still attaching
4. **Run the existing test suite under Bun** and diff against `tests/BASELINE.md`. Same rule as
   always: no *new* failures. Note that Bun's own test runner is not Jest/Vitest — keep your existing
   runner for this comparison; swapping the test runner at the same time destroys the baseline.
5. **Load-test both** before believing the performance win. Bun's advantage is real but
   workload-dependent; if the bottleneck is your database or an upstream LLM call, the runtime change
   buys nothing and you've taken risk for free.

If any step fails: **stay on Node.** The migration's value does not depend on the runtime.

## Package-manager switch (decision 1), if you take it

- Workspaces: pnpm's `pnpm-workspace.yaml` → `workspaces` in the root `package.json`.
- `pnpm.overrides` → Bun's override mechanism; `pnpm patch` has no direct equivalent — audit every
  patched dependency before switching, since a silently-dropped patch is a reintroduced bug.
- `--frozen-lockfile` equivalents in CI, and the Docker deps-stage caching layer, both change.
- The `postinstall: nuxi prepare` trap still applies: the deps stage has no `nuxt.config`, so install
  with scripts disabled there (`pitfalls.md` §10).
- Keep **one** lockfile in the repo. Two package managers' lockfiles coexisting means CI and laptops
  resolve different trees, which is a genuinely miserable class of bug.

## Deployment changes

- Docker base image → an official Bun image; the build stage may still be Node.
- Health checks, process supervision, and shutdown signals: re-verify, don't assume.
- Record in `NUXT_MIGRATION.md`: which of the three decisions you took, the preset, the base image,
  and the empirical gate results.
- **Rollback is one line** (`preset: 'bun'` → remove, rebuild, redeploy). Keep it that cheap by not
  letting Bun-specific APIs leak into application code — if handlers start importing `bun:*`, the
  runtime choice stops being reversible.
