/**
 * jsdom lacks a few browser APIs React Aria and HeroUI touch on mount.
 * Registered as `setupFiles` for the `studio` vitest project.
 */

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

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
  // React Aria ≥ 3.53 builds `meta[name="…"]` selectors with `CSS.escape`
  // when a modal mounts; jsdom has no `CSS` global. Escapes every character a
  // selector string cannot carry raw, which is all a meta name needs.
  if (typeof globalThis.CSS === 'undefined') {
    const escape = (value: string) => value.replace(/[^\w-]/g, (c) => `\\${c}`)
    globalThis.CSS = { escape, supports: () => false } as unknown as typeof CSS
  }
}
