/**
 * The pure half of `npm run map` (`scripts/codemap.ts`): read the TypeScript
 * contract and Studio's call sites with the compiler API, merge them with what
 * `tools/codemap` found in the Rust sources, and render `codemap.yaml`.
 *
 * Nothing here touches the disk or a clock, and nothing prints a line number:
 * the output is a function of the sources and only changes when a surface does.
 */

import { createHash } from 'node:crypto'
import ts from 'typescript'

// ---------------------------------------------------------------- YAML emitter

/** Render this value on one line: `{a: 1, b: [x, y]}`. */
export class Flow {
  constructor(readonly value: unknown) {}
}

export const flow = (value: unknown): Flow => new Flow(value)

const RESERVED = new Set(['null', 'true', 'false', 'yes', 'no', 'on', 'off', 'y', 'n', '~'])
const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*(?:[./-][A-Za-z0-9_]+)*$/

/** A scalar string, quoted unless it is unambiguous plain YAML. */
export function scalar(value: string): string {
  if (PLAIN.test(value) && !RESERVED.has(value.toLowerCase())) return value
  return JSON.stringify(value)
}

function atom(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return scalar(value)
  throw new Error(`not a scalar: ${JSON.stringify(value)}`)
}

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object'
}

function sortedEntries(obj: object, sort: boolean): [string, unknown][] {
  const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined)
  return sort ? entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : entries
}

function inline(value: unknown): string {
  const v = value instanceof Flow ? value.value : value
  if (isScalar(v)) return atom(v)
  if (Array.isArray(v)) return v.length === 0 ? '[]' : `[${v.map(inline).join(', ')}]`
  const entries = sortedEntries(v as object, true)
  return entries.length === 0 ? '{}' : `{${entries.map(([k, x]) => `${scalar(k)}: ${inline(x)}`).join(', ')}}`
}

const FLOW_LIMIT = 110

function block(value: unknown, indent: number, sortKeys: boolean): string[] {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`]
    const lines: string[] = []
    for (const item of value) {
      if (isScalar(item) || item instanceof Flow) {
        lines.push(`${pad}- ${inline(item)}`)
      } else {
        const sub = block(item, indent + 2, true)
        lines.push(`${pad}- ${sub[0]!.slice(indent + 2)}`, ...sub.slice(1))
      }
    }
    return lines
  }
  const entries = sortedEntries(value as object, sortKeys)
  if (entries.length === 0) return [`${pad}{}`]
  const lines: string[] = []
  for (const [key, item] of entries) {
    const head = `${pad}${scalar(key)}:`
    if (item instanceof Flow || isScalar(item)) {
      lines.push(`${head} ${inline(item)}`)
    } else if (Array.isArray(item) && item.every(isScalar) && inline(item).length <= FLOW_LIMIT) {
      lines.push(`${head} ${inline(item)}`)
    } else if (Array.isArray(item) && item.length === 0) {
      lines.push(`${head} []`)
    } else if (!Array.isArray(item) && sortedEntries(item as object, false).length === 0) {
      lines.push(`${head} {}`)
    } else {
      lines.push(head, ...block(item, indent + 2, true))
    }
  }
  return lines
}

/** Top-level keys keep their order (the section order is the spec); everything below is sorted. */
export function toYaml(root: Record<string, unknown>): string {
  return `${block(root, 0, false).join('\n')}\n`
}

// ------------------------------------------------------------------- text bits

/** The first sentence of the first paragraph — mirrors `first_sentence` in tools/codemap. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const m = /(?:(?<!\d)\.|[?!]) /.exec(flat)
  const cut = m ? flat.slice(0, m.index + 1) : flat
  return cut.length > 200 ? `${cut.slice(0, 197)}...` : cut
}

export function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clip(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

// ------------------------------------------------------------------ SQL schema

export interface MigrationSummary {
  version: number
  creates: Record<string, string[]>
  adds: string[]
  indexes: string[]
  other: string[]
}

function topLevelSplit(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === separator && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

const CONSTRAINT = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i

/** What each `MIGRATIONS` step creates, alters and indexes. Version = position + 1. */
export function summariseMigrations(steps: readonly string[]): MigrationSummary[] {
  return steps.map((sql, i) => {
    const summary: MigrationSummary = { version: i + 1, creates: {}, adds: [], indexes: [], other: [] }
    const clean = sql.replace(/--.*$/gm, '')
    for (const raw of topLevelSplit(clean, ';')) {
      const stmt = collapse(raw)
      if (!stmt) continue
      let m = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*)\)$/is.exec(stmt)
      if (m) {
        const columns = topLevelSplit(m[2]!, ',')
          .map(collapse)
          .filter((c) => c && !CONSTRAINT.test(c))
        summary.creates[m[1]!] = columns
        continue
      }
      m = /^ALTER TABLE (\w+)\s+ADD COLUMN (.+)$/is.exec(stmt)
      if (m) {
        summary.adds.push(`${m[1]}: ${collapse(m[2]!)}`)
        continue
      }
      m = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+) ON (\w+)\s*\((.*)\)$/is.exec(stmt)
      if (m) {
        summary.indexes.push(`${m[1]} ON ${m[2]}(${collapse(m[3]!)})`)
        continue
      }
      summary.other.push(clip(stmt, 120))
    }
    summary.adds.sort()
    summary.indexes.sort()
    summary.other.sort()
    return summary
  })
}

// ------------------------------------------------------------ TypeScript side

export interface SourceText {
  /** Repo-relative, forward slashes. */
  path: string
  text: string
}

export interface ContractItem {
  kind: string
  sig: string
  doc?: string
}

export interface Contract {
  /** file -> exported name -> item. */
  files: Record<string, Record<string, ContractItem>>
  commandGroups: Record<string, string[]>
  events: string[]
  stageEvents: string[]
  stageCommands: string[]
  version: number | null
  /** `TEXT_KEYS` in text.ts. */
  textKeys: string[]
  /** `STAGE_LANGUAGES` in play-state.ts. */
  languages: string[]
}

export function parseTs(file: SourceText): ts.SourceFile {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function jsDocOf(node: ts.Node): string | undefined {
  const docs = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc
  const last = docs?.[docs.length - 1]
  if (!last?.comment) return undefined
  const text = ts.getTextOfJSDocComment(last.comment)
  if (!text) return undefined
  const paragraph = text.split(/\n\s*\n/)[0]!
  return firstSentence(paragraph)
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function memberNames(members: readonly ts.TypeElement[], source: ts.SourceFile): string {
  const names = members.map((m) => {
    const name = m.name ? m.name.getText(source) : '[]'
    return ts.isMethodSignature(m) ? `${name}()` : `${name}${m.questionToken ? '?' : ''}`
  })
  return `{ ${names.join(', ')} }`
}

function literalValue(expr: ts.Expression): string | null {
  let e = expr
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.getText()
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return e.getText()
  if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return e.getText()
  return null
}

export function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression
  return e
}

function constSignature(decl: ts.VariableDeclaration, source: ts.SourceFile): string {
  const init = decl.initializer
  if (!init) return decl.type ? `: ${collapse(decl.type.getText(source))}` : ''
  const lit = literalValue(init)
  if (lit !== null) return `= ${lit}`
  const e = unwrap(init)
  const body = collapse(init.getText(source))
  if (ts.isObjectLiteralExpression(e)) {
    const keys = e.properties.map((p) => (p.name ? p.name.getText(source) : '...')).join(', ')
    return `{ ${keys} } #${hash(body)}`
  }
  if (ts.isArrayLiteralExpression(e)) return `[${e.elements.length}] #${hash(body)}`
  const type = decl.type ? `: ${collapse(decl.type.getText(source))} ` : ' '
  return `${type.trimEnd()} #${hash(body)}`.trim()
}

function functionSignature(fn: ts.FunctionDeclaration, source: ts.SourceFile): string {
  const params = fn.parameters.map((p) => collapse(p.getText(source))).join(', ')
  const ret = fn.type ? `: ${collapse(fn.type.getText(source))}` : ''
  return `(${params})${ret}`
}

export function exportsOf(file: SourceText): Record<string, ContractItem> {
  const source = parseTs(file)
  const out: Record<string, ContractItem> = {}
  const put = (name: string, item: ContractItem): void => {
    if (!item.doc) delete item.doc
    out[name] = item
  }
  for (const stmt of source.statements) {
    if (ts.isExportDeclaration(stmt)) {
      const from = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : '?'
      const names = stmt.exportClause && ts.isNamedExports(stmt.exportClause) ? stmt.exportClause.elements.map((e) => e.name.text).join(', ') : '*'
      put(`export ${from}`, { kind: 'reexport', sig: names })
      continue
    }
    if (!isExported(stmt)) continue
    if (ts.isInterfaceDeclaration(stmt)) {
      const ext = stmt.heritageClauses?.map((h) => collapse(h.getText(source))).join(' ')
      put(stmt.name.text, { kind: 'interface', sig: `${ext ? `${ext} ` : ''}${memberNames(stmt.members, source)}`, doc: jsDocOf(stmt) })
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      const body = collapse(stmt.type.getText(source))
      const sig = ts.isTypeLiteralNode(stmt.type) ? `${memberNames(stmt.type.members, source)} #${hash(body)}` : body.length > 200 ? `${body.slice(0, 197)}... #${hash(body)}` : body
      put(stmt.name.text, { kind: 'type', sig, doc: jsDocOf(stmt) })
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) put(decl.name.text, { kind: 'const', sig: constSignature(decl, source), doc: jsDocOf(stmt) })
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      put(stmt.name.text, { kind: 'function', sig: functionSignature(stmt, source), doc: jsDocOf(stmt) })
    } else if (ts.isEnumDeclaration(stmt)) {
      put(stmt.name.text, { kind: 'enum', sig: `{ ${stmt.members.map((m) => m.name.getText(source)).join(', ')} }`, doc: jsDocOf(stmt) })
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      put(stmt.name.text, { kind: 'class', sig: '', doc: jsDocOf(stmt) })
    }
  }
  return out
}

export function stringArray(expr: ts.Expression | undefined): string[] {
  if (!expr) return []
  const e = unwrap(expr)
  if (!ts.isArrayLiteralExpression(e)) return []
  return e.elements.filter(ts.isStringLiteralLike).map((x) => x.text)
}

export function topConst(source: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl.initializer
    }
  }
  return undefined
}

/** The contract package: every exported name, plus the command and event lists. */
export function readContract(files: readonly SourceText[]): Contract {
  const out: Contract = { files: {}, commandGroups: {}, events: [], stageEvents: [], stageCommands: [], version: null, textKeys: [], languages: [] }
  for (const file of files) {
    out.files[file.path] = exportsOf(file)
    const source = parseTs(file)
    if (file.path.endsWith('/commands.ts')) {
      out.events = stringArray(topConst(source, 'EVENTS'))
      out.stageEvents = stringArray(topConst(source, 'STAGE_EVENTS'))
      out.stageCommands = stringArray(topConst(source, 'STAGE_COMMANDS'))
      const groups = topConst(source, 'COMMAND_GROUPS')
      const g = groups && unwrap(groups)
      if (g && ts.isObjectLiteralExpression(g)) {
        for (const prop of g.properties) {
          if (ts.isPropertyAssignment(prop)) out.commandGroups[prop.name.getText(source)] = stringArray(prop.initializer)
        }
      }
    }
    if (file.path.endsWith('/text.ts')) out.textKeys = stringArray(topConst(source, 'TEXT_KEYS'))
    if (file.path.endsWith('/play-state.ts')) out.languages = stringArray(topConst(source, 'STAGE_LANGUAGES'))
    const version = topConst(source, 'CONTRACT_VERSION')
    if (version && ts.isNumericLiteral(unwrap(version))) out.version = Number(unwrap(version).getText())
  }
  return out
}

export interface StudioCalls {
  /** command -> files that call it with a string literal. */
  byCommand: Record<string, string[]>
  /** Files that call `run(`/`command(` with something that is not a literal. */
  dynamic: string[]
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr) && (expr.text === 'run' || expr.text === 'command')) return expr.text
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'ok' && ts.isIdentifier(expr.expression) && expr.expression.text === 'run') return 'run.ok'
  return null
}

/** Which Studio files call which host command: `run('x')`, `run.ok('x')`, `command('x')`. Tests are not callers. */
export function readStudioCalls(files: readonly SourceText[]): StudioCalls {
  const byCommand = new Map<string, Set<string>>()
  const dynamic = new Set<string>()
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file.path) || file.path.includes('/test/')) continue
    const source = parseTs(file)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && calleeName(node.expression)) {
        const first = node.arguments[0]
        if (first && ts.isStringLiteralLike(first)) {
          const set = byCommand.get(first.text) ?? new Set<string>()
          set.add(file.path)
          byCommand.set(first.text, set)
        } else if (first) {
          dynamic.add(file.path)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const sorted: Record<string, string[]> = {}
  for (const [name, set] of [...byCommand].sort(([a], [b]) => (a < b ? -1 : 1))) sorted[name] = [...set].sort()
  return { byCommand: sorted, dynamic: [...dynamic].sort() }
}

// ------------------------------------------------------------------- the merge

export interface RustCommand {
  name: string
  file: string
  params: { name: string; type: string }[]
  returns: string
  doc: string | null
  asyncCommand: boolean
}

export interface RustApiItem {
  path: string
  kind: string
  signature: string
  doc: string | null
  file: string
}

export interface RustMap {
  commands: RustCommand[]
  guard: { labels: Record<string, string>; stageCommands: string[]; statsCommands: string[] }
  handlers: string[]
  events: { function: string; target: string; event: string; payload: string }[]
  plugins: string[]
  hostApi: RustApiItem[]
  appApi: RustApiItem[]
  stageContractVersion: string | null
  settingsKeys: { type: string; variant: string; key: string }[]
  gameAffectingKeys: string[]
  settingsStructs: { name: string; serde: string | null; fields: { name: string; type: string; serdeDefault: boolean }[] }[]
  migrations: string[]
  metaKeys: { name: string; value: string; file: string }[]
  identity: Record<string, string>
  windows: { label: string; url: string }[]
  cargo: { members: string[]; crates: { name: string; path: string; features: Record<string, string[]>; dependencies: Record<string, string> }[] }
}

export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
export const uniqSorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(cmp)

function callersOf(name: string, guard: RustMap['guard']): string[] {
  const out = ['main']
  if (guard.stageCommands.includes(name)) out.push('stage')
  if (guard.statsCommands.includes(name)) out.push('stats')
  return out
}

/** The stage windows are `stage` and `stage-N` mirrors; the emission loop reaches all of them. */
function targetName(target: string): string {
  return target === 'stage_labels()' ? 'stage*' : target
}

function apiByFile(items: readonly RustApiItem[], strip: string): Record<string, Record<string, Flow>> {
  const out: Record<string, Record<string, Flow>> = {}
  for (const item of items) {
    const name = item.path.startsWith(`${strip}::`) ? item.path.slice(strip.length + 2) : item.path
    const files = (out[item.file] ??= {})
    files[name] = flow({ kind: item.kind, sig: item.signature, doc: item.doc ?? undefined })
  }
  return out
}

function describe(group: Record<string, ContractItem>): Record<string, Flow> {
  return Object.fromEntries(Object.entries(group).map(([name, item]) => [name, flow({ kind: item.kind, sig: item.sig, doc: item.doc })]))
}

export interface Surfaces {
  /** Extra top-level sections, in order. */
  sections: Record<string, unknown>
  mismatches: string[]
}

export function buildMap(rust: RustMap, contract: Contract, studio: StudioCalls, surfaces?: Surfaces): Record<string, unknown> {
  const mismatches: string[] = [...(surfaces?.mismatches ?? [])]
  const rustNames = rust.commands.map((c) => c.name)
  const contractNames = Object.values(contract.commandGroups).flat()

  for (const n of rustNames) {
    if (!contractNames.includes(n)) mismatches.push(`command ${n}: in Rust, not in COMMAND_GROUPS`)
    if (!rust.handlers.includes(n)) mismatches.push(`command ${n}: #[tauri::command] but not in generate_handler!`)
  }
  for (const n of contractNames) if (!rustNames.includes(n)) mismatches.push(`command ${n}: in COMMAND_GROUPS, no #[tauri::command]`)
  for (const n of rust.handlers) if (!rustNames.includes(n)) mismatches.push(`command ${n}: in generate_handler!, no #[tauri::command] found`)
  for (const n of rust.guard.stageCommands) if (!contract.stageCommands.includes(n)) mismatches.push(`stage command ${n}: guard.rs STAGE_COMMANDS allows it, contract STAGE_COMMANDS does not`)
  for (const n of contract.stageCommands) if (!rust.guard.stageCommands.includes(n)) mismatches.push(`stage command ${n}: contract STAGE_COMMANDS lists it, guard.rs does not allow it`)
  const rustEvents = uniqSorted(rust.events.map((e) => e.event))
  for (const e of rustEvents) if (!contract.events.includes(e)) mismatches.push(`event ${e}: emitted in emit.rs, not in contract EVENTS`)
  for (const e of contract.events) if (!rustEvents.includes(e)) mismatches.push(`event ${e}: in contract EVENTS, never emitted in emit.rs`)
  for (const name of Object.keys(studio.byCommand)) {
    if (!rustNames.includes(name)) mismatches.push(`studio call ${name}: no such command in Rust (${studio.byCommand[name]!.join(', ')})`)
  }
  const rustVersion = rust.stageContractVersion === null ? null : Number(rust.stageContractVersion)
  if (rustVersion !== contract.version) mismatches.push(`CONTRACT_VERSION: Rust ${rustVersion}, TypeScript ${contract.version}`)

  const commands: Record<string, unknown> = {}
  for (const c of rust.commands) {
    commands[c.name] = {
      file: c.file,
      async: c.asyncCommand,
      params: c.params.map((p) => `${p.name}: ${p.type}`),
      returns: c.returns,
      doc: c.doc ?? undefined,
      callers: callersOf(c.name, rust.guard),
    }
  }

  const events: Record<string, unknown> = {}
  for (const event of uniqSorted([...rustEvents, ...contract.events])) {
    const emits = rust.events.filter((e) => e.event === event)
    events[event] = {
      in_contract: contract.events.includes(event),
      stage_receives: contract.stageEvents.includes(event),
      targets: uniqSorted(emits.map((e) => targetName(e.target))),
      payload: uniqSorted(emits.map((e) => e.payload)),
      emitted_by: uniqSorted(emits.map((e) => e.function)),
    }
  }

  const gameAffecting = new Set(rust.gameAffectingKeys)
  const settingsStructs: Record<string, unknown> = {}
  for (const s of rust.settingsStructs) {
    settingsStructs[s.name] = {
      serde: s.serde ?? undefined,
      fields: Object.fromEntries(s.fields.map((f) => [f.name, flow({ type: f.type, serde_default: f.serdeDefault ? true : undefined })])),
    }
  }

  const migrations = summariseMigrations(rust.migrations)
  const storage = {
    schema_version: migrations.length,
    migrations: Object.fromEntries(
      migrations.map((m) => [
        String(m.version).padStart(3, '0'),
        { creates: m.creates, adds: m.adds, indexes: m.indexes, other: m.other },
      ]),
    ),
    meta_keys: Object.fromEntries(rust.metaKeys.map((k) => [k.name, flow({ value: k.value, file: k.file })])),
  }

  const modules = rust.appApi.filter((i) => i.kind === 'mod').map((i) => i.path.replace(/^questiongame_app::/, ''))

  return {
    commands,
    events,
    contract: {
      version: flow({ rust: rustVersion, typescript: contract.version }),
      command_groups: contract.commandGroups,
      events: contract.events,
      stage_commands: contract.stageCommands,
      stage_events: contract.stageEvents,
      files: Object.fromEntries(Object.entries(contract.files).map(([file, group]) => [file, describe(group)])),
    },
    settings: {
      keys: rust.settingsKeys.map((k) => flow({ key: k.key, type: k.type, variant: k.variant, game_affecting: gameAffecting.has(k.key) })),
      game_affecting_keys: rust.gameAffectingKeys,
      structs: settingsStructs,
    },
    storage,
    host_api: apiByFile(rust.hostApi, 'questiongame_host'),
    studio_calls: {
      by_command: studio.byCommand,
      dynamic_call_files: studio.dynamic,
    },
    app_crate: {
      plugins: rust.plugins,
      modules,
      functions: apiByFile(
        rust.appApi.filter((i) => i.kind === 'fn'),
        'questiongame_app',
      ),
    },
    ...(surfaces?.sections ?? {}),
    mismatches: uniqSorted(mismatches),
  }
}

export const HEADER = [
  '# codemap.yaml — Generated by `npm run map` — do not edit by hand.',
  '#',
  '# Every surface that can break between versions, read from the sources by a',
  '# parser (tools/codemap for Rust, scripts/lib/codemap.ts for TypeScript).',
  '# `git diff v1.0.2 -- codemap.yaml` is what changed in a release.',
  '# `npm run map:check` fails when this file is stale.',
  '',
].join('\n')

export function render(map: Record<string, unknown>): string {
  return `${HEADER}\n${toYaml(map)}`
}
