import { SPACE } from '@questiongame/design-stage'
import { CategoryCode, Tag, Text, insetFrame } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { hud } from '@/copy/format'

/**
 * One domain on the board: difficulty line + name + selected state. The
 * difficulty is that of the next question the domain would issue (difficulty
 * walks easy→hard inside a domain), already formatted by the caller.
 *
 * Exhausted domains stay on the board, dimmed — the audience should see what
 * was played out, and a card must not disappear between renders.
 */

export interface DomainCardProps {
  nodeId: string
  name: string
  /** Formatted difficulty label, e.g. `EASY`. Null when exhausted. */
  difficulty: string | null
  code?: string
  selected?: boolean
  exhausted?: boolean
}

export function DomainCard({ nodeId, name, difficulty, code, selected = false, exhausted = false }: DomainCardProps) {
  const dimmed = exhausted && !selected
  return (
    <div
      data-node-id={nodeId}
      data-selected={selected}
      data-exhausted={exhausted}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: SPACE[4],
        padding: SPACE[5],
        minHeight: 'calc(var(--space-8) * 4)',
        background: selected ? 'var(--ink)' : 'var(--paper)',
        boxShadow: selected
          ? insetFrame('heavy')
          : insetFrame('thin', dimmed ? 'var(--border-subtle)' : 'var(--border-default)'),
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE[3] }}>
        <Text variant="stage-hud" tone={selected ? 'inverse' : dimmed ? 'muted' : 'primary'}>
          {hud(STAGE_COPY.difficultyLabel, difficulty ?? STAGE_COPY.exhaustedTag)}
        </Text>
        <span style={{ visibility: selected ? undefined : 'hidden' }}>
          <Tag tone="info">{STAGE_COPY.selectedTag}</Tag>
        </span>
      </div>
      <Text
        variant="stage-name"
        transition="swap"
        tone={selected ? 'inverse' : dimmed ? 'muted' : 'heading'}
        style={{ overflowWrap: 'anywhere' }}
      >
        {name}
      </Text>
      {code ? <CategoryCode code={code} tone={selected ? 'inverse' : 'muted'} /> : null}
    </div>
  )
}
