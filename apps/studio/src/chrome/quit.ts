/**
 * Studio's close button was pressed (P12.2).
 *
 * Chrome, not Play: the host holds the window open and says so with
 * `close-requested`; `bridge.tsx` bumps this counter and `QuitGuard` answers.
 * A counter rather than a flag, so two requests are two changes.
 */

import { create } from 'zustand'

interface QuitState {
  readonly requested: number
  request(): void
}

export const useQuitStore = create<QuitState>((set) => ({
  requested: 0,
  request() {
    set((s) => ({ requested: s.requested + 1 }))
  },
}))
