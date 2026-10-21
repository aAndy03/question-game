import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from '@/atoms'
import { LIST } from '@/copy'

export interface DetailAsideProps {
  children: ReactNode
  /** Back to the list: the Close a narrow window shows, and Escape. */
  onClose: () => void
}

const NARROW = '(max-width: 1279.98px)'

/**
 * A library tab's opened row (1.1.1). At `xl` and wider it is the aside
 * beside the list, as before; below 1280 px — where it used to be `hidden`,
 * so opening a row at 1100 px showed nothing — it opens over the list's right
 * edge with a Close back to the list, takes the focus, and Escape closes it.
 * Its parent is the list's row, made `relative`.
 */
export function DetailAside({ children, onClose }: DetailAsideProps) {
  const close = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches) close.current?.querySelector('button')?.focus()
  }, [])
  return (
    <aside
      aria-label={LIST.detail}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches) onClose()
      }}
      className="absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] flex-col gap-2 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl xl:static xl:z-auto xl:w-[22rem] xl:shrink-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
      data-detail-aside
    >
      <div ref={close} className="flex justify-end xl:hidden">
        <IconButton icon="close" label={LIST.closeDetail} size="sm" onPress={onClose} />
      </div>
      {children}
    </aside>
  )
}
