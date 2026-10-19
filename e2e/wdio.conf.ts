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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { browser } from '@wdio/globals'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_IDENTIFIER, libraryFile, resetE2eFolders, seedFor } from './support/folders'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const application = path.join(root, 'target', 'debug', 'questiongame.exe')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')

let driver: ChildProcess | null = null

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
  },

  beforeSession(_config, _capabilities, specs) {
    // The folders of `org.questiongame.e2e` and nothing else; `resetE2eFolders`
    // refuses any other name.
    resetE2eFolders()
    const seed = seedFor(specs[0] ?? '')
    if (seed !== null) {
      run('cargo', ['run', '-q', '-p', 'questiongame-host', '--example', 'e2e_library', '--', `"${libraryFile()}"`, ...seed])
    }
    const nativeDriver = path.join(cargoBin, 'msedgedriver.exe')
    driver = spawn(path.join(cargoBin, 'tauri-driver.exe'), existsSync(nativeDriver) ? ['--native-driver', nativeDriver] : [], {
      stdio: [null, process.stdout, process.stderr],
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

  afterSession() {
    driver?.kill()
    driver = null
  },
}

export { E2E_IDENTIFIER }
