/**
 * The wider surfaces of `codemap.yaml`: Stage, the shared packages, windows
 * and permissions, the Tauri config, the build, the e2e suite and the
 * contract fixtures. Same rules as `codemap.ts`: pure, sorted, no line
 * numbers, one line per item.
 */

import ts from 'typescript'
import {
  cmp,
  collapse,
  exportsOf,
  flow,
  hash,
  parseTs,
  topConst,
  uniqSorted,
  unwrap,
  type Contract,
  type ContractItem,
  type RustMap,
  type SourceText,
  type Surfaces,
} from './codemap'

// ------------------------------------------------------------ call detection

function walkCalls(file: SourceText, visit: (call: ts.CallExpression, source: ts.SourceFile) => void): void {
  const source = parseTs(file)
  const go = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) visit(node, source)
    ts.forEachChild(node, go)
  }
  go(source)
}

const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path) || path.includes('/test/')

function push(map: Map<string, Set<string>>, key: string, file: string): void {
  const set = map.get(key) ?? new Set<string>()
  set.add(file)
  map.set(key, set)
}

function sorted(map: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of [...map].sort(([a], [b]) => cmp(a, b))) out[k] = [...v].sort(cmp)
  return out
}

/** `call('x')` / `postCommand('x')`: host commands a webview sends, by string literal. */
export function readCommandCalls(files: readonly SourceText[], callees: readonly string[]): Record<string, string[]> {
  const found = new Map<string, Set<string>>()
  for (const file of files.filter((f) => !isTest(f.path))) {
    walkCalls(file, (call) => {
      const first = call.arguments[0]
      if (ts.isIdentifier(call.expression) && callees.includes(call.expression.text) && first && ts.isStringLiteralLike(first)) {
        push(found, first.text, file.path)
      }
    })
  }
  return sorted(found)
}

/** `listen('x', …)`: host events a webview subscribes to. */
export function readListens(files: readonly SourceText[]): Record<string, string[]> {
  const found = new Map<string, Set<string>>()
  for (const file of files.filter((f) => !isTest(f.path))) {
    walkCalls(file, (call) => {
      const first = call.arguments[0]
      if (ts.isIdentifier(call.expression) && call.expression.text === 'listen' && first && ts.isStringLiteralLike(first)) {
        push(found, first.text, file.path)
      }
    })
  }
  return sorted(found)
}

/** `new URLSearchParams(…).has('x')` / `.get('x')`: the query flags a page reads. */
export function readQueryFlags(files: readonly SourceText[]): Record<string, string[]> {
  const found = new Map<string, Set<string>>()
  for (const file of files.filter((f) => !isTest(f.path))) {
    walkCalls(file, (call, source) => {
      const callee = call.expression
      const first = call.arguments[0]
      if (
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === 'has' || callee.name.text === 'get') &&
        callee.expression.getText(source).includes('URLSearchParams') &&
        first &&
        ts.isStringLiteralLike(first)
      ) {
        push(found, first.text, file.path)
      }
    })
  }
  return sorted(found)
}

// ---------------------------------------------------------------- Stage copy

export interface StageCopyShape {
  keys: string[]
  languages: string[]
  /** Override keys that `resolveCopy` routes into `screenTitle`. */
  titleKeys: string[]
}

export function readStageCopy(file: SourceText): StageCopyShape {
  const source = parseTs(file)
  const out: StageCopyShape = { keys: [], languages: [], titleKeys: [] }
  for (const stmt of source.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === 'StageCopy') {
      out.keys = stmt.members.map((m) => (m.name ? m.name.getText(source) : '')).filter(Boolean)
    }
  }
  const tables = topConst(source, 'COPY_TABLES')
  const t = tables && unwrap(tables)
  if (t && ts.isObjectLiteralExpression(t)) out.languages = t.properties.map((p) => (p.name ? p.name.getText(source) : '')).filter(Boolean)
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'titles' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const p of node.initializer.properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.initializer)) out.titleKeys.push(p.initializer.text)
        else if (ts.isShorthandPropertyAssignment(p)) out.titleKeys.push(p.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  out.keys.sort(cmp)
  out.languages.sort(cmp)
  out.titleKeys.sort(cmp)
  return out
}

// ------------------------------------------------------------------ packages

function unionMembers(file: SourceText, name: string): string[] {
  const source = parseTs(file)
  for (const stmt of source.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name && ts.isUnionTypeNode(stmt.type)) {
      return stmt.type.types.map((t) => (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? t.literal.text : collapse(t.getText(source)))).sort(cmp)
    }
  }
  return []
}

/** `--name: value` definitions, as name -> short hash of its value(s) in order. */
export function cssProperties(text: string): Record<string, string> {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const values = new Map<string, string[]>()
  for (const m of clean.matchAll(/(^|[\s;{])(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g)) {
    const list = values.get(m[2]!) ?? []
    list.push(collapse(m[3]!))
    values.set(m[2]!, list)
  }
  const out: Record<string, string> = {}
  for (const [name, list] of [...values].sort(([a], [b]) => cmp(a, b))) out[name] = hash(list.join('\n'))
  return out
}

export interface PackageInput {
  name: string
  packageJson: string
  /** Every file of the package, repo-relative, excluding dist and node_modules. */
  files: string[]
  css: SourceText[]
}

// -------------------------------------------------------------------- config

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v !== 'object'
}

/** A JSON document as `path: value`; long strings and arrays of objects are hashed. */
export function flattenJson(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (isScalar(value)) {
    out[prefix] = typeof value === 'string' && value.length > 100 ? `${value.slice(0, 40)}... #${hash(value)}` : value
  } else if (Array.isArray(value)) {
    if (value.every(isScalar)) out[prefix] = value
    else out[prefix] = `#${hash(JSON.stringify(value))}`
  } else if (Object.keys(value).length === 0) {
    out[prefix] = '{}'
  } else {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flattenJson(v, prefix ? `${prefix}.${k}` : k, out)
  }
  return out
}

/** Tauri's glob over a window label. */
export function labelMatches(pattern: string, label: string): boolean {
  const star = pattern.indexOf('*')
  if (star < 0) return pattern === label
  const head = pattern.slice(0, star)
  const tail = pattern.slice(star + 1)
  return label.length >= head.length + tail.length && label.startsWith(head) && label.endsWith(tail)
}

// --------------------------------------------------------------------- build

export interface WorkflowJob {
  name: string | null
  runsOn: string | null
  needs: string[]
  runs: string[]
}

/** Jobs of a GitHub workflow, read line by line (no YAML dependency): id, name, runs-on, needs, one-line `run:` steps. */
export function readWorkflowJobs(text: string): Record<string, WorkflowJob> {
  const jobs: Record<string, WorkflowJob> = {}
  let inJobs = false
  let current: WorkflowJob | null = null
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\S/.test(raw)) {
      inJobs = /^jobs:\s*$/.test(raw)
      current = null
      continue
    }
    if (!inJobs) continue
    let m = /^ {2}([\w-]+):\s*$/.exec(raw)
    if (m) {
      current = { name: null, runsOn: null, needs: [], runs: [] }
      jobs[m[1]!] = current
      continue
    }
    if (!current) continue
    m = /^ {4}name:\s*(.+?)\s*$/.exec(raw)
    if (m) current.name = m[1]!.replace(/^['"]|['"]$/g, '')
    m = /^ {4}runs-on:\s*(.+?)\s*$/.exec(raw)
    if (m) current.runsOn = m[1]!
    m = /^ {4}needs:\s*(.+?)\s*$/.exec(raw)
    if (m) current.needs = m[1]!.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim()).filter(Boolean)
    m = /^\s+(?:- )?run:\s*(\S.*?)\s*$/.exec(raw)
    if (m && !/^[|>]/.test(m[1]!)) current.runs.push(m[1]!)
  }
  return jobs
}

// ----------------------------------------------------------------------- e2e

export interface E2eSpec {
  /** `describe title > it title`, in file order. */
  titles: string[]
}

export function readE2eSpec(file: SourceText): E2eSpec {
  const titles: string[] = []
  const source = parseTs(file)
  const go = (node: ts.Node, trail: string[]): void => {
    let next = trail
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      const first = node.arguments[0]
      if ((name === 'describe' || name === 'context' || name === 'it') && first && ts.isStringLiteralLike(first)) {
        next = [...trail, first.text]
        if (name === 'it') titles.push(next.join(' > '))
      }
    }
    ts.forEachChild(node, (child) => go(child, next))
  }
  go(source, [])
  return { titles }
}

/** The `SEEDS` table of e2e/support/folders.ts as spec name -> seed arguments (source text). */
export function readSeeds(file: SourceText): Record<string, string> {
  const init = topConst(parseTs(file), 'SEEDS')
  const e = init && unwrap(init)
  const out: Record<string, string> = {}
  if (e && ts.isObjectLiteralExpression(e)) {
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p)) out[ts.isStringLiteralLike(p.name) ? p.name.text : p.name.getText()] = collapse(p.initializer.getText())
    }
  }
  return out
}

// --------------------------------------------------------------------- merge

export interface SurfaceInputs {
  stageFiles: SourceText[]
  stageCopyFile: SourceText | null
  textFiles: SourceText[]
  packages: PackageInput[]
  capabilities: SourceText[]
  configs: SourceText[]
  rootPackageJson: string
  workflows: SourceText[]
  e2eSpecs: SourceText[]
  foldersFile: SourceText | null
  fixtureNames: string[]
  fixtureIndex: string | null
}

function describeItems(group: Record<string, ContractItem>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(group).map(([n, i]) => [n, flow({ kind: i.kind, sig: i.sig, doc: i.doc })]))
}

export function buildSurfaces(input: SurfaceInputs, rust: RustMap, contract: Contract): Surfaces {
  const mismatches: string[] = []

  // ---- stage
  const stageCommands = readCommandCalls(input.stageFiles, ['call', 'postCommand'])
  const allowed = rust.guard.stageCommands
  for (const [name, files] of Object.entries(stageCommands)) {
    if (!allowed.includes(name)) mismatches.push(`stage calls ${name} (${files.join(', ')}): not in guard.rs STAGE_COMMANDS`)
  }
  const listens = readListens(input.stageFiles)
  for (const [name, files] of Object.entries(listens)) {
    if (!contract.stageEvents.includes(name)) mismatches.push(`stage listens to ${name} (${files.join(', ')}): not in contract STAGE_EVENTS`)
  }
  for (const e of contract.stageEvents) if (!(e in listens)) mismatches.push(`stage event ${e}: in contract STAGE_EVENTS, Stage never listens to it`)
  const copy = input.stageCopyFile ? readStageCopy(input.stageCopyFile) : { keys: [], languages: [], titleKeys: [] }
  const overridable = new Set([...copy.keys, ...copy.titleKeys])
  for (const k of contract.textKeys) if (!overridable.has(k)) mismatches.push(`text key ${k}: in contract TEXT_KEYS, not a StageCopy key or a title override in resolveCopy`)
  for (const l of contract.languages) if (!copy.languages.includes(l)) mismatches.push(`language ${l}: in contract STAGE_LANGUAGES, no copy table in COPY_TABLES`)
  for (const l of copy.languages) if (!contract.languages.includes(l)) mismatches.push(`language ${l}: has a copy table, not in contract STAGE_LANGUAGES`)

  const stage = {
    host_commands: stageCommands,
    events_listened: listens,
    query_flags: readQueryFlags(input.stageFiles),
    copy: {
      file: input.stageCopyFile?.path ?? null,
      languages: copy.languages,
      keys: copy.keys,
      title_override_keys: copy.titleKeys,
      contract_text_keys: [...contract.textKeys].sort(cmp),
    },
  }

  // ---- packages
  const textIndex = input.textFiles.find((f) => f.path.endsWith('/index.ts'))
  const packages: Record<string, unknown> = {}
  for (const pkg of input.packages) {
    const json = JSON.parse(pkg.packageJson) as { exports?: unknown; name?: string }
    const entry: Record<string, unknown> = {
      exports: json.exports ?? {},
      files: [...pkg.files].sort(cmp),
    }
    if (pkg.css.length > 0) {
      entry.css_properties = Object.fromEntries(pkg.css.map((f) => [f.path, cssProperties(f.text)]).filter(([, v]) => Object.keys(v as object).length > 0))
    }
    if (pkg.name === 'text') {
      entry.variants = textIndex ? unionMembers(textIndex, 'TextVariant') : []
      entry.transitions = textIndex ? unionMembers(textIndex, 'TextTransition') : []
      entry.api = Object.fromEntries(input.textFiles.filter((f) => !isTest(f.path)).map((f) => [f.path, describeItems(exportsOf(f))]))
    }
    packages[pkg.name] = entry
  }

  // ---- windows and permissions
  const caps = input.capabilities.map((f) => {
    const j = JSON.parse(f.text) as { identifier: string; windows?: string[]; permissions?: unknown[] }
    return { file: f.path, identifier: j.identifier, windows: j.windows ?? [], permissions: (j.permissions ?? []).map((p) => (typeof p === 'string' ? p : JSON.stringify(p))) }
  })
  const labels = [...new Set(rust.windows.flatMap((w) => (w.label === 'mirror_label()' ? ['stage-2', 'stage-3'] : [w.label])))].sort(cmp)
  for (const label of labels) {
    if (!caps.some((c) => c.windows.some((p) => labelMatches(p, label)))) mismatches.push(`window label ${label}: matches no capability (it would get no core permissions)`)
  }
  const windowsSection = {
    capabilities: Object.fromEntries(
      caps.map((c) => [c.identifier, { file: c.file, windows: c.windows, permissions: [...c.permissions].sort(cmp) }]),
    ),
    windows: Object.fromEntries(rust.windows.map((w) => [w.label === 'mirror_label()' ? 'stage-N (mirror)' : w.label, w.url])),
  }

  // ---- config
  const identities = Object.values(rust.identity)
  const configs: Record<string, unknown> = {}
  for (const f of input.configs) {
    const json = JSON.parse(f.text) as { identifier?: string }
    configs[f.path] = flattenJson(json)
    if (json.identifier !== undefined && !identities.includes(json.identifier)) {
      mismatches.push(`config ${f.path}: identifier ${json.identifier} is not one of identity.rs's constants`)
    }
  }
  const config = { identity_consts: rust.identity, files: configs }

  // ---- build
  const root = JSON.parse(input.rootPackageJson) as { scripts?: Record<string, string>; workspaces?: string[] }
  const workflows: Record<string, unknown> = {}
  for (const w of input.workflows) {
    workflows[w.path] = Object.fromEntries(
      Object.entries(readWorkflowJobs(w.text)).map(([id, j]) => [id, { name: j.name ?? undefined, runs_on: j.runsOn ?? undefined, needs: j.needs, runs: j.runs }]),
    )
  }
  const build = {
    npm_scripts: root.scripts ?? {},
    npm_workspaces: root.workspaces ?? [],
    cargo_members: rust.cargo.members,
    crates: Object.fromEntries(rust.cargo.crates.map((c) => [c.name, { path: c.path, features: c.features, dependencies: c.dependencies }])),
    workflows,
  }

  // ---- e2e
  const seeds = input.foldersFile ? readSeeds(input.foldersFile) : {}
  const specs: Record<string, string[]> = {}
  for (const f of input.e2eSpecs) {
    const base = f.path.slice(f.path.lastIndexOf('/') + 1)
    specs[f.path] = readE2eSpec(f).titles
    if (!(base in seeds)) mismatches.push(`e2e spec ${base}: missing from SEEDS in e2e/support/folders.ts`)
  }
  const specNames = input.e2eSpecs.map((f) => f.path.slice(f.path.lastIndexOf('/') + 1))
  for (const name of Object.keys(seeds)) if (!specNames.includes(name)) mismatches.push(`e2e SEEDS entry ${name}: no such spec file`)
  const e2e = { specs, seeds }

  // ---- fixtures
  const names = [...input.fixtureNames].sort(cmp)
  if (input.fixtureIndex !== null) {
    const listed = uniqSorted((JSON.parse(input.fixtureIndex) as { fixtures: string[] }).fixtures)
    for (const n of names) if (!listed.includes(n)) mismatches.push(`fixture ${n}: file exists, not listed in fixtures/index.json`)
    for (const n of listed) if (!names.includes(n)) mismatches.push(`fixture ${n}: listed in fixtures/index.json, no file`)
  }

  return {
    sections: { stage, packages, windows_and_permissions: windowsSection, config, build, e2e, fixtures: names },
    mismatches,
  }
}
