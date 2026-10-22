import type { ReactNode } from 'react'
import { Icon, MeaningChip, Text, Tooltip } from '@/atoms'
import { GAME } from '@/copy'
import { PREVIEW } from '@/copy/preview'
import type { DomainLadder } from '@/host/types'
import { DragHandle, type SortableRowHandle } from './SortableList'

export interface BoardDomainRowProps {
  handle: SortableRowHandle
  name: string
  code: string
  overridden: boolean
  /** Questions on the board, of `of` in the domain. */
  count: number
  of: number
  /** This domain's walk from the rules preview: its span and its ceiling. */
  ladder?: DomainLadder | undefined
  /** A ragged board's shortest domain: it empties first (P11.12). */
  short?: boolean | undefined
  open: boolean
  onToggle: () => void
  frozenReason: string | null
  /** *Choose questions…* and *Remove from board*. */
  actions: ReactNode
  /** The questions, in walk order — drawn only while open. */
  children: ReactNode
}

/**
 * One domain on a game's Board (P20): what used to be a card per domain and a
 * ladder table under them, as one row. The handle orders the domains (the
 * order teams see them in); the name opens the questions; the numbers are the
 * host's (`rules_preview`), so the row never counts what a Play would not ask.
 */
export function BoardDomainRow({ handle, name, code, overridden, count, of, ladder, short, open, onToggle, frozenReason, actions, children }: BoardDomainRowProps) {
  return (
    <div
      data-board-domain
      className={[
        'rounded-[var(--radius)] border bg-[var(--surface)] transition-shadow',
        handle.isDragging ? 'border-[var(--accent)] shadow-lg' : 'border-[var(--border)]',
      ].join(' ')}
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 pl-1">
        <DragHandle handle={handle} label={GAME.reorder(name)} disabledReason={frozenReason} />
        <button
          type="button"
          aria-expanded={open}
          aria-label={name}
          onClick={onToggle}
          className="flex min-w-[10rem] flex-1 items-center gap-2 rounded py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <Icon name="chevronRight" size="sm" className={['shrink-0 transition-transform', open ? 'rotate-90' : ''].join(' ')} />
          <Text variant="studio-label" truncate>
            {name}
          </Text>
          <Text variant="studio-mono" tone="muted">
            {code}
          </Text>
        </button>
        {overridden ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
        <span className="flex items-center gap-4 whitespace-nowrap">
          <Text variant="studio-caption" tone={short ? 'warning' : 'muted'} tabular>
            {GAME.questionsOn(count, of)}
          </Text>
          {ladder && ladder.questions > 0 ? (
            <>
              <Text variant="studio-caption" tone="muted" tabular>
                {GAME.span(ladder.minDifficulty, ladder.maxDifficulty)}
              </Text>
              <Tooltip content={PREVIEW.board.availableHint}>
                <Text variant="studio-caption" tone="muted" tabular>
                  {GAME.pointsAvailable(ladder.pointsAvailable)}
                </Text>
              </Tooltip>
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-1">{actions}</span>
      </div>
      {open ? <div className="border-t border-[var(--separator)] px-2 py-1.5">{children}</div> : null}
    </div>
  )
}
