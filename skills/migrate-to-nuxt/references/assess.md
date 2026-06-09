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
- **Backend** — Flask/FastAPI? thin CRUD or heavy/ML/async? DB + ORM? background workers/queues?
- **Styling** — Tailwind version, `next/font`, CSS tokens, dark mode mechanism.
- **Deploy** — Dockerfile(s), compose, CI workflows, host, env var names.

### Decision A — rebuild vs incremental
Default **greenfield rebuild** (scaffold fresh Nuxt 4, port feature-by-feature). It's the documented best practice past ~30 components and avoids dragging React idioms in. Choose **in-place incremental** only for tiny apps; if in-place, you MUST delete the Next `app/` (+ `next.config.*`, `middleware.ts`, `next-env.d.ts`) before scaffolding Nuxt or the scanners choke on the `app/` collision.

### Decision B — keep Python vs port to Nitro
See `flask-fastapi-to-nitro.md` for the full tree. Short version: **thin CRUD → port to `server/api`**; **heavy/ML/async/background-worker → keep Python, generate a Nitro BFF/proxy** in front. "Full Nuxt" does **not** require killing a heavy Python backend.

**→ GATE: confirm strategy (A + B) and scope with the user before continuing.**

## Phase 2 — Configure (HARD GATE)

Ask all of these **before writing any code** — use the AskUserQuestion tool. Record answers in `NUXT_MIGRATION.md`. Defaults to recommend in parentheses.

1. **Auth** — better-auth · keep existing (proxy to Python) · other/none. *(If the source uses a custom HttpOnly cookie, "keep existing" + Nitro `server/middleware` is the faithful path; offer better-auth as the idiomatic upgrade for pass 2.)*
2. **Database + ORM** — postgres+drizzle · sqlite+drizzle · keep DB in Python backend · none. *(For heavy Python backends, default "keep in Python".)*
3. **Tailwind install** — `@tailwindcss/vite` plugin *(recommended for v4)* · `@nuxtjs/tailwindcss` module.
4. **shadcn-vue** — component prefix (`Ui` vs empty) + component dir (`app/components/ui`).
5. **Package manager** — pnpm *(default)* · npm · yarn. Monorepo or standalone?
6. **Target structure** — confirm Nuxt 4 `app/` srcDir layout, where composables/stores/types live, server route shape. *(AI defaults to framework conventions unless told — pin this now to avoid drift.)*
7. **SSR mode** — SSR · SPA (`ssr: false`). *(Note: SPA still runs Nitro server middleware for the document + /api — server-side gating still works.)*

**→ Do not proceed to scaffold until every answer is recorded.**

## `NUXT_MIGRATION.md` template

```markdown
# Nuxt 4 Migration — <project>

## Decisions (Phase 1–2)
- Strategy: greenfield rebuild | in-place incremental
- Backend: keep Python (BFF proxy) | port to Nitro
- Auth: ... | DB: ... | Tailwind: ... | shadcn prefix/dir: ... | PM: ... | SSR: ...
- Source kept at: reference/ | git ref `<branch>`

## Conventions
See CONVENTIONS.md (handed to every port agent).

## Verification harness
- typecheck: `nuxi typecheck` · build: `pnpm build`
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