/**
 * Navigation — a typed route stack (spec §12: sidebar item, crumbs,
 * back/forward stack, the referrer a question editor returns to).
 *
 * Not a URL router: one desktop window, no deep links, and "the stack
 * remembers the referrer" is a stack. The route is a discriminated union, so a
 * page receives typed params as props and never parses a string. Should a
 * router ever be wanted, `useRoute` / `useNavigate` are the whole surface a
 * page sees; this file is what changes.
 *
 * Chrome only. A dirty editor registers a guard that may veto `go`.
 */

import { create } from 'zustand'

export type Tab =
  | 'teams'
  | 'library'
  | 'games'
  | 'operators'
  | 'control'
  | 'screens'
  | 'statistics'
  | 'settings'

export type RecordMode = 'view' | 'edit'

export type Route =
  | { readonly tab: 'teams' }
  | { readonly tab: 'teams'; readonly id: string; readonly mode: RecordMode }
  | { readonly tab: 'teams'; readonly mode: 'new' }
  | { readonly tab: 'library'; readonly domainId?: string }
  | {
      readonly tab: 'library'
      readonly questionId: string
      readonly mode: RecordMode
      /** Where "Back" goes; the domain that was open when the editor opened. */
      readonly domainId?: string
    }
  | { readonly tab: 'library'; readonly mode: 'new'; readonly domainId?: string }
  | { readonly tab: 'games' }
  | { readonly tab: 'games'; readonly id: string; readonly section?: GameSection }
  | { readonly tab: 'operators' }
  | { readonly tab: 'operators'; readonly id: string; readonly mode: RecordMode }
  | { readonly tab: 'operators'; readonly mode: 'new' }
  | { readonly tab: 'control' }
  | { readonly tab: 'screens' }
  | { readonly tab: 'statistics'; readonly view?: 'live' | 'all' }
  | { readonly tab: 'settings'; readonly inner?: SettingsInner }

export type GameSection = 'roster' | 'board' | 'rules' | 'plays'
export type SettingsInner = 'monitors' | 'settings' | 'shortcuts' | 'about'

export const HOME: Route = { tab: 'teams' }

/**
 * A guard may veto a navigation. It returns `true` to allow, `false` to keep
 * the current route, or a promise of either (the dirty dialog is async).
 */
export type NavGuard = (to: Route) => boolean | Promise<boolean>

/**
 * Where "quitting the app" navigates to, as far as a guard can tell (P12.2).
 * A real route by value, so every guard can read it; `useDirtyGuard` compares
 * it by identity to know that a save should end in a quit, not a navigation.
 */
export const QUIT_ROUTE: Route = Object.freeze({ tab: 'settings' }) as Route

interface NavState {
  readonly route: Route
  readonly back: readonly Route[]
  readonly forward: readonly Route[]
  readonly guard: NavGuard | null
  go(route: Route): Promise<boolean>
  /** Ask the current guard whether the app may close (P12.2). */
  askLeave(): Promise<boolean>
  replace(route: Route): void
  goBack(): Promise<boolean>
  goForward(): Promise<boolean>
  setGuard(guard: NavGuard | null): void
}

export const useNavStore = create<NavState>((set, get) => ({
  route: HOME,
  back: [],
  forward: [],
  guard: null,

  async go(route) {
    const { guard, route: current, back } = get()
    if (sameRoute(current, route)) return true
    if (guard && !(await guard(route))) return false
    set({ route, back: [...back, current].slice(-50), forward: [] })
    return true
  },

  async askLeave() {
    const { guard } = get()
    return guard ? await guard(QUIT_ROUTE) : true
  },

  replace(route) {
    set({ route })
  },

  async goBack() {
    const { guard, back, forward, route } = get()
    const target = back[back.length - 1]
    if (!target) return false
    if (guard && !(await guard(target))) return false
    set({ route: target, back: back.slice(0, -1), forward: [route, ...forward] })
    return true
  },

  async goForward() {
    const { guard, back, forward, route } = get()
    const target = forward[0]
    if (!target) return false
    if (guard && !(await guard(target))) return false
    set({ route: target, back: [...back, route], forward: forward.slice(1) })
    return true
  },

  setGuard(guard) {
    set({ guard })
  },
}))

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useRoute(): Route {
  return useNavStore((s) => s.route)
}

export function useNavigate() {
  return useNavStore((s) => s.go)
}

/** True when the route is inside an editor (new or edit). */
export function isEditing(route: Route): boolean {
  return 'mode' in route && (route.mode === 'edit' || route.mode === 'new')
}

/** The sidebar tab a route belongs to. */
export function tabOf(route: Route): Tab {
  return route.tab
}
