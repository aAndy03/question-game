/**
 * The e2e build's data folders, and the only code that deletes them (P12.14).
 *
 * `org.questiongame.e2e` is an identity of its own (`tauri.e2e.conf.json`), so
 * its library, log and WebView2 profile sit beside — never inside — the
 * installed app's (`org.questiongame.desktop`) and the dev build's
 * (`org.questiongame.app`). Every path this module deletes is checked to *be*
 * that folder first; a wrong root fails loudly instead of emptying a show.
 */

import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

export const E2E_IDENTIFIER = 'org.questiongame.e2e'

/** What each spec's library is: `null` none (first run), `[]` the Demo, or the example's flags. */
const SEEDS: Readonly<Record<string, readonly string[] | null>> = {
  'first-run.e2e.ts': null,
  'show.e2e.ts': [],
  'load-refusal.e2e.ts': ['--broken-board'],
  'upgrade.e2e.ts': [],
  // Stable 1.1: the Demo and 120 more questions, a list longer than a page.
  'library-views.e2e.ts': ['--more-questions', '120'],
}

type Env = Readonly<Record<string, string | undefined>>

/** `%APPDATA%\org.questiongame.e2e` (library, log) and `%LOCALAPPDATA%\…` (WebView2 profile). */
export function e2eFolders(env: Env = process.env): [string, string] {
  const roaming = env.APPDATA
  const local = env.LOCALAPPDATA
  if (!roaming || !local) throw new Error('APPDATA and LOCALAPPDATA must be set: the e2e suite runs on Windows')
  return [path.join(roaming, E2E_IDENTIFIER), path.join(local, E2E_IDENTIFIER)]
}

/** Throw unless `folder` is, after normalising, a folder named for the e2e identity. */
export function assertE2eFolder(folder: string): void {
  const normal = path.normalize(folder)
  if (path.basename(normal) !== E2E_IDENTIFIER) {
    throw new Error(`refusing to touch ${folder}: not an ${E2E_IDENTIFIER} folder`)
  }
}

/** Empty both e2e folders, so every spec starts from nothing. */
export function resetE2eFolders(env: Env = process.env): void {
  for (const folder of e2eFolders(env)) {
    assertE2eFolder(folder)
    rmSync(folder, { recursive: true, force: true })
  }
  mkdirSync(e2eFolders(env)[0], { recursive: true })
}

/** Where the e2e build keeps its library. */
export function libraryFile(env: Env = process.env): string {
  return path.join(e2eFolders(env)[0], 'questiongame.sqlite3')
}

/** The `e2e_library` flags a spec's library is written with, or `null` for none. */
export function seedFor(spec: string): readonly string[] | null {
  const name = path.basename(spec.replace(/^file:\/\//, ''))
  if (!(name in SEEDS)) throw new Error(`${name}: add it to SEEDS in e2e/support/folders.ts`)
  return SEEDS[name] ?? null
}
