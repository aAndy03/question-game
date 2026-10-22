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
import os from 'node:os'
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
  // Beta 2.0: the Demo, as 1.x left it; it moves into a workspace the spec names.
  'workspaces.e2e.ts': [],
  // P15: the Demo, as 1.x left it.
  'groups-tags.e2e.ts': [],
  // 1.1.1: Studio at 1100 px.
  'narrow.e2e.ts': [],
  // beta.4: the Game page's pickers, its menu and the Games bulk bar.
  'games.e2e.ts': [],
  // beta.5: Duplicate here, Manage workspaces as a list.
  'beta5.e2e.ts': [],
  // beta.2: a library beta.1 left, with shared rows; migration 6 makes them copies.
  'upgrade-shared.e2e.ts': ['--beta1-shared'],
  // questiongame Beta's first launch (P13.1): its own library starts empty.
  'beta-start-empty.e2e.ts': null,
  'beta-copy.e2e.ts': null,
  'beta-no-stable.e2e.ts': null,
  'beta-stable-running.e2e.ts': null,
  'beta-corrupt.e2e.ts': null,
}

/**
 * The Beta specs (P13.1): the e2e build plays questiongame Beta
 * (`QUESTIONGAME_E2E_CHANNEL=beta`) and finds its "stable library" in a temp
 * folder of the suite's own (`QUESTIONGAME_E2E_STABLE_DIR`), never a real one.
 * `stable` is what that folder holds: the Demo, nothing, the Demo with a
 * running stable app holding its lock, or bytes that are not a library.
 */
export interface ChannelSetup {
  readonly channel: 'beta'
  readonly stable: 'demo' | 'none' | 'running' | 'garbage'
}

const CHANNELS: Readonly<Record<string, ChannelSetup>> = {
  'beta-start-empty.e2e.ts': { channel: 'beta', stable: 'demo' },
  'beta-copy.e2e.ts': { channel: 'beta', stable: 'demo' },
  'beta-no-stable.e2e.ts': { channel: 'beta', stable: 'none' },
  'beta-stable-running.e2e.ts': { channel: 'beta', stable: 'running' },
  'beta-corrupt.e2e.ts': { channel: 'beta', stable: 'garbage' },
}

/** The temp folder the Beta specs copy from. */
export const STABLE_FIXTURE = 'questiongame-e2e-stable'

export function stableFixtureDir(tmp: string = os.tmpdir()): string {
  return path.join(tmp, STABLE_FIXTURE)
}

/** Throw unless `folder` is exactly `<tmp>/questiongame-e2e-stable`. */
export function assertStableFixture(folder: string, tmp: string = os.tmpdir()): void {
  if (path.normalize(folder) !== path.normalize(stableFixtureDir(tmp)) || folder.split(/[\\/]/).includes('..')) {
    throw new Error(`refusing to touch ${folder}: not the stable fixture ${stableFixtureDir(tmp)}`)
  }
}

/** Empty the stable fixture, so every Beta spec starts from nothing. */
export function resetStableFixture(): string {
  const folder = stableFixtureDir()
  assertStableFixture(folder)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  return folder
}

/** What a spec plays: `null` is questiongame (stable), as every spec before P13.1. */
export function channelFor(spec: string): ChannelSetup | null {
  const name = path.basename(spec.replace(/^file:\/\//, ''))
  const setup = CHANNELS[name]
  if (setup === undefined && name.startsWith('beta-')) throw new Error(`${name}: add it to CHANNELS in e2e/support/folders.ts`)
  return setup ?? null
}

/**
 * The environment `tauri-driver` (and so the app) starts with. Both variables
 * are always set or always removed, so a value left in the shell can never
 * turn a stable spec into a Beta one.
 */
export function launchEnv(setup: ChannelSetup | null, fixture: string, env: Env = process.env): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env }
  delete out.QUESTIONGAME_E2E_CHANNEL
  delete out.QUESTIONGAME_E2E_STABLE_DIR
  if (setup !== null) {
    out.QUESTIONGAME_E2E_CHANNEL = setup.channel
    out.QUESTIONGAME_E2E_STABLE_DIR = fixture
  }
  return out
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
export function seedFor(spec: string, env: Env = process.env): readonly string[] | null {
  const name = path.basename(spec.replace(/^file:\/\//, ''))
  if (name === LOOK_SPEC) return lookSeed(env)
  if (!(name in SEEDS)) throw new Error(`${name}: add it to SEEDS in e2e/support/folders.ts`)
  return SEEDS[name] ?? null
}

/** P20's photographs of Studio over a real library; it runs only when told where one is. */
export const LOOK_SPEC = 'look.e2e.ts'

/** The installed app's and the dev build's libraries: shows live there. */
const LIVE_FOLDERS = ['org.questiongame.desktop', 'org.questiongame.app']

/**
 * The look spec's library: a snapshot of `E2E_LOOK_LIBRARY` (read-only,
 * `VACUUM INTO`) with `E2E_LOOK_PLAYS` Plays (default 6) simulated on the
 * copy, so Statistics has something to draw — or `null` when the variable is
 * unset, and the spec skips. A file inside a live data folder is refused:
 * copy it out first (CLAUDE.md: read them on a copy).
 */
export function lookSeed(env: Env = process.env): readonly string[] | null {
  const source = env.E2E_LOOK_LIBRARY
  if (!source) return null
  const parts = path.normalize(source).split(/[\\/]/)
  const live = LIVE_FOLDERS.find((id) => parts.includes(id))
  if (live) throw new Error(`refusing to read ${source} in place: ${live} holds a live library — copy it somewhere else first`)
  return ['--copy-from', `"${source}"`, '--simulate-plays', env.E2E_LOOK_PLAYS ?? '6']
}
