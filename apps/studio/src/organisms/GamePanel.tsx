import { useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { MeaningChip, Text } from '@/atoms'
import { EmptyState, RingRow, type PanelBox, type PanelDensity, type RingRowVariant } from '@/molecules'
import { CONTROL, RING, SESSION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { isDropLegal, reorderedRing, ringEntries, type RingEntry } from '@/host/ring'

export interface GamePanelProps {
  density: PanelDensity
  /** The tile's measured box; the ring steps down when the roster outgrows it. */
  box?: PanelBox | undefined
}

/** Row height + gap, per density, for the fit calculation below. */
const ROW_HEIGHT: Record<PanelDensity, number> = { comfortable: 52, compact: 44, dense: 40 }

/** Round header, the separator and the domain footer, at their smallest. */
const CHROME_HEIGHT = 108

/**
 * The narrowest density is decided by width; the roster then decides whether
 * that density still fits *vertically*. Eight teams at `comfortable` are
 * 416px of rows — taller than most tiles — and a ring the operator has to
 * scroll to see the token holder is a ring that failed at its one job. The
 * list still scrolls past the point where even `dense` cannot fit; this only
 * pushes that point out.
 */
function ringDensityFor(width: PanelDensity, teams: number, box: PanelBox | undefined): PanelDensity {
  const height = box?.height ?? Number.POSITIVE_INFINITY
  if (!Number.isFinite(height) || teams === 0) return width
  const order: readonly PanelDensity[] = ['comfortable', 'compact', 'dense']
  const room = Math.max(0, height - CHROME_HEIGHT)
  const candidates = order.slice(order.indexOf(width))
  return candidates.find((d) => teams * ROW_HEIGHT[d] <= room) ?? 'dense'
}

/**
 * The ring with scores and turns, the round, the board's remaining
 * questions. Drag reorders the **future** ring only (spec §5.4); the same
 * `RingRow` the Action Panel uses, so one language across both.
 */
export function GamePanel({ density, box }: GamePanelProps) {
  const play = usePlayState()
  const run = useHostCommand()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  if (!play) return <EmptyState kind="empty" what={CONTROL.panels.game.toLowerCase()} detail={CONTROL.noRecipeBody} compact />
  const entries = ringEntries(play)
  const canReorder = play.status === 'playing' || play.status === 'paused'
  const rowDensity = ringDensityFor(density, entries.length, box)

  const variantOf = (e: RingEntry): RingRowVariant => {
    if (play.operator.isRehearsal) return 'rehearsal-solo'
    if (dragging && over === e.team.id && dragging !== e.team.id) return isDropLegal(entries, dragging, e.team.id) ? 'drop-ok' : 'drop-illegal'
    if (e.phase === 'current') return 'current'
    if (e.phase === 'history') return 'history'
    if (e.isOverlooked) return 'overlooked'
    return 'future'
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-game-panel>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Text variant="studio-label">{SESSION.round(play.ring.roundIndex)}</Text>
        <div className="flex items-center gap-1.5">
          {play.operator.isRehearsal ? <MeaningChip meaning="frozen">{SESSION.rehearsal}</MeaningChip> : null}
          <Text variant="studio-caption" tone="muted">
            {SESSION.question(play.questionsIssued)}
          </Text>
        </div>
      </div>
      <DragDropProvider
        onDragStart={(event) => setDragging(String(event.operation.source?.id ?? ''))}
        onDragOver={(event) => setOver(event.operation.target ? String(event.operation.target.id) : null)}
        onDragEnd={(event) => {
          const from = dragging
          const to = event.operation.target ? String(event.operation.target.id) : null
          setDragging(null)
          setOver(null)
          if (event.canceled || !from || !to || from === to) return
          const order = reorderedRing(play, from, to)
          if (order) void run('reorder_ring', { order })
        }}
      >
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden" aria-label={RING.title}>
          {entries.map((e) => (
            <SortableRingRow key={e.team.id} entry={e} index={e.index} variant={variantOf(e)} density={rowDensity} sortable={canReorder && e.phase === 'future'} />
          ))}
        </ol>
      </DragDropProvider>
      {/* The board's remaining questions, at every density: how many are left
        * is the one number that decides whether the show is nearly over. */}
      <div className="flex max-h-[40%] shrink-0 flex-col gap-1 overflow-y-auto overflow-x-hidden border-t border-[var(--separator)] pt-3">
        {play.domains.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2">
            <Text variant="studio-caption" tone={d.exhausted ? 'muted' : 'default'} truncate>
              {d.name}
            </Text>
            <Text variant="studio-mono" tone="muted" tabular>
              {d.exhausted ? SESSION.exhausted : rowDensity === 'dense' ? String(d.remaining) : SESSION.domainsLeft(d.remaining)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}

function SortableRingRow({
  entry,
  index,
  variant,
  density,
  sortable,
}: {
  entry: RingEntry
  index: number
  variant: RingRowVariant
  density: PanelDensity
  sortable: boolean
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: entry.team.id, index, disabled: !sortable })
  return (
    <li>
      <RingRow
        mark={{ color: entry.team.color, shortCode: entry.team.shortCode, name: entry.team.name, logoUrl: entry.team.logoUrl }}
        name={entry.team.name}
        score={entry.team.score}
        turns={entry.team.turnsTaken}
        variant={variant}
        position={index + 1}
        density={density}
        rowRef={ref}
        handleRef={sortable ? handleRef : undefined}
        isDragging={isDragging}
      />
    </li>
  )
}
