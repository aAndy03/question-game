import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, useChromeStore } from './chrome'
import { useHealthStore } from './health'
import { useNavStore, HOME } from './nav'
import { useNoticeStore } from './notices'

/**
 * P7 exit criterion: "Zustand holds only chrome state; a grep for
 * score/ring/session keys in stores returns nothing." Done here as a test over
 * the live state shapes rather than a grep, so a renamed key is still caught.
 */
const FORBIDDEN = /score|ring|session|timer|remaining|locked|reveal|team|domain|question/i

function keysDeep(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([k, v]) => [
    `${path}${k}`,
    ...keysDeep(v, `${path}${k}.`),
  ])
}

describe('chrome stores hold chrome only', () => {
  beforeEach(() => {
    useChromeStore.setState({ operatorId: '', prefs: {}, archiveScope: {} })
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    useHealthStore.setState({ report: null })
  })

  it('no store state key names a Play field', () => {
    // Populate every optional shape so the walk sees the full document.
    useChromeStore.getState().setOperator('op-a')
    useChromeStore.getState().setSettingsInner('shortcuts')
    useHealthStore.getState().setReport({ status: 'warn', items: [] })
    for (const store of [useChromeStore, useNavStore, useNoticeStore, useHealthStore]) {
      const state = Object.fromEntries(
        Object.entries(store.getState()).filter(([, v]) => typeof v !== 'function'),
      )
      for (const key of keysDeep(state)) {
        // `view.teams` is the Teams *tab's* grid|table preference, keyed by
        // tab name — chrome about a list, not a roster.
        if (/\.view\.[a-z]+$/.test(key)) continue
        expect(key, `${key} looks like Play state`).not.toMatch(FORBIDDEN)
      }
    }
  })

  it('keeps preferences per operator', () => {
    const s = useChromeStore.getState()
    s.setOperator('op-a')
    s.setView('teams', 'table')
    s.setOperator('op-b')
    expect(useChromeStore.getState().prefs['op-b']).toBeUndefined()
    s.setOperator('op-a')
    expect(useChromeStore.getState().prefs['op-a']?.view.teams).toBe('table')
    expect(DEFAULT_PREFS.view.teams).toBe('grid')
  })

  it('keeps the Settings inner tab per operator (§12.2)', () => {
    const s = useChromeStore.getState()
    s.setOperator('op-a')
    s.setSettingsInner('shortcuts')
    expect(useChromeStore.getState().prefs['op-a']?.settingsInner).toBe('shortcuts')
    s.setOperator('op-b')
    expect(useChromeStore.getState().prefs['op-b']?.settingsInner).toBeUndefined()
    expect(DEFAULT_PREFS.settingsInner).toBe('monitors')
  })

  it('cycles the sidebar through its three states', () => {
    const s = useChromeStore.getState()
    s.setOperator('op')
    s.cycleSidebar()
    expect(useChromeStore.getState().prefs['op']?.sidebar).toBe('rail')
    s.cycleSidebar()
    expect(useChromeStore.getState().prefs['op']?.sidebar).toBe('hidden')
    s.cycleSidebar()
    expect(useChromeStore.getState().prefs['op']?.sidebar).toBe('expanded')
  })
})

describe('nav', () => {
  beforeEach(() => useNavStore.setState({ route: HOME, back: [], forward: [], guard: null }))

  it('keeps a back/forward stack', async () => {
    const nav = useNavStore.getState()
    await nav.go({ tab: 'games' })
    await nav.go({ tab: 'games', id: 'r1' })
    expect(useNavStore.getState().back).toHaveLength(2)
    await nav.goBack()
    expect(useNavStore.getState().route).toEqual({ tab: 'games' })
    await nav.goForward()
    expect(useNavStore.getState().route).toEqual({ tab: 'games', id: 'r1' })
  })

  it('lets a guard veto and leaves the route alone', async () => {
    const nav = useNavStore.getState()
    nav.setGuard(async () => false)
    expect(await nav.go({ tab: 'operators' })).toBe(false)
    expect(useNavStore.getState().route).toEqual(HOME)
  })

  it('a same-route go is a no-op that does not grow the stack', async () => {
    const nav = useNavStore.getState()
    await nav.go(HOME)
    expect(useNavStore.getState().back).toHaveLength(0)
  })
})

describe('notices', () => {
  beforeEach(() => useNoticeStore.setState({ notices: [] }))

  it('refuses a fourth action (§14)', () => {
    expect(() =>
      useNoticeStore.getState().push({
        code: 'x',
        severity: 'warn',
        targetPath: null,
        actions: ['a', 'b', 'c', 'd'],
        detail: {},
      }),
    ).toThrow()
  })

  it('replaces one source wholesale and leaves the rest alone', () => {
    const s = useNoticeStore.getState()
    s.pushError('match', 'no')
    const health = (code: string) => ({ code, severity: 'warn' as const, targetPath: null, actions: ['open_data_folder'], detail: { source: 'health' } })
    s.replaceSource('health', [health('health.disk_low'), health('health.search_degraded')])
    expect(useNoticeStore.getState().notices).toHaveLength(3)
    s.replaceSource('health', [health('health.disk_low')])
    const after = useNoticeStore.getState().notices
    expect(after).toHaveLength(2)
    expect(after.filter((n) => n.detail.source === 'health').map((n) => n.code)).toEqual(['health.disk_low'])
    expect(after.some((n) => n.code === 'match')).toBe(true)
  })

  it('stacks confirm frames to depth three and pops one at a time', () => {
    const s = useNoticeStore.getState()
    const id = s.pushError('match', 'no')
    s.pushFrame(id, { title: 'Are you sure?', body: '', actions: ['yes'] })
    s.pushFrame(id, { title: 'Really?', body: '', actions: ['yes'] })
    expect(useNoticeStore.getState().notices[0]?.frames).toHaveLength(2)
    s.popFrame(id)
    expect(useNoticeStore.getState().notices[0]?.frames).toHaveLength(1)
  })
})
