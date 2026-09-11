import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, STAGE_LANGUAGES, nodeId } from '@questiongame/contract'
import { COPY_TABLES, STAGE_COPY, STAGE_COPY_RO, resolveCopy } from './tables'
import { StageRoot } from '@/pages'

const byNode = (root: HTMLElement, id: string) => root.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null

/** Every leaf path of a table, so two tables can be compared key for key. */
function leaves(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return [path]
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  }
  return [path]
}

describe('stage copy tables', () => {
  it('has one table per contract language, with the same keys', () => {
    for (const language of STAGE_LANGUAGES) expect(COPY_TABLES[language], language).toBeTruthy()
    expect(leaves(STAGE_COPY_RO).sort()).toEqual(leaves(STAGE_COPY).sort())
  })

  it('translates every authored word, and only shares what the design system owns', () => {
    // A key that reads the same in both tables is either shared formatting
    // (delimiters, digits, joiners) or a word Romanian borrows unchanged
    // (BONUS, MEDIU is not one). Listing them keeps a missed translation from
    // hiding behind "it matched".
    const shared = ['delimiter', 'clockOpen', 'clockClose', 'sessionValue', 'timerUrgentSeconds', 'bonusLabel', 'sequencePrefix', 'sequenceDigits', 'placeDigits', 'championJoiner', 'difficultyDisplay']
    for (const key of Object.keys(STAGE_COPY) as (keyof typeof STAGE_COPY)[]) {
      const same = JSON.stringify(STAGE_COPY[key]) === JSON.stringify(STAGE_COPY_RO[key])
      if (typeof STAGE_COPY[key] === 'object' && key === 'screenTitle') continue
      expect(same, `${key}: ${same ? 'not translated' : 'translated'}`).toBe(shared.includes(key))
    }
    // Screen titles: every non-empty one differs.
    for (const [screen, title] of Object.entries(STAGE_COPY.screenTitle)) {
      if (title) expect(STAGE_COPY_RO.screenTitle[screen as keyof typeof STAGE_COPY.screenTitle], screen).not.toBe(title)
    }
  })

  it('resolves English by default and overrides on top of the chosen table', () => {
    expect(resolveCopy()).toEqual(STAGE_COPY)
    expect(resolveCopy('ro').leaderTag).toBe('LIDER')
    expect(resolveCopy('ro', { domainLabel: 'X' }).domainLabel).toBe('X')
    const titled = resolveCopy('en', { chooseDomainTitle: 'PICK ONE', idleEyebrow: 'MY SHOW' })
    expect(titled.screenTitle.chooseDomain).toBe('PICK ONE')
    expect(titled.screenTitle.scoreboard).toBe('CURRENT STANDINGS')
    expect(titled.idleEyebrow).toBe('MY SHOW')
  })
})

describe('Stage draws the language play-state carries', () => {
  it('draws the Romanian title and tags when language is ro, and nothing derived changes', () => {
    const state = { ...FIXTURES['choose-domain'], language: 'ro' as const }
    const { container } = render(<StageRoot state={state} />)
    // Title: authored half translated, the team name as the author wrote it.
    expect(byNode(container, nodeId('chooseDomain', 'title'))!.textContent).toBe('ALEGE CATEGORIA // TEAM GAMMA')
    // Header carries the eyebrow, in Romanian.
    expect(byNode(container, nodeId('chooseDomain', 'header'))!.textContent).toContain(STAGE_COPY_RO.idleEyebrow)
    // Domain names are game data: untouched.
    for (const d of state.domains) expect(byNode(container, nodeId('chooseDomain', 'card', d.id))!.textContent).toContain(d.name)
  })

  it('draws English for the same fixture when language is en', () => {
    const { container } = render(<StageRoot state={{ ...FIXTURES['choose-domain'], language: 'en' }} />)
    expect(byNode(container, nodeId('chooseDomain', 'title'))!.textContent).toBe('SELECT CATEGORY // TEAM GAMMA')
  })

  it('switches every label on the scoreboard, the unit included', () => {
    const { container } = render(<StageRoot state={{ ...FIXTURES.scoreboard, language: 'ro' }} />)
    expect(byNode(container, nodeId('scoreboard', 'title'))!.textContent).toBe('CLASAMENT ACTUAL //')
    expect(container.textContent).toContain('LIDER')
    expect(container.textContent).toContain(' PCT')
    expect(container.textContent).not.toContain('LEADER')
  })

  it('draws the operator text for the language on the wire, and the table text for the other', () => {
    const text = { ro: { idleEyebrow: 'SPECTACOLUL MEU', chooseDomainTitle: 'ALEGE DOMENIUL' } }
    const base = FIXTURES['choose-domain']
    const ro = render(<StageRoot state={{ ...base, language: 'ro', layout: { ...base.layout, text } }} />)
    expect(byNode(ro.container, nodeId('chooseDomain', 'title'))!.textContent).toBe('ALEGE DOMENIUL // TEAM GAMMA')
    expect(byNode(ro.container, nodeId('chooseDomain', 'header'))!.textContent).toContain('SPECTACOLUL MEU')
    ro.unmount()
    const en = render(<StageRoot state={{ ...base, language: 'en', layout: { ...base.layout, text } }} />)
    expect(byNode(en.container, nodeId('chooseDomain', 'title'))!.textContent).toBe('SELECT CATEGORY // TEAM GAMMA')
  })
})
