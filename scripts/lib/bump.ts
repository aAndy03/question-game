/**
 * The version bump itself (P13.0): refuse, or write the version files, run
 * the checks, and commit. It never tags and never pushes — publishing is the
 * maintainer's word, and the tag is printed for them to run.
 *
 * Everything that touches the outside world is a parameter, so the suite
 * runs this against a throwaway repository.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { checkPreconditions, nextVersion, rewriteBundleTest, rewriteCargoVersion, rewriteJsonVersion, type Bump, type Line } from './version'

export const VERSION_FILES = {
  cargo: 'Cargo.toml',
  tauri: 'crates/app/tauri.conf.json',
  npm: 'package.json',
  bundleTest: 'crates/app/tests/bundle.rs',
} as const

export interface BumpOptions {
  readonly root: string
  readonly line: Line
  readonly bump?: Bump
  readonly start?: string
  /** Versions with notes in every language (`WHATS_NEW`). */
  readonly whatsNewVersions: readonly string[]
  /** Lock files, the map, typecheck and the bundle test; throws on a failure. */
  readonly verify: (root: string) => void
}

export type BumpResult = { readonly version: string; readonly commit: string } | { readonly refused: string }

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

export function bump(o: BumpOptions): BumpResult {
  const current = (JSON.parse(readFileSync(path.join(o.root, VERSION_FILES.npm), 'utf8')) as { version: string }).version
  const target = nextVersion(current, o.line, { ...(o.bump ? { bump: o.bump } : {}), ...(o.start ? { start: o.start } : {}) })
  if (typeof target !== 'string') return target
  const refusal = checkPreconditions({
    line: o.line,
    branch: git(o.root, 'rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: git(o.root, 'status', '--porcelain') !== '',
    target,
    whatsNewVersions: o.whatsNewVersions,
  })
  if (refusal !== null) return { refused: refusal }

  // Every rewrite is computed before any file is written, so a pattern that
  // has gone missing refuses with the tree untouched.
  const read = (rel: string) => readFileSync(path.join(o.root, rel), 'utf8')
  let next: [string, string][]
  try {
    next = [
      [VERSION_FILES.cargo, rewriteCargoVersion(read(VERSION_FILES.cargo), target)],
      [VERSION_FILES.tauri, rewriteJsonVersion(read(VERSION_FILES.tauri), target)],
      [VERSION_FILES.npm, rewriteJsonVersion(read(VERSION_FILES.npm), target)],
      [VERSION_FILES.bundleTest, rewriteBundleTest(read(VERSION_FILES.bundleTest), target)],
    ]
  } catch (e) {
    return { refused: (e as Error).message }
  }
  for (const [rel, text] of next) writeFileSync(path.join(o.root, rel), text)

  try {
    o.verify(o.root)
  } catch (e) {
    // The tree was clean before: putting back every tracked file is exactly undoing this.
    git(o.root, 'checkout', '--', '.')
    return { refused: `a check failed, nothing was committed: ${(e as Error).message}` }
  }
  git(o.root, 'add', '-u')
  try {
    git(o.root, 'commit', '-q', '-m', `Version ${target}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)
  } catch (e) {
    // A hook said no. It is heard, never skipped: undo, and say what it said.
    git(o.root, 'reset', '-q')
    git(o.root, 'checkout', '--', '.')
    const err = e as { stderr?: Buffer | string; message: string }
    return { refused: `the commit failed, nothing was committed: ${String(err.stderr ?? err.message).trim()}` }
  }
  return { version: target, commit: git(o.root, 'rev-parse', '--short', 'HEAD') }
}
