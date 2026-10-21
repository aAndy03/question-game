/**
 * The notice family's one owner (spec §14).
 *
 * Three sources land here: `notice` events from the host, refused commands
 * (`HostError`), and the `health` report's items (stamped `detail.source =
 * 'health'` and replaced as a set, never accumulated — §12.6). All become an
 * `OpenNotice`. Where it renders is decided by the notice, not by the caller:
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
import type { GameSection } from './nav'

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
  /**
   * A refused command. The same refusal again (code, path and message) is the
   * same problem: it replaces the open one rather than stacking a copy (P12.8).
   */
  pushError(code: string, message: string, targetPath?: string | null): number
  dismiss(id: number): void
  /**
   * Drop every **error** addressed under `prefix` — what a successful write to
   * that record does, so a fixed problem stops being reported (P12.8).
   */
  dismissUnder(prefix: string): void
  /** Drop every **error** the predicate picks (P12.12). */
  dismissWhere(pick: (notice: OpenNotice) => boolean): void
  /** Every notice about a row — a game, team, domain or question — whatever its severity: on a workspace switch that row is no longer here (beta.2). */
  dropRowNotices(): void
  /**
   * Replace every notice whose `detail.source` is `source` with `notices`,
   * stamping the source on each. Other notices keep their ids and order.
   */
  replaceSource(source: string, notices: readonly Notice[]): void
  pushFrame(id: number, frame: ConfirmFrame): void
  popFrame(id: number): void
  setCollectorOpen(open: boolean): void
  clear(): void
}

let nextId = 1

/** A target path that names a library row or a game (`recipe.g1…`, `team/t1`). */
const ROW_PATH = /^(recipe|team|domain|question)[./]/

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
    const same = get().notices.find(
      (n) => n.severity === 'error' && n.code === code && n.targetPath === targetPath && n.detail.message === message,
    )
    if (same) set((s) => ({ notices: s.notices.filter((n) => n.id !== same.id) }))
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

  dismissUnder(prefix) {
    set((s) => ({
      notices: s.notices.filter((n) => !(n.severity === 'error' && n.targetPath !== null && n.targetPath.startsWith(prefix))),
    }))
  },

  dismissWhere(pick) {
    set((s) => ({ notices: s.notices.filter((n) => !(n.severity === 'error' && pick(n))) }))
  },

  dropRowNotices() {
    set((s) => ({ notices: s.notices.filter((n) => !(n.targetPath !== null && ROW_PATH.test(n.targetPath))) }))
  },

  replaceSource(source, notices) {
    for (const notice of notices) {
      if (notice.actions.length > MAX_ACTIONS) {
        throw new Error(`notice ${notice.code} carries ${notice.actions.length} actions; §14 allows ${MAX_ACTIONS}`)
      }
    }
    const at = Date.now()
    const fresh: OpenNotice[] = notices.map((n) => ({
      ...n,
      detail: { ...n.detail, source },
      id: nextId++,
      at,
      frames: [],
    }))
    set((s) => ({ notices: [...fresh, ...s.notices.filter((n) => n.detail.source !== source)] }))
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

/**
 * What the status bar shows: the newest **error**, wherever it renders — a
 * refused Load addressed to the Board is still the thing the operator needs to
 * hear about from the Roster (P12.8) — else the newest notice that is not
 * inline.
 */
export function latestForStatusBar(notices: readonly OpenNotice[]): OpenNotice | null {
  return notices.find((n) => n.severity === 'error') ?? notices.find((n) => surfaceOf(n) !== 'inline') ?? null
}

/**
 * Notices that render at a field rather than in the collector.
 *
 * The status-bar dot reads the health report's status, not the notice list, so
 * an inline health item turned the dot amber while the panel the operator
 * clicked stayed empty (P11.8). The collector shows these as a "needs
 * attention elsewhere" line so there is always a way to the finding.
 */
export function inlineNotices(notices: readonly OpenNotice[]): OpenNotice[] {
  return notices.filter((n) => surfaceOf(n) === 'inline')
}

/** Notices addressed to a field or row, by path prefix. */
export function noticesAt(notices: readonly OpenNotice[], path: string): OpenNotice[] {
  return notices.filter((n) => n.targetPath !== null && n.targetPath.startsWith(path))
}

/**
 * The Game section a `recipe.<id>.<section>…` path is addressed to, at any
 * depth — a Board refusal is `recipe.<id>.board.<domain>.difficulty.<n>`.
 * What the collector's *Show* and the Game rail both read (P12.8).
 */
export function gameSectionOf(path: string | null): { recipeId: string; section: GameSection } | null {
  const match = /^recipe\.([^.]+)\.(roster|board|rules|plays)(?:\.|$)/.exec(path ?? '')
  if (!match?.[1] || !match[2]) return null
  return { recipeId: match[1], section: match[2] as GameSection }
}
