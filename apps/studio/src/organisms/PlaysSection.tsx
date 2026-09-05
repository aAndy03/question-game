import { MeaningChip, Panel, Skeleton, Text } from '@/atoms'
import { EmptyState } from '@/molecules'
import { fmt, GAME, PLAY_STATUS } from '@/copy'
import { useCatalogList, usePlayList } from '@/host/queries'
import type { Recipe } from '@/host/types'

export interface PlaysSectionProps {
  recipe: Recipe
}

/** Every Play of this recipe, read-only (spec §12: "Plays history"). */
export function PlaysSection({ recipe }: PlaysSectionProps) {
  const plays = usePlayList(recipe.id)
  const teams = useCatalogList('team', 'all')
  const nameOf = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? id

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-heading">{GAME.plays}</Text>
        <Text variant="studio-caption" tone="muted">
          {GAME.playsHint}
        </Text>
      </div>
      {plays.isLoading && !plays.data ? (
        <Skeleton shape="row" count={3} />
      ) : (plays.data ?? []).length === 0 ? (
        <EmptyState kind="empty" what={GAME.plays.toLowerCase()} compact />
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)]">
          <div className="grid grid-cols-[1fr_7rem_6rem_1fr] gap-3 border-b border-[var(--separator)] px-3 py-2">
            {['Play', 'Status', 'Questions', 'Scores'].map((h) => (
              <Text key={h} variant="studio-caption" tone="muted">
                {h}
              </Text>
            ))}
          </div>
          {(plays.data ?? []).map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_7rem_6rem_1fr] items-center gap-3 border-b border-[var(--separator)] px-3 py-2 last:border-b-0">
              <div className="flex min-w-0 flex-col">
                <Text variant="studio-mono" truncate>
                  {p.id}
                </Text>
                <Text variant="studio-caption" tone="muted">
                  {fmt.date(p.startedAtMs)}
                </Text>
              </div>
              <MeaningChip meaning={p.status === 'playing' ? 'playing' : 'seed'}>
                {PLAY_STATUS[p.status as keyof typeof PLAY_STATUS] ?? p.status}
              </MeaningChip>
              <Text variant="studio-body" tabular>
                {p.questionsConsumed}
              </Text>
              <Text variant="studio-caption" tone="muted" truncate>
                {Object.entries(p.scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, score]) => `${nameOf(id)} ${score}`)
                  .join(' · ')}
              </Text>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
