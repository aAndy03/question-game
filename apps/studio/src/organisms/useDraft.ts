/**
 * One form state per editor (spec §7: "never mount two competing form
 * states on one screen").
 *
 * A draft is a copy of the row the editor opened with, a `set` that patches
 * it, `isDirty` by structural comparison, and a `reset` back to the source.
 * Validation is the host's job — `catalog_upsert` refuses an illegal row and
 * the refusal lands inline through `targetPath` — so the client keeps only
 * the checks that decide whether the Save button is enabled.
 *
 * The dirty guard registers on the nav store, so leaving the page with
 * unsaved changes asks first (spec §11.A), and `DirtyGuard` is the dialog.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QUIT_ROUTE, useNavStore, type Route } from '@/chrome/nav'

export interface Draft<T> {
  readonly value: T
  readonly isDirty: boolean
  /**
   * Dirty **as of now**, before React has re-rendered. `adopt` runs in the
   * same task as the navigation that follows a save, so the rendered
   * `isDirty` is still `true` at the moment `go` consults the nav guard —
   * which is how saving used to raise the "unsaved changes" dialog *after*
   * the row had already been written. The guard reads this instead.
   */
  isDirtyNow(): boolean
  set(patch: Partial<T>): void
  replace(next: T): void
  reset(): void
  /** Adopt a new source (after a save, or when the row changes underneath). */
  adopt(source: T): void
}

export function useDraft<T extends object>(source: T | null | undefined, empty: T): Draft<T> {
  const base = source ?? empty
  const [origin, setOrigin] = useState<T>(base)
  const [value, setValue] = useState<T>(base)
  const seen = useRef(base)
  // The same two values, readable synchronously. Kept in step with the state
  // on every render, and written ahead of it by the setters below.
  const originNow = useRef(origin)
  const valueNow = useRef(value)
  originNow.current = origin
  valueNow.current = value

  // A new source (a different row, or the row after a save) resets the draft
  // only when the editor is clean — an operator's typing is never overwritten.
  useEffect(() => {
    if (source && source !== seen.current) {
      seen.current = source
      setOrigin((prev) => (JSON.stringify(prev) === JSON.stringify(value) ? source : prev))
      setValue((prev) => (JSON.stringify(prev) === JSON.stringify(origin) ? source : prev))
    }
  }, [source])

  const isDirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(origin), [value, origin])

  const set = useCallback((patch: Partial<T>) => {
    const next = { ...valueNow.current, ...patch }
    valueNow.current = next
    setValue(next)
  }, [])
  const replace = useCallback((next: T) => {
    valueNow.current = next
    setValue(next)
  }, [])
  const reset = useCallback(() => {
    valueNow.current = originNow.current
    setValue(originNow.current)
  }, [])
  const adopt = useCallback((next: T) => {
    seen.current = next
    originNow.current = next
    valueNow.current = next
    setOrigin(next)
    setValue(next)
  }, [])
  const isDirtyNow = useCallback(() => JSON.stringify(valueNow.current) !== JSON.stringify(originNow.current), [])

  return { value, isDirty, isDirtyNow, set, replace, reset, adopt }
}

/** What the guard needs from a draft: the rendered flag, and the live one. */
export interface DirtySource {
  readonly isDirty: boolean
  isDirtyNow(): boolean
}

export interface DirtyGuardState {
  /** The navigation waiting for an answer, or null. */
  readonly pending: Route | null
  readonly isOpen: boolean
  /** Save, then continue. */
  saveAndGo(save: () => Promise<boolean>): Promise<void>
  discardAndGo(): void
  keepEditing(): void
}

/**
 * Registers a nav guard while the draft is dirty; a blocked navigation is
 * held until the operator chooses. Unregisters on unmount.
 *
 * The registered guard asks the draft whether it is *still* dirty rather than
 * trusting the flag it was registered with: an editor saves and navigates in
 * one act, and between the two React has not re-rendered yet.
 */
export function useDirtyGuard(draft: DirtySource): DirtyGuardState {
  const setGuard = useNavStore((s) => s.setGuard)
  const go = useNavStore((s) => s.go)
  const [pending, setPending] = useState<Route | null>(null)
  const resolver = useRef<((allow: boolean) => void) | null>(null)
  const isDirtyNow = useRef(draft.isDirtyNow)
  isDirtyNow.current = draft.isDirtyNow

  useEffect(() => {
    if (!draft.isDirty) {
      setGuard(null)
      return
    }
    setGuard((to) => {
      if (!isDirtyNow.current()) return true
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setPending(to)
      })
    })
    return () => setGuard(null)
  }, [draft.isDirty, setGuard])

  const finish = useCallback((allow: boolean) => {
    resolver.current?.(allow)
    resolver.current = null
    setPending(null)
  }, [])

  return {
    pending,
    isOpen: pending !== null,
    async saveAndGo(save) {
      const ok = await save()
      if (!ok) {
        finish(false)
        return
      }
      const to = pending
      // A quit is not a navigation: allow it and let the app close (P12.2).
      if (to === QUIT_ROUTE) {
        finish(true)
        return
      }
      // The draft is clean now, so the guard goes and the deferred navigation
      // is re-issued rather than merely allowed (the effect that would clear
      // the guard has not run yet).
      finish(false)
      setGuard(null)
      if (to) void go(to)
    },
    discardAndGo() {
      finish(true)
    },
    keepEditing() {
      finish(false)
    },
  }
}
