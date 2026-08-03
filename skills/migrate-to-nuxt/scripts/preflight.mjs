#!/usr/bin/env node
// Phase -1: report available tooling before a migration starts. Read-only; installs nothing.
//
//   node preflight.mjs
//
// Scope note: this checks ONLY things a filesystem check answers reliably — MCP servers, plugins,
// and binaries. It deliberately does NOT check skills: skills can come from plugins, marketplaces,
// or project dirs, so guessing from disk produces false alarms, and a preflight that cries wolf
// gets ignored. You can already see your available skills in your own listing — that is the
// authoritative source. Check it there and report the union.

import { readFile, access } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const H = homedir()
const exists = async (p) => { try { await access(p); return true } catch { return false } }
const slurp = async (p) => ((await exists(p)) ? (await readFile(p, 'utf8')).toLowerCase() : '')

// Any config that can declare MCP servers or plugins. Presence of the name anywhere counts.
const blobs = await Promise.all([
  join(H, '.claude.json'),
  join(H, '.claude', 'settings.json'),
  join(H, '.claude', 'plugins', 'installed_plugins.json'),
  join(process.cwd(), '.mcp.json'),
  join(process.cwd(), '.claude', 'settings.json'),
  join(process.cwd(), '.claude', 'settings.local.json'),
].map(slurp))
const has = (n) => blobs.some((b) => b.includes(n.toLowerCase()))

const TOOLING = [
  ['context7',        'MCP',    'current docs for every package — the difference between checked and remembered APIs'],
  ['context-mode',    'plugin', 'keeps large tool output (greps, test runs, inventories) out of context'],
  ['chrome-devtools', 'MCP',    'real-browser verification: console errors, network, screenshots, streaming timing'],
]

console.log('Migration preflight\n')
const missing = []
for (const [name, kind, why] of TOOLING) {
  const ok = has(name)
  console.log(`${ok ? '  ok  ' : ' MISS '} ${name.padEnd(13)} ${kind.padEnd(7)} ${why}`)
  if (!ok) missing.push([name, kind, why])
}

console.log('')
for (const [cmd, label, optional] of [
  ['git --version', 'git', false],
  ['node --version', 'node', false],
  ['bun --version', 'bun', true],
]) {
  try {
    const v = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    console.log(`  ok   ${label.padEnd(13)} ${v}`)
  } catch {
    console.log(`${optional ? '  --  ' : ' MISS '} ${label.padEnd(13)}${optional ? 'not installed (only needed for a Bun target)' : 'REQUIRED'}`)
  }
}

console.log(`
Also verify from your OWN available-skills listing (not from disk):
  nuxt · vue · vueuse · shadcn-vue (if source uses shadcn) · pnpm (if pnpm workspaces)
Report only what is genuinely absent from that listing.`)

if (missing.length) {
  console.log('\nAsk the user whether to install before starting:')
  for (const [n, k] of missing) console.log(`  ${n} (${k})`)
  console.log('\nThe migration works without these; each removes a class of avoidable error.')
}
