/**
 * The end-to-end suite (P12.14): WebdriverIO driving the real app through
 * `tauri-driver` and the WebView2 driver. Windows only — there is no
 * WebDriver for macOS's WKWebView.
 *
 * It drives the **e2e build** (`npm run e2e:build`, identity
 * `org.questiongame.e2e`), so its library, log and WebView2 profile live in
 * folders no show lives in. Each spec starts from a reset folder and,
 * when it names one, a seeded library.
 *
 *   npm run e2e            build, then run every spec
 *   E2E_SKIP_BUILD=1 …     reuse target/debug/questiongame.exe
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { browser } from '@wdio/globals'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_IDENTIFIER, channelFor, launchEnv, libraryFile, resetE2eFolders, resetStableFixture, seedFor, stableFixtureDir } from './support/folders'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const application = path.join(root, 'target', 'debug', 'questiongame.exe')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')

let driver: ChildProcess | null = null
/** A stable app's lock, held for `beta-stable-running` (P13.1). */
let holder: ChildProcess | null = null
let realFolders: Record<string, string[]> = {}

/**
 * The names in the installed and dev apps' folders — read, never written. A
 * running app rewrites its log, perf log and SQLite sidecars on its own, so
 * those are left out; anything else appearing or vanishing is the suite's doing.
 */
function snapshotRealFolders(): Record<string, string[]> {
  const volatile = /(-wal|-shm|\.log(\.\d+)?|^perf)$/
  const out: Record<string, string[]> = {}
  for (const id of ['org.questiongame.desktop', 'org.questiongame.app']) {
    const dir = path.join(process.env.APPDATA ?? '', id)
    if (!existsSync(dir)) continue
    out[id] = readdirSync(dir).filter((n) => !volatile.test(n)).sort()
    // A copy written to the wrong folder would land in `backups/` first.
    const backups = path.join(dir, 'backups')
    if (existsSync(backups)) out[`${id}/backups`] = readdirSync(backups).sort()
  }
  return out
}

function run(command: string, args: readonly string[]): void {
  // WebdriverIO sets NODE_ENV for its own process; a Vite build that inherits
  // it compiles the webviews' dev-only code in, and the release check then
  // refuses the build. The app under test is built as a release is.
  const env = { ...process.env }
  delete env.NODE_ENV
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true, env })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`)
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  specs: ['./specs/**/*.e2e.ts'],
  // One app, one data folder: the specs never run side by side.
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': { application },
    } as WebdriverIO.Capabilities,
  ],
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  waitforTimeout: 15_000,

  onPrepare() {
    if (process.env.E2E_SKIP_BUILD !== '1') run('npm', ['run', 'e2e:build'])
    if (!existsSync(application)) throw new Error(`no e2e build at ${application}: run npm run e2e:build`)
    // The Beta specs play a running stable app with this (P13.1).
    run('cargo', ['build', '-q', '-p', 'questiongame-app', '--example', 'hold_lock'])
    realFolders = snapshotRealFolders()
  },

  onComplete() {
    // E2E12: the installed and dev libraries' folders hold the same names as
    // before the run. Read only; the files a running app rewrites are left out.
    const after = snapshotRealFolders()
    if (JSON.stringify(after) !== JSON.stringify(realFolders)) {
      // An error thrown here is logged and the run still exits 0; exiting is
      // what makes the guard a failure rather than a remark (review).
      console.error(`a real data folder changed during the e2e run:\n${JSON.stringify(realFolders)}\n${JSON.stringify(after)}`)
      process.exit(1)
    }
  },

  async beforeSession(_config, _capabilities, specs) {
    // The folders of `org.questiongame.e2e` and nothing else; `resetE2eFolders`
    // refuses any other name.
    resetE2eFolders()
    const spec = specs[0] ?? ''
    const seed = seedFor(spec)
    if (seed !== null) {
      run('cargo', ['run', '-q', '-p', 'questiongame-host', '--example', 'e2e_library', '--', `"${libraryFile()}"`, ...seed])
    }
    const setup = channelFor(spec)
    const fixture = stableFixtureDir()
    if (setup !== null) {
      resetStableFixture()
      if (setup.stable === 'demo' || setup.stable === 'running') {
        run('cargo', ['run', '-q', '-p', 'questiongame-host', '--example', 'e2e_library', '--', `"${path.join(fixture, 'questiongame.sqlite3')}"`])
      }
      if (setup.stable === 'garbage') writeFileSync(path.join(fixture, 'questiongame.sqlite3'), Buffer.alloc(8192, 0x5a))
      if (setup.stable === 'running') {
        // The app must find the lock already held: wait for the holder to say so.
        const child = spawn(path.join(root, 'target', 'debug', 'examples', 'hold_lock.exe'), [fixture], { stdio: ['ignore', 'pipe', 'inherit'] })
        holder = child
        await new Promise<void>((ok, no) => {
          child.stdout?.on('data', (chunk: Buffer) => {
            if (chunk.toString().includes('held')) ok()
          })
          child.once('exit', (code) => no(new Error(`hold_lock exited ${code} before holding the lock`)))
          setTimeout(() => no(new Error('hold_lock did not hold the lock within 10 s')), 10_000)
        })
      }
    }
    const nativeDriver = path.join(cargoBin, 'msedgedriver.exe')
    driver = spawn(path.join(cargoBin, 'tauri-driver.exe'), existsSync(nativeDriver) ? ['--native-driver', nativeDriver] : [], {
      stdio: [null, process.stdout, process.stderr],
      env: launchEnv(setup, fixture) as NodeJS.ProcessEnv,
    })
  },

  async afterTest(test, _context, { passed }) {
    if (passed) return
    // What the app looked like when a step failed: in CI, an uploaded artifact.
    const dir = path.join(root, 'e2e', '.artifacts')
    mkdirSync(dir, { recursive: true })
    const name = test.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    await browser.saveScreenshot(path.join(dir, `${name}.png`))
    writeFileSync(path.join(dir, `${name}.html`), await browser.getPageSource())
  },

  async afterSession() {
    driver?.kill()
    driver = null
    // Gone before the next session deletes the fixture: on Windows a dying
    // process can still hold a handle on it (review).
    const child = holder
    holder = null
    if (child !== null && child.exitCode === null) {
      const exited = new Promise((ok) => child.once('exit', ok))
      child.kill()
      await exited
    }
  },
}

export { E2E_IDENTIFIER }
