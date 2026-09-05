import { Button, Text } from '@/atoms'
import { LIST } from '@/copy'

export interface BulkBarProps {
  count: number
  /** Which verb applies to the current list scope. */
  mode: 'archive' | 'restore'
  onArchive?: (() => void) | undefined
  onRestore?: (() => void) | undefined
  onClear: () => void
  isPending?: boolean | undefined
}

/** Appears when a selection exists; one confirm per batch (spec §2.19). */
export function BulkBar({ count, mode, onArchive, onRestore, onClear, isPending }: BulkBarProps) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex h-11 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3"
      style={{ background: 'var(--surface-secondary)' }}
    >
      <Text variant="studio-label" tone="default">
        {LIST.selected(count)}
      </Text>
      <div className="flex flex-1 items-center gap-2">
        {mode === 'archive' && onArchive ? (
          <Button size="sm" variant="danger" icon="archive" onPress={onArchive} isPending={isPending}>
            {LIST.archive}
          </Button>
        ) : null}
        {mode === 'restore' && onRestore ? (
          <Button size="sm" variant="primary" icon="restore" onPress={onRestore} isPending={isPending}>
            {LIST.restore}
          </Button>
        ) : null}
      </div>
      <Button size="sm" variant="tertiary" onPress={onClear}>
        {LIST.clearSelection}
      </Button>
    </div>
  )
}
