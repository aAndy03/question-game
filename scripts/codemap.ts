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
import { buildSurfaces, type PackageInput } from './lib/codemap-surfaces'

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

const ts = (p: string): boolean => /\.tsx?$/.test(p)
const rustJson = rustMap()
const contract = readContract(load('packages/contract/src', (p) => p.endsWith('.ts') && !p.endsWith('.test.ts')))
const studio = readStudioCalls(load('apps/studio/src', ts))

const IGNORED = /(^|\/)(dist|node_modules)(\/|$)|\.tsbuildinfo$/

function packageInput(name: string): PackageInput {
  const dir = join(root, 'packages', name)
  const files = walk(dir, (p) => !IGNORED.test(relative(dir, p).split(sep).join('/'))).map((p) => relative(dir, p).split(sep).join('/'))
  return {
    name,
    packageJson: readFileSync(join(dir, 'package.json'), 'utf8'),
    files,
    css: load(`packages/${name}`, (p) => p.endsWith('.css') && !IGNORED.test(relative(dir, p).split(sep).join('/'))),
  }
}

function readIf(path: string): SourceText | null {
  const full = join(root, path)
  return existsSync(full) ? { path, text: readFileSync(full, 'utf8') } : null
}

const stageFiles = load('apps/stage/src', ts)
const fixtureDir = join(root, 'fixtures')
const surfaces = buildSurfaces(
  {
    stageFiles,
    stageCopyFile: stageFiles.find((f) => f.path === 'apps/stage/src/copy/tables.ts') ?? null,
    textFiles: load('packages/text/src', ts),
    packages: ['text', 'design-stage', 'design-studio'].map(packageInput),
    capabilities: load('crates/app/capabilities', (p) => p.endsWith('.json')),
    configs: load('crates/app', (p) => /tauri(\.[a-z0-9]+)?\.conf\.json$/.test(p) && !p.includes(`${sep}gen${sep}`) && !p.includes(`${sep}tests${sep}`)),
    rootPackageJson: readFileSync(join(root, 'package.json'), 'utf8'),
    workflows: load('.github/workflows', (p) => /\.ya?ml$/.test(p)),
    e2eSpecs: load('e2e/specs', (p) => p.endsWith('.e2e.ts')),
    foldersFile: readIf('e2e/support/folders.ts'),
    fixtureNames: readdirSync(fixtureDir)
      .filter((n) => n.endsWith('.json') && n !== 'index.json')
      .map((n) => n.slice(0, -'.json'.length)),
    fixtureIndex: readIf('fixtures/index.json')?.text ?? null,
  },
  rustJson,
  contract,
)
const yaml = render(buildMap(rustJson, contract, studio, surfaces))

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
