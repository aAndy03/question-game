import { describe, expect, it } from 'vitest'
import { route } from './release-route'
import { checkPreconditions, nextVersion, rewriteBundleTest, rewriteCargoVersion, rewriteJsonVersion } from './version'

const refused = (x: unknown) => typeof x === 'object' && x !== null && 'refused' in x

describe('the next version (BUMP01–BUMP06)', () => {
  it('bumps stable by patch, minor or major, patch by default', () => {
    expect(nextVersion('1.0.2', 'stable', {})).toBe('1.0.3')
    expect(nextVersion('1.0.2', 'stable', { bump: 'patch' })).toBe('1.0.3')
    expect(nextVersion('1.0.2', 'stable', { bump: 'minor' })).toBe('1.1.0')
    expect(nextVersion('1.0.2', 'stable', { bump: 'major' })).toBe('2.0.0')
  })

  it('refuses a bump it does not know, naming the three', () => {
    const r = nextVersion('1.0.2', 'stable', { bump: 'huge' as never })
    expect(r).toEqual({ refused: expect.stringMatching(/patch.*minor.*major/) })
  })

  it('refuses a stable bump from a prerelease', () => {
    expect(refused(nextVersion('2.0.0-beta.0', 'stable', {}))).toBe(true)
  })

  it('counts betas as numbers', () => {
    expect(nextVersion('2.0.0-beta.0', 'beta', {})).toBe('2.0.0-beta.1')
    expect(nextVersion('2.0.0-beta.9', 'beta', {})).toBe('2.0.0-beta.10')
  })

  it('moves a stable base to its first beta only when told where to (BUMP06)', () => {
    const r = nextVersion('1.0.2', 'beta', {})
    expect(r).toEqual({ refused: expect.stringContaining('--start') })
    expect(nextVersion('1.0.2', 'beta', { start: '2.0.0' })).toBe('2.0.0-beta.0')
    expect(refused(nextVersion('1.0.2', 'beta', { start: '1.0.1' }))).toBe(true)
    expect(refused(nextVersion('1.0.2', 'beta', { start: '1.0.2' }))).toBe(true)
    expect(refused(nextVersion('1.0.2', 'beta', { start: 'nope' }))).toBe(true)
    expect(refused(nextVersion('1.0.2', 'beta', { start: '2.0.0-beta.1' }))).toBe(true)
    expect(refused(nextVersion('2.0.0-beta.3', 'beta', { start: '3.0.0' }))).toBe(true)
  })

  it('refuses what is not a beta base, each with its own reason (BUMP05)', () => {
    const reasons = ['2.0.0', '2.0.0-rc.1', '2.0.0-beta', 'garbage'].map((v) => {
      const r = nextVersion(v, 'beta', {})
      expect(refused(r), v).toBe(true)
      return (r as { refused: string }).refused
    })
    expect(new Set(reasons.slice(1)).size).toBe(3)
  })

  it('always lands on a version the release route accepts (BUMP20)', () => {
    for (const v of ['0.0.0', '1.0.2', '1.9.99', '10.20.30']) {
      for (const bump of ['patch', 'minor', 'major'] as const) {
        const next = nextVersion(v, 'stable', { bump }) as string
        expect(route({ ref: `refs/tags/v${next}`, refName: `v${next}`, version: next })).toMatchObject({ channel: 'stable' })
      }
    }
    for (const n of [0, 1, 9, 99]) {
      const next = nextVersion(`2.0.0-beta.${n}`, 'beta', {}) as string
      expect(route({ ref: `refs/tags/v${next}`, refName: `v${next}`, version: next })).toMatchObject({ channel: 'beta' })
    }
  })
})

describe('when a bump may run (BUMP07–BUMP09)', () => {
  const ok = { line: 'stable' as const, branch: 'release/1.x', dirty: false, target: '1.0.3', whatsNewVersions: ['1.0.3', '1.0.2'] }

  it('passes a clean tree on the right branch with notes', () => {
    expect(checkPreconditions(ok)).toBeNull()
    expect(checkPreconditions({ ...ok, line: 'beta', branch: 'main', target: '2.0.0-beta.1', whatsNewVersions: ['2.0.0-beta.1'] })).toBeNull()
  })

  it('refuses the wrong branch each way', () => {
    for (const branch of ['main', 'feature/x', 'HEAD', 'release/1.xy']) {
      expect(checkPreconditions({ ...ok, branch })).toMatch(/release\/1\.x/)
    }
    expect(checkPreconditions({ ...ok, line: 'beta', branch: 'release/1.x', target: '2.0.0-beta.1', whatsNewVersions: ['2.0.0-beta.1'] })).toMatch(/main/)
  })

  it('refuses a dirty tree and a release without notes, each saying which', () => {
    const dirty = checkPreconditions({ ...ok, dirty: true })
    const notes = checkPreconditions({ ...ok, whatsNewVersions: ['1.0.2'] })
    expect(dirty).toMatch(/uncommitted/)
    expect(notes).toMatch(/What.s new/)
    expect(dirty).not.toBe(notes)
  })

  it('lets the unpublished first beta go without notes', () => {
    expect(checkPreconditions({ ...ok, line: 'beta', branch: 'main', target: '2.0.0-beta.0', whatsNewVersions: [] })).toBeNull()
  })
})

describe('rewriting the version files (BUMP12–BUMP14)', () => {
  it('changes only the workspace package version in Cargo.toml', () => {
    const toml = '[workspace]\nmembers = ["a"]\n\n[workspace.package]\nedition = "2024"\nversion = "1.0.2"\n\n[workspace.dependencies]\nserde = "1.0.2"\nversion-x = { version = "1.0.2" }\n'
    expect(rewriteCargoVersion(toml, '1.0.3')).toBe(toml.replace('version = "1.0.2"\n\n[workspace.dependencies]', 'version = "1.0.3"\n\n[workspace.dependencies]'))
    expect(() => rewriteCargoVersion('[package]\nversion = "1.0.2"\n', '1.0.3')).toThrow(/workspace.package/)
  })

  it('keeps CRLF line endings and indentation', () => {
    const toml = '[workspace.package]\r\n  version = "1.0.2"\r\nserde = "1.0.2"\r\n'
    expect(rewriteCargoVersion(toml, '1.1.0')).toBe('[workspace.package]\r\n  version = "1.1.0"\r\nserde = "1.0.2"\r\n')
  })

  it('changes the top-level JSON version and nothing else', () => {
    const json = '{\n  "name": "x",\n  "version": "1.0.2",\n  "devDependencies": {\n    "y": "1.0.2"\n  }\n}\n'
    expect(rewriteJsonVersion(json, '1.0.3')).toBe(json.replace('"version": "1.0.2"', '"version": "1.0.3"'))
    expect(() => rewriteJsonVersion('{"name":"x"}', '1.0.3')).toThrow(/version/)
  })

  it('changes the bundle test\'s expected version, and refuses when the line is gone', () => {
    const src = 'fn one() {\n    let version = workspace_version();\n    assert_eq!(version, "1.0.2");\n}\n'
    expect(rewriteBundleTest(src, '1.0.3')).toBe(src.replace('"1.0.2"', '"1.0.3"'))
    expect(() => rewriteBundleTest('fn one() {}\n', '1.0.3')).toThrow(/bundle/)
  })
})
