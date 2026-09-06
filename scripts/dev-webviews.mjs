/**
 * Start both Vite dev servers and keep them alive for `tauri dev`.
 *
 * The app has one dev **origin** (Studio, 5181) and two dev **servers**: Stage
 * runs on 5180 and Studio proxies `/stage` to it. That is what keeps both
 * webviews `local` to Tauri's ACL — an external URL is remote even on
 * localhost, and a remote webview is denied every command and `event.listen`.
 *
 * `tauri.conf.json` runs this as `beforeDevCommand`, so `npm run dev:app` is
 * the whole story. A plain `&` chain does not work on Windows, and neither
 * server should outlive the other, so this is twenty lines of Node instead of
 * a dependency.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Windows has no signals: TerminateProcess surfaces as 0xFFFFFFFF here. */
const TERMINATED = 4294967295

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Vite's own entry, run by this Node: no shell, no `.cmd` shim, one process to kill. */
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

// Vite directly rather than `npm run dev -w …`: closing the app terminates
// this whole tree, and an npm wrapper answers that by printing its own
// "Lifecycle script `dev` failed" block. There is nothing wrong to report —
// the window closed — so the wrapper is what goes.
const SERVERS = [
  { name: 'stage', cwd: join(ROOT, 'apps', 'stage'), port: '5180' },
  { name: 'studio', cwd: join(ROOT, 'apps', 'studio'), port: '5181' },
]

const children = SERVERS.map(({ name, cwd, port }) => {
  const child = spawn(process.execPath, [VITE, '--port', port, '--strictPort'], {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.on('exit', (code) => {
    // One server going down leaves the app half-served; take the rest with it
    // rather than leaving `tauri dev` pointed at a hole. Closing the app is
    // that same path, though: `tauri dev` ends this process tree, and a
    // terminated child reports TERMINATED (or no code at all) rather than 0.
    // Treating that as a crash is what printed an npm error every time the
    // window closed, so shutdown exits 0 and says so quietly.
    if (code === 0 || code === null || code === TERMINATED) {
      console.log(`[dev] ${name} stopped`)
      stop(0)
      return
    }
    console.error(`[dev] ${name} exited (${code})`)
    stop(code)
  })
  return child
})

let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(signal, () => stop(0))
