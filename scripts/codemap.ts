/**
 * `npm run map` (regenerate) and `npm run map:check` (fail when stale):
 * `codemap.yaml`, every surface that can break between versions.
 *
 * The Rust sources are read by `tools/codemap` (syn); the TypeScript contract
 * and Studio's call sites by the compiler API in `scripts/lib/codemap.ts`.
 * The file is never written by hand, and CI compares it to a fresh run.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { buildMap, readContract, readStudioCalls, render, type RustMap, type SourceText } from './lib/codemap'

const root = process.cwd()
const OUTPUT = join(root, 'codemap.yaml')

function walk(dir: string, accept: (path: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...walk(full, accept))
    } else if (accept(full)) {
      out.push(full)
    }
  }
  return out.sort()
}

function load(dir: string, accept: (path: string) => boolean): SourceText[] {
  return walk(join(root, dir), accept).map((full) => ({
    path: relative(root, full).split(sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }))
}

function rustMap(): RustMap {
  const out = execFileSync('cargo', ['run', '-q', '-p', 'codemap', '--', '--root', root], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(out) as RustMap
}

const contract = readContract(load('packages/contract/src', (p) => p.endsWith('.ts') && !p.endsWith('.test.ts')))
const studio = readStudioCalls(load('apps/studio/src', (p) => /\.tsx?$/.test(p)))
const yaml = render(buildMap(rustMap(), contract, studio))

if (process.argv.includes('--check')) {
  const committed = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n') : null
  if (committed !== yaml) {
    console.error('codemap.yaml is stale — run npm run map')
    process.exit(1)
  }
  console.log(`codemap.yaml is current (${yaml.split('\n').length - 1} lines)`)
} else {
  writeFileSync(OUTPUT, yaml)
  console.log(`wrote codemap.yaml (${yaml.split('\n').length - 1} lines)`)
}
