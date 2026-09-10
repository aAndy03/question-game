import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RulesSection } from './RulesSection'
import { RulesPreviewPanel } from './RulesPreviewPanel'
import { PREVIEW } from '@/copy/preview'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import type { Recipe } from '@/host/types'

/**
 * P11.12. The bug this file was written for: choosing **Bands** in Game ▸
 * Rules rendered *nothing at all*. The band editor existed as a molecule but
 * was wired only into the global Settings form, so the operator picked Bands,
 * the panel went blank, and there was no way to find out what Bands did.
 */
describe('Game ▸ Rules, the difficulty map', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (recipe: Recipe) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RulesSection recipe={recipe} frozenReason={null} />
      </QueryClientProvider>,
    )

  const withMap = (map: Recipe['settings']['scoring']['difficulty_map']): Recipe => {
    const base = demoRecipe()
    return {
      ...base,
      settings: {
        ...base.settings,
        scoring: { ...base.settings.scoring, mode: 'difficulty', difficulty_map: map },
      },
    }
  }

  it('renders an editable band table when the map is bands', async () => {
    draw(
      withMap({
        kind: 'bands',
        bands: [
          { up_to: 33, points: 10 },
          { up_to: 66, points: 20 },
          { up_to: 100, points: 30 },
        ],
      }),
    )

    // Three rows, each with its ceiling and its award — not a blank panel.
    await waitFor(() => {
      expect(document.querySelectorAll('[data-band-row]')).toHaveLength(3)
    })
    // And they are real controls, not inert markup: assert the role. HeroUI
    // v3's NumberField.Input is a text input, so the role is `textbox`.
    const fields = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(fields.length).toBeGreaterThanOrEqual(6)
    expect(fields.some((input) => input.value === '33')).toBe(true)
    expect(fields.some((input) => input.value === '30')).toBe(true)
  })

  it('renders the linear factor when the map is linear', async () => {
    draw(withMap({ kind: 'linear', factor: 10 }))
    await waitFor(() => {
      expect(document.querySelectorAll('[data-band-row]')).toHaveLength(0)
    })
    const fields = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(fields.some((input) => input.value === '10')).toBe(true)
  })

  it('offers the P11.12 speed keys, and they are controls', async () => {
    const base = demoRecipe()
    const recipe: Recipe = {
      ...base,
      settings: {
        ...base.settings,
        scoring: { ...base.settings.scoring, lock_speed_enabled: true, speed_weight: 1 },
      },
    }
    draw(recipe)
    // The banding switch is a switch, not a div that looks like one.
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
    })
  })
})

/**
 * Reported 2026-09-10: "What each setting does" said Partial Credit was
 * **in use** while the switch right above it was off.
 *
 * The table asked the host only "is this key disabled" — the §4.2 interlock —
 * and a switch that is usable but off has no interlock entry, so it fell
 * through to "In use". Two different questions had one answer between them.
 */
describe('Game ▸ Rules, what each setting is doing', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (recipe: Recipe) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RulesPreviewPanel recipeId={recipe.id} rev={recipe.rev} />
      </QueryClientProvider>,
    )

  const stateOf = (key: string) =>
    document.querySelector<HTMLElement>(`[data-effect="${key}"]`)?.dataset['state'] ?? null

  it('says off for a switch that is off, and never in use', async () => {
    draw(demoRecipe())
    await waitFor(() => expect(document.querySelector('[data-effect]')).not.toBeNull())

    // The reported key. The fixture has partial credit off.
    expect(stateOf('judging.partial_credit')).toBe('off')
    expect(stateOf('judging.order_matters')).toBe('off')
    expect(stateOf('turn.bonus_after_consecutive')).toBe('off')

    const row = document.querySelector<HTMLElement>('[data-effect="judging.partial_credit"]')
    expect(row?.textContent).toContain(PREVIEW.effects.off)
    expect(row?.textContent).not.toContain(PREVIEW.effects.live)
  })

  it('keeps off and disabled apart, and shows the value either way', async () => {
    draw(demoRecipe())
    await waitFor(() => expect(document.querySelector('[data-effect]')).not.toBeNull())

    // Three distinct states on screen at once — the thing the single
    // "disabled or not" question could never express.
    expect(stateOf('scoring.mode')).toBe('active')
    expect(stateOf('scoring.speed_steps')).toBe('off')
    expect(stateOf('scoring.flat_points')).toBe('disabled')

    // A disabled key says which sibling did it, not merely that it is off.
    const flat = document.querySelector<HTMLElement>('[data-effect="scoring.flat_points"]')
    expect(flat?.textContent).toContain('flat base')

    // And a live key reports what it is set to: "In use" alone never answers
    // the question the operator is asking.
    const mode = document.querySelector<HTMLElement>('[data-effect="scoring.mode"]')
    expect(mode?.textContent).toContain('By difficulty')
  })

  it('covers every award key, in the order the host sends', async () => {
    draw(demoRecipe())
    await waitFor(() => expect(document.querySelector('[data-effect]')).not.toBeNull())
    const keys = [...document.querySelectorAll<HTMLElement>('[data-effect]')].map((el) => el.dataset['effect'])
    expect(keys).toHaveLength(14)
    expect(keys[0]).toBe('scoring.mode')
    expect(keys.at(-1)).toBe('turn.bonus_after_consecutive')
  })
})
