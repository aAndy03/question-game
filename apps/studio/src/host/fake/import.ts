/**
 * `catalog_import_questions` for the fake host — the TypeScript mirror of
 * `crates/host/src/catalog/import.rs` (§2.32, 05_STUDIO_DESIGN.md §17.2–17.3).
 * Same document, same statuses, same refusals, so `?fake` and the dialog tests
 * meet the report the app sends. Change both in one commit.
 */

import { suggestDomainCode } from '../domain'
import { questionGaps } from '../question'
import type { Domain, ImportIgnored, ImportReport, ImportRow, Question } from '../types'

export const IMPORT_FORMAT = 'questiongame.questions'
export const IMPORT_VERSION = 1
export const IMPORT_MAX_ROWS = 2000
const ROW_FIELDS = ['question', 'options', 'difficulty', 'domains', 'explanation']

/** A file refused whole. `message` is what the host would send: `import: …`. */
export class ImportRefused extends Error {}

export interface ImportPlan {
  readonly report: ImportReport
  readonly questions: Question[]
  readonly domains: Domain[]
}

const refused = (reason: string) => new ImportRefused(`import: ${reason}`)
const fold = (text: string) => text.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase()
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The folded stem and the folded options with their marks, as a set. */
function fingerprint(stem: string, options: readonly (readonly [string, boolean])[]): string {
  const folded = options.map(([text, correct]) => `${correct ? 1 : 0}${fold(text)}`).sort()
  return JSON.stringify([fold(stem), folded])
}

function rowsOf(text: string): unknown[] {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (e) {
    throw refused(`the file is not valid JSON: ${(e as Error).message}`)
  }
  let rows: unknown
  if (Array.isArray(doc)) rows = doc
  else if (isObject(doc)) {
    if ('format' in doc && doc.format !== IMPORT_FORMAT) {
      throw refused(`this is not a questiongame question file (\`format\` must be "${IMPORT_FORMAT}")`)
    }
    if ('version' in doc && doc.version !== IMPORT_VERSION) {
      throw refused(`this file is from a version this build cannot read (\`version\` must be ${IMPORT_VERSION})`)
    }
    rows = doc.questions
  }
  if (!Array.isArray(rows)) throw refused('the file has no `questions` list')
  if (rows.length > IMPORT_MAX_ROWS) throw refused(`the file has ${rows.length} questions; one import takes at most ${IMPORT_MAX_ROWS}`)
  return rows
}

interface Read {
  stem: string
  options: [string, boolean][]
  difficulty: number | null
  domains: string[]
  explanation: string | null
  ignored: ImportIgnored[]
}

function readRow(fields: Record<string, unknown>): Read {
  const read: Read = { stem: '', options: [], difficulty: null, domains: [], explanation: null, ignored: [] }
  const drop = (field: string, why: ImportIgnored['why']) => void read.ignored.push({ field, why })
  // Unknown keys first, sorted — as the host does, so the lists match.
  for (const key of Object.keys(fields)
    .filter((k) => !ROW_FIELDS.includes(k))
    .sort())
    drop(key, 'unknown')

  const stem = fields.question
  if (typeof stem === 'string') read.stem = stem.trim()
  else if (stem !== undefined && stem !== null) drop('question', 'wrong_type')

  const options = fields.options
  if (Array.isArray(options)) {
    options.forEach((item, k) => {
      const field = `options[${k}]`
      let text: string
      let correct = false
      if (typeof item === 'string') text = item
      else if (isObject(item) && typeof item.text === 'string') {
        text = item.text
        if (typeof item.correct === 'boolean') correct = item.correct
        else if (item.correct !== undefined && item.correct !== null) drop(`${field}.correct`, 'wrong_type')
      } else return drop(field, 'wrong_type')
      if (!text.trim()) return drop(field, 'empty')
      read.options.push([text.trim(), correct])
    })
  } else if (options !== undefined && options !== null) drop('options', 'wrong_type')

  const difficulty = fields.difficulty
  if (typeof difficulty === 'number') {
    if (Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 100) read.difficulty = difficulty
    else drop('difficulty', 'out_of_range')
  } else if (difficulty !== undefined && difficulty !== null) drop('difficulty', 'wrong_type')

  const domains = fields.domains
  const pushDomain = (field: string, name: string) => (name.trim() ? void read.domains.push(name) : drop(field, 'empty'))
  if (typeof domains === 'string') pushDomain('domains', domains)
  else if (Array.isArray(domains)) {
    domains.forEach((name, k) => (typeof name === 'string' ? pushDomain(`domains[${k}]`, name) : drop(`domains[${k}]`, 'wrong_type')))
  } else if (domains !== undefined && domains !== null) drop('domains', 'wrong_type')

  const explanation = fields.explanation
  if (typeof explanation === 'string') read.explanation = explanation.trim() || null
  else if (explanation !== undefined && explanation !== null) drop('explanation', 'wrong_type')
  return read
}

const suffix = (k: number) => (k < 26 ? String.fromCharCode(97 + k) : `o${k}`)

/** Read one question file and say what importing it would do. */
export function planImport(
  text: string,
  library: { readonly questions: readonly Question[]; readonly domains: readonly Domain[] },
  defaultDomainId: string | null,
  mint: () => string,
): ImportPlan {
  const rows = rowsOf(text)
  if (defaultDomainId !== null && !library.domains.some((d) => d.id === defaultDomainId)) {
    throw refused('the domain chosen for questions without one is not in the active library')
  }

  const seen = new Set(library.questions.map((q) => fingerprint(q.stem, q.options.map((o) => [o.text, o.correct] as const))))
  // Names before codes, so a code that spells another domain's name never shadows it.
  const byKey = new Map<string, string>()
  for (const d of library.domains) if (!byKey.has(fold(d.name))) byKey.set(fold(d.name), d.id)
  for (const d of library.domains) if (!byKey.has(fold(d.code))) byKey.set(fold(d.code), d.id)
  const created: Domain[] = []
  // Insertion order is the order the import first touched each domain.
  const members = new Map<string, string[]>()
  const find = (id: string) => library.domains.find((d) => d.id === id) ?? created.find((d) => d.id === id)
  const resolve = (name: string): string => {
    const key = fold(name)
    const known = byKey.get(key)
    if (known) return known
    const spelled = name.trim().split(/\s+/).join(' ')
    const id = `dom-${mint()}`
    created.push({
      id,
      origin: 'operator',
      name: spelled,
      code: suggestDomainCode(spelled),
      description: null,
      questions: [],
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    })
    byKey.set(key, id)
    return id
  }

  const reportRows: ImportRow[] = []
  const questions: Question[] = []
  const counts = { complete: 0, incomplete: 0, duplicate: 0, rejected: 0 }
  rows.forEach((raw, i) => {
    const index = i + 1
    if (!isObject(raw)) {
      counts.rejected += 1
      reportRows.push({ index, status: 'rejected', stem: '', domains: [], gaps: [], ignored: [], reason: 'not_an_object' })
      return
    }
    const read = readRow(raw)
    if (!read.stem && read.options.length === 0) {
      counts.rejected += 1
      reportRows.push({ index, status: 'rejected', stem: read.stem, domains: [], gaps: [], ignored: read.ignored, reason: 'no_content' })
      return
    }
    const print = fingerprint(read.stem, read.options)
    if (seen.has(print)) {
      counts.duplicate += 1
      reportRows.push({ index, status: 'duplicate', stem: read.stem, domains: [], gaps: [], ignored: read.ignored, reason: null })
      return
    }
    seen.add(print)

    const domainIds: string[] = []
    for (const name of read.domains) {
      const id = resolve(name)
      if (!domainIds.includes(id)) domainIds.push(id)
    }
    if (domainIds.length === 0 && defaultDomainId !== null) domainIds.push(defaultDomainId)

    const id = `q-${mint()}`
    const question: Question = {
      id,
      origin: 'operator',
      stem: read.stem,
      mediaAssetId: null,
      options: read.options.map(([text, correct], k) => ({ id: `${id}-${suffix(k)}`, text, correct })),
      difficulty: read.difficulty,
      explanation: read.explanation,
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    }
    const gaps = questionGaps(question, domainIds.length > 0)
    const status = gaps.length === 0 ? 'complete' : 'incomplete'
    counts[status] += 1
    for (const d of domainIds) members.set(d, [...(members.get(d) ?? []), id])
    reportRows.push({ index, status, stem: read.stem, domains: domainIds.map((d) => find(d)?.name ?? ''), gaps, ignored: read.ignored, reason: null })
    questions.push(question)
  })

  const domains: Domain[] = [...members.entries()].flatMap(([id, added]) => {
    const domain = find(id)
    if (!domain) return []
    let next = Math.max(-1, ...domain.questions.map((m) => m.sortKey)) + 1
    return [{ ...domain, questions: [...domain.questions, ...added.map((questionId) => ({ questionId, sortKey: next++ }))] }]
  })
  const newDomains = created.filter((d) => members.has(d.id)).map((d) => ({ name: d.name, code: d.code }))
  return { report: { committed: false, rows: reportRows, newDomains, counts }, questions, domains }
}
