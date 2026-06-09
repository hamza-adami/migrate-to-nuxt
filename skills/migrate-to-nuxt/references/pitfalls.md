# Pitfalls — symptom → cause → fix

Real field guide from production Next.js → Nuxt 4 migrations. **Lead with the four un-guessable ones** (§1 `useStorage`/`useState` shadowing, §2 `NUXT_` env trap, §3 HttpOnly auth, §7 dropped font) — they cost the most time.

## 1. Auto-import collisions (highest-value, least obvious)

### `useStorage` silently resolves to the wrong thing
- **Symptom:** TS errors like `Property 'value' does not exist on type 'Storage<UploadedEmail[]>'` and `Expected 0-1 arguments, but got 2`. Code looks correct.
- **Cause:** Nuxt/Nitro auto-imports its own `useStorage` (unstorage / server KV), which **shadows** VueUse's. Auto-import picks the framework one.
- **Fix:** import collided VueUse composables explicitly: `import { useStorage } from '@vueuse/core'`.
- **Rule:** when a VueUse name overlaps a Nuxt built-in (`useStorage`, `useState`, `useFetch`, `useError`, `useCookie`, `useRequestHeaders`…), import it explicitly. **`useState` is the nastiest** — devs reach for it constantly, but Nuxt's `useState` is a cross-request SSR state helper, totally different from `ref`.

### shadcn-vue `ui/` components spam duplicate-name warnings
- **Symptom:** two files resolving to the same name (`UiSkeleton` warnings); risk of the wrong component resolving.
- **Cause:** Nuxt auto-scans `app/components/**`; folder-per-component (`ui/skeleton/Skeleton.vue`) + `index.ts` re-exports produce odd/duplicate generated names.
- **Fix:** scope auto-import and exclude the explicitly-imported `ui` dir, then import ui via the alias:
  ```ts
  components: { dirs: [{ path: '~/components', pathPrefix: false, ignore: ['**/ui/**'] }] }
  ```
- **Caveat:** don't blanket-disable auto-import — recursive components (a JSON tree node rendering itself) rely on it to resolve their self-reference. Use `defineOptions({ name: 'JsonNode' })` and let auto-import handle recursion.

## 2. runtimeConfig & environment variables

- **Symptom:** auth/secrets work in `nuxi dev` but break in the production build / Docker; env vars seem "not picked up".
- **Cause:** `runtimeConfig: { x: process.env.X || 'default' }` evaluates the default at **build time**. At runtime Nuxt only overrides it from a **`NUXT_`-prefixed** env var (`NUXT_X`). If your deployment sets plain `AUTH_COOKIE_SECRET` (not `NUXT_AUTH_COOKIE_SECRET`), the runtime value is the baked-in build-time default.
- **Fix (two valid options):**
  a. Rename deployment env vars to the `NUXT_`-prefixed form and use `useRuntimeConfig()`.
  b. Read `process.env.X` directly inside server handlers/middleware (Nitro is a Node process; `process.env` is live at request time) — the faithful, no-rename path when the deployment already sets specific names.
- **Rule:** never expose secrets via `runtimeConfig.public`. Document the `NUXT_` prefix behavior loudly — it's the #1 "works locally, broken in prod" Nuxt issue.

## 3. Auth & server middleware (Next edge → Nitro)

- **Symptom:** a client `defineNuxtRouteMiddleware` that reads the session cookie can't.
- **Cause:** the session cookie is **HttpOnly**, so client-side route middleware can never read it. Next's middleware ran on the edge (server); the equivalent is `server/middleware/` (Nitro), not `app/middleware/`.
- **Fixes / rules:**
  - Put the gate in `server/middleware/auth.ts`; use `getCookie`, `sendRedirect`.
  - Translate Next's matcher regex into an explicit allowlist (login page, `/api/auth/*`, Nuxt internals `/_nuxt`, `/__nuxt`, `/_ipx`, `/_scripts`, favicon, static extensions). **Forgetting `/_nuxt` redirects your JS/CSS → white screen.**
  - `ssr: false` still runs server middleware for the document request and all `/api` calls — server-side gating works in SPA mode. (Many assume SPA = no server; not true with Nitro.)
  - Server routes use method-suffixed filenames (`login.post.ts`, `logout.post.ts`), not Next's exported `GET`/`POST` functions.

## 4. The backend proxy: h3 `proxyRequest` is a big simplification

- **Lesson:** a hand-rolled Next proxy (separate GET/POST, manual Content-Type PDF-vs-JSON branching, `arrayBuffer()` body forwarding for multipart, manual timeout) collapses into one Nitro handler with `proxyRequest(event, target, { fetchOptions: { signal: AbortSignal.timeout(...) } })`. It forwards method/headers/body/query and streams the response with the original content-type — PDF streaming and multipart uploads "just work".
- **Pitfall — catch-all param encoding:** Next's `[...path]` gives a **decoded array** of segments; h3's `getRouterParam(event, 'path')` gives a **decoded joined string**. Re-encode per segment (`.split('/').map(encodeURIComponent).join('/')`) to match the original, and pull the query string from `getRequestURL(event).search` (it's not in the param).

## 5. Data fetching: SWR → Nuxt (behavioral caveats)

- **Mapping:** `useSWR(key, fetcher)` → `useAsyncData`/`useFetch` (keyed, cached, `refresh()` ≈ `mutate()`), or plain `$fetch` + `ref` + `watch` for imperative control. A 2s polling loop ports directly (or VueUse `useTimeoutPoll`).
- `$fetch` **throws on non-2xx** — replaces `if (!res.ok) throw`. Don't double-handle.
- `mutate(data, false)` → assign the ref directly (`resp.value = await $fetch(...)`); keep that ref **out of a `watch` source** or you loop.
- Replacing SWR with `$fetch`+`watch` **loses per-key caching** → re-selecting an item refetches (skeleton instead of instant stale data). If fidelity matters, key `useAsyncData` per item or keep a cache `Map`.
- `useAsyncData` data is **`null` until resolved** (SWR uses `undefined`) — adapt loading/skeleton conditions.
- `useFetch`/`useAsyncData` awaited at the top of `<script setup>` **suspends** the component; with `ssr: false` they run client-side.

## 6. React → Vue mechanical mapping
See `react-to-vue.md`. Highlights that bite: never `v-model` a prop (mutates props — use emits); one `.tsx` with multiple sub-components → multiple `.vue` SFCs; TS `!` doesn't narrow a discriminated union in templates/computeds (assign to a local const and narrow); `{{ }}` on its own line adds whitespace (matters for `<pre>` / tight inline values).

## 7. Styling: Tailwind v4 + the font trap

- **Tailwind v4 wiring:** use the `@tailwindcss/vite` plugin in `nuxt.config` `vite.plugins`, not legacy PostCSS or `@nuxtjs/tailwindcss`. `@import 'tailwindcss'`, `@theme`, `@custom-variant dark`, oklch tokens carry over unchanged. Load via `css: ['~/assets/css/main.css']`.
- **The font pitfall:** `next/font/google` has no direct equivalent. Drop it but keep CSS referencing the font (`--font-sans: 'Geist', 'Geist Fallback'`) → family unresolvable → browser falls back to default **serif** ("why is my app suddenly ugly?"). Two-part fix: (a) self-host with `@nuxt/fonts`; (b) replace synthetic `'Geist Fallback'` names with a real system chain (`ui-sans-serif, system-ui, …`).
- **Rule:** always audit `--font-*` / `font-family` after removing `next/font`; never leave a `*-Fallback` next/font name in the chain.

## 8. Aliases & directory structure

- **`@`/`~` differ:** Next aliases `@/*` to project root; Nuxt aliases `@`/`~` to srcDir = `app/`. shadcn-vue imports `@/lib/utils` and `@/components/ui/*` → those files must live under `app/lib` and `app/components`, or every shadcn import is "module not found".
- **Nuxt 4 layout:** `pages/`, `layouts/`, `components/`, `composables/`, `utils/`, `assets/` under `app/`; **`server/` stays at project root** (not under `app/`). Root is `app/app.vue` with `<NuxtLayout><NuxtPage/></NuxtLayout>`.
- **`app/` collision:** Next's App Router also uses `app/`. When migrating in-place, delete the Next `app/` (+ `next.config.*`, `middleware.ts`/`proxy.ts`, `next-env.d.ts`) before scaffolding Nuxt, or the scanners choke.

## 9. shadcn-vue CLI friction

- **Interactive prompts don't pipe:** `shadcn-vue init` prompts use raw TTY; piping `\n` doesn't reliably answer them and the run aborts. **Workaround:** hand-write a valid `components.json` and run `shadcn-vue add <comp> --overwrite --yes` directly (`add` is non-interactive and auto-detects the framework).
- **`components.json` schema is strict:** the CLI rejects `tsConfigPath` and `framework` keys (some docs/templates include them). Keep it minimal: `$schema`, `style`, `typescript`, `tailwind{config,css,baseColor,cssVariables}`, `aliases`, `iconLibrary`.
- **Leftover Next dirs break framework detection:** stray root `components/`, `lib/`, `hooks/` produce `Cannot find module 'components'`. Clean Next artifacts (or move to a reference dir) before running the CLI.
- **Let the CLI be authoritative** for the components you actually use — it produces the canonical Reka-UI versions (Button via `Primitive`, Input via `useVModel`, Label via Reka `Label`+`reactiveOmit`). Hand-writing risks subtle API drift.

## 10. Build, monorepo & Docker

- **pnpm workspace vs standalone Docker context:** the frontend was built as a standalone Docker context with its own `frontend/pnpm-lock.yaml`. But `pnpm add` from a workspace member updates the **root** lockfile, leaving `frontend/pnpm-lock.yaml` stale → `pnpm install --frozen-lockfile` fails in Docker. **Fix:** regenerate with `pnpm install --ignore-workspace --lockfile-only` after dependency changes.
- **`postinstall: nuxi prepare` in the Docker deps stage:** the deps stage copies only `package.json` + lockfile (no `nuxt.config`/sources), so `nuxi prepare` in `postinstall` fails. **Fix:** `pnpm install --frozen-lockfile --ignore-scripts` in the deps stage (`nuxi build` prepares anyway).
- **Output paths changed:** Next `.next/standalone` + `server.js` (+ copy `.next/static`, `public`) → Nuxt `.output/server/index.mjs` (self-contained; no `node_modules`/`public` copy at runtime). Env `HOSTNAME`/`PORT` → `NITRO_HOST`/`NITRO_PORT`.
- **`@tailwindcss/vite` must be installed before first `nuxi prepare`:** since `nuxt.config` imports it at the top, install all config-referenced deps in one shot or `prepare` errors during `postinstall`.

## 11. Dev-server papercuts

- **Vite "discovered new dependencies, pre-bundle them":** dev logs a warning and reloads the page the first time it sees a dep used in a component (e.g. `lucide-vue-next`). **Fix:** add it to `vite.optimizeDeps.include` (pre-list CVA/clsx/tailwind-merge/reka-ui/lucide). Cosmetic but reload-y.
- **New module/dep installed while `nuxi dev` runs isn't always picked up** — restart the dev server after adding modules.

## 12. Process & strategy lessons (most reusable)

- **Dead-code audit first.** Grep actual imports before porting. In one migration only **5 of 57** shadcn `ui/` components were used, and ~10 heavyweight deps (react-hook-form, recharts, sonner, embla, cmdk, vaul, next-themes…) were unused scaffold. Skipping them turned "rewrite 57 components" into "port 5 + 4 screens". Make `grep -r "from '@/components/ui"` an explicit early step. Watch wired-but-unused dead code (a theme-provider never mounted; `next/font` objects created but never applied).
- **Build the foundation before the components:** config → CSS/tokens → UI primitives → shared types/composables → leaf components → the big stateful component → pages. Makes conventions concrete before anything depends on them.
- **Parallelize the leaf ports, keep the complex core yourself.** Presentational components port well via parallel `port-component` agents given a strict `CONVENTIONS.md`. The interconnected stateful core (the dashboard) needs full oversight.
- **Verify in layers:** `nuxi typecheck` → `pnpm build` → runtime smoke test with curl → independent agent parity audit vs the preserved original.
- **Keep the original reachable during verification** (reference dir or `git show <orig>:...`) so the audit can diff 1:1, then delete it.
- **A faithful migration surfaces latent backend bugs.** Once the new frontend correctly hit a previously-unexercised endpoint, a pre-existing backend `TypeError` surfaced. New errors after migration aren't necessarily migration bugs — verify which side owns them before "fixing".