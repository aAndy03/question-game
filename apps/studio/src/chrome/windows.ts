/**
 * What the host's other windows are doing right now (§9, §13.3).
 *
 * Chrome, not Play: whether the Statistics window is on screen is a fact about
 * the desktop, not about a game. It cannot be a setting either — the operator
 * opens and closes that window, and a setting would re-open it the next time
 * anything read it, which is exactly the bug this store replaced.
 *
 * Fed by `host/bridge.tsx` alone, from the `monitors-changed` event the host
 * emits after every window change and every monitor refresh.
 */

import { create } from 'zustand'

interface WindowsState {
  /** Null until the first `monitors-changed` says. */
  readonly statsOpen: boolean | null
  setStatsOpen(open: boolean): void
}

export const useWindowsStore = create<WindowsState>((set) => ({
  statsOpen: null,
  setStatsOpen(statsOpen) {
    set({ statsOpen })
  },
}))

/** Is the Statistics window up? `false` while nothing has said otherwise. */
export function useStatsWindowOpen(): boolean {
  return useWindowsStore((s) => s.statsOpen ?? false)
}
