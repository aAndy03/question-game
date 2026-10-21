import { useMemo, useState } from 'react'
import { Button, IconButton, MeaningChip, Panel, SwitchField, Text } from '@/atoms'
import { BoardBalance, DifficultyDialog, EmptyState, IncompleteMark, InlineNotice } from '@/molecules'
import { DOMAIN, GAME, PICKER, QUESTION } from '@/copy'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { blockedMembers, everyQuestion, oneQuestionPerDifficulty } from '@/host/board'
import { useHostCommand } from '@/host/commands'
import { pickDomainsSpec, pickQuestionsSpec, type QuestionItem } from '@/host/listSpecs'
import { bodyGaps, effectiveBody } from '@/host/question'
import { useCatalogList, useRulesPreview, useTags } from '@/host/queries'
import { difficultyBand, type BoardDomain, type BoardSettings, type Domain, type EditScope, type Recipe } from '@/host/types'
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
 * — a library of hundreds is a board of minutes. A domain card lists what it
 * has chosen. Difficulty overrides go through `DifficultyDialog` (§2.17); the
 * snapshot re-sorts by difficulty at Play start, so the order here is for the
 * operator's eye only.
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

  const write = async (board: readonly BoardDomain[]) => {
    setPending(true)
    await run('recipe_set_membership', { id: recipe.id, teams: recipe.teams, board })
    setPending(false)
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
    const done = await run(
      'recipe_set_overlay',
      { id: recipe.id, target: { target: 'question', id: difficultyFor.questionId, patch: { difficulty } }, scope, alsoCopies },
      { targetPath: `recipe.${recipe.id}.board` },
    )
    return done !== null
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

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-heading">{GAME.board}</Text>
          <Text variant="studio-caption" tone="muted">
            {GAME.boardHint}
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Text variant="studio-caption" tone="muted">
            {`${GAME.domainsCount(recipe.board.length)} · ${GAME.questionsCount(total)}`}
          </Text>
          <Button variant="secondary" icon="add" onPress={() => setPickingDomains(true)} isDisabled={pending} disabledReason={frozenReason}>
            {PICKER.addDomains}
          </Button>
        </div>
      </div>

      <SwitchField
        label={GAME.allowRepeats}
        description={GAME.allowRepeatsHint}
        isSelected={allowRepeats}
        onChange={(on) =>
          void run('recipe_set_settings', {
            id: recipe.id,
            settings: { ...recipe.settings, board: { allow_repeated_difficulty: on } },
          })
        }
        disabledReason={frozenReason}
      />

      {boardNotices.map((n) => (
        <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
      ))}

      {recipe.board.length === 0 ? <EmptyState kind="empty" what={DOMAIN.many} compact /> : null}

      {/*
        What kind of board this is, and what that means for the show (P11.12).
        Uneven domains never change what a question pays — the award does not
        read domain membership — but they change the ceiling and the walk, and
        that belongs here, next to the questions, rather than in Rules.
      */}
      {preview.data ? <BoardBalance board={preview.data.board} /> : null}

      {recipe.board.map((b) => {
        const d = domainById.get(b.domainId)
        const members = d ? d.questions.length : b.questionIds.length
        const overlay = recipe.overlays.domains[b.domainId]
        return (
          <div key={b.domainId} className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Text variant="studio-label" truncate>
                  {overlay?.name ?? d?.name ?? GAME.missingDomain}
                </Text>
                <Text variant="studio-mono" tone="muted">
                  {overlay?.code ?? d?.code ?? ''}
                </Text>
                {overlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
              </div>
              <Text variant="studio-caption" tone="muted">
                {GAME.questionsOn(b.questionIds.length, members)}
              </Text>
              <Button variant="secondary" size="sm" onPress={() => setChoosingIn(b.domainId)} isDisabled={pending || !d} disabledReason={frozenReason}>
                {PICKER.chooseQuestions}
              </Button>
              <IconButton
                icon="remove"
                label={GAME.removeDomain}
                size="sm"
                onPress={() => void write(recipe.board.filter((x) => x.domainId !== b.domainId))}
                isDisabled={pending}
                disabledReason={frozenReason}
              />
            </div>
            {b.questionIds.length === 0 ? (
              <Text variant="studio-caption" tone="muted">
                {DOMAIN.questionCount(0)}
              </Text>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {b.questionIds.map((qid) => {
                  const q = questionById.get(qid)
                  const qOverlay = recipe.overlays.questions[qid]
                  const gaps = gapsOf(qid)
                  const difficulty = difficultyOf(qid)
                  const band = difficulty === null ? null : difficultyBand(difficulty)
                  const stem = qOverlay?.stem ?? q?.stem ?? ''
                  return (
                    <li key={qid} className="flex h-9 items-center gap-3 rounded px-1.5 hover:bg-[var(--surface-secondary)]">
                      <Text variant="studio-body" truncate className="min-w-0 flex-1">
                        {q ? stem || QUESTION.noStem : GAME.missingQuestion}
                      </Text>
                      <IncompleteMark gaps={gaps} />
                      {qOverlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
                      <button
                        type="button"
                        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                        aria-label={GAME.editDifficulty(stem || QUESTION.noStem)}
                        title={QUESTION.difficulty}
                        disabled={frozenReason !== null || !q}
                        onClick={() => setDifficultyFor({ questionId: qid, current: difficulty })}
                      >
                        {band ? (
                          <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${difficulty}`}</MeaningChip>
                        ) : (
                          <MeaningChip meaning="unset">{QUESTION.difficultyUnset}</MeaningChip>
                        )}
                      </button>
                      {qOverlay ? (
                        <IconButton
                          icon="undo"
                          label={GAME.reset}
                          size="sm"
                          onPress={() =>
                            void run('recipe_set_overlay', { id: recipe.id, target: { target: 'question', id: qid, patch: null }, scope: 'this_game' })
                          }
                          disabledReason={frozenReason}
                        />
                      ) : null}
                      <IconButton
                        icon="remove"
                        label={GAME.removeQuestion}
                        size="sm"
                        onPress={() => removeQuestion(b.domainId, qid)}
                        isDisabled={pending}
                        disabledReason={frozenReason}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      <Text variant="studio-caption" tone="muted">
        {GAME.shapeHint}
      </Text>
      <PickerDialog
        isOpen={pickingDomains}
        onClose={() => setPickingDomains(false)}
        title={PICKER.domainsTitle}
        spec={pickDomainsSpec}
        items={domainItems}
        initial={recipe.board.map((b) => b.domainId)}
        onApply={applyDomains}
        isPending={pending}
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
