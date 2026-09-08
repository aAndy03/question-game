import type { ReactNode } from 'react'
import { CheckboxField, Text } from '@/atoms'

export type RecordLayout = 'grid' | 'table'

export interface RecordRowProps {
  layout: RecordLayout
  /** Leading mark: an `Avatar`, a `Swatch`, an `Icon`. */
  leading?: ReactNode
  title: string
  subtitle?: string | undefined
  /** Chips after the title. */
  chips?: ReactNode
  /** Right-aligned metadata (dates, counts). In table layout these are the cells. */
  meta?: readonly ReactNode[] | undefined
  /** The `ActionMenu`. */
  actions?: ReactNode
  isSelected?: boolean | undefined
  onSelectChange?: ((selected: boolean) => void) | undefined
  isArchived?: boolean | undefined
  isOverridden?: boolean | undefined
  /** Highlighted as the currently open record (an aside is showing it). */
  isCurrent?: boolean | undefined
  /**
   * 1-based position in the list as it is currently filtered and sorted —
   * a running count, not an id (an archived row does not hold a number).
   * Table layout prints it; the grid does not.
   */
  index?: number | undefined
  onOpen?: (() => void) | undefined
}

/**
 * One record, two layouts (spec §12: "same row node, two layouts"). The grid
 * card and the table row share every slot, so a tab switches layout without
 * touching its data.
 */
export function RecordRow({
  layout,
  leading,
  title,
  subtitle,
  chips,
  meta = [],
  actions,
  isSelected,
  onSelectChange,
  isArchived,
  isOverridden,
  isCurrent,
  index,
  onOpen,
}: RecordRowProps) {
  const selectable = onSelectChange !== undefined
  const tone = isArchived ? 'muted' : 'default'
  // A table row is a slice of one rounded, clipped container, so its ring is
  // drawn **inside**: an outer ring on the first or last row is a square
  // corner over the container's rounded one, and half of it is clipped away.
  // A card owns its whole outline, so its ring stays outside.
  const frame = [
    'group relative outline-none transition-colors',
    isCurrent ? (layout === 'table' ? 'ring-2 ring-inset ring-[var(--accent)]' : 'ring-2 ring-[var(--accent)]') : '',
    isSelected ? 'bg-[var(--accent)]/8' : '',
    isOverridden ? 'border-l-2 border-l-[var(--accent)]' : '',
    isArchived ? 'opacity-70' : '',
  ].join(' ')

  const checkbox = selectable ? (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center">
      <CheckboxField label={`Select ${title}`} hideLabel isSelected={Boolean(isSelected)} onChange={onSelectChange} />
    </div>
  ) : null

  if (layout === 'grid') {
    return (
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOpen()
          }
        }}
        className={[
          frame,
          'flex min-h-16 flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4',
          onOpen ? 'cursor-pointer hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]' : '',
        ].join(' ')}
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-start gap-3">
          {checkbox}
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text variant="studio-label" tone={tone} truncate>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="studio-caption" tone="muted" truncate>
                {subtitle}
              </Text>
            ) : null}
          </div>
          {actions ? (
            <div onClick={(e) => e.stopPropagation()} className="-mr-2 -mt-1 shrink-0">
              {actions}
            </div>
          ) : null}
        </div>
        {chips || meta.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
            <div className="flex items-center gap-3">
              {meta.map((m, i) => (
                <Text key={i} variant="studio-caption" tone="muted">
                  {m}
                </Text>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      role={onOpen ? 'button' : 'row'}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={[
        frame,
        // The last row's separator is the container's own bottom border.
        'flex h-10 items-center gap-3 border-b border-[var(--separator)] px-3 last:border-b-0',
        onOpen ? 'cursor-pointer hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]' : '',
      ].join(' ')}
    >
      {checkbox}
      {index !== undefined ? (
        <Text variant="studio-mono" tone="muted" className="w-7 shrink-0 text-right" tabular>
          {index}
        </Text>
      ) : null}
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Text variant="studio-label" tone={tone} truncate className="min-w-0 flex-1">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="studio-caption" tone="muted" truncate className="hidden max-w-[30%] xl:block">
            {subtitle}
          </Text>
        ) : null}
        <div className="flex shrink-0 items-center gap-1.5">{chips}</div>
      </div>
      {meta.map((m, i) => (
        <Text key={i} variant="studio-caption" tone="muted" className="w-28 shrink-0 text-right" tabular>
          {m}
        </Text>
      ))}
      {actions ? (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
