import { describe, expect, it } from 'vitest'
import { ImportRefused, planImport } from './import'
import type { Domain, Question } from '../types'

const stamps = { createdAt: 0, updatedAt: 0, archivedAt: null }
const geo: Domain = { id: 'dom-geo', origin: 'operator', name: 'Geografie', code: 'GEO_101', description: null, questions: [], ...stamps }

const counter = () => {
  let n = 0
  return () => (++n).toString(16).padStart(8, '0')
}
const run = (text: string, questions: Question[] = [], domains: Domain[] = [], defaultDomainId: string | null = null) =>
  planImport(text, { questions, domains }, defaultDomainId, counter())

/** The same cases as `crates/host/src/catalog/import.rs`, so the fake cannot drift. */
describe('the fake import mirrors the host (§2.32)', () => {
  it('lands a whole row in its domain, complete', () => {
    const plan = run('[{ "question": "Q?", "options": [{ "text": "A", "correct": true }, "B"], "difficulty": 50, "domains": ["geografie"] }]', [], [geo])
    expect(plan.report.rows.map((r) => r.status)).toEqual(['complete'])
    expect(plan.questions[0]?.options[0]?.id).toBe(`${plan.questions[0]?.id}-a`)
    expect(plan.domains[0]?.id).toBe('dom-geo')
    expect(plan.report.rows[0]?.domains).toEqual(['Geografie'])
  })

  it('accepts a stem alone and options alone as incomplete, and rejects neither', () => {
    const plan = run('[{ "question": "Q?" }, { "options": ["A", "B"] }, { "difficulty": 10 }, 7]')
    expect(plan.report.rows.map((r) => r.status)).toEqual(['incomplete', 'incomplete', 'rejected', 'rejected'])
    expect(plan.report.rows[0]?.gaps).toEqual(['options', 'correct', 'difficulty', 'domain'])
    expect(plan.report.rows[2]?.reason).toBe('no_content')
    expect(plan.report.rows[3]?.reason).toBe('not_an_object')
  })

  it('creates an unknown domain once for two spellings, with the host’s code, and skips duplicates', () => {
    const plan = run('[{ "question": "Q1?", "domains": ["Istorie"] }, { "question": "Q2?", "domains": [" istorie "] }, { "question": "q1?", "domains": [] }]')
    expect(plan.report.newDomains).toEqual([{ name: 'Istorie', code: 'IST_225' }])
    expect(plan.report.rows.map((r) => r.status)).toEqual(['incomplete', 'incomplete', 'duplicate'])
    expect(plan.domains[0]?.questions).toHaveLength(2)
  })

  it('sends a row with no domain to the default one', () => {
    const plan = run('[{ "question": "Q?" }]', [], [geo], 'dom-geo')
    expect(plan.report.rows[0]?.domains).toEqual(['Geografie'])
    expect(plan.report.rows[0]?.gaps).not.toContain('domain')
  })

  it('lists what it dropped, unknown keys first and sorted', () => {
    const plan = run(
      '[{ "question": "Q?", "zeta": 1, "dificulty": 10, "difficulty": 150, "options": ["A", "", 3, { "text": "B", "correct": "yes" }] }]',
    )
    expect(plan.report.rows[0]?.ignored).toEqual([
      { field: 'dificulty', why: 'unknown' },
      { field: 'zeta', why: 'unknown' },
      { field: 'options[1]', why: 'empty' },
      { field: 'options[2]', why: 'wrong_type' },
      { field: 'options[3].correct', why: 'wrong_type' },
      { field: 'difficulty', why: 'out_of_range' },
    ])
    expect(plan.questions[0]?.options).toHaveLength(2)
  })

  it('refuses a file it cannot read, whole, with the wire message', () => {
    expect(() => run('{ nope')).toThrow(ImportRefused)
    expect(() => run('{ nope')).toThrow(/^import: the file is not valid JSON/)
    expect(() => run('{ "format": "other", "questions": [] }')).toThrow(/`format`/)
    expect(() => run('{ "version": 2, "questions": [] }')).toThrow(/`version`/)
    expect(() => run('42')).toThrow(/`questions`/)
    expect(() => run('[{ "question": "Q?" }]', [], [], 'dom-gone')).toThrow(/^import: /)
  })
})
