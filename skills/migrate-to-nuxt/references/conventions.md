# CONVENTIONS.md — the project "Nuxt Way"

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