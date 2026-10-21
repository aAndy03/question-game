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

  it('says where a row lands, its tags, and what a duplicate repeats; twins resolve to the oldest (beta.3)', () => {
    const old: Domain = { ...geo, id: 'dom-old', name: 'History', code: 'HIS_100', createdAt: 1 }
    const young: Domain = { ...geo, id: 'dom-young', name: 'History', code: 'HIS_200', createdAt: 5 }
    const rome: Question = { id: 'q1', origin: 'operator', stem: 'Who built Rome?', mediaAssetId: null, options: [{ id: 'q1-a', text: 'Romulus', correct: true }, { id: 'q1-b', text: 'Remus', correct: false }], difficulty: 10, explanation: null, ...stamps }
    const plan = run(
      JSON.stringify([
        { question: 'When did Rome fall?', options: [{ text: '476', correct: true }, '1453'], domains: ['history'], tags: [' Empire ', 'empire', 'Rome'] },
        { question: 'Who built Rome?', options: [{ text: 'Romulus', correct: true }, 'Remus'] },
        { question: 'Name a river', options: [{ text: 'Tiber', correct: true }, 'Nile'], domains: ['Geography', 'HIS_200'] },
        { question: 'When did Rome fall?', options: [{ text: '476', correct: true }, '1453'] },
      ]),
      [rome],
      [young, old],
    )
    const rows = plan.report.rows
    expect(rows[0]?.landing).toEqual(['History (HIS_100), the oldest of 2 named History'])
    expect(rows[0]?.tags).toEqual(['Empire', 'Rome'])
    expect(plan.questions[0]?.tags).toEqual(['Empire', 'Rome'])
    expect(rows[1]?.duplicateOf).toBe('Who built Rome?')
    expect(rows[2]?.landing).toEqual(['Geography (new)', 'History (HIS_200), one of 2 named History'])
    expect(rows[3]?.duplicateOf).toBe('row 1')
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
