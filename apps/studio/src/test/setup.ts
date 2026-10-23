/**
 * jsdom lacks a few browser APIs React Aria and HeroUI touch on mount.
 * Registered as `setupFiles` for the `studio` vitest project.
 */

import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

afterEach(() => cleanup())

// How long `findBy…` and `waitFor` wait (beta.8). The default is 1 s; the
// project's `testTimeout` was raised to 20 s in P12.9 because a test that
// renders the whole App can take 5 s with every jsdom worker busy, but each
// wait inside it still gave up after 1 s — so `transfer.test.tsx`, four waits
// in a row on a booted App, failed one full run in three and never alone.
// A wait that succeeds returns as soon as it does; only a real failure waits.
configure({ asyncUtilTimeout: 5_000 })

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }
  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {}
  }
  // The Web Animations API: `motion` and HeroUI's exit transitions ask an
  // element what it is animating before they remove it.
  if (typeof Element.prototype.getAnimations !== 'function') {
    Element.prototype.getAnimations = () => []
  }
  // dnd-kit finishes the document's running animations before it measures a
  // row it lifts (P20's `SortableList`).
  if (typeof document.getAnimations !== 'function') {
    document.getAnimations = () => []
  }
  // …animates the drop, then removes its placeholder when that finishes…
  if (typeof Element.prototype.animate !== 'function') {
    Element.prototype.animate = function () {
      const finished = Promise.resolve()
      return { finished, cancel() {}, finish() {}, onfinish: null, addEventListener() {}, removeEventListener() {} } as unknown as Animation
    }
  }
  // …and watches which rows are on screen while one is lifted.
  if (typeof window.IntersectionObserver === 'undefined') {
    class IntersectionObserverStub {
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0]
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
  }
  // React Aria ≥ 3.53 builds `meta[name="…"]` selectors with `CSS.escape`
  // when a modal mounts; jsdom has no `CSS` global. Escapes every character a
  // selector string cannot carry raw, which is all a meta name needs.
  if (typeof globalThis.CSS === 'undefined') {
    const escape = (value: string) => value.replace(/[^\w-]/g, (c) => `\\${c}`)
    globalThis.CSS = { escape, supports: () => false } as unknown as typeof CSS
  }
}
