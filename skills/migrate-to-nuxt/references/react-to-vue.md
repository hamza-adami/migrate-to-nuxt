# React → Vue mapping

For the Pass-1 faithful port of components. Use the **correct primitive**, not a literal translation. For Composition-API depth, defer to the `vue` skill.

## Hooks → Composition API

| React | Vue 3 (`<script setup>`) | Notes |
|-------|--------------------------|-------|
| `useState(x)` | `ref(x)` | access `.value` in script; auto-unwrapped in template |
| `useState` (object) | `reactive({...})` or `ref({...})` | prefer `ref` for consistency |
| `useEffect(fn, [])` | `onMounted(fn)` | mount-only |
| `useEffect(fn, [dep])` | `watch(dep, fn)` | reacts to specific source |
| `useEffect(fn)` (no deps) | `watchEffect(fn)` | auto-tracks deps |
| effect cleanup `return () => …` | `onUnmounted` / `watch` `onCleanup` | |
| `useMemo(fn, [deps])` | `computed(fn)` | |
| `useCallback(fn, [deps])` | **plain function** | Vue needs no memoized callbacks |
| `useRef(domNode)` | template ref: `const el = ref(); <div ref="el">` | |
| `useRef(mutableValue)` | `ref()` (not exposed to template) | |
| `useContext(Ctx)` | `inject(key)` + `provide(key, val)` | or a composable / Pinia |
| `useReducer` | composable returning state + actions, or Pinia store | |

**Do not port `useCallback`/`useMemo` reflexively** — they exist to fight React's re-render model. Replicating them as manual caches ports an anti-pattern (this is the kind of debt Pass 2 removes).

## JSX → SFC template

| React JSX | Vue template |
|-----------|--------------|
| `{cond && <X/>}` / ternary | `v-if` / `v-else` (`v-show` if toggling visibility only) |
| `{list.map(i => <X key={i.id}/>)}` | `<X v-for="i in list" :key="i.id"/>` |
| `onClick={fn}` | `@click="fn"` |
| `className={x}` | `class="x"` |
| `className={\`a ${b}\`}` (dynamic) | `:class="['a', b]"` or `:class="{ a: cond }"` |
| `style={{color}}` | `:style="{ color }"` |
| `{children}` | `<slot/>` |
| `dangerouslySetInnerHTML` | `v-html` |
| controlled `value+onChange` | `v-model` (own state) / emits (props) — see below |
| Fragment `<>...</>` | `<template>` allows multiple roots in Vue 3 |

## Props & emits (the main source of integration drift)

- **Never `v-model` a prop** — it mutates props. Route through `defineProps` + `defineEmits`:
  ```vue
  <script setup lang="ts">
  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ 'update:modelValue': [string] }>()
  </script>
  <template><input :value="modelValue" @input="emit('update:modelValue', $event.target.value)"></template>
  ```
- **Callback props → emits.** `onChange`/`onSubmit`/`onSelect` become `emit('update:orders', …)` / `emit('submit')`. **Define the props/emits contract explicitly and write it into `CONVENTIONS.md`** so parents that import the component in parallel ports stay in sync.
- **Immutable updates preserved.** Keep the original's clone-and-emit style (`emit('update:items', [...items, next])`) — don't mutate in place.

## Structural rules

- **One `.tsx` with multiple sub-components → multiple `.vue` SFCs** (one per file). Stateful sub-components MUST be real components so each instance keeps its own state. Trivial render helpers can become `defineComponent`/`h()` if you must inline.
- **Recursive components** (tree node rendering itself) rely on auto-import for self-reference — add `defineOptions({ name: 'JsonNode' })` and let auto-import resolve recursion. Do not blanket-disable auto-import.
- **TS union narrowing fails in templates/computeds.** `props.selected!.id` does NOT narrow a discriminated union (`!` only removes `null`). Assign to a local `const` and narrow, or cast. `vue-tsc` type-checks template expressions too, so this bites in `<template>` as well.
- **Template whitespace** — `{{ x }}` on its own line adds surrounding whitespace. Keep interpolation adjacent to tags for `<pre>` and tight inline values: `<span>{{ value }}</span>`.

## Drop-in equivalents

- Icons: `lucide-react` → `lucide-vue-next` (identical names, `<Icon class="..."/>`).
- `next/image`: if the source set `images.unoptimized`, just use `<img>` and drop `width`/`height`/`priority`. Otherwise `<NuxtImg>`.
- Tailwind classes are 100% portable (`className` → `class`).

---

## Pass 2 — idiomatic checklist (run per-feature, verify as refactor)

Only after the faithful version is verified. Each change must preserve behavior vs the pass-1 baseline.

- [ ] Replace hand-written utilities with **VueUse** — check the `vueuse` skill *first* (`useStorage`, `refDebounced`/`useDebounceFn`, `useElementSize`, `useEventListener`, `useTimeoutPoll`, `useClipboard`, `useMediaQuery`…).
- [ ] Remove now-redundant manual reactivity (leftover `watch`/manual caches that `computed` subsumes).
- [ ] Extract repeated logic into `composables/`; extract shared layout into `layouts/` or a Nuxt **layer**.
- [ ] Move data fetching to idiomatic `useAsyncData`/`useFetch` with keys + caching (see `next-to-nuxt.md`).
- [ ] Adopt auto-imports (drop now-unneeded explicit imports — except the ones that must stay explicit to avoid shadowing; see `pitfalls.md` §1).
- [ ] Prefer Nuxt components (`<NuxtLink>`, `<NuxtImg>`, `<NuxtTime>`) over raw equivalents where they add value.