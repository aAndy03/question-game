import { Text } from '@/atoms'
import { fmt, TIMELINE } from '@/copy'

export interface EventRowProps {
  seq: number
  atMs: number
  type: string
  /** A short detail: the team, the option, the points. */
  detail?: string | undefined
  /** Undone events render struck through. */
  isInverted?: boolean | undefined
  isLast?: boolean | undefined
  compact?: boolean | undefined
}

/** One Timeline row: seq · time · kind · detail. Read-only; undo is a button, not a row action. */
export function EventRow({ seq, atMs, type, detail, isInverted, isLast, compact }: EventRowProps) {
  const label = TIMELINE.kinds[type] ?? type.replace(/_/g, ' ')
  return (
    <div
      data-event-row={type}
      className={['flex items-center gap-3 border-b border-[var(--separator)] px-2', compact ? 'h-7' : 'h-8', isInverted ? 'opacity-50 line-through' : '', isLast ? 'bg-[var(--accent)]/8' : ''].join(' ')}
    >
      <Text variant="studio-mono" tone="muted" className="w-8 text-right" tabular>
        {seq}
      </Text>
      <Text variant="studio-mono" tone="muted" className="w-16" tabular>
        {new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(atMs)}
      </Text>
      <Text variant="studio-label" className="w-36 shrink-0" truncate>
        {label}
      </Text>
      <Text variant="studio-caption" tone="muted" truncate className="min-w-0 flex-1">
        {detail ?? ''}
      </Text>
      {isLast ? (
        <Text variant="studio-caption" tone="accent">
          {fmt.int(seq) === String(seq) ? '●' : ''}
        </Text>
      ) : null}
    </div>
  )
}
