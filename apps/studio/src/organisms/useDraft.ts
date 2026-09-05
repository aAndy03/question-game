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
import { useNavStore, type Route } from '@/chrome/nav'

export interface Draft<T> {
  readonly value: T
  readonly isDirty: boolean
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

  const set = useCallback((patch: Partial<T>) => setValue((prev) => ({ ...prev, ...patch })), [])
  const replace = useCallback((next: T) => setValue(next), [])
  const reset = useCallback(() => setValue(origin), [origin])
  const adopt = useCallback((next: T) => {
    seen.current = next
    setOrigin(next)
    setValue(next)
  }, [])

  return { value, isDirty, set, replace, reset, adopt }
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
 * Registers a nav guard while `isDirty`; a blocked navigation is held until
 * the operator chooses. Unregisters on unmount.
 */
export function useDirtyGuard(isDirty: boolean): DirtyGuardState {
  const setGuard = useNavStore((s) => s.setGuard)
  const go = useNavStore((s) => s.go)
  const [pending, setPending] = useState<Route | null>(null)
  const resolver = useRef<((allow: boolean) => void) | null>(null)

  useEffect(() => {
    if (!isDirty) {
      setGuard(null)
      return
    }
    setGuard(
      (to) =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve
          setPending(to)
        }),
    )
    return () => setGuard(null)
  }, [isDirty, setGuard])

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
