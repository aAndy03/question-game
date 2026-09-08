#!/usr/bin/env node
/**
 * Print the JavaScript stack of a webview — including one that has stopped
 * responding.
 *
 * Debug builds of the app start WebView2 with `--remote-debugging-port=9222`
 * (`crates/app/src/lib.rs`, `remote_debugging`). This attaches over the Chrome
 * DevTools Protocol, asks the debugger to pause, and prints every frame the
 * main thread is on. A pause is delivered as a V8 interrupt, so it lands even
 * while a synchronous loop is running — which is exactly when nothing else
 * (the console, a crumb, a commit) can tell you anything.
 *
 *   node scripts/js-stack.mjs                # the Studio webview, port 9222
 *   node scripts/js-stack.mjs stage          # a page whose URL contains "stage"
 *   node scripts/js-stack.mjs studio 9333    # another port
 *
 * Every target is listed first, so a wrong match is visible. The page is
 * resumed afterwards; if it was looping, it goes on looping.
 */

const match = process.argv[2] ?? 'studio'
const port = Number(process.argv[3] ?? process.env.QUESTIONGAME_DEBUG_PORT ?? 9222)

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
console.log(`targets on :${port}`)
for (const t of targets) console.log(`  ${t.type.padEnd(8)} ${t.url}`)
const page = targets.find((t) => t.type === 'page' && t.url.includes(match))
if (!page) {
  console.error(`no page target matching "${match}"`)
  process.exit(1)
}
console.log(`\nattaching to ${page.url}`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((ok, no) => {
  ws.onopen = ok
  ws.onerror = no
})

let seq = 0
const pending = new Map()
const events = []
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data)
  if (msg.id !== undefined) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) p.no(new Error(JSON.stringify(msg.error)))
    else p.ok(msg.result)
  } else {
    events.push(msg)
    if (msg.method === 'Debugger.paused') onPaused(msg.params)
  }
}
function call(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((ok, no) => pending.set(id, { ok, no }))
}

let paused = null
const gotPause = new Promise((ok) => (paused = ok))
function onPaused({ callFrames, reason }) {
  console.log(`\npaused (${reason}) — ${callFrames.length} frames, innermost first:\n`)
  for (const f of callFrames) {
    const { url, lineNumber, columnNumber } = f.location
    const where = `${(url || '<anon>').replace(/^https?:\/\/[^/]+/, '')}:${lineNumber + 1}:${columnNumber + 1}`
    console.log(`  ${(f.functionName || '(anonymous)').padEnd(40)} ${where}`)
  }
  paused()
}

// `Debugger.enable` can itself wait on a busy page; `pause` is the interrupt.
// Send both without awaiting the first, then wait for the pause event.
void call('Debugger.enable').catch(() => {})
void call('Debugger.pause').catch(() => {})
const timeout = new Promise((_, no) => setTimeout(() => no(new Error('no pause within 15 s')), 15_000))
try {
  await Promise.race([gotPause, timeout])
} catch (e) {
  console.error(String(e))
  console.error('the renderer did not answer the interrupt — a hang below JavaScript (layout, style, GC)')
  process.exit(2)
}
await call('Debugger.resume').catch(() => {})
ws.close()
