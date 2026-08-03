# Express / Node backend → Nitro

Express→Nitro is **not** the same problem as Flask→Nitro. Same language, same runtime, same
`node_modules`. That makes it much cheaper *and* much more dangerous: you can move a file, have it
typecheck and build, and still have silently changed the response shape, the header casing, the
status code, or the streaming behavior. Verify contracts, not compilation.

## Contents
1. [Decision tree](#decision-tree)
2. [Strangler-fig: the default plan](#strangler-fig-the-default-plan)
3. [In-process mount (escape hatch)](#in-process-mount-escape-hatch)
4. [Mechanical mapping](#mechanical-mapping)
5. [The seven Express-specific traps](#the-seven-express-specific-traps)
6. [Streaming / SSE](#streaming--sse)
7. [Background jobs & long-running work](#background-jobs--long-running-work)
8. [Ordering the strangle](#ordering-the-strangle)

## Decision tree

```
How big is the Express surface? (count route files + LOC + models)
├─ < ~20 route files, no workers, no long-lived connections
│    → PORT WHOLESALE to server/api. One branch, one pass.
├─ ~20–100 route files, or has workers/queues/streaming
│    → STRANGLER FIG. Express keeps running as its own process behind a Nitro
│      proxy; move endpoints group-by-group. This is the default. Never big-bang.
└─ Native/binary deps that won't load in the Nitro bundle (image processing, OCR,
   ML runtimes, headless browsers, *.wasm, .node addons), or a separate worker
     → KEEP that service in Express/Node permanently. Nitro proxies to it.
       "Full Nuxt" does not require one process.
```

Record the verdict **per endpoint group**, not for the whole backend — the answer is usually
"port 60% of it and keep the rest".

## Strangler-fig: the default plan

The [strangler fig pattern](https://martinfowler.com/bliki/StranglerFigApplication.html) is the
industry-standard answer to "I must not break anything": put a facade in front, route everything to
the old system, then move one route at a time behind the facade. In a Nuxt app **the facade is a
Nitro catch-all route** — you already have one if the frontend was talking to Express through a
proxy.

```
Browser → Nitro
            ├─ server/api/<ported>/…        ← grows each session
            └─ server/routes/<legacy>/[...] ← proxyRequest to EXPRESS_URL (shrinks)
```

The facade handler (nitro v2 / h3 v1):

```ts
// server/routes/api/[...path].ts  — everything not matched by a real server/api route lands here
export default defineEventHandler(async (event) => {
  const target = process.env.EXPRESS_URL // NOT runtimeConfig — see pitfalls.md §2
  const path = getRouterParam(event, 'path') ?? ''
  const search = getRequestURL(event).search
  return proxyRequest(
    event,
    `${target}/${path.split('/').map(encodeURIComponent).join('/')}${search}`,
    { fetchOptions: { signal: AbortSignal.timeout(120_000) } }, // raise for streaming routes
  )
})
```

Rules that make this safe:

- **Nitro's own routes win over the catch-all**, so "porting an endpoint" = creating the file. There
  is no cutover step and no config flag. Deleting the new file rolls back instantly.
- **Delete the Express route in the *same commit* that adds the Nitro one.** Two live
  implementations of one endpoint is the failure mode of every strangler migration — the facade
  silently picks one and you debug the other.
- **Keep the URL identical.** No path renames during the strangle. Rename after parity, as its own
  commit, or you cannot diff old vs new.
- **`proxyRequest` streams** and forwards method/headers/body/query, so SSE and multipart uploads
  pass through untouched while they're still on Express. Do not hand-roll `$fetch` + re-serialize.
- The facade is also the **rollback lever**: the Express process stays deployed until the parity
  audit passes. If a ported endpoint misbehaves in production, delete the Nitro file and traffic
  falls back through the proxy.

## In-process mount (escape hatch)

You *can* run the Express app inside Nitro instead of as a second process. This is sometimes worth
it (one deploy target, shared memory, no proxy hop) but it is a **compatibility shim, not a
migration** — nothing gets more idiomatic and you inherit Express's error handling.

Which API depends on your Nitro major — **check it before writing code**
(`node -e "console.log(require('nitropack/package.json').version)"`, or `nitro` for v3):

- **Nitro 2 / h3 v1** (Nuxt 4.x today): `server/middleware/legacy.ts` exporting
  `fromNodeMiddleware(app)` from `h3`. Order matters — Nitro middleware runs before route matching,
  so guard it to the legacy prefix or it swallows your ported routes.
- **Nitro 3 / h3 v2**: a root `server.node.ts` that default-exports the Express app as the custom
  server entry (Node runtime only — incompatible with edge/Workers presets).

Verify the exact symbol against the docs for *your installed version* before relying on either.
Nitro 3 rewrote h3 around web-standard `Request`/`Response`, so v2 snippets and v3 snippets are not
interchangeable and search results skew to the newest.

Prefer the proxy unless you have a concrete reason. The proxy keeps the two systems'
failure modes separate, which is the entire point of a low-risk migration.

## Mechanical mapping

| Express | Nitro (h3 v1) |
|---|---|
| `router.get('/x', h)` | `server/api/x.get.ts` → `defineEventHandler` |
| `router.post('/x', h)` | `server/api/x.post.ts` |
| `/items/:id` | `server/api/items/[id].get.ts` → `getRouterParam(event, 'id')` |
| `/files/*` | `server/api/files/[...path].ts` |
| `req.body` (+ `body-parser`/`express.json()`) | `await readBody(event)` — parsing is built in, drop body-parser |
| validated body | `readValidatedBody(event, schema.parse)` |
| `req.query` | `getQuery(event)` / `getValidatedQuery(event, schema.parse)` |
| `req.params` | `getRouterParam` / `getRouterParams` |
| `req.headers.x` | `getHeader(event, 'x')` (case-insensitive) |
| `req.cookies` (+ `cookie-parser`) | `getCookie(event, name)` — built in, drop cookie-parser |
| `res.json(obj)` | `return obj` |
| `res.send(str)` | `return str` |
| `res.status(201).json(o)` | `setResponseStatus(event, 201); return o` |
| `res.sendStatus(204)` | `setResponseStatus(event, 204); return null` |
| `res.setHeader` | `setResponseHeader(event, k, v)` |
| `res.cookie` / `res.clearCookie` | `setCookie(event, …)` / `deleteCookie(event, …)` |
| `res.redirect(url)` | `await sendRedirect(event, url, 302)` |
| `res.status(404).json({error})` | `throw createError({ statusCode: 404, statusMessage, data })` |
| `next(err)` + error middleware | `throw createError(...)`; central handling via `server/plugins/error.ts` (`hooks.hook('error', …)`) |
| `app.use(mw)` (global) | `server/middleware/*.ts` (runs on **every** request, incl. pages/assets) |
| per-route middleware chain | call helpers inline at the top of the handler, or `defineEventHandler` composed via `server/utils/` |
| `multer` upload | `await readMultipartFormData(event)` |
| `res.sendFile` | `sendStream(event, createReadStream(p))` + `setResponseHeader` |
| `cors` package | `handleCors(event, { origin, methods })` from h3 |
| `express-rate-limit` | no built-in — keep the package behind the proxy, or `nuxt-security`, or a hand-rolled limiter in `server/middleware` |
| shared services/models (`utils/`, `models/`) | `server/utils/**` (auto-imported inside server/) — usually **moved verbatim**, no rewrite |
| `process.env.X` | `process.env.X` still works in Nitro; prefer it over `runtimeConfig` for existing var names (pitfalls.md §2) |

**The `server/utils` insight is the whole reason Express→Nitro is cheap:** your models, DB layer,
providers, and business logic are already framework-agnostic Node modules. They move by `git mv`.
Only the ~15 lines per file that touch `req`/`res` are actually being rewritten. Scope the migration
that way and the estimate collapses.

## The seven Express-specific traps

1. **Nitro `server/middleware` is not `app.use`.** It runs on *every* request including HTML
   documents, `/_nuxt/*`, and images — an auth check or a JSON body parse there will break asset
   loading. Guard with an explicit path check (`if (!event.path.startsWith('/api/')) return`) and
   allowlist Nuxt internals (`/_nuxt`, `/__nuxt`, `/_ipx`, `/_scripts`).
2. **Middleware cannot short-circuit by "not calling next()".** In h3 you short-circuit by
   `throw createError(...)` or by returning a value. A middleware that just `return`s falls through
   to the route — a ported guard that used `if (!ok) return res.status(401)…` becomes a **no-op that
   typechecks**. Grep every ported middleware for bare `return` after a failed check.
3. **Error shape changes silently.** Express's default handler emits HTML or your custom JSON;
   `createError` emits `{ statusCode, statusMessage, data, stack? }`. Clients that read
   `err.response.data.message` break. Decide the error envelope once, put it in `server/utils/`, and
   assert it in the contract fixtures.
4. **Method-suffixed filenames or you accept every method.** `server/api/x.ts` answers GET, POST,
   DELETE and everything else. Express route definitions were method-scoped; dropping the suffix
   turns a GET endpoint into a write endpoint. Always use `.get.ts` / `.post.ts`.
5. **Route precedence differs.** Express matches in registration order (first wins); Nitro matches
   by specificity (static > `[param]` > `[...catchall]`). A hand-ordered Express router where
   `/users/me` is declared before `/users/:id` maps fine, but the reverse case — where Express
   *intentionally* let `:id` win — silently changes behavior.
6. **Body is single-read.** `readBody` caches, but a `server/middleware` that reads the body and a
   handler that reads it again with a raw stream API will conflict. Read once, stash on
   `event.context`.
7. **Header casing and `set-cookie` multiplicity.** Nitro normalizes header names to lowercase and
   handles multiple `Set-Cookie` values differently from `res.setHeader` called twice. If a client
   or a test asserts on casing or on cookie order, catch it in fixtures.

## Streaming / SSE

The highest-risk endpoints in an AI/chat backend and the ones to port **last**.

- Express SSE (`res.writeHead(200, {'Content-Type':'text/event-stream'})` + `res.write(...)`) →
  Nitro: `setResponseHeaders(event, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'})`
  then return a stream, or use `createEventStream(event)` (h3) / the Vercel AI SDK's
  `toDataStreamResponse()` if the route already uses `ai`.
- **Buffering is the killer.** A reverse proxy, compression middleware, or `X-Accel-Buffering`
  absence can turn a working stream into a 30-second silence then a dump. Verify streaming with a
  timestamped read, not just a final-byte diff:
  `curl -N -s <url> | while IFS= read -r l; do printf '%s %s\n' "$(date +%s.%N)" "$l"; done`
  Compare inter-chunk timings old vs new. Equal bodies with different timing is a regression.
- Client disconnect: Express `req.on('close')` → `event.node.req.on('close')` (still available in
  nitro v2) or the stream's abort signal. Getting this wrong leaks LLM requests and burns money.
- Keep streaming routes on the proxy while everything else moves. `proxyRequest` streams correctly;
  a half-ported stream does not.

## Background jobs & long-running work

- `node-cron` / `agenda` / `bull` / `bree` / bare `setInterval` in the Express process → Nitro **tasks** (`server/tasks/*.ts`,
  `defineTask`) with `scheduledTasks` in the Nitro config, and `experimental: { tasks: true }` while
  it remains experimental. Confirm the flag is still required for your version.
- **Nitro tasks run in the request runtime, not a separate worker.** Anything CPU-bound, anything
  that must survive a deploy, or anything with retry/backoff semantics should stay in the existing
  worker process. Serverless presets have no long-lived scheduler at all.
- A separate worker service that loads native deps (headless browser, OCR, ML runtime, image
  processing) is a **keep**, not a port. Give it a Nitro-side client in `server/utils/` and leave it
  alone.

## Ordering the strangle

Move in this order — each step de-risks the next:

1. **Read-only, no-auth endpoints** (`/health`, `/ping`, public config). Proves routing, deploy, env
   wiring, and the error envelope with nothing at stake.
2. **Shared plumbing to `server/utils/`** (`git mv` DB client, models, logger, providers). No
   behavior change; makes every later step a small diff.
3. **Read-only authenticated GETs.** Proves the auth guard once, for many endpoints.
4. **Writes / mutations.** One endpoint group per session, each with fixtures.
5. **Uploads / multipart.**
6. **Auth endpoints themselves.** Late, and faithfully — see `package-swaps.md` before swapping the
   auth library.
7. **Streaming.** Last.
8. **Workers/queues** — or never (keep the process).

Anything with a native dep, a long-lived connection, or a vendor SDK that assumes Express: leave it
and mark it KEEP in `NUXT_MIGRATION.md` with the reason.
