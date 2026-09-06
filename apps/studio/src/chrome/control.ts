/**
 * The Control mosaic's layout — chrome, persisted per operator (spec §8:
 * "Mosaic layout persisted per operator"). The host's per-operator
 * `control_layout.json` (§5.10) is P10's paths work; until then this lives
 * in `localStorage` next to the other chrome preferences.
 *
 * The tree is `react-mosaic`'s own node shape so the library can be handed
 * it back unchanged. Nothing in here is a Play field.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { MosaicNode } from 'react-mosaic-component'

export type PanelId = 'viewer' | 'game' | 'action' | 'strips' | 'timeline'

/** The spec's default arrangement (§11.H). */
export const DEFAULT_LAYOUT: MosaicNode<PanelId> = {
  type: 'split',
  direction: 'column',
  splitPercentages: [78, 22],
  children: [
    {
      type: 'split',
      direction: 'row',
      splitPercentages: [22, 52, 26],
      children: [
        'game',
        'viewer',
        { type: 'split', direction: 'column', splitPercentages: [60, 40], children: ['action', 'strips'] },
      ],
    },
    'timeline',
  ],
}

export const PANEL_IDS: readonly PanelId[] = ['viewer', 'game', 'action', 'strips', 'timeline']

interface ControlLayoutState {
  readonly operatorId: string
  readonly layouts: Readonly<Record<string, MosaicNode<PanelId>>>
  readonly timelineCollapsed: Readonly<Record<string, boolean>>
  setOperator(id: string | null): void
  setLayout(node: MosaicNode<PanelId> | null): void
  resetLayout(): void
  setTimelineCollapsed(collapsed: boolean): void
}

export const useControlLayoutStore = create<ControlLayoutState>()(
  persist(
    (set) => ({
      operatorId: '',
      layouts: {},
      timelineCollapsed: {},
      setOperator(id) {
        set({ operatorId: id ?? '' })
      },
      setLayout(node) {
        set((s) => ({ layouts: { ...s.layouts, [s.operatorId]: node ?? DEFAULT_LAYOUT } }))
      },
      resetLayout() {
        set((s) => ({ layouts: { ...s.layouts, [s.operatorId]: DEFAULT_LAYOUT } }))
      },
      setTimelineCollapsed(collapsed) {
        set((s) => ({ timelineCollapsed: { ...s.timelineCollapsed, [s.operatorId]: collapsed } }))
      },
    }),
    {
      name: 'questiongame.studio.control',
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ layouts: s.layouts, timelineCollapsed: s.timelineCollapsed }),
    },
  ),
)

export function useControlLayout(): MosaicNode<PanelId> {
  return useControlLayoutStore((s) => s.layouts[s.operatorId] ?? DEFAULT_LAYOUT)
}

export function useTimelineCollapsed(): boolean {
  return useControlLayoutStore((s) => s.timelineCollapsed[s.operatorId] ?? true)
}

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
