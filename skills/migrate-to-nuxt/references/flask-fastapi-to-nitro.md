# Flask / FastAPI → Nitro (backend)

Decide **keep Python vs port to Nitro** per project. "Full Nuxt" does **not** require killing a heavy Python backend.

## Decision tree

```
Is the backend thin CRUD / proxying / simple auth, with no heavy deps?
├─ YES → PORT to Nitro server routes (server/api/*). Single full-Nuxt codebase.
└─ NO  → Does it do ML / OCR / heavy compute / long async / background workers /
         queues / Python-only libraries (numpy, torch, pandas, a vendor SDK)?
         ├─ YES → KEEP Python. Generate a Nitro BFF/proxy in front (see next-to-nuxt.md proxy).
         │        Nuxt owns frontend + a thin server/ layer; Python owns the heavy work.
         └─ MIXED → KEEP the heavy parts in Python; optionally port the thin/CRUD
                    endpoints to Nitro and proxy the rest. Record the split in NUXT_MIGRATION.md.
```

Confirm the decision with the user at the Phase-1 gate.

## Endpoint mapping (when porting to Nitro)

| Flask / FastAPI | Nitro (h3) |
|-----------------|-----------|
| `@app.get("/x")` / `@router.get` | `server/api/x.get.ts` → `defineEventHandler` |
| `@app.post("/x")` | `server/api/x.post.ts` |
| path param `/items/{id}` | `server/api/items/[id].get.ts` → `getRouterParam(event, 'id')` |
| catch-all | `server/api/[...path].ts` |
| query params (`request.args` / `Query`) | `getQuery(event)` or `getValidatedQuery(event, zodSchema)` |
| JSON body (`request.json` / Pydantic model) | `readBody(event)` or `readValidatedBody(event, zodSchema)` |
| `request.files` / multipart | `readMultipartFormData(event)` |
| `abort(404)` / `HTTPException` | `throw createError({ statusCode, statusMessage })` |
| `jsonify(...)` / return dict | `return obj` (auto-JSON) |
| middleware / `before_request` | `server/middleware/*.ts` |
| background task (`BackgroundTasks`) | Nitro task / queue / external worker — re-architect, don't fake it |
| env (`os.environ`) | `process.env` (live in Nitro) or `useRuntimeConfig()` (`NUXT_` prefix) |

## Validation: Pydantic → Zod

Pydantic models → Zod schemas used with `getValidatedQuery`/`readValidatedBody`. Mirror field names and constraints. If the model is large or shared, define schemas in `server/utils/schemas.ts` and import.

## Keep-Python topology (the common case)

- Frontend + Nitro BFF live in the Nuxt app; the Python service stays as-is (or lightly fixed).
- Nuxt talks to Python via the proxy handler (`server/api/proxy/[...path].ts`) using `process.env.BACKEND_URL`.
- Auth: either let Nitro middleware gate and forward the cookie, or proxy `/api/auth/*` straight through to Python.
- Deployment is **two services** — see `deployment.md` (hybrid topology).
- **Faithful migrations surface latent backend bugs:** once the new frontend correctly exercises a previously-unhit endpoint, pre-existing Python errors can appear. These are **not migration bugs** — identify which side owns the error before "fixing" it. Note it in `NUXT_MIGRATION.md`.