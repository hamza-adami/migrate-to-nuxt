# Package swaps — replacing hand-rolled flows with ecosystem libraries

Migrating is the one moment when swapping a hand-rolled subsystem (auth, validation, jobs, docs) for
a maintained library is cheap. It is also the fastest way to turn a verifiable migration into an
unverifiable rewrite. One rule governs everything here:

> **A library swap is Pass 2 work, never Pass 1.**
> Pass 1 ports the existing flow faithfully — same endpoints, same cookies, same token shape. The
> swap lands afterwards as its own commit, verified as a *refactor* against the Pass-1 baseline.

Rationale: if you swap the auth library while porting the auth endpoints, a login failure has two
possible causes and you cannot bisect it. Faithful first means every later failure has exactly one
suspect. (The cost of skipping the separation is visible in Bun's Zig→Rust AI port: 13k `unsafe`
blocks vs ~73 hand-written, because translation and idiom happened at once.)

## Use Context7 to check — don't swap from memory

For every candidate swap, query Context7 **before** writing code:

1. `resolve-library-id` with the library name → pick by benchmark score + snippet count + High
   source reputation.
2. `query-docs` with the **specific concept**, one concept per call ("generic OAuth provider with
   discoveryUrl", not "auth"). Multi-concept queries return shallow results for each.
3. **Pin the version.** This is the trap that matters here: Context7 serves the *latest* docs, and
   your project is on a specific major. Nitro 3 / h3 v2 rewrote the server API around web-standard
   `Request`/`Response`; Nuxt 4.x ships Nitro 2 / h3 v1. A snippet that is correct in the docs can be
   wrong in your repo. Check the installed version first
   (`node -e "console.log(require('nitropack/package.json').version)"`) and use a version-qualified
   library id when one exists (`/websites/nuxt_4_x` vs `/websites/nuxt_3_x`; `/nuxt/nuxt` accepts
   versions). Full protocol — including why *planning* should read current docs while *implementation*
   pins to installed — in `assess.md` §load current docs.
4. If the docs and the installed version disagree, **the installed version wins**. Note the
   divergence in `NUXT_MIGRATION.md` rather than "fixing" the code to match newer docs.

## Candidate map (verify each against your versions)

| Hand-rolled / Express-era | Nuxt-era candidate | Verdict |
|---|---|---|
| `jsonwebtoken` + `bcryptjs` + custom session table | **better-auth** (`@onmax/nuxt-better-auth` for Nuxt wiring) | Strong candidate — but see the auth section below |
| `openid-client` / custom SSO handshake | better-auth **`sso()`** plugin, or **`genericOAuth()`** with `discoveryUrl` | Strong candidate; `genericOAuth` covers any OIDC-discoverable IdP |
| custom API-key/bearer issuing | better-auth `jwt()` / `bearer()` / `apiKey()` plugins | Good, but keep the existing key format during Pass 1 |
| `joi` / `yup` / `express-validator` | **zod** (often already a dep; `readValidatedBody(event, schema.parse)`) | Do it — h3 integrates natively, and it removes a dep |
| `multer` | `readMultipartFormData(event)` | Do it — built in |
| `body-parser`, `cookie-parser` | built into h3 | Delete outright |
| `cors` | `handleCors(event, …)` | Do it |
| `express-rate-limit` | `nuxt-security`, or a small `server/middleware` limiter | Only if you need it in-process; otherwise keep it on the proxy |
| `swagger-autogen` + `swagger-ui-express` | Nitro's OpenAPI (`experimental.openAPI`) + Scalar UI | Nice win — generated from real handlers instead of comments. Verify the flag's status for your version |
| `winston` | `consola` (already in the Nuxt toolchain) | Optional. Keep winston if you depend on its transports/log sinks |
| `node-cron` / `agenda` / `bull` / `bree` | Nitro tasks + `scheduledTasks` | Only for light periodic work; anything with retry/backoff or CPU-bound stays put — see `express-to-nitro.md` §background-jobs |
| `moment` | `date-fns` / `Temporal` / native `Intl` | Pure cleanup, do it late |
| the existing ORM (`drizzle`, `prisma`, `typeorm`, `knex`, raw SQL) | **keep as-is** | Already framework-agnostic. Move the client to `server/utils/db.ts` and stop. Never migrate the ORM and the framework in the same pass |
| services with native/binary deps (headless browsers, OCR, image processing, ML runtimes, any `.node` addon) | **keep the process** | Not a swap candidate |

## Auth specifically — the sequence that doesn't break logins

Auth is the highest-blast-radius swap: getting it wrong logs out every user, or worse, lets the wrong
one in. Do it in this order, each step its own commit:

1. **Pass 1 — port faithfully.** Existing JWT/cookie verification moves into
   `server/utils/auth.ts` + a guarded `server/middleware/`. Same cookie name, same flags, same claim
   shape, same expiry. Existing sessions must survive the deploy. (HttpOnly cookies can only be read
   server-side — see `pitfalls.md` §3.)
2. **Land and verify.** Contract fixtures for login / refresh / logout / 401, plus a real
   browser login against the built app. Sessions issued *before* the deploy must still work.
3. **Then evaluate better-auth as a separate project** with its own branch and its own gate. Query
   Context7 for the adapter matching your ORM, the `sso()` plugin, and the password-migration guide — it
   documents importing existing hashes (including custom scrypt/bcrypt params) so users don't have to
   reset passwords, and linking existing SSO identities as accounts.
4. **Run both auth systems in parallel before cutting over.** Better-auth owns new sessions;
   the legacy verifier stays as a fallback for old cookies until they expire. Remove the fallback
   after the longest session lifetime has elapsed, not on merge day.
5. **Never** delete the legacy user/session tables in the same release as the cutover.

If the project has SSO/enterprise tenants: their IdP config is external state you cannot roll back
from a git revert. Treat each tenant's redirect URI change as a separate, scheduled migration.

## When to say no

Skip a swap when any of these hold:

- The hand-rolled version has behavior no library reproduces (a bespoke multi-tenant permission
  model, a legacy token format other services parse).
- It has no test coverage and you can't cheaply record fixtures.
- The migration is already the largest in-flight change. **One risky change at a time.** A swap
  deferred to next quarter costs nothing; a swap that breaks auth mid-migration costs the migration.

Record every considered-and-rejected swap in `NUXT_MIGRATION.md` with the reason — otherwise a later
session re-litigates it, or worse, does it.
