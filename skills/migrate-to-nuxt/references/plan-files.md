# Plan files, session splitting, and model roles

A migration bigger than one context window is a **pipeline problem**, not a prompting problem. The
two best-documented large AI migrations both solved it the same way: decompose into independently
verifiable units, run each through a validate→retry loop, and keep a human gate on the diff.

- **Airbnb** migrated ~3,500 test files in 6 weeks (est. 18 months manual) by treating each file as
  an independent unit walking a **step-based state machine**, validating at every step and
  re-prompting with the actual error text on failure. 97% landed automatically; the last 3% were
  finished by hand *using the generated code as a baseline*.
  ([Airbnb Engineering](https://medium.com/airbnb-engineering/accelerating-large-scale-test-migration-with-llms-9565c208023b))
- **Google** ran 39 migrations / 595 changes with ~75% of edits LLM-generated, and the pipeline was
  *find targets → generate → validate against build+tests → route to human review*. Their explicit
  finding: **"in most cases the human needed to revert at least some changes the model made that
  were either incorrect or not necessary."** ([arXiv 2504.09691](https://arxiv.org/abs/2504.09691))

Two conclusions to bake into every migration: **the unit must be independently verifiable**, and
**a human reviews every landed diff**. Autonomy comes from the validation loop, not from trust.

## Artifact layout

```
NUXT_MIGRATION.md        ← index + decisions + progress. The only file you always read.
CONVENTIONS.md           ← the project "Nuxt Way". Every executor reads this.
plans/
  00-foundation.md
  01-server-utils-move.md
  02-endpoints-projects.md
  03-endpoints-invoices.md
  …                      ← one file per unit of work, each = one session
```

`NUXT_MIGRATION.md` links to the plan files and holds status. It must never grow to hold plan
*content* — that defeats the point.

```markdown
## Plan index
| # | Unit | Plan | Model | Status | Landed |
|---|------|------|-------|--------|--------|
| 00 | Foundation + facade | plans/00-foundation.md | opus | ✅ done | abc1234 |
| 01 | server/utils move | plans/01-server-utils-move.md | sonnet | ✅ done | def5678 |
| 02 | /api/projects (7 routes) | plans/02-endpoints-projects.md | sonnet | 🔨 in progress | — |
| 03 | /api/invoices (5 routes) | plans/03-endpoints-invoices.md | sonnet | ⬜ blocked on 01 | — |
```

## What makes a plan file executable by a fresh session

The test: **hand it to a session with no memory of this conversation and it succeeds without asking
questions.** If it needs the planning conversation to make sense, it is notes, not a plan.

**Plans must be exhaustively detailed, and the reason is structural:** the executor runs on a smaller
model at lower effort. Every ambiguity you leave is resolved by the cheapest reasoning in the pipeline —
which is exactly backwards. Anything you were *going* to figure out during implementation, figure out
now and write it down. A plan that takes 20 minutes to write and reads as tediously specific is
correct; a plan that reads as elegant is usually underspecified.

Concretely, detail means: exact file paths (never "the relevant files"), source line ranges, MOVE vs
REWRITE per item, the literal error envelope, the exact status codes, named helpers to reuse rather than
re-derive, the specific gotchas from the reference docs that apply *to this unit*, and the exact
commands to run. If two readings of a sentence would produce different code, rewrite the sentence.

Every plan file contains, in this order:

```markdown
# <NN> — <unit name>
Model: sonnet | Depends on: <NN>, <NN> | Est. files: N

## Read first (in this order)
- CONVENTIONS.md
- references/express-to-nitro.md §mechanical-mapping, §the-seven-express-specific-traps
- <the 2-4 source files>            ← exact paths, not "the relevant endpoints"

## Scope — EXACTLY these, nothing else
Mark each item MOVE or REWRITE. MOVE = `git mv` + fix imports (same language, no framework API).
REWRITE = genuine paradigm change. Never regenerate a file the target language already accepts.
- [ ] MOVE    server/utils/projectService.ts  ← git mv from server/services/projects.js
- [ ] MOVE    server/utils/schemas/project.ts ← git mv from server/validators/project.js
- [ ] REWRITE server/api/projects/index.get.ts   ← from server/routes/projects.js:41-88 (~15 glue lines)
- [ ] REWRITE server/api/projects/[id].get.ts    ← from server/routes/projects.js:90-133
(one checkbox per output file, each with source file + line range)

## Out of scope (do NOT touch)
- auth middleware · anything under server/routes/billing.js · any Pass-2 idiom work

## Reuse these — do NOT re-derive or re-invent
- auth guard:      server/utils/requireUser.ts   (throws createError 401; call at handler top)
- error envelope:  server/utils/apiError.ts      (`apiError(404, 'not found')`)
- db client:       server/utils/db.ts
- validation:      server/utils/schemas/project.ts  (zod; `readValidatedBody(event, createProject.parse)`)

## Contract to preserve
- fixtures: tests/fixtures/projects/*.json  (recorded from the running Express app)
- error envelope: { error: string }  — NOT h3's default createError shape
- status codes: 200 / 401 / 404 exactly as recorded
- pagination: ?page&limit, 1-indexed, returns { items, total } — do not "fix" to 0-indexed
- unauthenticated → 401 with { error: 'unauthorized' }, NOT a redirect

## Gotchas that apply to THIS unit (from the reference docs — don't make the executor go find them)
- Guards must `throw createError(...)`; a bare `return` falls through to the handler and disables the
  check while still typechecking. (express-to-nitro.md trap 2)
- Method-suffixed filenames only (`.get.ts`/`.post.ts`); a bare `x.ts` answers every method.
- Express matched `/projects/me` before `/projects/:id` by registration order; Nitro matches by
  specificity, so this particular pair is safe — but do not reorder anything.
- Read env via `process.env.X`, not `runtimeConfig` (the deployment does not use NUXT_ prefixes).

## Definition of done (run these, paste output)
1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test:contract -- projects`   ← must be green, this is the real gate
4. `pnpm test` — compare against tests/BASELINE.md: **no NEW failures** (pre-existing reds
   listed there stay red; do not fix them, do not skip a test to go green)
5. Express route deleted in the same commit
6. NUXT_MIGRATION.md row updated + one commit, message `migrate(projects): port 7 routes to Nitro`

## Escape hatch
If any item can't be ported faithfully: leave it on the proxy, tick it as ⚠️ KEPT with a
one-line reason in NUXT_MIGRATION.md, and STOP. Do not guess, do not expand scope,
do not "improve while you're in there".
```

The escape hatch matters more than it looks. Airbnb's long tail was finished manually; the failure
mode of a cheap executor is not "gives up" but "invents a plausible endpoint". An explicit,
low-shame way to stop is what keeps the invention rate down.

## Model roles — yes, the split works

**Opus plans and reviews; Sonnet executes.** This is a good setup and it maps directly onto what
Google and Airbnb built (an expensive planner/analyzer, cheap high-volume workers, a human/strong
gate on the diff). Concretely:

| Work | Model + effort | Why |
|---|---|---|
| Assess, dead-code audit, strategy, questionnaire | **opus / high** | Whole-repo judgment, irreversible decisions. Do not economise here — a wrong strategic call costs more than the entire planning phase |
| Writing plan files & CONVENTIONS.md | **opus / high** | The plan is the leverage; a bad plan multiplies across every executor |
| Plan audit (`audit-migration-plan`) | **opus / high** (pinned) | Finding what a thorough-looking plan omits is the hardest reasoning task in the whole migration |
| Foundation (config, facade, error envelope, first endpoint) | **opus / high** | Sets the pattern all later units copy — pay once |
| Bulk mechanical ports with a green contract test | **sonnet / medium** (pinned) | Table-lookup work behind a real gate. High effort buys nothing when the mapping is a lookup and the test is authoritative |
| `git mv` + import-path fixes | **a script, not a model** | `git mv` + `sed` on import paths is find-and-replace. Paying inference for it is waste, and a script is more reliable. Only fall back to sonnet/low if the rename genuinely needs judgment |
| Auth, streaming, the stateful frontend core, native deps, anything without fixtures | **opus / high** | Subtle failure modes; a wrong port here passes tests and breaks prod |
| Parity audit / reviewing each landed diff | **opus / high** | Google: humans reverted some model edits in *most* changes |

Effort is set the same three ways the model is: pinned in agent frontmatter (`effort: high|medium|low`
alongside `model:`), per-session via `--effort <level>`, or interactively via `/model`. The port agents
ship pinned at `sonnet`/`medium`; the auditor at `opus`/`high`.

Escalate a unit's effort (don't just retry) when it fails its gate twice for *different* reasons —
that's a signal the unit is subtler than the plan assumed, which is a **plan** defect. Re-scope it and
move it to the opus row rather than grinding.

### Why medium and not low, and how to calibrate

Effort buys thinking (output) tokens; a mechanical port barely needs them, so low→medium costs little
here. What dominates is **input** — plan file + CONVENTIONS + source + fixtures, 5–15k tokens *per
attempt*. Because these plans are deliberately detailed, **first-pass success rate matters more than
per-token effort**: one medium pass that lands beats two low passes that each re-read everything. (With
thin plans the opposite is true — low + retry wins. The plan-detail choice and the effort choice are
coupled; don't change one without the other.)

Don't take the defaults on faith. Run 2–3 units, then measure the first-pass rate with the gate held
constant:

- **≥80% first-pass** → try `low` on the next batch and compare. You may be overpaying.
- **50–80%** → `medium` is right. Leave it.
- **<50%** → **the plan is underspecified — fix the plan, do not raise the model.** A model that can't
  execute your plan reliably is usually reporting an ambiguity; raising the tier hides it and then
  charges you for the concealment on every remaining unit.

The tier is a second-order knob. **The gate is first-order:** sonnet/medium behind a green contract test
is fine; sonnet at *any* effort behind only typecheck+build is not, because these bugs compile cleanly.

Preconditions before you hand a unit to a cheaper model — all three, no exceptions:

1. **A contract test that actually fails when the port is wrong.** Typecheck + build are not gates;
   Express→Nitro bugs typecheck cleanly (see `express-to-nitro.md` trap 2). Without fixtures, do not
   downshift the model — you're trading tokens for undetectable regressions.
2. **A written plan file with an explicit file list and an out-of-scope list.** Scope creep is the
   main cost of a cheap executor, and it shows up as a 40-file diff you now have to review.
3. **Each unit is one commit, reviewed before the next starts.** Never queue five unreviewed units.
   Bun's AI-generated 600K-line PR was closed as "AI slop" and had to be resubmitted in reviewable
   chunks — reviewability is a property of the *plan*, not of the reviewer's stamina.

### How the model actually switches — the mechanics, precisely

**An agent cannot change the model of its own session.** There is no tool and no hook for it; `/model`
is a user action. So "Opus plans, Sonnet writes" is achieved one of three ways, and only the first is
automatic:

1. **Subagents — automatic, in-session, no user action.** `port-endpoint` and `port-component` carry
   `model: sonnet` in their frontmatter, so dispatching them runs Sonnet *from an Opus session*. Fan
   out several per unit; Opus reviews what returns. This also keeps their file reads out of the parent
   context — the other half of the saving, and usually the larger half. **This is the default path,
   and it needs nothing from you.**
2. **Headless batch — scriptable, one process per unit.** Verified flags: `--model` sets the session
   model, `-p/--print` runs non-interactively, `--agent <name>` runs the session *as* a defined agent
   (so it inherits that agent's pinned model and tool restrictions).
   ```bash
   # one unit per process; review each diff before starting the next
   claude --model sonnet --effort medium -p "Execute plans/02-endpoints-projects.md. Read CONVENTIONS.md first. Stay in scope."
   claude --agent port-endpoint -p "Execute plans/03-endpoints-invoices.md."   # inherits pinned model+effort
   ```
   Do **not** loop this over every plan file unattended — that produces the pile of unreviewed diffs
   the whole method exists to prevent. Gate on the contract test *and* a human read.
3. **Interactive hand-off — manual.** The Opus session writes the plan and stops; you run
   `/model sonnet` and paste `Execute plans/NN-*.md`; then `/model opus` to review. Fine for a couple
   of units, tedious past that. Prefer (1).

Whichever path: the **plan file is the interface**. If the executor had to ask a question, the plan was
incomplete — fix the plan, not just the answer, because the same gap hits the next unit.

Two cautions on the economics: a Sonnet unit that fails its contract test three times and gets
re-driven by Opus costs *more* than doing it in Opus once, so don't downshift units that are subtle
rather than bulky. And `--fallback-model` exists for capacity, not for cost — don't use it to fake a
tiering strategy.

## Gaps to close before you call the plan done

These are what the `audit-migration-plan` agent looks for, and they're the ones plans routinely miss:

- **CI, not laptops.** The contract replay and the baseline diff must run in CI on the migration
  branch. A gate that only exists in someone's terminal is not a gate.
- **Decommission criteria, written down.** What must be true before the old service is turned off?
  (Zero facade traffic for N days, all groups PORT-or-KEEP with none LATER, parity audit passed.)
  Undefined means it never happens and you run both forever.
- **Observability parity.** Error reporting, structured logs, and metrics must survive each port, or
  the new path goes dark and a broken endpoint *looks* healthy. Check this per unit, not at the end.
- **Rollback per unit.** Concretely: what is reverted, and is the old path still reachable? "Delete
  the new file" only works while the facade and the old service are still deployed.
- **Traffic proof before deletion.** Log which facade paths are still being hit. Deleting an endpoint
  because you believe it's unused is how you find out it wasn't.

## Resumability checklist (run before ending any session)

- [ ] `NUXT_MIGRATION.md` row updated (status + commit sha)
- [ ] Any new convention or contract discovered → written into `CONVENTIONS.md`
- [ ] Anything left on the proxy → marked ⚠️ KEPT with the reason
- [ ] Next unit's plan file exists and passes the fresh-session test
- [ ] Working tree clean, committed on the migration branch

An unwritten decision is a decision the next session will make differently.
