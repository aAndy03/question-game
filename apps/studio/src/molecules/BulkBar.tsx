import { useRef, type ReactNode } from 'react'
import { Button, CheckboxField, Text, useSqueeze } from '@/atoms'
import { LIST, SHELL } from '@/copy'

export interface BulkAction {
  readonly count: number
  run(): void
}

export interface BulkBarProps {
  /** Selected items, across every page. */
  count: number
  /** How many of them are on the page shown. */
  onPage: number
  /** What Archive would touch — the active ones. Hidden at 0. */
  archive?: BulkAction | undefined
  /** What Restore would touch — the archived ones. Hidden at 0. */
  restore?: BulkAction | undefined
  onClear: () => void
  isPending?: boolean | undefined
  /** More actions on the selection, after Archive and Restore (Beta 2.0). */
  extra?: ReactNode
  /**
   * The *Select all* checkbox — every matching item, every page — drawn first
   * (P20) for grid view, which has no header row to hold it. Table view passes
   * nothing: its header has one.
   */
  page?: { readonly all: boolean; readonly some: boolean; onChange(on: boolean): void } | undefined
}

/**
 * The selection strip (P20): **always there** on a list with bulk actions, so
 * nothing moves when the first row is ticked, on *Clear*, or when a filter
 * clears the selection — the list used to jump 56px each time, and a second
 * click in the same place ticked the page. Quiet at 0 (no fill, no outline,
 * "0 selected", nothing to press); one confirm per batch when
 * something is selected (spec §2.19). Under Status *All* a selection mixes
 * active and archived rows, so both actions are offered, each with the count
 * it applies to (stable 1.1). The count and *Clear* never shrink.
 *
 * **No scrollbars** (beta.8): the actions used to scroll inside the strip, so a
 * narrow window with an opened row drew a scrollbar in it. Now, when they do
 * not fit, they become their icons (`useSqueeze`), each named by a tooltip;
 * what still does not fit is clipped, never scrolled.
 */
export function BulkBar({ count, onPage, archive, restore, onClear, isPending, extra, page }: BulkBarProps) {
  const idle = count === 0
  const actions = useRef<HTMLDivElement>(null)
  useSqueeze(actions)
  return (
    <div
      {...(idle ? {} : { role: 'toolbar', 'aria-label': SHELL.bulkActions })}
      className={[
        'flex h-9 shrink-0 items-center gap-3 rounded-[var(--radius)] border px-3',
        // Idle draws no outline (P20.11: no lines); the border stays, transparent, so the strip keeps its size.
        idle ? 'border-transparent' : 'border-[var(--border)]',
      ].join(' ')}
      style={idle ? undefined : { background: 'var(--surface-secondary)' }}
      data-bulk-strip
      data-density="compact"
      data-bulk-idle={idle ? '' : undefined}
    >
      {page ? (
        <CheckboxField label={LIST.selectAll} hideLabel isSelected={page.all} isIndeterminate={!page.all && page.some} onChange={page.onChange} />
      ) : null}
      <span aria-live="polite" className="shrink-0 whitespace-nowrap">
        <Text variant="studio-label" tone={idle ? 'muted' : 'default'}>
          {onPage < count ? LIST.selectedOnPage(count, onPage) : LIST.selected(count)}
        </Text>
      </span>
      {idle ? null : (
        <>
          <div ref={actions} className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden" data-bulk-actions data-squeeze>
            {archive && archive.count > 0 ? (
              <Button size="sm" variant="danger" icon="archive" onPress={archive.run} isPending={isPending} isDisabled={isPending}>
                {LIST.archiveN(archive.count)}
              </Button>
            ) : null}
            {restore && restore.count > 0 ? (
              <Button size="sm" variant="primary" icon="restore" onPress={restore.run} isPending={isPending} isDisabled={isPending}>
                {LIST.restoreN(restore.count)}
              </Button>
            ) : null}
            {extra}
          </div>
          <Button size="sm" variant="tertiary" onPress={onClear} className="shrink-0">
            {LIST.clearSelection}
          </Button>
        </>
      )}
    </div>
  )
}
