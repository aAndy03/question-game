import { describe, expect, it } from 'vitest'
import { keys } from './queries'
import { targetPathOf } from './commands'

/** P7 exit criterion: `play-state` never appears in a TanStack Query key. */
describe('query keys', () => {
  const every = [
    keys.catalog.all,
    keys.catalog.kind('team'),
    keys.catalog.list('team', 'active'),
    keys.catalog.item('question', 'q'),
    keys.catalog.referencedBy('domain', 'd'),
    keys.search({ text: 'x', kinds: [], scope: 'active', limit: 10 }),
    keys.recipes.all,
    keys.recipes.list('archived'),
    keys.recipes.item('r'),
    keys.settings,
    keys.monitors,
    keys.paths,
    keys.seedStatus.all,
    keys.seedStatus.of('ro'),
    keys.importPreview('{}', null),
    keys.plays.list(null),
    keys.plays.events('p'),
  ]

  it('never name the live Play', () => {
    for (const key of every) {
      const flat = JSON.stringify(key)
      expect(flat).not.toMatch(/play-state|playState|get_state/)
    }
  })

  it('mirror the §13 read verbs and nothing else', () => {
    const roots = new Set(every.map((k) => k[0]))
    expect([...roots].sort()).toEqual([
      'catalog',
      'import-preview',
      'monitors',
      'paths',
      'plays',
      'recipes',
      'search',
      'seed-status',
      'settings',
    ])
  })
})

describe('targetPathOf', () => {
  it('reads the path off a CatalogError::Invalid message', () => {
    expect(targetPathOf('team.t-1.name: a team needs a name')).toBe('team.t-1.name')
    expect(targetPathOf('question.q-9.options: a question needs at least two options')).toBe('question.q-9.options')
  })
  it('reads the bare settings paths (§12.2)', () => {
    expect(targetPathOf('audio.volume: volume is 0-100')).toBe('audio.volume')
    expect(targetPathOf('shortcuts: that chord is already bound to another command')).toBe('shortcuts')
    expect(targetPathOf('operator.op-1.pin: wrong pin')).toBe('operator.op-1.pin')
  })
  it('lands an import refusal on the dialog (§2.32)', () => {
    expect(targetPathOf('import: the file is not valid JSON: expected value at line 1 column 1')).toBe('import')
  })
  it('has no path for anything else', () => {
    expect(targetPathOf('recipe r already has an open play, p')).toBeNull()
    expect(targetPathOf('stage may not call play_start')).toBeNull()
    expect(targetPathOf('a Play is open')).toBeNull()
  })
})
