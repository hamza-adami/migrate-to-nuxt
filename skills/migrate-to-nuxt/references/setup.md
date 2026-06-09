# Setup order & gotchas

Phase 3. **Delegate the exact, current commands to the live skills** (`shadcn-vue`, `nuxt`, `pnpm`, `nuxt-better-auth`, `nuxthub`). This file is the **sequencing + the gotchas those skills don't emphasize**. Setup order matters because `nuxt.config` imports tooling at the top, so config-referenced deps must exist before the first `nuxi prepare`.

## Order (do not reorder)

1. **Scaffold Nuxt 4** — `npm create nuxt@latest` (or pnpm). Install `typescript` as a dep if you hit `Cannot read properties of undefined (reading 'sys')`.
2. **Install ALL config-referenced deps in one shot** before any `nuxi prepare`. In particular `@tailwindcss/vite` must be installed before the first prepare, because `nuxt.config` imports it at the top — otherwise `postinstall`'s prepare errors. (See `pitfalls.md` §10.)
3. **Tailwind v4** — prefer the **`@tailwindcss/vite` plugin** in `nuxt.config` `vite.plugins`, NOT legacy PostCSS or `@nuxtjs/tailwindcss`:
   ```ts
   import tailwindcss from '@tailwindcss/vite'
   export default defineNuxtConfig({
     css: ['~/assets/css/main.css'],
     vite: { plugins: [tailwindcss()] },
   })
   ```
   `app/assets/css/main.css` starts with `@import 'tailwindcss';`. `@theme`, `@custom-variant dark`, and oklch tokens from the source carry over unchanged.
4. **Aliases** — ensure `@/lib` and `@/components` resolve under `app/` (Nuxt srcDir). This is what shadcn-vue expects (see `next-to-nuxt.md` aliases).
5. **shadcn-vue** — install `shadcn-nuxt` module + configure `shadcn: { prefix, componentDir }` in `nuxt.config`. Run `npx nuxi prepare` (generates `.nuxt`) **before** the shadcn CLI.
6. **Fonts** — if the source used `next/font`, set up `@nuxt/fonts` now (see font trap below).
7. **`nuxi prepare`** → then add components.

## shadcn-vue CLI friction (real failures)

- **`shadcn-vue init` prompts use raw TTY** — piping `\n` does NOT reliably answer them; the run aborts. **Workaround:** hand-write a valid `components.json`, then run `npx shadcn-vue@latest add <comp> --overwrite --yes` directly (`add` is non-interactive and auto-detects the framework).
- **`components.json` schema is strict** — the CLI rejects `tsConfigPath` and `framework` keys that some templates include. Keep it minimal:
  ```json
  {
    "$schema": "https://shadcn-vue.com/schema.json",
    "style": "new-york",
    "typescript": true,
    "tailwind": { "config": "", "css": "app/assets/css/main.css", "baseColor": "neutral", "cssVariables": true },
    "aliases": { "components": "@/components", "ui": "@/components/ui", "utils": "@/lib/utils", "lib": "@/lib" },
    "iconLibrary": "lucide"
  }
  ```
- **Leftover Next dirs break framework detection** — stray root `components/`, `lib/`, `hooks/` produce `Cannot find module 'components'`. Clean (or move to `reference/`) Next artifacts before running the CLI.
- **Let the CLI be authoritative** for components you actually use — it emits the canonical Reka-UI versions (Button via `Primitive`, Input via `useVModel`, Label via Reka `Label`+`reactiveOmit`). Hand-writing risks subtle API drift.
- **Auto-import collision:** scope component auto-import to exclude the explicitly-imported `ui` dir, or you get duplicate-name warnings (`UiSkeleton`):
  ```ts
  components: { dirs: [{ path: '~/components', pathPrefix: false, ignore: ['**/ui/**'] }] }
  ```
  Import ui components explicitly via `@/components/ui/button`. (See `pitfalls.md` §1.)
- Optional: add the `ssr-width` plugin (`provideSSRWidth(1024, nuxtApp.vueApp)` via `@vueuse/core`) to avoid mobile hydration errors in some components.

## The font trap (very easy to miss)

`next/font/google` has **no direct equivalent**. If you drop it but keep CSS referencing the family (`--font-sans: 'Geist', 'Geist Fallback'`), the family is unresolvable → browser falls back to its default **serif** ("why is my app suddenly ugly?"). Two-part fix:
1. Self-host via **`@nuxt/fonts`** (`modules: ['@nuxt/fonts']` + `fonts.families`) — the idiomatic equivalent of `next/font`'s self-hosting.
2. Replace `next/font`'s synthetic fallback names (`'Geist Fallback'`) with a **real system chain** (`ui-sans-serif, system-ui, …`) so it degrades gracefully before/without the webfont.

**Rule:** always audit `--font-*` / `font-family` after removing `next/font`; never leave a `*-Fallback` next/font name in the chain.

## Dev-server papercuts

- Vite "discovered new dependencies, pre-bundle them" → a warning + page reload the first time it sees a dep (e.g. `lucide-vue-next`). Pre-list to avoid the reload:
  ```ts
  vite: { optimizeDeps: { include: ['lucide-vue-next', 'clsx', 'tailwind-merge', 'class-variance-authority', 'reka-ui'] } }
  ```
- A new module/dep installed while `nuxi dev` is running isn't always picked up — **restart the dev server** after adding modules.