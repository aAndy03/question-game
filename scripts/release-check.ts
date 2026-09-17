/**
 * `npm run release:check` (P12.3): scan `dist/studio` and `dist/stage` for
 * what a release may not ship (`scripts/lib/release-check.ts`). Run by
 * Tauri's `beforeBuildCommand`, so every production build is checked.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scan } from './lib/release-check'

const root = process.cwd()
const dirs = ['dist/studio', 'dist/stage'].map((d) => join(root, d))

if (!existsSync(join(root, 'dist/studio/index.html')) || !existsSync(join(root, 'dist/stage/index.html'))) {
  console.error('release:check: dist/studio or dist/stage is missing — run `npm run build` first')
  process.exit(1)
}

const TEXT = /\.(html|js|css|txt|json|svg)$/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : TEXT.test(name) ? [path] : []
  })
}

const files = dirs.flatMap(walk).map((path) => ({ name: relative(root, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
const findings = scan(files)
if (findings.length > 0) {
  console.error(`release:check: ${findings.length} finding(s)`)
  for (const f of findings) console.error(`  ${f.file}: ${f.rule}: …${f.excerpt}…`)
  process.exit(1)
}
console.log(`release:check: ${files.length} files clean`)
