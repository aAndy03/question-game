/**
 * Chrome preferences — what the operator has arranged, never what the game
 * is. Sidebar mode, theme, grid|table per tab, archive scope per tab, the
 * question filter, the Settings inner tab.
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
import type { Changed, FilterValue, LibraryTab, PageSize } from '@/host/listView'
import type { Tab } from './nav'
import { crumb } from './diagnostics'

export type SidebarMode = 'expanded' | 'rail' | 'hidden'
export type ThemeChoice = 'system' | 'light' | 'dark'
export type ViewMode = 'grid' | 'table'

/** Tabs that show a record list and so carry a view preference (§12). */
export type ListTab = 'teams' | 'library' | 'games' | 'operators' | 'statistics'

/** The Settings tab's inner tab, in its fixed order (§12.2). */
export type SettingsInner = 'monitors' | 'settings' | 'shortcuts' | 'about'

export interface OperatorPrefs {
  readonly sidebar: SidebarMode
  readonly theme: ThemeChoice
  readonly view: Readonly<Record<ListTab, ViewMode>>
  /** Per operator like the rest; a route's `inner` wins when present. */
  readonly settingsInner: SettingsInner
  /**
   * How each library tab is ordered, grouped and paged (stable 1.1). Absent in
   * a document 1.0.2 wrote; every field absent means the tab's own default.
   */
  readonly lists?: Readonly<Partial<Record<LibraryTab, ListPrefs>>>
}

/** A library tab's remembered view: per operator, persisted. */
export interface ListPrefs {
  readonly sort?: { readonly id: string; readonly desc: boolean }
  readonly group?: string | null
  readonly pageSize?: PageSize
}

/** A library tab's view for this session: what a fresh start forgets. */
export interface ListState {
  readonly filters: Readonly<Record<string, FilterValue | null>>
  readonly changed: Changed
  readonly search: string
  readonly page: number
  readonly collapsed: readonly string[]
}

export const EMPTY_LIST_STATE: ListState = { filters: {}, changed: 'any', search: '', page: 1, collapsed: [] }
const NO_LIST_PREFS: ListPrefs = {}

/**
 * The two subtrees that hold list views. Their keys are filter, sort and group
 * ids — `domain`, `team`… — which name what a *list* is filtered by, not Play
 * state, so the banned-key walk in `chrome.test.ts` skips them and nothing else.
 */
export function isListViewKey(path: string): boolean {
  return /^prefs.[^.]+.lists(.|$)/.test(path) || /^listState(.|$)/.test(path)
}

export const DEFAULT_PREFS: OperatorPrefs = {
  sidebar: 'expanded',
  theme: 'system',
  view: { teams: 'grid', library: 'table', games: 'grid', operators: 'table', statistics: 'table' },
  settingsInner: 'monitors',
}

interface ChromeState {
  /** Whose preferences are in force. `''` before any operator exists. */
  readonly operatorId: string
  readonly prefs: Readonly<Record<string, OperatorPrefs>>
  /** Session-only: not persisted. */
  readonly archiveScope: Readonly<Partial<Record<Tab, ArchiveScope>>>
  /** Session-only list views per tab (stable 1.1): filters, search, page, collapsed groups. */
  readonly listState: Readonly<Partial<Record<LibraryTab, ListState>>>
  /** True while the pointer is over the left-edge peek strip (sidebar hidden). */
  readonly peeking: boolean

  setOperator(id: string | null): void
  setSidebar(mode: SidebarMode): void
  cycleSidebar(): void
  setTheme(theme: ThemeChoice): void
  setView(tab: ListTab, view: ViewMode): void
  setArchiveScope(tab: Tab, scope: ArchiveScope): void
  setListPrefs(tab: LibraryTab, patch: Partial<ListPrefs>): void
  setListState(tab: LibraryTab, patch: Partial<ListState>): void
  setSettingsInner(inner: SettingsInner): void
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
        listState: {},
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
          // Before the state change, so the log has it even if the render that
          // follows never returns.
          crumb('scope', `${tab}=${scope}`)
          set((s) => ({ archiveScope: { ...s.archiveScope, [tab]: scope } }))
        },
        setListPrefs(tab, patch) {
          const lists = current(get()).lists ?? {}
          update({ lists: { ...lists, [tab]: { ...lists[tab], ...patch } } })
        },
        setListState(tab, patch) {
          set((s) => {
            const was = s.listState[tab] ?? EMPTY_LIST_STATE
            // Nothing changed, nothing written: a new object here is a new
            // render for every list on screen.
            if ((Object.keys(patch) as (keyof ListState)[]).every((k) => Object.is(was[k], patch[k]))) return s
            return { listState: { ...s.listState, [tab]: { ...was, ...patch } } }
          })
        },
        setSettingsInner(settingsInner) {
          update({ settingsInner })
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

/** Older persisted documents predate `settingsInner`; the default fills it. */
export function useSettingsInner(): SettingsInner {
  return useChromeStore((s) => s.prefs[s.operatorId]?.settingsInner ?? DEFAULT_PREFS.settingsInner)
}

/** A tab's remembered sort, group and page size — one object until it changes. */
export function useListPrefs(tab: LibraryTab): ListPrefs {
  return useChromeStore((s) => s.prefs[s.operatorId]?.lists?.[tab] ?? NO_LIST_PREFS)
}

/** A tab's session view — one object until it changes. */
export function useListState(tab: LibraryTab): ListState {
  return useChromeStore((s) => s.listState[tab] ?? EMPTY_LIST_STATE)
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
