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
  /**
   * Where the Stage window **actually stands**, and which displays mirror it
   * (§9, P11.11). `null` is the primary display.
   *
   * The *place*, not the *pick*. `control.stage_monitor_id` is where the
   * operator asked Stage to go; this is where it is. They differ more often
   * than they look like they should — a remembered display that is unplugged,
   * a window that has not been created yet — and reading the pick where the
   * place was meant left Settings ▸ Monitors insisting Stage was on a display
   * it had never been on (the P11.11 bug).
   */
  readonly stageOn: string | null
  readonly stageMirrors: readonly string[]
  setStatsOpen(open: boolean): void
  setStagePlacement(on: string | null, mirrors: readonly string[]): void
}

export const useWindowsStore = create<WindowsState>((set) => ({
  statsOpen: null,
  stageOn: null,
  stageMirrors: [],
  setStatsOpen(statsOpen) {
    set({ statsOpen })
  },
  setStagePlacement(stageOn, stageMirrors) {
    set({ stageOn, stageMirrors })
  },
}))

/** Where Stage stands and what mirrors it, as the host last reported. */
export function useStagePlacement(): { on: string | null; mirrors: readonly string[] } {
  const on = useWindowsStore((s) => s.stageOn)
  const mirrors = useWindowsStore((s) => s.stageMirrors)
  return { on, mirrors }
}

/** Is the Statistics window up? `false` while nothing has said otherwise. */
export function useStatsWindowOpen(): boolean {
  return useWindowsStore((s) => s.statsOpen ?? false)
}
