/**
 * Whether *What's new* is open, and with which releases (P12.10). Chrome:
 * a window the operator reads and closes; nothing here is a Play field.
 */

import { create } from 'zustand'
import type { WhatsNewRelease } from '@/copy/whatsNew'

export interface WhatsNewOpen {
  /** Newest first. */
  readonly releases: readonly WhatsNewRelease[]
  /** Closing it records that the operator has seen up to this build. */
  readonly markSeen: boolean
}

interface WhatsNewState {
  readonly open: WhatsNewOpen | null
  show(open: WhatsNewOpen): void
  close(): void
}

export const useWhatsNewStore = create<WhatsNewState>((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}))
