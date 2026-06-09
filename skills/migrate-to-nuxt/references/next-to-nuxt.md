# Next.js → Nuxt 4 mapping

Framework-level mapping for Pass 1. For Nuxt API depth, defer to the `nuxt` skill.

## Routing

| Next | Nuxt 4 |
|------|--------|
| `app/page.tsx` / `pages/index.tsx` | `app/pages/index.vue` |
| `app/about/page.tsx` | `app/pages/about.vue` |
| `app/blog/[slug]/page.tsx` | `app/pages/blog/[slug].vue` (`useRoute().params.slug`) |
| `app/[...path]/page.tsx` | `app/pages/[...path].vue` |
| `app/layout.tsx` (root) | `app/app.vue` = `<NuxtLayout><NuxtPage/></NuxtLayout>` + `app/layouts/default.vue` |
| nested layout | `app/layouts/<name>.vue` + `definePageMeta({ layout: '<name>' })` |
| `<Link href>` | `<NuxtLink to>` |
| `useRouter().push` | `useRouter().push` / `navigateTo()` |
| `useSearchParams` | `useRoute().query` |
| `not-found.tsx` | `app/error.vue` |
| `loading.tsx` | `<NuxtLoadingIndicator>` / Suspense boundaries |

## Directory & aliases (subtle — breaks shadcn if wrong)

- **`@`/`~` differ.** Next aliases `@/*` to **project root**; Nuxt aliases `@`/`~` to **srcDir = `app/`**. shadcn-vue imports `@/lib/utils` and `@/components/ui/*`, so those files MUST live under **`app/lib`** and **`app/components`** — otherwise every shadcn import is "module not found".
- **Nuxt 4 layout:** `pages/`, `layouts/`, `components/`, `composables/`, `utils/`, `assets/`, `middleware/`, `plugins/` all under **`app/`**. **`server/` stays at PROJECT ROOT** (not under `app/`).
- In-place migration: delete Next's `app/` (+ `next.config.*`, `middleware.ts`, `next-env.d.ts`, stray root `components/`/`lib/`/`hooks/`) before scaffolding — see `pitfalls.md` §8–9.

## Data fetching: SWR / Next data APIs → Nuxt

| Source | Nuxt |
|--------|------|
| `useSWR(key, fetcher)` | `useAsyncData(key, fetcher)` or `useFetch(url)` — keyed + cached; `refresh()` ≈ `mutate()` |
| imperative fetch + state | `$fetch` + `ref` + `watch` |
| polling (e.g. 2s loop) | ports directly, or VueUse `useTimeoutPoll` |
| `getServerSideProps` | `useAsyncData` (runs server-side in SSR) / server route |
| `getStaticProps` | `useAsyncData` + route rules / prerender |

**Behavioral caveats (document these — they change UX):**
- `$fetch` **throws on non-2xx** — it replaces the `if (!res.ok) throw` pattern. Don't double-handle.
- `mutate(data, false)` (set cache, no revalidate) → just assign the ref: `resp.value = await $fetch(...)`. Keep that ref **out of a `watch` source** or you loop.
- Replacing SWR with `$fetch`+`watch` **loses per-key caching** → re-selecting an item refetches (skeleton instead of instant stale data). If fidelity matters, key `useAsyncData` per item or keep a cache `Map`.
- `useAsyncData` `data` is **`null` until resolved** (SWR uses `undefined`) — adapt loading/skeleton conditions.
- `useFetch`/`useAsyncData` awaited at the top of `<script setup>` **suspends** the component; with `ssr: false` they run client-side.

## Auth & server middleware (Next edge middleware → Nitro)

- **HttpOnly session cookies cannot be read client-side** → gating must run in **`server/middleware/auth.ts`** (Nitro), NOT `app/middleware/`. Next edge middleware ran server-side; the equivalent is Nitro server middleware.
  ```ts
  // server/middleware/auth.ts
  export default defineEventHandler((event) => {
    const url = getRequestURL(event)
    const allow = ['/login', '/api/auth/', '/_nuxt', '/__nuxt', '/_ipx', '/_scripts', '/favicon.ico']
    if (allow.some(p => url.pathname.startsWith(p)) || /\.\w+$/.test(url.pathname)) return
    if (!getCookie(event, 'session')) return sendRedirect(event, `/login?redirect=${url.pathname}`, 302)
  })
  ```
  **Translate Next's matcher regex into an explicit allowlist** — and never forget `/_nuxt` (omitting it redirects your JS/CSS → white screen).
- `ssr: false` **still runs server middleware** for the document request and all `/api` calls — server gating works in SPA mode.
- Server routes use **method-suffixed filenames** (`login.post.ts`, `logout.post.ts`), not exported `GET`/`POST` functions.
- Env/secrets: read via `process.env.X` in handlers OR `useRuntimeConfig()` with **`NUXT_`-prefixed** vars — see `pitfalls.md` §2. Never `runtimeConfig.public` for secrets.
- For the idiomatic auth upgrade (better-auth), defer to the `nuxt-better-auth` skill in Pass 2.

## The backend proxy (huge simplification)

A hand-rolled Next proxy (separate GET/POST, manual PDF-vs-JSON content-type branching, `arrayBuffer()` body forwarding, manual timeout) collapses into one Nitro handler:

```ts
// server/api/proxy/[...path].ts
export default defineEventHandler((event) => {
  const path = (getRouterParam(event, 'path') || '').split('/').map(encodeURIComponent).join('/')
  const search = getRequestURL(event).search
  const target = `${process.env.BACKEND_URL}/${path}${search}`
  return proxyRequest(event, target, { fetchOptions: { signal: AbortSignal.timeout(220_000) } })
})
```
`proxyRequest` forwards method/headers/body/query and **streams the response with the original content-type** — PDF streaming and multipart uploads "just work".

**Pitfall — catch-all param encoding:** Next `[...path]` gives a **decoded array** of segments; h3 `getRouterParam(event, 'path')` gives a **decoded joined string**. Re-encode per segment (`.split('/').map(encodeURIComponent).join('/')`) to match the original, and pull the query from `getRequestURL(event).search` (it's **not** in the param).