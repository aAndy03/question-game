import { useCallback, useMemo, useState } from 'react'
import { Button, Icon, MeaningChip } from '@/atoms'
import { ActionMenu, ArchiveToggle, PageHeader, SearchField, ViewSwitch, type ArchiveView } from '@/molecules'
import { LibraryList, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useArchiveScope, useChromeStore, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { CHROME, fmt, GAME, LIST, TABS } from '@/copy'
import type { SeedResult } from '@/host/types'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { useRecipeList, useSearch } from '@/host/queries'
import { isArchived, type Recipe } from '@/host/types'

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
  const [text, setText] = useState('')
  const onSearch = useCallback((t: string) => setText(t), [])

  const list = useRecipeList(scope === 'archived' ? 'archived' : 'active')
  const hits = useSearch(text ? { text, kinds: ['recipe'], scope: scope === 'archived' ? 'archived' : 'active', limit: 200 } : null)
  const hitIds = useMemo(() => (text && hits.data ? new Set(hits.data.map((h) => h.id)) : null), [text, hits.data])
  const playingId = play && (play.status === 'playing' || play.status === 'paused') ? play.operator.recipeId : null

  const rows = useMemo<RecordView[] | undefined>(
    () =>
      list.data
        ?.filter((r) => !hitIds || hitIds.has(r.id))
        .map((r: Recipe) => {
          const questions = r.board.reduce((n, b) => n + b.questionIds.length, 0)
          return {
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
            sort: { updated: r.updatedAt, created: r.createdAt },
          }
        }),
    [list.data, hitIds, playingId],
  )

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
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <SearchField what={GAME.many} onSearch={onSearch} />
              <div className="flex-1" />
              <ViewSwitch value={view.games} onChange={(v) => setView('games', v)} />
              <ArchiveToggle value={archivedView ? 'archived' : 'active'} onChange={(v: ArchiveView) => setScope('games', v)} />
            </div>
          }
        />
      }
    >
      <LibraryList
        rows={rows}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.games}
        what={GAME.many}
        sortBy="updated"
        sortDesc
        emptyKind={text ? 'noResults' : archivedView ? 'archivedEmpty' : 'empty'}
        emptyAction={
          !text && !archivedView ? (
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
