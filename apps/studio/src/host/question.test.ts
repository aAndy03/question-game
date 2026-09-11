import { describe, expect, it } from 'vitest'
import { acceptsQuestion, activeMemberIds, bodyGaps, effectiveBody, questionGaps } from './question'
import type { Domain, Question } from './types'

const stamps = { createdAt: 0, updatedAt: 0, archivedAt: null }

const complete = (): Question => ({
  id: 'q-1',
  origin: 'operator',
  stem: 'Which one?',
  mediaAssetId: null,
  options: [
    { id: 'q-1-a', text: 'A', correct: true },
    { id: 'q-1-b', text: 'B', correct: false },
  ],
  difficulty: 40,
  explanation: null,
  ...stamps,
})

const domain = (id: string, questionIds: string[], archivedAt: number | null = null): Domain => ({
  id,
  origin: 'operator',
  name: id,
  code: 'X_001',
  description: null,
  questions: questionIds.map((questionId, sortKey) => ({ questionId, sortKey })),
  ...stamps,
  archivedAt,
})

/** The host's matrix (`crates/host/src/catalog/complete.rs`), case for case. */
describe('the five gaps (§2.32)', () => {
  it('a complete question in a domain has none', () => {
    expect(questionGaps(complete(), true)).toEqual([])
  })

  it('reports each gap on its own', () => {
    expect(questionGaps({ ...complete(), stem: '  ' }, true)).toEqual(['stem'])
    expect(questionGaps({ ...complete(), options: complete().options.slice(0, 1) }, true)).toEqual(['options'])
    expect(questionGaps({ ...complete(), options: complete().options.map((o) => ({ ...o, correct: false })) }, true)).toEqual([
      'correct',
    ])
    expect(questionGaps({ ...complete(), difficulty: null }, true)).toEqual(['difficulty'])
    expect(questionGaps(complete(), false)).toEqual(['domain'])
  })

  it('reports them in reading order', () => {
    expect(questionGaps({ stem: '', options: [], difficulty: null }, false)).toEqual(['stem', 'options', 'correct', 'difficulty', 'domain'])
  })

  it('reads the overlay field by field, so a game can close a gap or open one', () => {
    const open = { ...complete(), difficulty: null }
    expect(bodyGaps(effectiveBody(open, { difficulty: 30 }))).toEqual([])
    expect(bodyGaps(effectiveBody(complete(), { options: [{ id: 'x', text: 'X', correct: false }] }))).toEqual(['options', 'correct'])
    expect(effectiveBody(complete(), undefined)).toEqual({ stem: 'Which one?', options: complete().options, difficulty: 40 })
  })
})

describe('the floor', () => {
  it('is a stem or one option with text', () => {
    expect(acceptsQuestion({ stem: 'Only a stem?', options: [] })).toBe(true)
    expect(acceptsQuestion({ stem: '', options: [{ id: 'a', text: 'A', correct: false }] })).toBe(true)
    expect(acceptsQuestion({ stem: '  ', options: [] })).toBe(false)
    expect(acceptsQuestion({ stem: '', options: [{ id: 'a', text: ' ', correct: false }] })).toBe(false)
  })
})

describe('active membership', () => {
  it('counts only active domains', () => {
    const ids = activeMemberIds([domain('d-1', ['q-1']), domain('d-2', ['q-2'], 5)])
    expect(ids.has('q-1')).toBe(true)
    expect(ids.has('q-2')).toBe(false)
  })
})
