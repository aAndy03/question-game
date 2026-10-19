import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { E2E_IDENTIFIER, assertE2eFolder, e2eFolders, seedFor } from './folders'

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
