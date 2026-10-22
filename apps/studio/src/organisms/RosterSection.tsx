import { useMemo, useState } from 'react'
import { Button, IconButton, MeaningChip, Panel, Text } from '@/atoms'
import { DragHandle, EmptyState, InlineNotice, SortableList, TeamMark } from '@/molecules'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { GAME, LIST, PICKER, TEAM } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { pickTeamsSpec } from '@/host/listSpecs'
import { useCatalogList } from '@/host/queries'
import { isArchived, type Recipe } from '@/host/types'
import { PickerDialog, type PickerRow } from './PickerDialog'

export interface RosterSectionProps {
  recipe: Recipe
  /** Every control disabled with this reason (the recipe is playing). */
  frozenReason: string | null
}

/**
 * The roster in play order — the opening ring (spec §4.3). A row is dragged
 * by its handle (P20: the other rows slide aside, the drop writes once);
 * *Add teams…* is the picker on the list-view model (beta.4), which keeps the
 * order and appends what it adds. Writes `recipe_set_membership`.
 *
 * An archived team on the roster is drawn by its name with *Archived* —
 * Load refuses it (beta.4), so the operator sees which one before pressing.
 */
export function RosterSection({ recipe, frozenReason }: RosterSectionProps) {
  const teams = useCatalogList('team', 'all')
  const run = useHostCommand()
  const [pending, setPending] = useState(false)
  const [picking, setPicking] = useState(false)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  // A refused Load names a roster row (beta.4: an archived team): said here, where it is fixed.
  const rosterNotices = noticesAt(notices, `recipe.${recipe.id}.roster`)

  const byId = new Map((teams.data ?? []).map((t) => [t.id, t]))
  const items = useMemo(
    () =>
      (teams.data ?? [])
        .filter((t) => !isArchived(t))
        .map((t) => ({ id: t.id, data: t, view: { title: t.name, chips: <TeamMark mark={{ color: t.color, shortCode: t.shortCode, name: t.name }} /> } satisfies PickerRow })),
    [teams.data],
  )

  const write = async (next: readonly string[]): Promise<boolean> => {
    setPending(true)
    const ok = await run.ok('recipe_set_membership', { id: recipe.id, teams: next, board: recipe.board })
    setPending(false)
    return ok
  }
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-heading">{GAME.roster}</Text>
          <Text variant="studio-caption" tone="muted">
            {GAME.rosterHint}
          </Text>
        </div>
        <Button variant="secondary" icon="add" onPress={() => setPicking(true)} isDisabled={pending} disabledReason={frozenReason}>
          {PICKER.addTeams}
        </Button>
      </div>
      {rosterNotices.map((n) => (
        <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
      ))}
      {recipe.teams.length === 0 ? (
        <EmptyState kind="empty" what={TEAM.many} compact />
      ) : (
        <SortableList
          ids={recipe.teams}
          label={GAME.rosterOrder}
          onReorder={write}
          disabledReason={frozenReason}
          className="flex flex-col gap-1"
          renderRow={(id, handle) => {
            const t = byId.get(id)
            const overlay = recipe.overlays.teams[id]
            const name = overlay?.name ?? t?.name ?? GAME.missingTeam
            return (
              <div
                className={['flex h-12 items-center gap-2 rounded-[calc(var(--radius)/1.5)] px-1.5 transition-shadow', handle.isDragging ? 'shadow-lg ring-1 ring-[var(--accent)]' : ''].join(' ')}
                style={{ background: 'var(--surface-secondary)' }}
              >
                <DragHandle handle={handle} label={GAME.reorder(name)} disabledReason={frozenReason} />
                <Text variant="studio-mono" tone="muted" className="w-5 text-right" tabular>
                  {handle.index + 1}
                </Text>
                <div className="min-w-0 flex-1">
                  {t ? (
                    <TeamMark mark={{ color: overlay?.color ?? t.color, shortCode: overlay?.shortCode ?? t.shortCode, name }} withName />
                  ) : (
                    <Text variant="studio-caption" tone="muted">
                      {GAME.missingTeam}
                    </Text>
                  )}
                </div>
                {t && isArchived(t) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
                {overlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
                <IconButton
                  icon="remove"
                  label={GAME.removeTeam}
                  size="sm"
                  onPress={() => void write(recipe.teams.filter((x) => x !== id))}
                  isDisabled={pending}
                  disabledReason={frozenReason}
                />
              </div>
            )
          }}
        />
      )}
      <PickerDialog
        isOpen={picking}
        onClose={() => setPicking(false)}
        title={PICKER.teamsTitle}
        spec={pickTeamsSpec}
        items={items}
        initial={recipe.teams}
        onApply={write}
        isPending={pending}
        columns={2}
      />
    </Panel>
  )
}
