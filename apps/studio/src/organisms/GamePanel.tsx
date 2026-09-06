import { useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { MeaningChip, Text } from '@/atoms'
import { EmptyState, RingRow, type RingRowVariant } from '@/molecules'
import { CONTROL, RING, SESSION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { isDropLegal, reorderedRing, ringEntries, type RingEntry } from '@/host/ring'

export interface GamePanelProps {
  density: 'comfortable' | 'compact' | 'dense'
}

/**
 * The ring with scores and turns, the round, the board's remaining
 * questions. Drag reorders the **future** ring only (spec §5.4); the same
 * `RingRow` the Action Panel uses, so one language across both.
 */
export function GamePanel({ density }: GamePanelProps) {
  const play = usePlayState()
  const run = useHostCommand()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  if (!play) return <EmptyState kind="empty" what={CONTROL.panels.game.toLowerCase()} detail={CONTROL.noRecipeBody} compact />
  const entries = ringEntries(play)
  const canReorder = play.status === 'playing' || play.status === 'paused'

  const variantOf = (e: RingEntry): RingRowVariant => {
    if (play.operator.isRehearsal) return 'rehearsal-solo'
    if (dragging && over === e.team.id && dragging !== e.team.id) return isDropLegal(entries, dragging, e.team.id) ? 'drop-ok' : 'drop-illegal'
    if (e.phase === 'current') return 'current'
    if (e.phase === 'history') return 'history'
    if (e.isOverlooked) return 'overlooked'
    return 'future'
  }

  return (
    <div className="flex flex-col gap-3" data-game-panel>
      <div className="flex items-center justify-between gap-2">
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
        <ol className="flex flex-col gap-1" aria-label={RING.title}>
          {entries.map((e) => (
            <SortableRingRow key={e.team.id} entry={e} index={e.index} variant={variantOf(e)} density={density} sortable={canReorder && e.phase === 'future'} />
          ))}
        </ol>
      </DragDropProvider>
      {density !== 'dense' ? (
        <div className="flex flex-col gap-1 border-t border-[var(--separator)] pt-3">
          {play.domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2">
              <Text variant="studio-caption" tone={d.exhausted ? 'muted' : 'default'} truncate>
                {d.name}
              </Text>
              <Text variant="studio-mono" tone="muted" tabular>
                {d.exhausted ? SESSION.exhausted : SESSION.domainsLeft(d.remaining)}
              </Text>
            </div>
          ))}
        </div>
      ) : null}
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
  density: 'comfortable' | 'compact' | 'dense'
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
