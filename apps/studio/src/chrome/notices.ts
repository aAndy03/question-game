/**
 * The notice family's one owner (spec §14).
 *
 * Two sources land here: `notice` events from the host and refused commands
 * (`HostError`). Both become an `OpenNotice`. Where it renders is decided by
 * the notice, not by the caller:
 *
 *   targetPath set     → inline, on the field or row that caused it
 *   severity 'block'   → the destructive dialog, which cannot be clicked away
 *   otherwise          → the collector float, and the status bar one-liner
 *
 * A notice may stack confirm frames ("Stop playing → Are you sure?"): a frame
 * is pushed by the action that needs it, and Cancel pops one. Depth 3 is the
 * §14 maximum (the third frame may be a pin, P10).
 *
 * Chrome only. Nothing here is a Play field.
 */

import { create } from 'zustand'
import type { Notice } from '@questiongame/contract'

export const MAX_ACTIONS = 3
export const MAX_FRAMES = 3

export interface ConfirmFrame {
  readonly title: string
  readonly body: string
  /** Action ids for this frame; the last one is the one that runs. */
  readonly actions: readonly string[]
}

export interface OpenNotice extends Notice {
  readonly id: number
  readonly at: number
  readonly frames: readonly ConfirmFrame[]
}

interface NoticeState {
  readonly notices: readonly OpenNotice[]
  readonly collectorOpen: boolean
  push(notice: Notice): number
  pushError(code: string, message: string, targetPath?: string | null): number
  dismiss(id: number): void
  pushFrame(id: number, frame: ConfirmFrame): void
  popFrame(id: number): void
  setCollectorOpen(open: boolean): void
  clear(): void
}

let nextId = 1

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],
  collectorOpen: false,

  push(notice) {
    if (notice.actions.length > MAX_ACTIONS) {
      throw new Error(`notice ${notice.code} carries ${notice.actions.length} actions; §14 allows ${MAX_ACTIONS}`)
    }
    const id = nextId++
    const open: OpenNotice = { ...notice, id, at: Date.now(), frames: [] }
    set((s) => ({ notices: [open, ...s.notices] }))
    return id
  },

  pushError(code, message, targetPath = null) {
    return get().push({
      code,
      severity: 'error',
      targetPath,
      actions: [],
      detail: { message },
    })
  },

  dismiss(id) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
  },

  pushFrame(id, frame) {
    set((s) => ({
      notices: s.notices.map((n) => {
        if (n.id !== id) return n
        if (n.frames.length >= MAX_FRAMES) throw new Error(`notice ${n.code}: confirm depth ${MAX_FRAMES} exceeded`)
        return { ...n, frames: [...n.frames, frame] }
      }),
    }))
  },

  popFrame(id) {
    set((s) => ({
      notices: s.notices.map((n) => (n.id === id ? { ...n, frames: n.frames.slice(0, -1) } : n)),
    }))
  },

  setCollectorOpen(open) {
    set({ collectorOpen: open })
  },

  clear() {
    set({ notices: [] })
  },
}))

/** Where a notice renders, decided once (05_STUDIO_DESIGN.md §3.3). */
export type NoticeSurface = 'inline' | 'dialog' | 'collector'

export function surfaceOf(notice: Notice): NoticeSurface {
  if (notice.targetPath) return 'inline'
  if (notice.severity === 'block') return 'dialog'
  return 'collector'
}

/** The most recent notice that is not inline — what the status bar shows. */
export function latestForStatusBar(notices: readonly OpenNotice[]): OpenNotice | null {
  return notices.find((n) => surfaceOf(n) !== 'inline') ?? null
}

/** Notices addressed to a field or row, by path prefix. */
export function noticesAt(notices: readonly OpenNotice[], path: string): OpenNotice[] {
  return notices.filter((n) => n.targetPath !== null && n.targetPath.startsWith(path))
}
