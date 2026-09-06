import type { ReactNode } from 'react'
import { Avatar, Icon, Text, Tooltip, type TeamMarkData } from '@/atoms'
import { RING } from '@/copy'

/** The nine row variants of spec §5.4. */
export type RingRowVariant =
  | 'history'
  | 'current'
  | 'future'
  | 'drop-ok'
  | 'drop-illegal'
  | 'overlooked'
  | 'override-armed'
  | 'override-blocked'
  | 'rehearsal-solo'

export interface RingRowProps {
  mark: TeamMarkData
  name: string
  score: number
  turns: number
  variant: RingRowVariant
  position: number
  /** Comfortable shows name · score · turns; compact drops turns; dense is the mark alone. */
  density?: 'comfortable' | 'compact' | 'dense'
  /** Draggable handle (future rows only). Refs from the sortable hook. */
  handleRef?: ((el: Element | null) => void) | undefined
  rowRef?: ((el: Element | null) => void) | undefined
  isDragging?: boolean | undefined
  /** Press = give the token (when the variant allows). */
  onPress?: (() => void) | undefined
  trailing?: ReactNode
}

const FRAME: Record<RingRowVariant, string> = {
  history: 'opacity-60',
  current: 'bg-[var(--accent)]/12 ring-1 ring-[var(--accent)]',
  future: 'hover:bg-[var(--surface-secondary)]',
  'drop-ok': 'ring-2 ring-[var(--success)] bg-[var(--success)]/10',
  'drop-illegal': 'ring-2 ring-[var(--danger)] bg-[var(--danger)]/10 cursor-not-allowed',
  overlooked: 'ring-1 ring-[var(--warning)]',
  'override-armed': 'ring-2 ring-[var(--danger)] bg-[var(--danger)]/10',
  'override-blocked': 'opacity-60 cursor-not-allowed',
  'rehearsal-solo': 'bg-[var(--accent)]/12 ring-1 ring-[var(--accent)]',
}

const HINT: Partial<Record<RingRowVariant, string>> = {
  history: RING.history,
  current: RING.current,
  future: RING.future,
  'drop-illegal': RING.dropIllegal,
  overlooked: RING.overlooked,
  'override-armed': RING.overrideArmed,
  'override-blocked': RING.overrideBlocked,
  'rehearsal-solo': RING.rehearsalSolo,
}

/**
 * One team in the ring, the same row in the Action Panel and the Game panel
 * (spec §5.4: "same language as Game tab roster"). The variant is the whole
 * visual state; nothing else decides a colour.
 */
export function RingRow({
  mark,
  name,
  score,
  turns,
  variant,
  position,
  density = 'comfortable',
  handleRef,
  rowRef,
  isDragging,
  onPress,
  trailing,
}: RingRowProps) {
  const pressable = onPress !== undefined && variant !== 'override-blocked' && variant !== 'drop-illegal'
  const isCurrent = variant === 'current' || variant === 'rehearsal-solo'
  const row = (
    <div
      ref={rowRef}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      aria-current={isCurrent ? 'true' : undefined}
      data-ring-row={variant}
      onClick={pressable ? onPress : undefined}
      onKeyDown={(e) => {
        if (pressable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onPress?.()
        }
      }}
      className={[
        'flex items-center gap-2 rounded-[calc(var(--radius)/1.5)] px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
        density === 'dense' ? 'h-9 justify-center px-1' : density === 'compact' ? 'h-10' : 'h-12',
        pressable ? 'cursor-pointer' : '',
        isDragging ? 'opacity-40' : '',
        FRAME[variant],
      ].join(' ')}
    >
      {handleRef && variant !== 'history' && !isCurrent ? (
        <span ref={handleRef} className="cursor-grab text-[var(--muted)] active:cursor-grabbing" aria-label={RING.reorder}>
          <Icon name="drag" size="sm" />
        </span>
      ) : density !== 'dense' ? (
        <Text variant="studio-mono" tone="muted" className="w-4 text-right" tabular>
          {position}
        </Text>
      ) : null}
      <Avatar mark={mark} size="sm" />
      {density !== 'dense' ? (
        <>
          <Text variant="studio-label" tone={isCurrent ? 'accent' : 'default'} truncate className="min-w-0 flex-1">
            {name}
          </Text>
          <Text variant="studio-label" tabular>
            {score}
          </Text>
          {density === 'comfortable' ? (
            <Text variant="studio-caption" tone="muted" tabular className="w-6 text-right">
              {`×${turns}`}
            </Text>
          ) : null}
        </>
      ) : null}
      {isCurrent && density !== 'dense' ? <Icon name="token" size="sm" style={{ color: 'var(--accent)' }} label={RING.current} /> : null}
      {trailing}
    </div>
  )
  const hint = HINT[variant]
  return hint && density !== 'comfortable' ? <Tooltip content={`${name} · ${hint}`}>{row}</Tooltip> : row
}
