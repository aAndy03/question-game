import type { ReactNode } from 'react'
import { Button, CheckboxField, Text } from '@/atoms'
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
  /** *Select all {n}*: every matching item on every page, when not all are selected. */
  selectAll?: BulkAction | undefined
  onClear: () => void
  isPending?: boolean | undefined
  /** More actions on the selection, after Archive and Restore (Beta 2.0). */
  extra?: ReactNode
  /**
   * The page's *Select all* checkbox, drawn first (P20) — for grid view, which
   * has no header row to hold it. Table view passes nothing: its header has one.
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
 * it applies to (stable 1.1). The actions scroll inside the strip rather than
 * run under an opened row's panel; the count and *Clear* never shrink.
 */
export function BulkBar({ count, onPage, archive, restore, selectAll, onClear, isPending, extra, page }: BulkBarProps) {
  const idle = count === 0
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
          <div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto">
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
            {selectAll && selectAll.count > count ? (
              <Button size="sm" variant="tertiary" onPress={selectAll.run}>
                {LIST.selectAllN(selectAll.count)}
              </Button>
            ) : null}
          </div>
          <Button size="sm" variant="tertiary" onPress={onClear} className="shrink-0">
            {LIST.clearSelection}
          </Button>
        </>
      )}
    </div>
  )
}
