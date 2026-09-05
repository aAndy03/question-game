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

const SERVERS = [
  { name: 'stage', script: 'dev:stage' },
  { name: 'studio', script: 'dev:studio' },
]

const children = SERVERS.map(({ name, script }) => {
  const child = spawn('npm', ['run', script], {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true,
  })
  child.on('exit', (code) => {
    // One server going down leaves the app half-served; take the rest with it
    // rather than leaving `tauri dev` pointed at a hole.
    console.error(`[dev] ${name} exited (${code})`)
    stop(code ?? 1)
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

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
