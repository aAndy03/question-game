#!/usr/bin/env node
/**
 * Pin a memory growth rate to a part of the app.
 *
 * Debug builds start WebView2 with `--remote-debugging-port=9222`
 * (`crates/app/src/windows.rs`). This attaches over the Chrome DevTools
 * Protocol, puts the app into one scenario, and measures the Studio (or
 * Stage) page for N seconds three ways:
 *
 *   1. counters under forced GC at the start, the end and in between —
 *      `Memory.getDOMCounters` (every DOM node the renderer holds, detached
 *      ones included, and JS event listeners) and `Runtime.getHeapUsage`;
 *   2. a heap snapshot at both ends, aggregated by `(type, constructor)` and
 *      diffed, so the answer is a row like `native:PerformanceMeasure Δ+691654`
 *      rather than a number;
 *   3. the working set of the host process and its WebView2 children, from
 *      the OS, which is the number Task Manager shows and the JS heap cannot.
 *
 * Scenarios differ in what is mounted and what is moving, so the rates
 * attribute: growth in `idle` but not `none` is the Play; growth in
 * `tick-away` is not the Control panels; growth on `stage` is not Studio.
 *
 *   node scripts/leak-probe.mjs none          90   # no Play, Teams tab
 *   node scripts/leak-probe.mjs idle          90   # Play loaded, Control open, nothing ticking
 *   node scripts/leak-probe.mjs tick-control  90   # countdown running, Control open
 *   node scripts/leak-probe.mjs tick-away     90   # countdown running, Control left for Teams
 *   node scripts/leak-probe.mjs stage         90   # countdown running, measured on the Stage window
 *
 * It drives the host through `__TAURI_INTERNALS__.invoke` on the Studio page
 * — the same commands the operator's clicks issue — and loads a Play with a
 * `probe-` id that it deletes on the way out. A Play already open is unloaded
 * first and kept. Found P11.4 (2026-09-09): 2.8 GB of `PerformanceMeasure`
 * entries from React's development build; see `docs/v1/04_ROADMAP.md`.
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const scenario = process.argv[2] ?? 'idle'
const seconds = Number(process.argv[3] ?? 90)
const port = Number(process.env.QUESTIONGAME_DEBUG_PORT ?? 9222)
const SCENARIOS = ['none', 'idle', 'tick-control', 'tick-away', 'stage']
if (!SCENARIOS.includes(scenario)) {
  console.error(`scenario must be one of ${SCENARIOS.join(', ')}`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Working set of the app's process tree, from the OS. Windows only. */
function processTree() {
  if (process.platform !== 'win32') return 'process tree: unavailable on this OS'
  const ps = [
    "$rows = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -or $_.Name -eq 'questiongame.exe' }",
    "foreach ($p in $rows) { $t = 'browser'; if ($p.Name -eq 'questiongame.exe') { $t = 'host' } elseif ($p.CommandLine -match '--type=([a-z-]+)') { $t = $matches[1] }",
    "'{0}|{1}|ws={2}MB' -f $p.ProcessId, $t, [math]::Round($p.WorkingSetSize / 1MB) }",
  ].join('; ')
  try {
    return execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .join('  ')
  } catch (e) {
    return `process tree? ${e.message.slice(0, 100)}`
  }
}

async function connect(match) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find((t) => t.type === 'page' && match(t.url))
  if (!page) throw new Error(`no page matched; targets: ${targets.map((t) => `${t.type} ${t.url}`).join(', ')}`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = no
  })
  let seq = 0
  const pending = new Map()
  const chunks = []
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.no(new Error(JSON.stringify(msg.error)))
      else p.ok(msg.result)
    } else if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk)
  }
  const call = (method, params = {}) => {
    const id = ++seq
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((ok, no) => pending.set(id, { ok, no }))
  }
  const ev = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500))
    return r.result.value
  }
  await call('Runtime.enable')
  await call('HeapProfiler.enable')
  const invoke = (name, args = {}) =>
    ev(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(name)}, ${JSON.stringify(args)}).catch(e => ({ __err: e }))`)

  async function snapshot() {
    chunks.length = 0
    await call('HeapProfiler.collectGarbage')
    await call('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    const text = chunks.join('')
    chunks.length = 0
    return summarize(JSON.parse(text))
  }

  async function counters(label) {
    await call('HeapProfiler.collectGarbage')
    await sleep(200)
    const heap = await call('Runtime.getHeapUsage')
    const dom = await call('Memory.getDOMCounters')
    const live = await ev(`({ els: document.getElementsByTagName('*').length, frames: document.getElementsByTagName('iframe').length })`)
    const row = {
      label,
      v8UsedMb: +(heap.usedSize / 1048576).toFixed(1),
      documents: dom.documents,
      domNodes: dom.nodes,
      listeners: dom.jsEventListeners,
      liveEls: live.els,
      iframes: live.frames,
    }
    console.log(JSON.stringify(row))
    console.log('   ' + processTree())
    return row
  }
  return { call, ev, invoke, snapshot, counters, url: page.url, close: () => ws.close() }
}

/** Count and self-size per (type, name); detached natives flagged. */
function summarize(snap) {
  const meta = snap.snapshot.meta
  const nf = meta.node_fields
  const types = meta.node_types[0]
  const { nodes, strings } = snap
  const stride = nf.length
  const iType = nf.indexOf('type')
  const iName = nf.indexOf('name')
  const iSize = nf.indexOf('self_size')
  const iDet = nf.indexOf('detachedness')
  const agg = new Map()
  let total = 0
  for (let i = 0; i < nodes.length; i += stride) {
    const type = types[nodes[i + iType]]
    let name = strings[nodes[i + iName]]
    if (['string', 'concatenated string', 'sliced string', 'code', 'closure', 'array', 'hidden', 'number', 'bigint'].includes(type)) name = `(${type})`
    else if (name.length > 60) name = name.slice(0, 60)
    const det = iDet >= 0 && nodes[i + iDet] === 2 ? ' [detached]' : ''
    const key = `${type}:${name}${det}`
    const size = nodes[i + iSize]
    total += size
    const a = agg.get(key) ?? { count: 0, size: 0 }
    a.count++
    a.size += size
    agg.set(key, a)
  }
  return { total, agg }
}

function diff(a, b, top = 20) {
  const rows = []
  for (const [key, vb] of b.agg) {
    const va = a.agg.get(key) ?? { count: 0, size: 0 }
    rows.push({ key, dCount: vb.count - va.count, dSize: vb.size - va.size, count: vb.count })
  }
  rows.sort((x, y) => y.dSize - x.dSize)
  console.log(`heap total: ${(a.total / 1048576).toFixed(1)}MB → ${(b.total / 1048576).toFixed(1)}MB (Δ ${((b.total - a.total) / 1048576).toFixed(1)}MB)`)
  console.log('top growth by self-size (Δcount, ΔKB, count now):')
  for (const r of rows.slice(0, top)) console.log(`  ${r.key.padEnd(58)} Δ${String(r.dCount).padStart(8)}  ${(r.dSize / 1024).toFixed(0).padStart(8)}KB  now ${r.count}`)
  return rows
}

// ------------------------------------------------------------------ drive

const studio = await connect((u) => u.includes('/studio/'))
const open = await studio.invoke('get_state')
if (open) {
  console.log(`unloading the open play ${open.playId} (${open.status})${open.playId.startsWith('probe-') ? ', discarding it' : ''}`)
  await studio.invoke('play_unload', { discard: open.playId.startsWith('probe-') })
  await sleep(500)
}

const clickNav = (label) =>
  studio.ev(
    `(() => { const el = [...document.querySelectorAll('a,button,[role=button],[role=tab],[role=link]')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!el) throw new Error('no nav item ' + ${JSON.stringify(label)}); el.click(); return true })()`,
  )

async function loadAndIssue({ timer }) {
  const recipes = await studio.invoke('recipe_list', { scope: 'active' })
  const recipe = recipes[0]
  if (!recipe) throw new Error('no recipe in the library')
  const fail = (name, r) => r?.__err && console.log(`${name}: ${r.__err.message ?? JSON.stringify(r.__err)}`)
  fail('play_load', await studio.invoke('play_load', { recipeId: recipe.id, playId: `probe-${Date.now()}` }))
  await sleep(1500)
  fail('play_start', await studio.invoke('play_start'))
  await sleep(1500)
  const s = await studio.invoke('get_state')
  const domain = s.domains.find((d) => !d.exhausted)
  fail('choose_domain', await studio.invoke('choose_domain', { domainId: domain.id }))
  await sleep(1500)
  if (timer) fail('start_timer', await studio.invoke('start_timer'))
}

let target = studio
if (scenario === 'none') {
  await clickNav('Teams')
  await sleep(1000)
} else {
  await clickNav('Control')
  await sleep(800)
  await loadAndIssue({ timer: scenario !== 'idle' })
  if (scenario === 'tick-away') {
    await clickNav('Teams')
    await sleep(1000)
  }
  if (scenario === 'stage') target = await connect((u) => u.includes('/stage/') && !u.includes('viewer'))
}

console.log(`scenario=${scenario} measuring ${target.url} for ${seconds}s`)
await sleep(3000)
const c0 = await target.counters('t0')
const s0 = await target.snapshot()
const step = Math.max(10, Math.min(30, seconds / 4))
const mids = []
for (let t = step; t < seconds; t += step) {
  await sleep(step * 1000)
  mids.push(await target.counters(`t${t}`))
}
await sleep(Math.max(0, seconds - mids.length * step) * 1000)
const c1 = await target.counters(`t${seconds}`)
const s1 = await target.snapshot()

console.log(`\n=== ${scenario}: ${seconds}s ===`)
for (const k of ['v8UsedMb', 'domNodes', 'listeners', 'liveEls']) {
  const d = c1[k] - c0[k]
  console.log(`  ${k}: ${c0[k]} → ${c1[k]} (Δ ${d.toFixed(1)}, ${((d / seconds) * 60).toFixed(1)}/min)`)
}
const rows = diff(s0, s1)
const out = `leak-probe-${scenario}.json`
writeFileSync(out, JSON.stringify({ scenario, seconds, c0, mids, c1, rows: rows.slice(0, 200) }, null, 1))
console.log(`written ${out}`)

if (scenario !== 'none') await studio.invoke('play_unload', { discard: true })
target.close()
if (target !== studio) studio.close()
