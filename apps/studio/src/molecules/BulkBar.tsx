import type { ReactNode } from 'react'
import { Button, Text } from '@/atoms'
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
}

/**
 * Appears when a selection exists; one confirm per batch (spec §2.19). Under
 * Status *All* a selection mixes active and archived rows, so both actions are
 * offered, each with the count it applies to and touching only those rows
 * (stable 1.1).
 */
export function BulkBar({ count, onPage, archive, restore, selectAll, onClear, isPending, extra }: BulkBarProps) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label={SHELL.bulkActions}
      className="flex h-11 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3"
      style={{ background: 'var(--surface-secondary)' }}
    >
      <Text variant="studio-label" tone="default">
        {onPage < count ? LIST.selectedOnPage(count, onPage) : LIST.selected(count)}
      </Text>
      <div className="flex flex-1 items-center gap-2">
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
      <Button size="sm" variant="tertiary" onPress={onClear}>
        {LIST.clearSelection}
      </Button>
    </div>
  )
}
