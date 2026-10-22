import { useMemo, useState, type CSSProperties } from 'react'
import { Button, IconButton, MeaningChip, Panel, SwitchField, Text } from '@/atoms'
import { BoardBalance, BoardDomainRow, DifficultyDialog, EmptyState, IncompleteMark, InlineNotice, SettingRow, SortableList } from '@/molecules'
import { DOMAIN, GAME, PICKER, QUESTION } from '@/copy'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { blockedMembers, everyQuestion, oneQuestionPerDifficulty } from '@/host/board'
import { useHostCommand } from '@/host/commands'
import { pickDomainsSpec, pickQuestionsSpec, type QuestionItem } from '@/host/listSpecs'
import { bodyGaps, effectiveBody } from '@/host/question'
import { useCatalogList, useRulesPreview, useTags } from '@/host/queries'
import { difficultyBand, type BoardDomain, type BoardSettings, type Domain, type EditScope, type QuestionGap, type Recipe } from '@/host/types'
import { PickerDialog, type PickerRow } from './PickerDialog'
import { usePropagatingSave } from './usePropagatingSave'

export interface BoardSectionProps {
  recipe: Recipe
  frozenReason: string | null
}

/**
 * Pick domains for this show, then the questions from each (spec §12).
 * *Add domains…* and *Choose questions…* are pickers on the list-view model
 * (beta.4): search, filters, the domain's groups, select all in a group, pages
 * — a library of hundreds is a board of minutes. Each domain is one row
 * (P20): dragged by its handle to set the order teams see the domains in,
 * opened to list its questions in the walk the snapshot asks them in (easy to
 * hard, then id) — a big board opens closed. Difficulty overrides go through
 * `DifficultyDialog` (§2.17).
 *
 * **One question per difficulty, per domain** (P11.13), unless the game allows
 * repeats (`board.allow_repeated_difficulty`, P12.7). In *Choose questions…*
 * a question whose difficulty another chosen one holds is disabled with the
 * reason, live as the ticks change, and *select all in a group* skips it — so
 * the dialog never offers a board the host would refuse. The rule itself is
 * the host's (`recipe_upsert`, `build_snapshot`); `host/board.ts` spells it.
 *
 * **An incomplete question** (§2.32) cannot be chosen, its gaps as the reason —
 * unless it is already on the board, when it stays, marked, so the board Load
 * would refuse can be fixed. It is judged on the body this show would ask, so
 * a this-game difficulty can complete it. A new domain starts with one
 * complete question per difficulty (every complete one with repeats on).
 */
export function BoardSection({ recipe, frozenReason }: BoardSectionProps) {
  const preview = useRulesPreview(recipe.id, recipe.rev)
  const domains = useCatalogList('domain', 'active')
  const questions = useCatalogList('question', 'active')
  const tags = useTags()
  const run = useHostCommand()
  const propagating = usePropagatingSave()
  const [pending, setPending] = useState(false)
  const [pickingDomains, setPickingDomains] = useState(false)
  const [choosingIn, setChoosingIn] = useState<string | null>(null)
  const [difficultyFor, setDifficultyFor] = useState<{ questionId: string; current: number | null } | null>(null)
  /** Rows the operator opened or closed; the rest follow the board's size. */
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({})
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)

  const domainById = new Map((domains.data ?? []).map((d) => [d.id, d]))
  const questionById = new Map((questions.data ?? []).map((q) => [q.id, q]))
  /** The body this show would ask: overlay if this recipe set one, else the catalog's (§4.3). */
  const bodyOf = (questionId: string) => {
    const q = questionById.get(questionId)
    return q ? effectiveBody(q, recipe.overlays.questions[questionId]) : null
  }
  const gapsOf = (questionId: string) => {
    const body = bodyOf(questionId)
    return body ? bodyGaps(body) : []
  }
  const difficultyOf = (questionId: string) => bodyOf(questionId)?.difficulty ?? null
  const boardNotices = noticesAt(notices, `recipe.${recipe.id}.board`)
  // A recipe row written before P12.7 has no `board`; the host reads that as off.
  const allowRepeats = (recipe.settings.board as BoardSettings | undefined)?.allow_repeated_difficulty === true

  const write = async (board: readonly BoardDomain[]): Promise<boolean> => {
    setPending(true)
    const ok = await run.ok('recipe_set_membership', { id: recipe.id, teams: recipe.teams, board })
    setPending(false)
    return ok
  }
  /**
   * A domain new to the board: one complete question per difficulty,
   * `difficulty ASC, id ASC` — the order the snapshot queue walks, so it is
   * already a playable ladder rather than a board the host would refuse.
   */
  const ladderOf = (id: string): string[] => {
    const members = (domainById.get(id)?.questions ?? []).flatMap((m) => {
      const difficulty = difficultyOf(m.questionId)
      return difficulty !== null && gapsOf(m.questionId).length === 0 ? [{ questionId: m.questionId, difficulty }] : []
    })
    return [...(allowRepeats ? everyQuestion(members) : oneQuestionPerDifficulty(members))]
  }
  const applyDomains = (chosen: readonly string[]) =>
    write(chosen.map((id) => recipe.board.find((b) => b.domainId === id) ?? { domainId: id, questionIds: ladderOf(id) }))
  const applyQuestions = (domainId: string, chosen: readonly string[]) =>
    write(recipe.board.map((b) => (b.domainId === domainId ? { ...b, questionIds: [...chosen] } : b)))
  const removeQuestion = (domainId: string, questionId: string) =>
    void write(recipe.board.map((b) => (b.domainId === domainId ? { ...b, questionIds: b.questionIds.filter((q) => q !== questionId) } : b)))

  /**
   * *This game* writes the overlay; *Apply to original* writes the library row
   * and, when the row has copies, asks the editors' question first (beta.4) —
   * `false` keeps the dialog open when that question is cancelled.
   */
  const applyDifficulty = async (scope: EditScope, difficulty: number): Promise<boolean> => {
    if (!difficultyFor) return false
    let alsoCopies = false
    const q = questionById.get(difficultyFor.questionId)
    if (scope === 'original' && q) {
      const choice = await propagating.decide({ kind: 'question', item: { ...q, difficulty } }, { targetPath: `recipe.${recipe.id}.board` })
      if (choice === 'cancel') return false
      alsoCopies = choice === 'also'
    }
    // Closes whatever the host said: a refusal lands on the Board, under the
    // dialog, where it could not be read while the dialog stayed (1.1.1 review).
    await run(
      'recipe_set_overlay',
      { id: recipe.id, target: { target: 'question', id: difficultyFor.questionId, patch: { difficulty } }, scope, alsoCopies },
      { targetPath: `recipe.${recipe.id}.board` },
    )
    return true
  }

  const domainItems = useMemo(
    () =>
      (domains.data ?? []).map((d) => ({
        id: d.id,
        data: d,
        view: { title: d.name, subtitle: `${d.code} · ${DOMAIN.questionCount(d.questions.length)}` } satisfies PickerRow,
      })),
    [domains.data],
  )

  const choosing: Domain | undefined = choosingIn ? domainById.get(choosingIn) : undefined
  const choosingBoard = recipe.board.find((b) => b.domainId === choosingIn)
  const questionItems = useMemo(() => {
    if (!choosing) return []
    return choosing.questions.flatMap((m) => {
      const q = questionById.get(m.questionId)
      if (!q) return []
      const body = effectiveBody(q, recipe.overlays.questions[q.id])
      const group = m.groupId ? (choosing.groups ?? []).find((g) => g.id === m.groupId) : undefined
      const item: QuestionItem = { question: { ...q, ...body }, gaps: bodyGaps(body), domains: [], group: group ? { id: group.id, name: group.name } : null }
      const band = body.difficulty === null ? null : difficultyBand(body.difficulty)
      const view: PickerRow = {
        title: body.stem || QUESTION.noStem,
        chips: (
          <>
            <IncompleteMark gaps={item.gaps} />
            {band ? <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${body.difficulty}`}</MeaningChip> : <MeaningChip meaning="unset">{QUESTION.difficultyUnset}</MeaningChip>}
          </>
        ),
      }
      return [{ id: q.id, data: item, view }]
    })
    // `questionById` is rebuilt each render from the same query data.
  }, [choosing, questions.data, recipe.overlays.questions])
  const questionSpec = useMemo(
    () => pickQuestionsSpec({ groups: (choosing?.groups ?? []).map((g) => ({ id: g.id, name: g.name })), tags: (tags.data ?? []).map((t) => t.tag) }),
    [choosing, tags.data],
  )
  /** Incomplete, or its difficulty taken by a chosen question (repeats off). */
  const questionReason = (id: string, chosen: ReadonlySet<string>): string | null => {
    const gaps = gapsOf(id)
    if (gaps.length > 0) return GAME.incomplete(gaps)
    if (allowRepeats || !choosing) return null
    const taken = blockedMembers(
      choosing.questions.map((m) => ({ questionId: m.questionId, difficulty: difficultyOf(m.questionId), selected: chosen.has(m.questionId) })),
      false,
    ).get(id)
    return taken === undefined ? null : GAME.difficultyTaken(taken)
  }

  const total = recipe.board.reduce((n, b) => n + b.questionIds.length, 0)
  // A big board opens closed (P20): fifteen domains of thirty-eight questions
  // is a page of headers, not five hundred rows.
  const startsOpen = total <= 40 && recipe.board.length <= 4
  const isOpen = (domainId: string) => toggled[domainId] ?? startsOpen
  const setAll = (open: boolean) => setToggled(Object.fromEntries(recipe.board.map((b) => [b.domainId, open])))
  const ladders = new Map(preview.data && preview.data.board.kind !== 'empty' ? preview.data.board.domains.map((l) => [l.id, l]) : [])
  const shortest = preview.data?.board.kind === 'ragged' ? preview.data.board.min : null
  /** The order the snapshot asks them in: easy to hard, then id (`SnapshotDomain::new`). */
  const walk = (ids: readonly string[]) => [...ids].sort((a, b) => (difficultyOf(a) ?? 101) - (difficultyOf(b) ?? 101) || (a < b ? -1 : a > b ? 1 : 0))
  const reorderDomains = (order: readonly string[]) => write(order.flatMap((id) => recipe.board.filter((b) => b.domainId === id)))

  return (
    <Panel className="@container/board flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text variant="studio-heading">{GAME.board}</Text>
          <Text variant="studio-caption" tone="muted">
            {recipe.board.length === 0 ? GAME.boardHint : GAME.boardHintShort}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Text variant="studio-caption" tone="muted" className="whitespace-nowrap" tabular>
            {`${GAME.domainsCount(recipe.board.length)} · ${GAME.questionsCount(total)}`}
          </Text>
          <Button variant="secondary" icon="add" onPress={() => setPickingDomains(true)} isDisabled={pending} disabledReason={frozenReason}>
            {PICKER.addDomains}
          </Button>
        </div>
      </div>

      <div className="border-y border-[var(--separator)]">
        <SettingRow label={GAME.allowRepeats} description={GAME.allowRepeatsHint}>
          <SwitchField
            label={GAME.allowRepeats}
            hideLabel
            isSelected={allowRepeats}
            onChange={(on) =>
              void run('recipe_set_settings', {
                id: recipe.id,
                settings: { ...recipe.settings, board: { allow_repeated_difficulty: on } },
              })
            }
            disabledReason={frozenReason}
          />
        </SettingRow>
      </div>

      {boardNotices.map((n) => (
        <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
      ))}

      {recipe.board.length === 0 ? (
        <EmptyState kind="empty" what={DOMAIN.many} compact />
      ) : (
        <>
          {/*
            What kind of board this is (P11.12), in a line. Uneven domains never
            change what a question pays — the award does not read domain
            membership — but they change the ceiling and the walk, which each
            row shows for its own domain.
          */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">{preview.data ? <BoardBalance board={preview.data.board} /> : null}</div>
            {recipe.board.length > 1 ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onPress={() => setAll(true)}>
                  {GAME.openAll}
                </Button>
                <Button variant="ghost" size="sm" onPress={() => setAll(false)}>
                  {GAME.closeAll}
                </Button>
              </span>
            ) : null}
          </div>
          <SortableList
            ids={recipe.board.map((b) => b.domainId)}
            label={GAME.boardOrder}
            onReorder={reorderDomains}
            disabledReason={frozenReason}
            className="flex flex-col gap-2"
            renderRow={(domainId, handle) => {
              const b = recipe.board.find((x) => x.domainId === domainId)
              if (!b) return null
              const d = domainById.get(domainId)
              const overlay = recipe.overlays.domains[domainId]
              const ladder = ladders.get(domainId)
              return (
                <BoardDomainRow
                  handle={handle}
                  name={overlay?.name ?? d?.name ?? GAME.missingDomain}
                  code={overlay?.code ?? d?.code ?? ''}
                  overridden={overlay !== undefined}
                  count={b.questionIds.length}
                  of={d ? d.questions.length : b.questionIds.length}
                  ladder={ladder}
                  short={shortest !== null && ladder?.questions === shortest}
                  open={isOpen(domainId)}
                  onToggle={() => setToggled((t) => ({ ...t, [domainId]: !isOpen(domainId) }))}
                  frozenReason={frozenReason}
                  actions={
                    <>
                      <Button variant="secondary" size="sm" onPress={() => setChoosingIn(domainId)} isDisabled={pending || !d} disabledReason={frozenReason}>
                        {PICKER.chooseQuestions}
                      </Button>
                      <IconButton
                        icon="remove"
                        label={GAME.removeDomain}
                        size="sm"
                        onPress={() => void write(recipe.board.filter((x) => x.domainId !== domainId))}
                        isDisabled={pending}
                        disabledReason={frozenReason}
                      />
                    </>
                  }
                >
                  {b.questionIds.length === 0 ? (
                    <Text as="p" variant="studio-caption" tone="muted" className="px-1.5 py-1">
                      {GAME.noQuestionsYet}
                    </Text>
                  ) : (
                    // Two columns where they fit; the walk reads down, then across.
                    <ul
                      className="grid grid-cols-1 gap-x-6 @[64rem]/board:grid-flow-col @[64rem]/board:grid-cols-2 @[64rem]/board:[grid-template-rows:repeat(var(--walk-rows),auto)]"
                      style={{ '--walk-rows': Math.ceil(b.questionIds.length / 2) } as CSSProperties}
                    >
                      {walk(b.questionIds).map((qid) => (
                        <BoardQuestion
                          key={qid}
                          stem={recipe.overlays.questions[qid]?.stem ?? questionById.get(qid)?.stem ?? ''}
                          missing={!questionById.has(qid)}
                          difficulty={difficultyOf(qid)}
                          gaps={gapsOf(qid)}
                          overridden={recipe.overlays.questions[qid] !== undefined}
                          frozenReason={frozenReason}
                          pending={pending}
                          onDifficulty={() => setDifficultyFor({ questionId: qid, current: difficultyOf(qid) })}
                          onReset={() => void run('recipe_set_overlay', { id: recipe.id, target: { target: 'question', id: qid, patch: null }, scope: 'this_game' })}
                          onRemove={() => removeQuestion(domainId, qid)}
                        />
                      ))}
                    </ul>
                  )}
                </BoardDomainRow>
              )
            }}
          />
        </>
      )}

      <PickerDialog
        isOpen={pickingDomains}
        onClose={() => setPickingDomains(false)}
        title={PICKER.domainsTitle}
        spec={pickDomainsSpec}
        items={domainItems}
        initial={recipe.board.map((b) => b.domainId)}
        onApply={applyDomains}
        isPending={pending}
        columns={2}
      />
      <PickerDialog
        isOpen={choosing !== undefined}
        onClose={() => setChoosingIn(null)}
        title={PICKER.questionsTitle(choosing?.name ?? '')}
        spec={questionSpec}
        items={questionItems}
        initial={choosingBoard?.questionIds ?? []}
        disabledReason={questionReason}
        onApply={(chosen) => applyQuestions(choosingIn ?? '', chosen)}
        isPending={pending}
        // The walk the snapshot will ask them in: easy to hard, then id.
        chosenOrder={walk}
      />
      <DifficultyDialog
        isOpen={difficultyFor !== null}
        onOpenChange={(open) => !open && setDifficultyFor(null)}
        current={difficultyFor?.current ?? null}
        onChoose={applyDifficulty}
      />
      {propagating.dialog}
    </Panel>
  )
}

/**
 * One question on an open Board row: its difficulty first (the walk's key, and
 * the button that changes it for this game), then the stem. *Reset* and
 * *Take off the board* appear on hover or focus, so a long walk reads as a list.
 */
function BoardQuestion(props: {
  stem: string
  missing: boolean
  difficulty: number | null
  gaps: readonly QuestionGap[]
  overridden: boolean
  frozenReason: string | null
  pending: boolean
  onDifficulty: () => void
  onReset: () => void
  onRemove: () => void
}) {
  const { stem, missing, difficulty, gaps, overridden, frozenReason, pending } = props
  const band = difficulty === null ? null : difficultyBand(difficulty)
  const label = band ? `${QUESTION.band[band]} · ${difficulty}` : QUESTION.difficultyUnset
  return (
    <li className="group/q flex h-9 min-w-0 items-center gap-2 rounded px-1.5 hover:bg-[var(--surface-secondary)]" data-board-question>
      <button
        type="button"
        // One width for every chip, so the stems start in one column.
        className="flex w-24 shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        aria-label={GAME.editDifficulty(stem || QUESTION.noStem, label)}
        title={QUESTION.difficulty}
        disabled={frozenReason !== null || missing}
        onClick={props.onDifficulty}
      >
        <MeaningChip meaning={band ?? 'unset'}>{label}</MeaningChip>
      </button>
      <Text variant="studio-body" truncate className="min-w-0 flex-1">
        {missing ? GAME.missingQuestion : stem || QUESTION.noStem}
      </Text>
      <IncompleteMark gaps={gaps} />
      {overridden ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/q:opacity-100 group-hover/q:opacity-100">
        {overridden ? <IconButton icon="undo" label={GAME.reset} size="sm" onPress={props.onReset} disabledReason={frozenReason} /> : null}
        <IconButton icon="remove" label={GAME.removeQuestion} size="sm" onPress={props.onRemove} isDisabled={pending} disabledReason={frozenReason} />
      </span>
    </li>
  )
}
