#!/usr/bin/env node
// Record HTTP contract fixtures against the original server, replay them against the new one.
// No dependencies. Node >= 18.
//
//   node fixtures.mjs record <manifest.json> <baseUrl>   # run against the OLD server, commit output
//   node fixtures.mjs replay <manifest.json> <baseUrl>   # run against the NEW server, exit 1 on drift
//
// manifest.json:
// {
//   "group": "projects",
//   "dir": "tests/fixtures/projects",
//   "volatile": ["id", "createdAt", "updatedAt", "*.token"],   // compared for presence+type, not value
//   "headers": { "cookie": "$SESSION" },                       // $NAME reads process.env.NAME
//   "requests": [
//     { "name": "list",        "method": "GET",  "path": "/api/projects" },
//     { "name": "list-unauth", "method": "GET",  "path": "/api/projects", "headers": {} },
//     { "name": "create",      "method": "POST", "path": "/api/projects", "body": { "name": "x" } },
//     { "name": "missing",     "method": "GET",  "path": "/api/projects/does-not-exist" }
//   ]
// }
//
// Include the 4xx cases. The error envelope is the most commonly broken thing in a port.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const [mode, manifestPath, baseUrl] = process.argv.slice(2)
if (!['record', 'replay'].includes(mode) || !manifestPath || !baseUrl) {
  console.error('usage: fixtures.mjs record|replay <manifest.json> <baseUrl>')
  process.exit(2)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const dir = manifest.dir ?? `tests/fixtures/${manifest.group ?? 'default'}`
const volatile = manifest.volatile ?? []
// Compared exactly. Everything else varies legitimately between two servers (date, server, etag,
// content-length, keep-alive) and asserting on it produces noise that gets the whole check disabled.
const CHECKED_HEADERS = manifest.checkedHeaders ?? ['content-type', 'location', 'set-cookie']

const expandEnv = (o = {}) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === 'string' && v.startsWith('$') ? (process.env[v.slice(1)] ?? '') : v,
    ]),
  )

async function send(req) {
  const headers = { ...expandEnv(manifest.headers), ...expandEnv(req.headers ?? {}) }
  if (req.body !== undefined) headers['content-type'] ??= 'application/json'
  const res = await fetch(new URL(req.path, baseUrl), {
    method: req.method ?? 'GET',
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    redirect: 'manual',
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  const picked = {}
  for (const h of CHECKED_HEADERS) {
    // getSetCookie keeps multiplicity — two Set-Cookie headers is a contract detail, not a detail.
    const v = h === 'set-cookie' ? res.headers.getSetCookie?.() : res.headers.get(h)
    if (v != null && (!Array.isArray(v) || v.length)) picked[h] = v
  }
  return { status: res.status, headers: picked, body }
}

const isVolatile = (path) =>
  volatile.some((p) => p === path || (p.startsWith('*.') && path.endsWith(p.slice(1))))

// Shape-first comparison: key sets, types, array lengths, and the values of non-volatile leaves.
// A renamed key, a dropped field, a number-turned-string, and a null-turned-absent all fail here.
function diff(expected, actual, path = '', out = []) {
  const te = expected === null ? 'null' : Array.isArray(expected) ? 'array' : typeof expected
  const ta = actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual
  if (te !== ta) {
    out.push(`${path || '(root)'}: type ${te} -> ${ta}`)
    return out
  }
  if (te === 'array') {
    if (expected.length !== actual.length) out.push(`${path}: length ${expected.length} -> ${actual.length}`)
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff(expected[i], actual[i], `${path}[${i}]`, out)
    return out
  }
  if (te === 'object') {
    const ke = Object.keys(expected).sort()
    const ka = Object.keys(actual).sort()
    for (const k of ke) if (!ka.includes(k)) out.push(`${path}.${k}: MISSING in new response`)
    for (const k of ka) if (!ke.includes(k)) out.push(`${path}.${k}: UNEXPECTED in new response`)
    for (const k of ke) if (ka.includes(k)) diff(expected[k], actual[k], `${path}.${k}`, out)
    return out
  }
  const leaf = path.replace(/\[\d+\]/g, '').replace(/^\./, '')
  if (!isVolatile(leaf) && expected !== actual) {
    out.push(`${path}: ${JSON.stringify(expected)} -> ${JSON.stringify(actual)}`)
  }
  return out
}

if (mode === 'record') {
  await mkdir(dir, { recursive: true })
  for (const req of manifest.requests) {
    const got = await send(req)
    await writeFile(join(dir, `${req.name}.json`), JSON.stringify({ req, ...got }, null, 2) + '\n')
    console.log(`recorded ${req.name}  ${got.status}`)
  }
  console.log(`\n${manifest.requests.length} fixtures -> ${dir}`)
  console.log('Commit these. Never edit one to make a test pass.')
  process.exit(0)
}

const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))
if (!files.length) {
  console.error(`no fixtures in ${dir} — record against the ORIGINAL server first`)
  process.exit(2)
}

let failed = 0
for (const f of files.sort()) {
  const fx = JSON.parse(await readFile(join(dir, f), 'utf8'))
  const got = await send(fx.req)
  const deltas = []
  if (fx.status !== got.status) deltas.push(`status ${fx.status} -> ${got.status}`)
  for (const h of CHECKED_HEADERS) {
    const a = JSON.stringify(fx.headers[h] ?? null)
    const b = JSON.stringify(got.headers[h] ?? null)
    if (a !== b) deltas.push(`header ${h}: ${a} -> ${b}`)
  }
  deltas.push(...diff(fx.body, got.body))
  if (deltas.length) {
    failed++
    console.log(`\nFAIL ${fx.req.name}  (${fx.req.method ?? 'GET'} ${fx.req.path})`)
    for (const d of deltas) console.log(`  ${d}`)
  } else {
    console.log(`pass ${fx.req.name}`)
  }
}

console.log(`\n${files.length - failed}/${files.length} passed`)
if (failed) {
  console.log('Fix the port, not the fixture. If the new behavior is genuinely correct,')
  console.log('re-record in a separate Pass-2 commit that says so.')
}
process.exit(failed ? 1 : 0)
