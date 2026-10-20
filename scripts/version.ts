/**
 * `npm run version:stable [-- patch|minor|major]` (on release/1.x) and
 * `npm run version:beta [-- --start X.Y.Z]` (on main) — P13.0.
 *
 * Bumps the one version in its four places, refreshes the lock files and the
 * codebase map, runs typecheck and the bundle test, and commits `Version X`.
 * It never tags and never pushes: it prints the tag, and publishing is the
 * maintainer's to do (`scripts/lib/bump.ts`).
 */

import { execSync } from 'node:child_process'
import { WHATS_NEW } from '../apps/studio/src/copy/whatsNew'
import { bump } from './lib/bump'
import type { Bump, Line } from './lib/version'

const args = process.argv.slice(2).filter((a) => a !== '--')
const line = args[0] as Line
if (line !== 'stable' && line !== 'beta') {
  console.error('usage: version.ts stable [patch|minor|major] | beta [--start X.Y.Z]')
  process.exit(2)
}
const startAt = args.indexOf('--start')
const start = startAt >= 0 ? args[startAt + 1] : undefined
const kind = args.slice(1).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--start') as Bump | undefined

const result = bump({
  root: process.cwd(),
  line,
  ...(kind ? { bump: kind } : {}),
  ...(start ? { start } : {}),
  whatsNewVersions: WHATS_NEW.filter((r) => Object.values(r.notes).every((notes) => notes.length > 0)).map((r) => r.version),
  verify: (root) => {
    for (const cmd of [
      'npm install --package-lock-only --ignore-scripts',
      'cargo update -w',
      'npm run map',
      'npm run typecheck',
      'cargo test -q -p questiongame-app --test bundle',
    ]) {
      console.log(`> ${cmd}`)
      execSync(cmd, { cwd: root, stdio: 'inherit' })
    }
  },
})

if ('refused' in result) {
  console.error(`version:${line}: ${result.refused}`)
  process.exit(1)
}
console.log(`\nCommitted ${result.commit}: Version ${result.version}. Nothing was tagged or pushed.`)
console.log(`To publish it, when you decide to:\n  git push && git tag v${result.version} && git push origin v${result.version}`)
