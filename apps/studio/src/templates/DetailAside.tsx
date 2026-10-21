import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from '@/atoms'
import { LIST } from '@/copy'

export interface DetailAsideProps {
  children: ReactNode
  /** Back to the list: Close, Escape, the open row pressed again, empty space in the list. */
  onClose: () => void
}

const NARROW = '(max-width: 1279.98px)'

/** Typing, or a dialog open over the page: Escape is theirs, not the aside's. */
function escapeBelongsElsewhere(e: KeyboardEvent): boolean {
  const t = e.target instanceof Element ? e.target : null
  if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))) return true
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

/**
 * A library tab's opened row (1.1.1). At `xl` and wider it is the aside
 * beside the list; below 1280 px — where it used to be `hidden`, so opening
 * a row at 1100 px showed nothing — it opens over the list's right edge and
 * takes the focus. At every width it has a Close and Escape closes it (the
 * maintainer: at full width an opened row could not be closed at all); the
 * list also closes it when the open row is pressed again or empty space is
 * clicked. Its parent is the list's row, made `relative`.
 */
export function DetailAside({ children, onClose }: DetailAsideProps) {
  const close = useRef<HTMLDivElement>(null)
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches) close.current?.querySelector('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || escapeBelongsElsewhere(e)) return
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <aside
      aria-label={LIST.detail}
      className="absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] flex-col gap-2 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl xl:static xl:z-auto xl:w-[22rem] xl:shrink-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
      data-detail-aside
    >
      <div ref={close} className="flex justify-end">
        <IconButton icon="close" label={LIST.closeDetail} size="sm" onPress={onClose} />
      </div>
      {children}
    </aside>
  )
}
