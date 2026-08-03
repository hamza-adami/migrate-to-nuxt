# Deployment

Phase 7. If the source has deploy config, **regenerate equivalents so the new app is deploy-ready**. Branch on topology.

## Detect first

```bash
ls Dockerfile* docker-compose* 2>/dev/null; ls .github/workflows 2>/dev/null
ls vercel.json fly.toml Procfile nixpacks.toml 2>/dev/null
```
Record host, registry, env var names, and which services exist in `NUXT_MIGRATION.md`.

**Runtime target:** default Node. For **Bun** (`nitro.preset: 'bun'`, run with `bun run ./.output/server/index.mjs`) see `references/bun.md` — it is a separate pass after parity, with its own empirical gate, and it's three independent decisions (package manager / prod runtime / dev runtime) that must not be conflated. Verify the preset name against your installed Nitro major.

## Two topologies

### A. Full Nuxt (single service) — backend was thin CRUD, ported to Nitro
- Set the **Nitro preset** to match the host in `nuxt.config`: `nitro: { preset: 'node-server' | 'vercel' | 'cloudflare-pages' | 'bun' | … }`.
- One deploy unit. Output is `.output/` (self-contained).

### B. Hybrid — Nuxt (+ Nitro BFF) + retained Python (the common case)
The migrated app is **two services**:
- **Keep / fix the Python** Dockerfile + its CI/registry/deploy path.
- **Add the Nuxt** Dockerfile + CI.
- **Wire the proxy** via env (`BACKEND_URL`-style) so the Nuxt BFF reaches Python.
- **Preserve multi-service orchestration**: compose locally, separate registry images + deploy steps in prod (e.g. Scaleway/registry redeploy).
- "Migrate to full Nuxt" here means *frontend → Nuxt*, **not** delete Python.

## Next → Nuxt build/output changes

| Next | Nuxt |
|------|------|
| `.next/standalone` + `server.js` (+ copy `.next/static`, `public`) | `.output/server/index.mjs` (self-contained; no `node_modules`/`public` copy at runtime) |
| `next build` / `next start` | `nuxi build` / `node .output/server/index.mjs` |
| env `HOSTNAME` / `PORT` | `NITRO_HOST` / `NITRO_PORT` |

## Docker + pnpm monorepo gotchas (real failures)

- **Standalone lockfile drift.** If the frontend builds as a standalone Docker context with its own `frontend/pnpm-lock.yaml`, note that `pnpm add` from a workspace member updates the **root** lockfile → the standalone one goes stale → `pnpm install --frozen-lockfile` fails in Docker. **Fix:** after dependency changes, regenerate with `pnpm install --ignore-workspace --lockfile-only`.
- **`postinstall: nuxi prepare` fails in the deps stage.** The Docker deps stage copies only `package.json` + lockfile (no `nuxt.config`/sources), so `nuxi prepare` in `postinstall` errors. **Fix:** `pnpm install --frozen-lockfile --ignore-scripts` in the deps stage (`nuxi build` prepares anyway).
- **Config-referenced deps must be installed before first prepare** (`@tailwindcss/vite` etc.) — see `setup.md`.

## Env vars at deploy — the `NUXT_` prefix

If you use `useRuntimeConfig()`, the deploy environment must set **`NUXT_`-prefixed** vars (`NUXT_AUTH_COOKIE_SECRET`), or the build-time default ships. Either rename the deploy vars or read `process.env.X` directly in server code. Never expose secrets via `runtimeConfig.public`. (Full explanation in `pitfalls.md` §2.)