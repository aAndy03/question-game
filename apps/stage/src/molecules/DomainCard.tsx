import { SPACE } from '@questiongame/design-stage'
import { Tag, Text, insetFrame } from '@/atoms'
import { STAGE_COPY } from '@/copy'

/**
 * One domain on the board, as the reference draws it:
 *
 *   SCI_440                       ← category code, quiet mono
 *   10                            ← the next question's difficulty figure
 *   Science                       ← the name, mono bold
 *
 * Selected: ink fill, paper text, a yellow SELECTED pill top-right.
 * Exhausted domains stay on the board, dimmed — a card must not disappear
 * between renders.
 */

export interface DomainCardProps {
  nodeId: string
  name: string
  code: string
  /** Formatted difficulty figure for the next question. Null when exhausted. */
  difficulty: string | null
  selected?: boolean
  exhausted?: boolean
}

export function DomainCard({ nodeId, name, code, difficulty, selected = false, exhausted = false }: DomainCardProps) {
  const dimmed = exhausted && !selected
  const tone = selected ? 'inverse' : dimmed ? 'muted' : 'heading'
  return (
    <div
      data-node-id={nodeId}
      data-selected={selected}
      data-exhausted={exhausted}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE[3],
        padding: SPACE[4],
        minHeight: 'calc(var(--space-8) * 3 + var(--space-1))',
        boxSizing: 'border-box',
        background: selected ? 'var(--ink)' : 'var(--paper)',
        boxShadow: insetFrame('thin', selected ? 'var(--ink)' : dimmed ? 'var(--border-subtle)' : 'var(--border-default)'),
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE[3] }}>
        <Text variant="stage-code-quiet" tone={selected ? 'inverse' : dimmed ? 'muted' : 'primary'}>
          {code}
        </Text>
        <span style={{ visibility: selected ? undefined : 'hidden' }}>
          <Tag tone="accent">{STAGE_COPY.selectedTag}</Tag>
        </span>
      </div>
      <Text variant="stage-card-figure" transition="count" tone={tone}>
        {difficulty ?? STAGE_COPY.exhaustedTag}
      </Text>
      <Text variant="stage-card-name" transition="swap" tone={tone} style={{ marginTop: 'auto', overflowWrap: 'anywhere' }}>
        {name}
      </Text>
    </div>
  )
}
