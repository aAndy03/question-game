import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, useChromeStore } from './chrome'
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
  })

  it('no store state key names a Play field', () => {
    for (const store of [useChromeStore, useNavStore, useNoticeStore]) {
      const state = Object.fromEntries(
        Object.entries(store.getState()).filter(([, v]) => typeof v !== 'function'),
      )
      for (const key of keysDeep(state)) {
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
