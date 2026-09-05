/**
 * Chrome preferences — what the operator has arranged, never what the game
 * is. Sidebar mode, theme, grid|table per tab, archive scope per tab, the
 * Settings inner tab.
 *
 * Persisted to `localStorage` per operator (spec §8: "grid/table view
 * preference persisted per operator per tab"). The active operator is host
 * truth (`settings_get.globals.active_operator_id`); this store is told which
 * one to load for and keeps a document per id.
 *
 * The rule that keeps this store honest: a test asserts its state shape has no
 * `score`, `ring`, `session`, `timer` or `team` key. A Play field landing here
 * is the Play write seam broken.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ArchiveScope } from '@/host/types'
import type { Tab } from './nav'

export type SidebarMode = 'expanded' | 'rail' | 'hidden'
export type ThemeChoice = 'system' | 'light' | 'dark'
export type ViewMode = 'grid' | 'table'

/** Tabs that show a record list and so carry a view preference (§12). */
export type ListTab = 'teams' | 'library' | 'games' | 'operators'

export interface OperatorPrefs {
  readonly sidebar: SidebarMode
  readonly theme: ThemeChoice
  readonly view: Readonly<Record<ListTab, ViewMode>>
}

export const DEFAULT_PREFS: OperatorPrefs = {
  sidebar: 'expanded',
  theme: 'system',
  view: { teams: 'grid', library: 'table', games: 'grid', operators: 'table' },
}

interface ChromeState {
  /** Whose preferences are in force. `''` before any operator exists. */
  readonly operatorId: string
  readonly prefs: Readonly<Record<string, OperatorPrefs>>
  /** Session-only: not persisted. */
  readonly archiveScope: Readonly<Partial<Record<Tab, ArchiveScope>>>
  readonly settingsInner: 'monitors' | 'settings' | 'shortcuts'
  /** True while the pointer is over the left-edge peek strip (sidebar hidden). */
  readonly peeking: boolean

  setOperator(id: string | null): void
  setSidebar(mode: SidebarMode): void
  cycleSidebar(): void
  setTheme(theme: ThemeChoice): void
  setView(tab: ListTab, view: ViewMode): void
  setArchiveScope(tab: Tab, scope: ArchiveScope): void
  setSettingsInner(inner: 'monitors' | 'settings' | 'shortcuts'): void
  setPeeking(peeking: boolean): void
}

const ORDER: SidebarMode[] = ['expanded', 'rail', 'hidden']

export const useChromeStore = create<ChromeState>()(
  persist(
    (set, get) => {
      const update = (patch: Partial<OperatorPrefs>) =>
        set((s) => ({
          prefs: { ...s.prefs, [s.operatorId]: { ...current(s), ...patch } },
        }))
      const current = (s: Pick<ChromeState, 'operatorId' | 'prefs'>) => s.prefs[s.operatorId] ?? DEFAULT_PREFS

      return {
        operatorId: '',
        prefs: {},
        archiveScope: {},
        settingsInner: 'monitors',
        peeking: false,

        setOperator(id) {
          set({ operatorId: id ?? '' })
        },
        setSidebar(sidebar) {
          update({ sidebar })
        },
        cycleSidebar() {
          const mode = current(get()).sidebar
          const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] ?? 'expanded'
          update({ sidebar: next })
        },
        setTheme(theme) {
          update({ theme })
        },
        setView(tab, view) {
          update({ view: { ...current(get()).view, [tab]: view } })
        },
        setArchiveScope(tab, scope) {
          set((s) => ({ archiveScope: { ...s.archiveScope, [tab]: scope } }))
        },
        setSettingsInner(settingsInner) {
          set({ settingsInner })
        },
        setPeeking(peeking) {
          set({ peeking })
        },
      }
    },
    {
      name: 'questiongame.studio.chrome',
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ operatorId: s.operatorId, prefs: s.prefs }),
    },
  ),
)

/** The active operator's preferences. */
export function usePrefs(): OperatorPrefs {
  return useChromeStore((s) => s.prefs[s.operatorId] ?? DEFAULT_PREFS)
}

export function useArchiveScope(tab: Tab): ArchiveScope {
  return useChromeStore((s) => s.archiveScope[tab] ?? 'active')
}

/** `localStorage` can throw (blocked storage, some webview sandboxes). */
function safeStorage(): Storage {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem('questiongame.studio.probe', '1')
      localStorage.removeItem('questiongame.studio.probe')
      return localStorage
    }
  } catch {
    // fall through
  }
  const memory = new Map<string, string>()
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size
    },
  }
}
