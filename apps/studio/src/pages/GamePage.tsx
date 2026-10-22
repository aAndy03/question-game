import { useState } from 'react'
import { Button, ComboField, MeaningChip, Panel, Skeleton, StatusDot, Text, TextField } from '@/atoms'
import { ActionMenu, EmptyState, InlineNotice, NavCrumbs, PageHeader, TagField } from '@/molecules'
import { BoardSection, PlaysSection, RosterSection, RulesPreviewPanel, RulesSection, useArchive, useGameLabels, useTransfer } from '@/organisms'
import { TRANSFER } from '@/copy/workspaces'
import type { Recipe, RecipeEdit } from '@/host/types'
import { RecordPageLayout } from '@/templates'
import { useNavStore, type GameSection } from '@/chrome/nav'
import { gameSectionOf, useNoticeStore } from '@/chrome/notices'
import { CHROME, CONFIRM, GAME, GAME_TAG_WORDS, LIST, MENU, SHELL, TABS } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { isPlayOpen, usePlayState } from '@/host/playState'
import { useRecipe, useRecipeList } from '@/host/queries'
import { isTwin } from '@/host/twins'
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
  const transfer = useTransfer()
  const labels = useGameLabels()
  const [name, setName] = useState<string | null>(null)
  const games = useRecipeList('active')
  const [loading, setLoading] = useState(false)
  // Sections holding a refusal that still stands, so the rail can say where to
  // look from whichever section the operator is on (P12.8).
  const notices = useNoticeStore((s) => s.notices)
  const attention = new Set(
    notices.flatMap((n) => {
      const at = n.severity === 'error' ? gameSectionOf(n.targetPath) : null
      return at?.recipeId === id ? [at.section] : []
    }),
  )

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
  // The Games list's row actions, here too (beta.4).
  const duplicate = async () => {
    const copy = await run<Recipe>('recipe_duplicate', { id: r.id, newId: `recipe-${crypto.randomUUID().slice(0, 8)}`, newName: GAME.copyName(r.name) })
    if (copy) void go({ tab: 'games', id: copy.id })
  }
  const load = async () => {
    setLoading(true)
    // `play_load` answers `()`, so the verdict is the only signal here. A
    // refusal usually renders on another section (a Board problem, pressed
    // from the Roster), so it opens the collector where the click was (P12.8).
    const ok = await run.ok('play_load', { recipeId: r.id, playId: `play-${Date.now()}` }, { openCollectorOnRefusal: true, code: 'play_refused' })
    setLoading(false)
    if (ok) {
      toast.success(SHELL.inControl(r.name), SHELL.inControlHint)
      void go({ tab: 'control' })
    }
  }

  return (
    <RecordPageLayout
      width="wide"
      rail={
        <nav aria-label={SHELL.gameSections} className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={section === s ? 'page' : undefined}
              aria-label={attention.has(s) ? `${GAME.sections[s]} — ${CHROME.needsAttention}` : undefined}
              onClick={() => replace({ tab: 'games', id: r.id, section: s })}
              className={[
                'flex h-9 items-center justify-between gap-2 rounded-[calc(var(--radius)/1.5)] px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                section === s ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'hover:bg-[var(--surface-secondary)]',
              ].join(' ')}
            >
              <Text variant="studio-label" tone="inherit">
                {GAME.sections[s]}
              </Text>
              {attention.has(s) ? <StatusDot tone="danger" /> : null}
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
            {/* How the Games list files it (P20); the internal rev is a tooltip on the folder, not a headline. */}
            {r.folder ? (
              <span title={`${GAME.rev} ${r.rev}`}>
                <MeaningChip meaning="seed">{r.folder}</MeaningChip>
              </span>
            ) : null}
            {r.tags.slice(0, 4).map((t) => (
              <MeaningChip key={t} meaning="tag">
                {t}
              </MeaningChip>
            ))}
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
          <span className="flex items-center gap-1">
            {archived ? (
              <Button variant="secondary" icon="restore" onPress={() => void archive.restore({ kind: 'recipe', ids: [r.id], what: GAME.one })}>
                {LIST.restore}
              </Button>
            ) : (
              <Button variant="ghost" icon="archive" onPress={() => archive.archive({ kind: 'recipe', ids: [r.id], what: GAME.one })} isDisabled={frozen} disabledReason={frozenReason}>
                {LIST.archive}
              </Button>
            )}
            <ActionMenu
              label={GAME.moreActions}
              size="md"
              sections={[
                {
                  id: 'copy',
                  title: MENU.copyMove,
                  items: [
                    { id: 'duplicate', label: LIST.duplicate, icon: 'duplicate' },
                    { id: 'copy', label: TRANSFER.copyTo, icon: 'copy' },
                    { id: 'move', label: TRANSFER.moveTo, icon: 'transfer', disabledReason: frozen ? frozenReason : null },
                  ],
                },
              ]}
              onAction={(a) => {
                if (a === 'duplicate') void duplicate()
                if (a === 'copy' || a === 'move') transfer.open(a, { recipes: [r.id] })
              }}
            />
          </span>
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
          {/* The game's details (P20): its name, and how the Games list files it. */}
          <Panel className="@container/details flex flex-col gap-4">
            <TextField
              label={GAME.name}
              value={name ?? r.name}
              onChange={setName}
              description={isTwin(name ?? r.name, (games.data ?? []).filter((g) => g.id !== r.id)) ? CONFIRM.twinGame(name ?? r.name) : undefined}
              onBlur={() => void commitName()}
              isRequired
              disabledReason={frozenReason}
            />
            {/* Organisation, not the show: editable while the game plays. */}
            <div className="grid grid-cols-1 gap-4 @[40rem]/details:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <ComboField
                label={GAME.folder}
                description={GAME.folderHint}
                value={r.folder}
                options={labels.folders}
                maxLength={60}
                onCommit={(folder) => void labels.write([r.id], [{ op: 'set_folder', folder }])}
              />
              <TagField
                words={GAME_TAG_WORDS}
                value={r.tags}
                known={labels.tags}
                onChange={(next) => {
                  const key = (t: string) => t.trim().toLowerCase()
                  const removed = r.tags.filter((t) => !next.some((x) => key(x) === key(t))).map((t): RecipeEdit => ({ op: 'untag', tag: t }))
                  const added = next.filter((t) => !r.tags.some((x) => key(x) === key(t))).map((t): RecipeEdit => ({ op: 'tag', tag: t }))
                  void labels.write([r.id], [...removed, ...added])
                }}
              />
            </div>
          </Panel>
          <RosterSection recipe={r} frozenReason={frozenReason} />
        </>
      ) : null}
      {section === 'board' ? <BoardSection recipe={r} frozenReason={frozenReason} /> : null}
      {section === 'rules' ? (
        // On a wide page the rules and what they pay sit side by side, the explanation sticky (P20).
        <div className="@container/rules">
          <div className="grid grid-cols-1 gap-6 @[72rem]/rules:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] @[72rem]/rules:items-start">
            <RulesSection recipe={r} frozenReason={frozenReason} />
            {/*
              The preview reads the same recipe and the same rev, so it refetches
              with the write it is explaining (P11.12).
            */}
            <div className="@[72rem]/rules:sticky @[72rem]/rules:top-0 @[72rem]/rules:max-h-[calc(100vh-7rem)] @[72rem]/rules:overflow-y-auto">
              <RulesPreviewPanel recipeId={r.id} rev={r.rev} />
            </div>
          </div>
        </div>
      ) : null}
      {section === 'plays' ? <PlaysSection recipe={r} /> : null}
      {archive.dialog}
      {transfer.dialog}
      {labels.dialog}
    </RecordPageLayout>
  )
}
