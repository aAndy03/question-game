/**
 * Theme application. HeroUI v3 switches on `class="dark" data-theme="dark"`
 * on the root element (theming guide); `system` follows
 * `prefers-color-scheme` and re-applies when the OS flips.
 */

import { useEffect } from 'react'
import { usePrefs, type ThemeChoice } from './chrome'

export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

function systemPrefersDark(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

/** Mount once in `App`. */
export function useApplyTheme(): void {
  const { theme } = usePrefs()
  useEffect(() => {
    const media = systemPrefersDark()
    const apply = () => applyTheme(resolveTheme(theme, media?.matches ?? false))
    apply()
    if (theme !== 'system' || !media) return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
