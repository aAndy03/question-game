import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { noticeText, useNoticeStore } from '@/chrome/notices'
import { CONFIRM, LIST, TEAM } from '@/copy'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { CatalogItem, PlayRecord, Team } from '@/host/types'
import { acceptsDifficulty, InlineNotice } from '@/molecules'
import { playNumbers } from '@/organisms/PlaysSection'

/** Stable 1.1.1: the narrow window, the difficulty dialog, and the 1.1 bugs. */
let fake: FakeHost

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
  receivePlayState(null)
  fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
})
afterEach(() => {
  setHostTransport(null)
  cleanup()
})

async function at(route: Route) {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go(route)
  })
}

describe('an opened row below 1280 px (1.1.1)', () => {
  it('is drawn in an aside with a Close back to the list', async () => {
    await at({ tab: 'teams', id: 'team-alpha', mode: 'view' } as Route)
    const aside = (await waitFor(() => {
      const el = document.querySelector('[data-detail-aside]')
      if (!el) throw new Error('no aside')
      return el
    })) as HTMLElement
    // Not hidden below xl any more: it is the overlay there, the aside at xl.
    expect(aside.className).not.toMatch(/(^| )hidden( |$)/)
    fireEvent.click(within(aside).getByRole('button', { name: LIST.closeDetail }))
    await waitFor(() => expect(useNavStore.getState().route).toEqual({ tab: 'teams' }))
  })
})

describe('the difficulty dialog (1.1.1)', () => {
  it('replaces the prompt: This game only writes the overlay', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    fireEvent.click(await screen.findByRole('button', { name: /^Difficulty of Which empire built the road/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByRole('textbox')
    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.blur(field)
    fireEvent.click(within(dialog).getByRole('button', { name: CONFIRM.thisGame }))
    await waitFor(() => expect(fake.calls.find((c) => c.name === 'recipe_set_overlay')?.args).toMatchObject({ scope: 'this_game', target: { patch: { difficulty: 30 } } }))
  })

  it('takes a whole number 1–100', () => {
    for (const bad of [null, 0, 101, 2.5]) expect(acceptsDifficulty(bad, 20)).toBe(false)
    expect(acceptsDifficulty(30, 20)).toBe(true)
  })
})

describe('the 1.1 bugs (1.1.1)', () => {
  it('the archive confirm says "used by" once', () => {
    expect(CONFIRM.referencedBy('a recipe board')).not.toMatch(/\ba a\b/)
  })

  it('a theme colour is a swatch, not raw text', async () => {
    const red: CatalogItem = {
      kind: 'team',
      item: { id: 'seed-team-red', origin: 'seed', name: 'Red', shortCode: 'RED', color: 'var(--state-incorrect)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } satisfies Team,
    }
    fake.seed([red])
    await at({ tab: 'teams', id: 'seed-team-red', mode: 'edit' } as Route)
    expect((await screen.findByRole('radio', { name: TEAM.themeColour })).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('textbox', { name: TEAM.colorCode }) as HTMLInputElement).value).toBe('')
  })

  it('the team detail names a theme colour instead of printing its token', async () => {
    const red: CatalogItem = {
      kind: 'team',
      item: { id: 'seed-team-red', origin: 'seed', name: 'Red', shortCode: 'RED', color: 'var(--state-incorrect)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } satisfies Team,
    }
    fake.seed([red])
    await at({ tab: 'teams', id: 'seed-team-red', mode: 'view' } as Route)
    expect(await screen.findByText(TEAM.themeColour, {}, { timeout: 5000 })).toBeTruthy()
    expect(document.body.textContent).not.toContain('var(--state-incorrect)')
  })

  it('Plays are numbered by start time', () => {
    const play = (id: string, startedAtMs: number) => ({ id, startedAtMs }) as unknown as PlayRecord
    const n = playNumbers([play('p-c', 30), play('p-a', 10), play('p-b', 10)])
    expect([n.get('p-a'), n.get('p-b'), n.get('p-c')]).toEqual([1, 2, 3])
  })

  it('a refusal shows its reason, not its routing path', () => {
    render(
      <InlineNotice
        notice={{ id: 1, code: 'catalog', severity: 'error', targetPath: 'recipe.r1.board', actions: [], detail: { message: 'recipe.r1.board: the board has no questions' } } as never}
        onAction={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByText('the board has no questions')).toBeTruthy()
    expect(document.body.textContent).not.toContain('recipe.r1.board:')
  })
})

describe('the 1.1.1 review', () => {
  it('a refused difficulty edit closes the dialog, so the Board says why', async () => {
    // Two at 20 in History once q-h1 is set to 45 (q-h2's): the host refuses it.
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    fireEvent.click(await screen.findByRole('button', { name: /^Difficulty of Which empire built the road/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByRole('textbox')
    fireEvent.change(field, { target: { value: '45' } })
    fireEvent.blur(field)
    fireEvent.click(within(dialog).getByRole('button', { name: CONFIRM.thisGame }))
    await waitFor(() => expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Apply to original of the value this game asks writes it', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    fireEvent.click(await screen.findByRole('button', { name: /^Difficulty of Which two of these were signatories/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: CONFIRM.original }))
    await waitFor(() => expect(fake.calls.find((c) => c.name === 'recipe_set_overlay')?.args).toMatchObject({ scope: 'original', target: { patch: { difficulty: 70 } } }))
  })

  it('the question aside closes back to its domain', async () => {
    await at({ tab: 'library', questionId: 'q-h1', mode: 'view', domainId: 'dom-history' } as Route)
    const aside = (await waitFor(() => {
      const el = document.querySelector('[data-detail-aside]')
      if (!el) throw new Error('no aside')
      return el
    })) as HTMLElement
    fireEvent.click(within(aside).getByRole('button', { name: LIST.closeDetail }))
    await waitFor(() => expect(useNavStore.getState().route).toEqual({ tab: 'library', domainId: 'dom-history' }))
  })

  it('the theme colour can be picked again after a palette colour', async () => {
    const red: CatalogItem = {
      kind: 'team',
      item: { id: 'seed-team-red', origin: 'seed', name: 'Red', shortCode: 'RED', color: 'var(--state-incorrect)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } satisfies Team,
    }
    fake.seed([red])
    await at({ tab: 'teams', id: 'seed-team-red', mode: 'edit' } as Route)
    const theme = await screen.findByRole('radio', { name: TEAM.themeColour })
    const field = screen.getByRole('textbox', { name: TEAM.colorCode }) as HTMLInputElement
    fireEvent.change(field, { target: { value: '#123456' } })
    expect(theme.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(theme)
    expect(theme.getAttribute('aria-checked')).toBe('true')
    // A value being typed is not a theme colour yet.
    fireEvent.change(field, { target: { value: 'var(' } })
    expect(field.value).toBe('var(')
  })

  it('a field error is the reason, not the path', () => {
    expect(noticeText({ targetPath: 'team.t1.name', detail: { message: 'team.t1.name: a team needs a name' } })).toBe('a team needs a name')
    expect(noticeText({ targetPath: 'team.t1', detail: { message: 'team.t1.name: a team needs a name' } })).toBe('a team needs a name')
    expect(noticeText({ targetPath: null, detail: { message: 'Plain words' } })).toBe('Plain words')
    expect(CONFIRM.referencedBy('an open play')).toContain('an open Play')
  })
})
