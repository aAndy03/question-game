import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { E2E_IDENTIFIER, STABLE_FIXTURE, assertE2eFolder, assertStableFixture, channelFor, e2eFolders, launchEnv, lookSeed, seedFor, stableFixtureDir } from './folders'

/**
 * P12.14. The suite deletes and rewrites an app's data folder before every
 * spec. The one thing it must never do is point that at a folder a show
 * lives in.
 */
describe('the e2e folders', () => {
  it('are the e2e identity under both app-data roots, and nothing else', () => {
    const folders = e2eFolders({ APPDATA: 'C:\\Roaming', LOCALAPPDATA: 'C:\\Local' })
    expect(folders).toEqual([path.join('C:\\Roaming', E2E_IDENTIFIER), path.join('C:\\Local', E2E_IDENTIFIER)])
  })

  it('refuses to be computed without the roots', () => {
    expect(() => e2eFolders({})).toThrow(/APPDATA/)
  })

  it('refuses any folder that is not the e2e identity', () => {
    for (const folder of [
      'C:\\Roaming\\org.questiongame.desktop',
      'C:\\Roaming\\org.questiongame.app',
      'C:\\Roaming',
      'C:\\Roaming\\org.questiongame.e2e\\..\\org.questiongame.desktop',
    ]) {
      expect(() => assertE2eFolder(folder), folder).toThrow()
    }
    expect(() => assertE2eFolder(path.join('C:\\Roaming', E2E_IDENTIFIER))).not.toThrow()
  })

  it('seeds each spec with the library it needs', () => {
    expect(seedFor('/x/e2e/specs/first-run.e2e.ts')).toBeNull()
    expect(seedFor('file:///x/e2e/specs/show.e2e.ts')).toEqual([])
    expect(seedFor('/x/e2e/specs/load-refusal.e2e.ts')).toEqual(['--broken-board'])
    expect(seedFor('/x/e2e/specs/upgrade.e2e.ts')).toEqual([])
    expect(() => seedFor('/x/e2e/specs/unknown.e2e.ts')).toThrow(/unknown\.e2e\.ts/)
  })
})

/**
 * P13.1. The Beta specs copy from a "stable library" the suite writes into a
 * temp folder of its own — never a real one.
 */
describe('the stable fixture', () => {
  it('is one named folder directly under the temp folder', () => {
    expect(stableFixtureDir('C:\\Temp')).toBe(path.join('C:\\Temp', STABLE_FIXTURE))
    expect(() => assertStableFixture(path.join('C:\\Temp', STABLE_FIXTURE), 'C:\\Temp')).not.toThrow()
  })

  it('refuses anything else, the real stable folder above all', () => {
    for (const folder of [
      'C:\\Roaming\\org.questiongame.desktop',
      'C:\\Temp\\org.questiongame.desktop',
      'C:\\Temp\\other',
      'C:\\Temp',
      `C:\\Temp\\${STABLE_FIXTURE}\\..\\x`,
      `C:\\Elsewhere\\${STABLE_FIXTURE}`,
    ]) {
      expect(() => assertStableFixture(folder, 'C:\\Temp'), folder).toThrow()
    }
  })

  it('names what each Beta spec copies from, and refuses a Beta spec it does not know', () => {
    expect(channelFor('/x/e2e/specs/show.e2e.ts')).toBeNull()
    expect(channelFor('/x/e2e/specs/beta-copy.e2e.ts')).toEqual({ channel: 'beta', stable: 'demo' })
    expect(channelFor('/x/e2e/specs/beta-no-stable.e2e.ts')).toEqual({ channel: 'beta', stable: 'none' })
    expect(channelFor('/x/e2e/specs/beta-stable-running.e2e.ts')).toEqual({ channel: 'beta', stable: 'running' })
    expect(channelFor('/x/e2e/specs/beta-corrupt.e2e.ts')).toEqual({ channel: 'beta', stable: 'garbage' })
    expect(() => channelFor('/x/e2e/specs/beta-unknown.e2e.ts')).toThrow(/CHANNELS/)
    for (const spec of ['beta-start-empty', 'beta-copy', 'beta-no-stable', 'beta-stable-running', 'beta-corrupt']) {
      expect(seedFor(`/x/e2e/specs/${spec}.e2e.ts`), spec).toBeNull()
    }
  })

  it('leaves the stable specs on the stable channel, whatever the shell has set', () => {
    const env = launchEnv(null, 'C:\\Temp\\fixture', { QUESTIONGAME_E2E_CHANNEL: 'beta', QUESTIONGAME_E2E_STABLE_DIR: 'C:\\x', PATH: 'p' })
    expect(env.QUESTIONGAME_E2E_CHANNEL).toBeUndefined()
    expect(env.QUESTIONGAME_E2E_STABLE_DIR).toBeUndefined()
    expect(env.PATH).toBe('p')
    const beta = launchEnv({ channel: 'beta', stable: 'demo' }, 'C:\\Temp\\fixture', { PATH: 'p' })
    expect(beta).toMatchObject({ QUESTIONGAME_E2E_CHANNEL: 'beta', QUESTIONGAME_E2E_STABLE_DIR: 'C:\\Temp\\fixture', PATH: 'p' })
  })
})

describe('the look spec’s library (P20)', () => {
  it('is nothing until it is told where a library is, and the spec skips', () => {
    expect(seedFor('/x/e2e/specs/look.e2e.ts', {})).toBeNull()
    expect(lookSeed({})).toBeNull()
  })

  it('is a snapshot of that library with Plays simulated on the copy', () => {
    const source = 'C:\\Users\\me\\AppData\\Roaming\\org.questiongame.beta\\questiongame.sqlite3'
    expect(seedFor('/x/e2e/specs/look.e2e.ts', { E2E_LOOK_LIBRARY: source })).toEqual(['--copy-from', `"${source}"`, '--simulate-plays', '6'])
    expect(lookSeed({ E2E_LOOK_LIBRARY: source, E2E_LOOK_PLAYS: '2' })?.at(-1)).toBe('2')
  })

  it('refuses a library inside a live data folder: it reads a copy', () => {
    for (const source of [
      'C:\\Roaming\\org.questiongame.desktop\\questiongame.sqlite3',
      'C:\\Roaming\\org.questiongame.app\\questiongame.sqlite3',
      'C:\\Roaming\\org.questiongame.e2e\\..\\org.questiongame.desktop\\questiongame.sqlite3',
    ]) {
      expect(() => lookSeed({ E2E_LOOK_LIBRARY: source }), source).toThrow(/live library/)
    }
  })
})
