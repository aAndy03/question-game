import type { ReactNode } from 'react'
import { Icon, Text, type IconName } from '@/atoms'
import { EMPTY } from '@/copy'

export type EmptyKind = 'empty' | 'noResults' | 'archivedEmpty' | 'error'

const ICON: Record<EmptyKind, IconName> = {
  empty: 'add',
  noResults: 'search',
  archivedEmpty: 'archive',
  error: 'error',
}

export interface EmptyStateProps {
  kind: EmptyKind
  /** The plural noun: "teams", "questions". */
  what?: string | undefined
  /** Overrides the body for `error` with the host's message. */
  detail?: string | undefined
  action?: ReactNode
  compact?: boolean | undefined
}

/** The four empty states, one look (05_STUDIO_DESIGN.md §4.6). */
export function EmptyState({ kind, what = 'items', detail, action, compact }: EmptyStateProps) {
  const copy =
    kind === 'empty'
      ? EMPTY.empty(what)
      : kind === 'archivedEmpty'
        ? EMPTY.archivedEmpty(what)
        : kind === 'noResults'
          ? EMPTY.noResults
          : EMPTY.error
  return (
    <div
      role="status"
      className={[
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-16',
      ].join(' ')}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: 'var(--surface-secondary)', color: kind === 'error' ? 'var(--danger)' : 'var(--muted)' }}
      >
        <Icon name={ICON[kind]} size="md" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <Text as="p" variant="studio-heading" tone="default">
          {copy.title}
        </Text>
        <Text as="p" variant="studio-body" tone="muted">
          {detail ?? copy.body}
        </Text>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
