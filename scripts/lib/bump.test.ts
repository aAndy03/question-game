import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bump, VERSION_FILES, type BumpOptions } from './bump'

/** A throwaway repository holding the four version files, and a bare remote. */
let root: string
let remote: string

const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  writeFileSync(path.join(root, rel), text)
}
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function seed(version: string, branch: string) {
  write(VERSION_FILES.cargo, `[workspace]\nmembers = []\n\n[workspace.package]\nversion = "${version}"\n\n[workspace.dependencies]\nserde = "${version}"\n`)
  write(VERSION_FILES.tauri, `{\n  "productName": "questiongame",\n  "version": "${version}"\n}\n`)
  write(VERSION_FILES.npm, `{\n  "name": "questiongame",\n  "version": "${version}",\n  "dependencies": { "x": "${version}" }\n}\n`)
  write(VERSION_FILES.bundleTest, `fn one() {\n    assert_eq!(version, "${version}");\n}\n`)
  write('.gitignore', 'ignored.txt\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'seed')
  git('branch', '-M', branch)
  git('push', '-q', 'origin', branch)
}

const opts = (o: Partial<BumpOptions> = {}): BumpOptions => ({
  root,
  line: 'stable',
  whatsNewVersions: ['1.0.3', '1.1.0', '2.0.0-beta.1'],
  verify: () => {},
  ...o,
})
const snapshot = () => Object.values(VERSION_FILES).map(read).join('\0')
const refs = () => git('ls-remote', remote) + '|' + git('tag', '--list')

beforeEach(() => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'qg-bump-'))
  root = path.join(base, 'repo')
  remote = path.join(base, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', remote])
  mkdirSync(root)
  git('init', '-q')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'test')
  git('config', 'core.autocrlf', 'false')
  git('remote', 'add', 'origin', remote)
})
afterEach(() => rmSync(path.dirname(root), { recursive: true, force: true }))

describe('a bump (BUMP10–BUMP18)', () => {
  it('writes the four files, commits once, and neither tags nor pushes', () => {
    seed('1.0.2', 'release/1.x')
    const before = refs()
    const result = bump(opts({ bump: 'minor' }))
    expect(result).toMatchObject({ version: '1.1.0' })
    expect(git('log', '--format=%s', '-1')).toBe('Version 1.1.0')
    expect(git('log', '--format=%B', '-1')).toMatch(/Co-Authored-By: Claude Opus 5\.5 <noreply@anthropic\.com>\s*$/)
    expect(git('rev-list', '--count', 'HEAD')).toBe('2')
    expect(git('diff', '--name-only', 'HEAD~1').split('\n').sort()).toEqual(Object.values(VERSION_FILES).sort())
    expect(read(VERSION_FILES.cargo)).toContain('version = "1.1.0"')
    expect(read(VERSION_FILES.cargo)).toContain('serde = "1.0.2"')
    expect(read(VERSION_FILES.npm)).toContain('"x": "1.0.2"')
    expect(read(VERSION_FILES.bundleTest)).toContain('assert_eq!(version, "1.1.0");')
    expect(git('diff', '--numstat', 'HEAD~1').split('\n').every((l) => l.startsWith('1\t1\t'))).toBe(true)
    expect(refs()).toBe(before)
  })

  it('bumps a beta on main', () => {
    seed('2.0.0-beta.0', 'main')
    expect(bump(opts({ line: 'beta' }))).toMatchObject({ version: '2.0.0-beta.1' })
  })

  it('moves main to its first beta with --start, without notes', () => {
    seed('1.0.2', 'main')
    expect(bump(opts({ line: 'beta', start: '2.0.0', whatsNewVersions: [] }))).toMatchObject({ version: '2.0.0-beta.0' })
  })

  const refusals: [string, () => void, Partial<BumpOptions>][] = [
    ['stable on main', () => seed('1.0.2', 'main'), {}],
    ['beta on release/1.x', () => seed('2.0.0-beta.0', 'release/1.x'), { line: 'beta' }],
    ['a modified file', () => (seed('1.0.2', 'release/1.x'), write('README.md', 'x'), git('add', 'README.md'), git('commit', '-q', '-m', 'r'), write('README.md', 'y')), {}],
    ['a staged file', () => (seed('1.0.2', 'release/1.x'), write('new.txt', 'x'), git('add', 'new.txt')), {}],
    ['an untracked file', () => (seed('1.0.2', 'release/1.x'), write('new.txt', 'x')), {}],
    ['no notes', () => seed('1.0.2', 'release/1.x'), { whatsNewVersions: [] }],
    ['a stable base for beta', () => seed('1.0.2', 'main'), { line: 'beta' }],
    ['a missing bundle assertion', () => (seed('1.0.2', 'release/1.x'), write(VERSION_FILES.bundleTest, 'fn one() {}\n'), git('commit', '-qam', 'gone')), {}],
    ['a failing check', () => seed('1.0.2', 'release/1.x'), { verify: () => { throw new Error('typecheck failed') } }],
  ]
  for (const [name, setup, o] of refusals) {
    it(`refuses ${name} and changes nothing`, () => {
      setup()
      const status = git('status', '--porcelain')
      const files = snapshot()
      const head = git('rev-parse', 'HEAD')
      expect(bump(opts(o))).toHaveProperty('refused')
      expect(git('status', '--porcelain')).toBe(status)
      expect(snapshot()).toBe(files)
      expect(git('rev-parse', 'HEAD')).toBe(head)
    })
  }

  it('a detached HEAD is the wrong branch', () => {
    seed('1.0.2', 'release/1.x')
    git('checkout', '-q', '--detach')
    expect(bump(opts())).toEqual({ refused: expect.stringContaining('not HEAD') })
  })

  it('an ignored file is no reason to refuse', () => {
    seed('1.0.2', 'release/1.x')
    write('ignored.txt', 'x')
    expect(bump(opts())).toMatchObject({ version: '1.0.3' })
  })

  it('keeps CRLF files CRLF', () => {
    seed('1.0.2', 'release/1.x')
    write(VERSION_FILES.npm, read(VERSION_FILES.npm).replace(/\n/g, '\r\n'))
    git('commit', '-qam', 'crlf')
    bump(opts())
    expect(read(VERSION_FILES.npm)).toBe('{\r\n  "name": "questiongame",\r\n  "version": "1.0.3",\r\n  "dependencies": { "x": "1.0.2" }\r\n}\r\n')
  })

  it('a failing hook is heard, never skipped', () => {
    seed('1.0.2', 'release/1.x')
    write('.git/hooks/pre-commit', '#!/bin/sh\necho no >&2\nexit 1\n')
    try {
      execFileSync('chmod', ['+x', path.join(root, '.git/hooks/pre-commit')])
    } catch {
      // Windows git runs the hook through its own sh regardless of the mode.
    }
    const files = snapshot()
    expect(bump(opts())).toEqual({ refused: expect.stringContaining('commit failed') })
    expect(git('rev-list', '--count', 'HEAD')).toBe('1')
    expect(snapshot()).toBe(files)
    expect(git('status', '--porcelain')).toBe('')
  })
})
