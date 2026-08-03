# CONVENTIONS.md — the project "Nuxt Way"

## Copy, don't rewrite — read this before porting anything

**If the target language is the same as the source, move the file. Do not regenerate it.**
Reading a 300-line file into context and typing it back out costs roughly twice its tokens, risks
transcription drift, and produces *nothing* a `cp` wouldn't have. It is the single largest avoidable
cost in a migration, and the most common one.

| Situation | Action |
|---|---|
| Same language, touches no framework API (types, pure utils, models, DB layer, providers, constants, validators, i18n JSON, CSS/tokens, assets, test fixtures) | **`git mv`** (or `cp`) **verbatim.** Do not open it to "check" first — `grep` it if you must |
| Same language, a handful of framework lines (an Express handler wrapping logic; a `.vue` SFC using a Nuxt-specific import) | **Copy first, then `Edit` only those lines.** Never Write the whole file |
| Already the target framework (a `.vue` SFC from another Vue/Nuxt app) | **Copy.** It is already correct; alias/import fixes are targeted Edits |
| Different language or paradigm (JSX→SFC, React hooks→composables, Python→TS) | **Rewrite** — this is the only case that earns a full rewrite |

Rules that follow from this:

- **The 80% test.** If the output would be ≥80% identical to the input, you are copying with edits, not
  rewriting. Behave accordingly.
- **Never `Read` a whole file solely to reproduce it.** Read to *decide* (is this dead? does it touch
  the framework?) — and `grep` usually answers that more cheaply than reading.
- **A copied file is provably faithful.** `diff old new` is a stronger parity proof than any review of
  a regenerated file, and it's free. Use it: for copied files, paste the `diff` (empty, or only the
  intended edits) as the verification.
- **Do the dead-code audit first.** Copying is so cheap it makes it tempting to bring everything —
  don't. Copy what's imported; leave the rest behind.
- **Verify after copying, because copies carry their old assumptions:** import paths and aliases
  (`@/*` → `~/*`, srcDir now `app/`), relative depths that changed, `.js`→`.ts` extension references,
  and anything importing a package that isn't in the new `package.json` yet.
- **Prefer `git mv` over `cp`** when the file is leaving its old home — history follows the file, and
  the diff shows a rename instead of a delete-plus-add, which makes review dramatically cheaper.
- This is *why* an Express→Nitro port is cheap: business logic is already framework-agnostic Node.
  Only the `req`/`res` glue is genuinely rewritten. Scope every unit that way — count the lines that
  actually change, not the lines in the file.

## Comments: write none by default

Ported code gets **zero comments** unless the code genuinely cannot explain itself. No narration of
what a line does, no section banners, no restating the function name in prose, no "// ported from
Express" archaeology. Every comment is tokens spent on output that will be stale by the next commit.

- The rare warranted comment is **1–2 lines** stating a non-obvious *why* or a constraint — never a
  *what*. If a better name or a smaller function would remove the need, do that instead.
- **Do not carry over excessive comments from the source.** If the original is heavily commented,
  drop them during the port. Keep only those that encode a real constraint you'd otherwise lose (a
  workaround for an upstream bug, a legal/protocol requirement, a non-obvious ordering dependency).
  A commented-out block is dead code — leave it behind, don't port it.
- **Never write a migration-progress comment** (`// TODO: port the rest`, `// was res.json`). That
  belongs in `NUXT_MIGRATION.md`, which is where anyone will actually look. The exception: an escape
  hatch you must flag in code gets one line naming the constraint, and a matching entry in the
  tracking file.
- Exception — **preserve** license/copyright headers and any comment that is load-bearing for tooling
  (`@ts-expect-error` with its reason, eslint pragmas, JSDoc a consumer's types depend on).
- **Copied files keep their comments.** Stripping comments from a `git mv`'d file turns a free, empty
  `diff` into a reviewable change and destroys the parity proof. Copy verbatim; if the comments are
  genuinely bad, clean them in a separate commit that touches nothing else.


Generate a project-specific `CONVENTIONS.md` during Phase 3 and **hand it to every `port-component` subagent**. It is what keeps parallel ports consistent and prevents idiom drift across sessions (the single highest-leverage artifact in a multi-session migration). Fill the blanks from the Phase-2 answers.

```markdown
# CONVENTIONS — <project> Nuxt 4 migration

## Hard rules (Pass 1 — faithful)
- Composition API + `<script setup lang="ts">` only. No Options API.
- Preserve Tailwind classes VERBATIM (className → class). Dynamic → :class arrays/objects.
- Immutable updates: clone arrays/objects and emit new ones; never mutate props.
- Controlled inputs go through defineProps + defineEmits (update:modelValue / named events) — never v-model a prop.
- Use the correct primitive: useState→ref, useMemo→computed, useEffect(dep)→watch, useEffect([])→onMounted,
  useCallback→plain function. Do NOT port useMemo/useCallback as manual caches.
- One component per .vue file. Multi-component .tsx → multiple SFCs.

## Imports & aliases
- srcDir is `app/`. `@`/`~` → `app/`. shadcn files live at `app/lib/*`, `app/components/ui/*`.
- Shared types: `app/types/<...>.ts` (import path: `~/types/...`).
- Composables: `app/composables/`. Utils: `app/utils/`.
- Icons: `lucide-vue-next`.
- EXPLICIT imports required (auto-import shadowing): `useStorage`, `useState`(VueUse), `useFetch`(VueUse)
  → `import { … } from '@vueuse/core'`. shadcn ui → `@/components/ui/<name>`.

## Emits contracts (fill per shared component — prevents integration drift)
- <ComponentName>: props { ... }  emits { 'update:orders': [Order[]], 'submit': [] }
- ...

## Idiomatic targets (Pass 2 only — do NOT do these in Pass 1)
- Prefer VueUse over custom composables (check the vueuse skill first).
- useAsyncData/useFetch with keys + caching for data.
- Extract shared logic to composables/; shared layout to layouts/ or a Nuxt layer.

## Verification per unit
- `nuxi typecheck` + `pnpm build` must pass before marking [p] done.
- Behavior must match the original (reference/ or `git show <orig>:...`).
```

Tailor the blanks; delete idiomatic targets the project doesn't need. Update it as new contracts/decisions emerge — it travels with the migration.