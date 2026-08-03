# Assess & Configure

Phases 0–2. Goal: know exactly what you're porting, decide the strategy, and lock the stack **before writing any code**.

## Phase 0 — Branch + tracking file

1. `git checkout -b feat/nuxt-migration` (never work on `main`).
2. Preserve the original for 1:1 parity diffing: either copy the source app to `reference/` (gitignored) or rely on `git show <orig-branch>:path`. Keep it until Phase 8.
3. Create `NUXT_MIGRATION.md` at repo root (template below). This is the **single source of truth** and makes the migration resumable across sessions.

## Phase 1 — Assess

### Dead-code audit FIRST (highest ROI)
Before porting anything, grep for **actual import sites**. Do not port what nothing imports.

```bash
# Which shadcn/ui components are actually used?
grep -rEo "from ['\"]@/components/ui/[a-z-]+" app src 2>/dev/null | sort -u
# Which heavyweight deps are actually imported?
grep -rE "from ['\"](react-hook-form|recharts|sonner|embla-carousel|cmdk|vaul|next-themes)" app src
```
Real example: only **5 of 57** `ui/` components and **~4 screens** were live; ~10 heavyweight deps were unused scaffold. Auditing turned "rewrite 57 components" into "port 5 + 4 screens". Also hunt **wired-but-unused** dead code: a `theme-provider` never mounted in the layout, `next/font` objects created but never applied.

### Inventory (record counts in `NUXT_MIGRATION.md`)
- **Routes/pages** — file-based? dynamic segments? route groups? API routes?
- **Components** — count, which are leaf/presentational vs stateful core, any `.tsx` files holding *multiple* sub-components (each becomes its own `.vue`).
- **Data fetching** — SWR? React Query? `getServerSideProps`/`getStaticProps`? client `fetch`? polling?
- **State** — Context providers, Zustand/Redux, local `useState`.
- **Auth** — where enforced (Next middleware? per-route?), cookie shape (HttpOnly?), provider.
- **Backend** — Express/Node? Flask/FastAPI? thin CRUD or heavy/ML/async? DB + ORM? background workers/queues?
- **Frontend framework** — is it **already Nuxt**? (`grep '"nuxt"' */package.json`) If so this is a **mode-C backend-only** migration: no scaffold phase, no React refs. Note the Nuxt/Nitro/h3 majors — snippets differ across them.

### Extra inventory for an Express/Node backend
Numbers first; they decide wholesale-port vs strangler fig.
```bash
find server -name '*.js' -not -path '*/node_modules/*' | wc -l      # file count
find server -name '*.js' -not -path '*/node_modules/*' -exec cat {} + | wc -l   # LOC
ls server/endpoints server/middleware server/models 2>/dev/null      # route groups
grep -rln 'text/event-stream\|res.write(\|pipe(' server --exclude-dir=node_modules   # streaming routes
grep -rln 'multer\|express-rate-limit\|swagger\|node-cron\|agenda\|bull\|bree\|new Worker' server --exclude-dir=node_modules
node -e "const d=require('./server/package.json').dependencies;console.log(Object.keys(d).join(' '))"
```
Then classify **per route group** (not per backend):
- **route files vs business logic** — how much is `req`/`res` glue vs framework-agnostic modules that just `git mv` into `server/utils/`? This ratio is the real size of the job and it is usually far smaller than the LOC suggests.
- **streaming / SSE endpoints** — port last, list them explicitly.
- **native or binary deps** (image processing, OCR, ML runtimes, headless browsers, `.node`, `.wasm`) — these are KEEPs, not ports.
- **existing proxy** — does the Nuxt app already have a catch-all forwarding to the backend? That is your strangler facade; do not build a second one.
- **workers / schedulers** — separate process? Assume KEEP unless it's trivially periodic.
- **Styling** — Tailwind version, `next/font`, CSS tokens, dark mode mechanism.
- **Deploy** — Dockerfile(s), compose, CI workflows, host, env var names.

### Load CURRENT docs during planning — and pin them during implementation

These are two different needs and conflating them causes both failure modes (planning against stale
knowledge, or implementing against docs newer than your code). Do both, deliberately:

**Planning (now):** fetch **current** docs for **every package you're about to write code against** —
not just Nuxt. Nuxt, Nitro/h3, and equally: the ORM, the auth library, the validation library, the UI
kit, the test runner, the deploy target's SDK, every module in the target stack. Your training data
lags; APIs that were experimental are now stable, defaults changed, packages got renamed or
deprecated, and things you'd plan to hand-roll may now ship built in. Planning from memory is how a
migration commits to a pattern the ecosystem replaced two minors ago — and then propagates it across
every unit.

Query per library for: what's new/stable/deprecated since the version you'd assume, the *currently
recommended* pattern for what you need (not the one that merely still works), whether any flag you plan
to rely on is still experimental, and the current deployment preset for the target host.

**This applies during implementation too, not only planning.** Before writing against an API you
haven't verified this session — even one you're confident about — check it. "I know this one" is
exactly the case that ships a deprecated call. Cheap check, expensive miss.

**Then pin.** Resolve and record the actual installed majors *first* — they decide which docs are
authoritative for code:

```bash
node -e "for (const p of ['nuxt','nitropack','nitro','h3','vue','vite']) { try { console.log(p, require(`${p}/package.json`).version) } catch {} }"
```

Write them into `NUXT_MIGRATION.md`. Then use **version-qualified** Context7 ids rather than the
generic one — e.g. `/websites/nuxt_4_x` vs `/websites/nuxt_3_x`, and `/nuxt/nuxt` with a version
(`v4_1_3`, `v3_17_7`, …). Nitro 3 / h3 v2 rewrote the server API around web-standard
`Request`/`Response`, so a Nitro-3 snippet is simply wrong in a Nuxt 4.x / Nitro 2 project and will
typecheck-fail or, worse, silently misbehave.

**The reconciliation rule:** current docs decide *what the target should be*; the installed version
decides *what the code may say today*. If planning reveals a better pattern that needs a newer major,
that is an explicit, separately-gated **upgrade decision** — record it as its own plan unit, do not
smuggle it into a port. And if you're scaffolding fresh (mode A/B), take the current stable version
deliberately and record it, rather than inheriting whatever a template pins.

Where a companion skill exists (`nuxt`, `vue`, `vueuse`, `shadcn-vue`, `pnpm`), prefer it for framework
detail — those track upstream and cost you nothing to consult.

### Decision A — rebuild vs incremental
Default **greenfield rebuild** (scaffold fresh Nuxt 4, port feature-by-feature). It's the documented best practice past ~30 components and avoids dragging React idioms in. Choose **in-place incremental** only for tiny apps; if in-place, you MUST delete the Next `app/` (+ `next.config.*`, `middleware.ts`, `next-env.d.ts`) before scaffolding Nuxt or the scanners choke on the `app/` collision.

### Decision B — keep backend vs port to Nitro (decide **per route group**)
Full trees: `express-to-nitro.md` (Node/Express) and `flask-fastapi-to-nitro.md` (Python). Short version: **thin CRUD → port to `server/api`**; **heavy/ML/async/native-dep/background-worker → keep, put a Nitro proxy in front**. "Full Nuxt" does **not** require one process, and it does not require killing a heavy backend.

Produce a table, not a verdict: `group → PORT | KEEP | LATER` with a one-line reason each. A whole-backend yes/no is always wrong at scale.

### Decision C — strangle order (Express/Node only)
Confirm the sequence and that the facade already exists. Default order in `express-to-nitro.md` §ordering: facade → utils move → public GETs → authed GETs → writes → uploads → auth → streaming → workers. **Never** big-bang a backend over ~20 route files.

**→ GATE: confirm strategy (A + B + C) and scope with the user before continuing.**

## Phase 2 — Configure (HARD GATE)

Ask all of these **before writing any code** — use the AskUserQuestion tool. Record answers in `NUXT_MIGRATION.md`. Defaults to recommend in parentheses.

1. **Auth** — better-auth · keep existing (proxy to Python) · other/none. *(If the source uses a custom HttpOnly cookie, "keep existing" + Nitro `server/middleware` is the faithful path; offer better-auth as the idiomatic upgrade for pass 2.)*
2. **Database + ORM** — postgres+drizzle · sqlite+drizzle · keep DB in Python backend · none. *(For heavy Python backends, default "keep in Python".)*
3. **Tailwind install** — `@tailwindcss/vite` plugin *(recommended for v4)* · `@nuxtjs/tailwindcss` module.
4. **shadcn-vue** — component prefix (`Ui` vs empty) + component dir (`app/components/ui`).
5. **Package manager** — pnpm *(default)* · npm · yarn. Monorepo or standalone?
6. **Target structure** — confirm Nuxt 4 `app/` srcDir layout, where composables/stores/types live, server route shape. *(AI defaults to framework conventions unless told — pin this now to avoid drift.)*
7. **SSR mode** — SSR · SPA (`ssr: false`). *(Note: SPA still runs Nitro server middleware for the document + /api — server-side gating still works.)*
8. **Target runtime** — Node *(default)* · **Bun** (`nitro.preset: 'bun'`) · platform-specific preset (Workers/Lambda/Vercel). *(If Bun: it is a separate pass **after** parity, and it's three independent decisions — package manager / prod runtime / dev runtime. See `bun.md`. Never migrate framework and runtime at once.)*
9. **Framework version** — confirm the target Nuxt/Nitro majors explicitly, from **current** docs, and record them. Don't inherit whatever a template pins, and don't assume your training data's default.

**→ Do not proceed to scaffold until every answer is recorded.**

## `NUXT_MIGRATION.md` template

```markdown
# Nuxt 4 Migration — <project>

## Decisions (Phase 1–2)
- Entry mode: A full | B frontend-only | C backend-only (frontend already Nuxt)
- Strategy: greenfield rebuild | in-place incremental | strangler fig (backend)
- Versions: nuxt <x> · nitro <x> · h3 <x>   ← installed; snippets differ across majors
- Target runtime: node | bun (preset, separate pass after parity) | <platform preset>
- Docs consulted during planning: <library ids + date> · deviations from current guidance: <why>
- Auth: ... | DB: ... | Tailwind: ... | shadcn prefix/dir: ... | PM: ... | SSR: ...
- Source kept at: reference/ | git ref `<branch>` · legacy backend at `EXPRESS_URL`
- Considered-and-rejected library swaps: <lib> — <reason> (so no one re-litigates)

## Backend: keep vs port (per group)
| Group | Routes | Verdict | Reason |
|---|---|---|---|
| /api/projects | 7 | PORT | thin CRUD, ORM only |
| /api/thumbnails | 4 | KEEP | native image/ML dep won't bundle |
| /api/stream | 2 | LATER | SSE — port last |

## Plan index
| # | Unit | Plan | Model | Status | Landed |
|---|------|------|-------|--------|--------|
| 00 | Foundation + facade | plans/00-foundation.md | opus | ⬜ | — |

## Conventions
See CONVENTIONS.md (handed to every port agent).

## Verification harness
- **baseline** (untouched original): `tests/BASELINE.md` — N passed / N failed. Bar = **no new failures**.
  - pre-existing failures (out of scope, do not fix): <names>
- typecheck: `nuxi typecheck` · build: `pnpm build`
- contract fixtures: `tests/fixtures/**` recorded from <old base URL> · replay: `pnpm test:contract`
- smoke: <curl commands> · parity audit: <how>

## Progress
### Foundation
- [ ] nuxt.config + aliases  - [ ] Tailwind v4 + tokens  - [ ] fonts  - [ ] shadcn init + components.json
### Pass 1 — faithful (port | idiomatic checkboxes per unit)
- [ ] UI primitives: button [p][i], input [p][i], ...
- [ ] composables/types
- [ ] leaf components: <name> [p][i] ...
- [ ] stateful core: <dashboard> [p][i]
- [ ] pages/routes: <route> [p][i]
- [ ] server: proxy [p][i], auth middleware [p][i], api/auth/* [p][i]
### Deploy
- [ ] Dockerfile(s)  - [ ] CI  - [ ] Nitro preset  - [ ] env vars (NUXT_ prefix!)
### Audit
- [ ] parity audit passed  - [ ] reference/ deleted

## Blockers / notes
- (e.g. "backend TypeError surfaced after faithful port — pre-existing, owned by backend")
```