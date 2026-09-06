import { useState } from 'react'
import { Button, MeaningChip, Panel, Skeleton, Text, TextField } from '@/atoms'
import { EmptyState, InlineNotice, NavCrumbs, PageHeader } from '@/molecules'
import { BoardSection, PlaysSection, RosterSection, RulesSection, useArchive } from '@/organisms'
import { RecordPageLayout } from '@/templates'
import { useNavStore, type GameSection } from '@/chrome/nav'
import { GAME, LIST, TABS } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { isPlayOpen, usePlayState } from '@/host/playState'
import { useRecipe } from '@/host/queries'
import { isArchived } from '@/host/types'

export interface GamePageProps {
  id: string
  section?: GameSection | undefined
}

const SECTIONS: readonly GameSection[] = ['roster', 'board', 'rules', 'plays']

/**
 * Game — one file (spec §12): name · Roster · Board · Rules · Plays, and
 * "Load into Control". Frozen while this recipe's Play is `playing|paused`:
 * every control disabled with the reason, a banner to Control.
 */
export function GamePage({ id, section = 'roster' }: GamePageProps) {
  const recipe = useRecipe(id)
  const play = usePlayState()
  const go = useNavStore((s) => s.go)
  const replace = useNavStore((s) => s.replace)
  const run = useHostCommand()
  const archive = useArchive()
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (recipe.isLoading && !recipe.data) {
    return (
      <RecordPageLayout width="wide">
        <Skeleton shape="card" count={3} />
      </RecordPageLayout>
    )
  }
  if (!recipe.data) {
    return (
      <RecordPageLayout width="wide">
        <EmptyState kind="error" what={GAME.many} detail={recipe.error?.message} />
      </RecordPageLayout>
    )
  }
  const r = recipe.data
  const archived = isArchived(r)
  const inControl = play?.operator.recipeId === r.id
  const frozen = inControl && isPlayOpen(play)
  const frozenReason = frozen ? GAME.frozenBanner : archived ? LIST.archived : null

  const commitName = async () => {
    if (name === null || name.trim() === r.name || !name.trim()) {
      setName(null)
      return
    }
    await run('recipe_upsert', { recipe: { ...r, name: name.trim() } })
    setName(null)
  }
  const load = async () => {
    setLoading(true)
    // `play_load` answers `()`, so the verdict is the only signal here.
    const ok = await run.ok('play_load', { recipeId: r.id, playId: `play-${Date.now()}` })
    setLoading(false)
    if (ok) {
      toast.success(`${r.name} is in Control`, 'Stage is open on the primary display.')
      void go({ tab: 'control' })
    }
  }

  return (
    <RecordPageLayout
      width="wide"
      rail={
        <nav aria-label="Game sections" className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={section === s ? 'page' : undefined}
              onClick={() => replace({ tab: 'games', id: r.id, section: s })}
              className={[
                'h-9 rounded-[calc(var(--radius)/1.5)] px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                section === s ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'hover:bg-[var(--surface-secondary)]',
              ].join(' ')}
            >
              <Text variant="studio-label" tone="inherit">
                {GAME.sections[s]}
              </Text>
            </button>
          ))}
        </nav>
      }
    >
      <PageHeader
        title={r.name}
        status={
          <span className="flex items-center gap-1.5">
            {inControl ? <MeaningChip meaning="playing">{GAME.loadedInControl}</MeaningChip> : null}
            {frozen ? <MeaningChip meaning="frozen">{GAME.frozen}</MeaningChip> : null}
            {archived ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
            <Text variant="studio-mono" tone="muted">{`${GAME.rev} ${r.rev}`}</Text>
          </span>
        }
        crumbs={<NavCrumbs crumbs={[{ label: TABS.games.label, onPress: () => void go({ tab: 'games' }) }, { label: r.name }]} />}
        primaryAction={
          inControl ? (
            <Button variant="primary" icon="control" onPress={() => void go({ tab: 'control' })}>
              {GAME.goToControl}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="control"
              onPress={() => void load()}
              isPending={loading}
              isDisabled={archived || r.teams.length === 0 || r.board.length === 0}
              disabledReason={archived ? LIST.archived : r.teams.length === 0 ? GAME.rosterEmpty : r.board.length === 0 ? GAME.boardEmpty : null}
            >
              {GAME.loadIntoControl}
            </Button>
          )
        }
        secondaryActions={
          archived ? (
            <Button variant="secondary" icon="restore" onPress={() => void archive.restore({ kind: 'recipe', ids: [r.id], what: GAME.one })}>
              {LIST.restore}
            </Button>
          ) : (
            <Button variant="ghost" icon="archive" onPress={() => archive.archive({ kind: 'recipe', ids: [r.id], what: GAME.one })} isDisabled={frozen} disabledReason={frozenReason}>
              {LIST.archive}
            </Button>
          )
        }
      />
      {frozen ? (
        <InlineNotice
          notice={{ code: 'recipe.frozen', severity: 'info', targetPath: null, actions: ['go_to_control'], detail: { message: GAME.frozenBanner } }}
          onAction={() => void go({ tab: 'control' })}
        />
      ) : null}
      {section === 'roster' ? (
        <>
          <Panel className="flex flex-col gap-4">
            <TextField
              label={GAME.name}
              value={name ?? r.name}
              onChange={setName}
              onBlur={() => void commitName()}
              isRequired
              disabledReason={frozenReason}
            />
          </Panel>
          <RosterSection recipe={r} frozenReason={frozenReason} />
        </>
      ) : null}
      {section === 'board' ? <BoardSection recipe={r} frozenReason={frozenReason} /> : null}
      {section === 'rules' ? <RulesSection recipe={r} frozenReason={frozenReason} /> : null}
      {section === 'plays' ? <PlaysSection recipe={r} /> : null}
      {archive.dialog}
    </RecordPageLayout>
  )
}
