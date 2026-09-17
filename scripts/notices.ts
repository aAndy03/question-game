/**
 * `npm run notices` (P12.3): audit every shipped dependency's licence, then
 * write `apps/studio/public/notices/THIRD-PARTY-NOTICES.txt` and a copy of
 * `LICENSE`. Vite copies both into `dist/studio/notices/`, where Settings ▸
 * About reads them. Run by `npm run build`, so a release cannot skip it.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { audit, cargoPackages, npmPackages, render, type Pkg } from './lib/notices'

const root = process.cwd()

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32' && cmd === 'npm' })
}

function npmQuery(): unknown[] {
  const execpath = process.env.npm_execpath
  const out = execpath && execpath.endsWith('.js') ? run(process.execPath, [execpath, 'query', '.prod']) : run('npm', ['query', '.prod'])
  return JSON.parse(out) as unknown[]
}

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)/i

function readText(pkg: Pkg): string | null {
  if (!pkg.dir || !existsSync(pkg.dir)) return null
  const files = readdirSync(pkg.dir)
    .filter((f) => LICENCE_FILE.test(f) && statSync(join(pkg.dir!, f)).isFile())
    .sort()
  if (files.length === 0) return null
  return files.map((f) => readFileSync(join(pkg.dir!, f), 'utf8').trim()).join('\n\n')
}

const cargo = cargoPackages(JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--locked'])), 'questiongame-app')
const npm = npmPackages(npmQuery() as Parameters<typeof npmPackages>[0])
const all = [...npm, ...cargo]

const refused = audit(all)
if (refused.length > 0) {
  console.error(`notices: ${refused.length} package(s) under a licence outside the allowlist (scripts/lib/notices.ts):`)
  for (const p of refused) console.error(`  ${p.ecosystem} ${p.name} ${p.version}: ${p.license ?? 'no licence declared'}`)
  process.exit(1)
}

const fonts = readFileSync(join(root, 'packages/design-stage/fonts/OFL.txt'), 'utf8')
const geist = readFileSync(join(root, 'node_modules/@fontsource-variable/geist/LICENSE'), 'utf8')
const text = render(all, readText, [
  { title: 'Fonts: Space Grotesk, Space Mono (SIL Open Font License 1.1)', text: fonts },
  { title: 'Font: Geist (SIL Open Font License 1.1)', text: geist },
])

const out = join(root, 'apps/studio/public/notices')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.txt'), text)
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'))
console.log(`notices: ${npm.length} npm + ${cargo.length} cargo packages, none refused → apps/studio/public/notices/`)
