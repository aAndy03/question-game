import { useMemo } from 'react'
import { Button, Icon, MeaningChip } from '@/atoms'
import { ActionMenu, PageHeader } from '@/molecules'
import { LibraryList, ListToolbar, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useArchiveScope, useChromeStore, useListState, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { CHROME, fmt, GAME, LIST, TABS, VIEWS } from '@/copy'
import type { SeedResult } from '@/host/types'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { gamesSpec, type GameItem } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useListHits, useRecipeList } from '@/host/queries'
import { isArchived, type Recipe } from '@/host/types'
import { useListView } from '@/host/useListView'

/** Games — all games: recipe cards or a table (spec §12). */
export function GamesPage() {
  const scope = useArchiveScope('games')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const run = useHostCommand()
  const archive = useArchive()
  const play = usePlayState()
  const list = useRecipeList(scope)
  const session = useListState('games')
  const hits = useListHits('recipe', session.search, scope, list.data?.length)
  const playingId = play && (play.status === 'playing' || play.status === 'paused') ? play.operator.recipeId : null

  const items = useMemo<ListItem<GameItem, RecordView>[] | undefined>(
    () =>
      list.data?.map((r: Recipe) => {
        const questions = r.board.reduce((n, b) => n + b.questionIds.length, 0)
        return {
          id: r.id,
          data: { recipe: r, playing: playingId === r.id, questions },
          view: {
            id: r.id,
            title: r.name,
            subtitle: [r.folder, ...r.tags].filter(Boolean).join(' · ') || undefined,
            leading: <Icon name="games" size="md" className="opacity-60" />,
            chips: (
              <>
                {playingId === r.id ? <MeaningChip meaning="playing">{GAME.loadedInControl}</MeaningChip> : null}
                {isArchived(r) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
              </>
            ),
            meta: [GAME.teamsCount(r.teams.length), GAME.questionsCount(questions), fmt.dateShort(r.updatedAt)],
            isArchived: isArchived(r),
          },
        }
      }),
    [list.data, playingId],
  )
  const spec = useMemo(() => gamesSpec(list.data ?? []), [list.data])
  const lv = useListView(spec, items, hits)

  const create = async () => {
    const id = `recipe-${crypto.randomUUID().slice(0, 8)}`
    const recipe = await run<Recipe>('recipe_new', { id, name: 'New game' })
    if (recipe) void go({ tab: 'games', id: recipe.id })
  }
  const duplicate = async (id: string) => {
    const source = list.data?.find((r) => r.id === id)
    const recipe = await run<Recipe>('recipe_duplicate', {
      id,
      newId: `recipe-${crypto.randomUUID().slice(0, 8)}`,
      newName: `${source?.name ?? 'Game'} (copy)`,
    })
    if (recipe) void go({ tab: 'games', id: recipe.id })
  }

  const archivedView = scope === 'archived'
  return (
    <LibraryTabLayout
      header={
        <PageHeader
          title={TABS.games.label}
          description={TABS.games.hint}
          primaryAction={
            <Button variant="primary" icon="add" onPress={() => void create()}>
              {LIST.new(GAME.one)}
            </Button>
          }
          toolbar={<ListToolbar view={lv} what={GAME.many} layout={view.games} onLayout={(v) => setView('games', v)} status={scope} onStatus={(v) => setScope('games', v)} />}
        />
      }
    >
      <LibraryList
        view={lv}
        total={list.data?.length}
        scope={scope}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.games}
        what={GAME.many}
        columns={{
          title: { sortId: 'name', label: VIEWS.name },
          meta: [{ sortId: 'teams', label: VIEWS.teams }, { sortId: 'questions', label: VIEWS.questions }, { sortId: 'changed', label: VIEWS.changed }],
        }}
        emptyAction={
          !archivedView ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" icon="add" onPress={() => void create()}>
                {LIST.new(GAME.one)}
              </Button>
              <Button
                variant="secondary"
                icon="games"
                onPress={() => {
                  void run<SeedResult>('catalog_seed_demo', { demo: 'en', mode: 'missing' }).then((r) => {
                    if (r) void go({ tab: 'games', id: r.recipeId })
                  })
                }}
              >
                {CHROME.loadDemo}
              </Button>
              <Button
                variant="secondary"
                icon="games"
                onPress={() => {
                  void run<SeedResult>('catalog_seed_demo', { demo: 'ro', mode: 'missing' }).then((r) => {
                    if (r) void go({ tab: 'games', id: r.recipeId })
                  })
                }}
              >
                {CHROME.loadDemoRo}
              </Button>
            </div>
          ) : null
        }
        onOpen={(id) => void go({ tab: 'games', id })}
        actions={(row) => (
          <ActionMenu
            items={[
              { id: 'open', label: LIST.open, icon: 'open' },
              { id: 'duplicate', label: LIST.duplicate, icon: 'duplicate' },
              row.isArchived
                ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true, isDisabled: playingId === row.id },
            ]}
            onAction={(a) => {
              if (a === 'open') void go({ tab: 'games', id: row.id })
              if (a === 'duplicate') void duplicate(row.id)
              if (a === 'archive') archive.archive({ kind: 'recipe', ids: [row.id], what: GAME.one })
              if (a === 'restore') void archive.restore({ kind: 'recipe', ids: [row.id], what: GAME.one })
            }}
          />
        )}
        onRetry={() => void list.refetch()}
      />
      {archive.dialog}
    </LibraryTabLayout>
  )
}
