import { afterEach, describe, expect, it } from 'vitest'
import { isMirrorMode, isViewerMode } from './host'

/**
 * P11.11. A mirror is the same bundle fed the same emission, and differs in
 * exactly two behaviours: it makes no sound, and it does not acknowledge an
 * animation. Both are load-bearing — three windows playing every cue is a
 * flam, and a second ack advances the overlay queue twice.
 *
 * Decided by the URL rather than the window label so the answer is there on
 * the first render, before the async label fetch resolves.
 */
const setSearch = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    configurable: true,
  })
}

afterEach(() => setSearch(''))

describe('mirror mode', () => {
  it('is decided by the URL, synchronously', () => {
    setSearch('')
    expect(isMirrorMode()).toBe(false)
    setSearch('?mirror')
    expect(isMirrorMode()).toBe(true)
  })

  it('is not the Viewer, which is a different thing again', () => {
    setSearch('?viewer')
    expect(isMirrorMode()).toBe(false)
    setSearch('?mirror')
    expect(isViewerMode(), 'the Viewer needs a parent window as well').toBe(false)
  })
})
