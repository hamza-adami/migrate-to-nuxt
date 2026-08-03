# JS → TS during the migration

**Ask first.** JS→TS is a second migration riding along with the first. It is usually worth doing —
you're touching every file anyway, and Nitro/Nuxt are TS-native — but it is the user's call, and the
answer changes the plan's size. Offer three levels:

| Option | What it means |
|---|---|
| **Full TS** *(recommended when the target is fresh)* | Every ported file becomes `.ts`/typed SFC. Types are *derived*, never guessed |
| **TS at the boundary only** | Route handlers, validation schemas, and shared types are typed; moved business logic stays `.js` under `allowJs` |
| **Keep JS** | `.js` throughout, `checkJs` off. Fastest, and a legitimate choice for a big strangler migration |

Record the answer in `NUXT_MIGRATION.md`. Whichever level: **never convert a file in the same commit
as its behavioral port.** Move/port first (verified against fixtures), then type it. Two changes in one
commit means a runtime failure has two suspects again.

## The one rule: derive types from reality, never from vibes

An invented type is worse than no type — it typechecks, so it silences the compiler while lying about
the data, and every downstream file inherits the lie. Before annotating anything whose shape you
haven't *seen*, go look:

```bash
# what does this function actually return? run it and inspect.
node -e "import('./server/utils/projectService.js').then(async m => {
  const r = await m.listProjects(); console.dir(r, {depth: 3})
})"

# what columns does the query actually produce, and which are nullable?
node -e "/* run the real query, log Object.entries(row).map(([k,v]) => [k, v === null ? 'NULL' : typeof v]) */"

# what does the third-party API actually send back? (shape, not docs)
curl -s "$API/endpoint" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.dir(JSON.parse(s),{depth:3}))"
```

Write a throwaway probe script when the shape is non-obvious — a DB row, an LLM/vendor response, a
legacy function with five return paths. Two minutes of running the code beats an afternoon of a wrong
type propagating. Keep genuinely useful probes in `scripts/`; delete the rest.

Sources of truth, in order of preference — always prefer a *derived* type over a hand-written one:

1. **`z.infer<typeof schema>`** from the validation schema (see below). One source of truth for the
   runtime check *and* the type.
2. **ORM-inferred types** (`typeof table.$inferSelect` in Drizzle, generated Prisma types, etc.).
3. **Observed runtime shape**, captured with a probe as above — and note nullability explicitly, since
   that is what probes reveal and guesses miss.
4. Hand-written interface — last resort, and only for shapes you own.

Your **contract fixtures are already recorded response shapes.** Use them: they're the empirical
answer to "what does this endpoint return", and a type that contradicts a fixture is wrong by
construction.

## Prohibitions

- **No `any` to make an error go away.** `unknown` + a narrowing check, or fix the actual type. `any`
  disables checking for everything downstream, which is the opposite of why you're doing this.
- **No `as` to silence a mismatch.** A cast asserts you know better than the compiler; during a
  migration you usually don't. If you must, `as unknown as X` with a one-line reason, or better: a
  runtime check that makes the cast unnecessary.
- **No `@ts-ignore` / `@ts-expect-error`** without a comment naming the real problem and the fix.
- **No `!` non-null assertion to narrow a discriminated union** in templates or computeds — assign to a
  local const and narrow properly (it doesn't work the way you expect in Vue templates).
- **Don't loosen a type to make a test pass.** That's the fixture-editing anti-pattern wearing a
  different hat.

## Strictness: ratchet, don't leap

Start with the project's existing strictness and raise it in its own commit, after the port lands.
Turning on `strict` mid-port produces hundreds of errors that mask real problems. Per file:
`allowJs: true` lets typed and untyped files coexist while you convert incrementally, and `checkJs`
can stay off until you're ready. Verify with `nuxi typecheck` (`vue-tsc` — it checks template
expressions too, which plain `tsc` does not).

Mechanical notes: `.js` → `.ts` rename is a `git mv` (see conventions.md — do **not** regenerate the
file to add types; move it, then `Edit` in annotations). Nitro/Nuxt resolve extensionless imports, but
audit any explicit `.js` in an import path. `jsconfig.json` → `tsconfig.json`.

## Zod v4 for input validation

Zod is the right validator here: h3 integrates it directly
(`readValidatedBody(event, schema.parse)`, `getValidatedQuery`), and `z.infer` gives you the type for
free — so the runtime check and the static type cannot drift apart.

```ts
// server/utils/schemas/project.ts
import { z } from 'zod'

export const createProject = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),                       // v4: top-level format, not z.string().email()
  startsAt: z.iso.datetime().optional(),
  visibility: z.enum(['private', 'team']).default('private'),
})
export type CreateProject = z.infer<typeof createProject>
```

```ts
// server/api/projects/index.post.ts
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createProject.parse)  // throws → 400
  // body is fully typed
})
```

**v4 differs from v3 in ways that will bite a port.** Check [zod.dev](https://zod.dev) (or Context7
`/colinhacks/zod` v4, `/websites/zod_dev`) rather than trusting v3 muscle memory. Confirmed changes:

- **String formats moved to top level:** `z.email()`, `z.uuid()`, `z.iso.date()`, `z.iso.datetime()` —
  the v3 `z.string().email()` style is the old API. Custom formats via `z.stringFormat(name, fn|regex)`.
- **Error customization unified:** pass a plain string or `{ error }` — `z.string('Bad!')`,
  `z.uuid('Bad UUID!')`, `z.string().min(5, 'Too short!')`. v3's `message` / `invalid_type_error` /
  `required_error` split is gone.
- **`.default()` now takes the OUTPUT type** (v3 took the input type). Use **`.prefault()`** for the v3
  behavior. Also: defaults inside optional fields now *apply*, where Zod 3 omitted them. **This silently
  changes validated output** — if you port v3 schemas verbatim, re-record the affected fixtures and diff.
- **`z.infer` is an alias for `z.output`.** Use **`z.input<typeof s>`** when you need the pre-transform
  type (they differ whenever you use `.default()`, `.transform()`, or coercion).
- **Error formatting moved off the error object:** `err.format()` / `err.flatten()` are deprecated →
  `z.treeifyError(err)`, `z.flattenError(err)`, `z.formatError(err)`.
- **`z.nativeEnum()` deprecated** — `z.enum()` now handles arrays *and* native enum objects.
- **`zod/mini`** exists as a smaller tree-shakable variant with a `.check()`-based API if bundle size
  matters.

Migration rules for validation specifically:

- **Port the validation faithfully first.** If the Express side used `joi`/`yup`, a schema swap is a
  Pass-2 change (`package-swaps.md`) — and it must preserve the **error envelope and status code** the
  old validator produced, or every client's error handling breaks. Map Zod's error output into the
  project's existing envelope in `server/utils/`; don't leak Zod's default shape into responses.
- **Validation is a trust boundary — never simplify it away.** Every field the old validator checked
  must still be checked, including the constraints that look redundant. This is the one place in the
  migration where "less code" is the wrong instinct.
- Validate **at the edge only** (handler entry). Don't re-validate the same object three layers deep.
