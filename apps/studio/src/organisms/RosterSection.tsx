import { useState } from 'react'
import { Button, IconButton, MeaningChip, Panel, SelectField, Text } from '@/atoms'
import { EmptyState, TeamMark } from '@/molecules'
import { GAME, LIST, TEAM } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { useCatalogList } from '@/host/queries'
import type { Recipe } from '@/host/types'

export interface RosterSectionProps {
  recipe: Recipe
  /** Every control disabled with this reason (the recipe is playing). */
  frozenReason: string | null
}

/**
 * The roster in play order — the opening ring (spec §4.3). Up/down reorders
 * in P7; dnd-kit drag arrives with P8. Writes `recipe_set_membership`.
 */
export function RosterSection({ recipe, frozenReason }: RosterSectionProps) {
  const teams = useCatalogList('team', 'active')
  const run = useHostCommand()
  const [adding, setAdding] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const byId = new Map((teams.data ?? []).map((t) => [t.id, t]))
  const available = (teams.data ?? []).filter((t) => !recipe.teams.includes(t.id))

  const write = async (next: readonly string[]) => {
    setPending(true)
    await run('recipe_set_membership', { id: recipe.id, teams: next, board: recipe.board })
    setPending(false)
  }
  const move = (i: number, dir: -1 | 1) => {
    const next = [...recipe.teams]
    const j = i + dir
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) return
    next[i] = b
    next[j] = a
    void write(next)
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-heading">{GAME.roster}</Text>
        <Text variant="studio-caption" tone="muted">
          {GAME.rosterHint}
        </Text>
      </div>
      {recipe.teams.length === 0 ? (
        <EmptyState kind="empty" what={TEAM.many} compact />
      ) : (
        <ol className="flex flex-col gap-1">
          {recipe.teams.map((id, i) => {
            const t = byId.get(id)
            const overlay = recipe.overlays.teams[id]
            return (
              <li key={id} className="flex h-12 items-center gap-3 rounded-[calc(var(--radius)/1.5)] px-2" style={{ background: 'var(--surface-secondary)' }}>
                <Text variant="studio-mono" tone="muted" className="w-5 text-right" tabular>
                  {i + 1}
                </Text>
                <div className="min-w-0 flex-1">
                  {t ? (
                    <TeamMark mark={{ color: overlay?.color ?? t.color, shortCode: overlay?.shortCode ?? t.shortCode, name: overlay?.name ?? t.name }} withName />
                  ) : (
                    <Text variant="studio-mono" tone="muted">
                      {id}
                    </Text>
                  )}
                </div>
                {overlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
                <IconButton icon="up" label={GAME.moveUp} size="sm" onPress={() => move(i, -1)} isDisabled={i === 0 || pending} disabledReason={frozenReason} />
                <IconButton icon="down" label={GAME.moveDown} size="sm" onPress={() => move(i, 1)} isDisabled={i === recipe.teams.length - 1 || pending} disabledReason={frozenReason} />
                <IconButton
                  icon="remove"
                  label={GAME.removeTeam}
                  size="sm"
                  onPress={() => void write(recipe.teams.filter((x) => x !== id))}
                  isDisabled={pending}
                  disabledReason={frozenReason}
                />
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex items-end gap-2">
        <div className="w-72">
          <SelectField
            label={GAME.addTeam}
            hideLabel
            value={adding}
            onChange={setAdding}
            placeholder={available.length === 0 ? `${LIST.new(TEAM.one)}…` : GAME.addTeam}
            options={available.map((t) => ({ value: t.id, label: t.name, description: t.shortCode }))}
            isDisabled={available.length === 0}
            disabledReason={frozenReason}
          />
        </div>
        <Button
          variant="secondary"
          icon="add"
          onPress={() => {
            if (adding) void write([...recipe.teams, adding])
            setAdding(null)
          }}
          isDisabled={adding === null || pending}
          disabledReason={frozenReason}
        >
          {GAME.addTeam}
        </Button>
      </div>
    </Panel>
  )
}
