import { useState } from 'react'
import { Button, CheckboxField, IconButton, MeaningChip, Panel, SelectField, Text } from '@/atoms'
import { BoardBalance, EmptyState, ScopeConfirm } from '@/molecules'
import { DOMAIN, GAME, QUESTION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { useCatalogList, useRulesPreview } from '@/host/queries'
import { difficultyBand, type BoardDomain, type EditScope, type Recipe } from '@/host/types'

export interface BoardSectionProps {
  recipe: Recipe
  frozenReason: string | null
}

/**
 * Pick domains for this show, then the questions from each (spec §12).
 * Difficulty overrides are inline edits with `ScopeConfirm` (§2.17); the
 * snapshot re-sorts by difficulty at Play start, so the authored order shown
 * here is for the operator's eye only.
 */
export function BoardSection({ recipe, frozenReason }: BoardSectionProps) {
  const preview = useRulesPreview(recipe.id, recipe.rev)
  const domains = useCatalogList('domain', 'active')
  const questions = useCatalogList('question', 'active')
  const run = useHostCommand()
  const [adding, setAdding] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [scopeFor, setScopeFor] = useState<{ questionId: string; difficulty: number } | null>(null)

  const domainById = new Map((domains.data ?? []).map((d) => [d.id, d]))
  const questionById = new Map((questions.data ?? []).map((q) => [q.id, q]))
  const onBoard = new Set(recipe.board.map((b) => b.domainId))
  const available = (domains.data ?? []).filter((d) => !onBoard.has(d.id))

  const write = async (board: readonly BoardDomain[]) => {
    setPending(true)
    await run('recipe_set_membership', { id: recipe.id, teams: recipe.teams, board })
    setPending(false)
  }
  const addDomain = (id: string) => {
    const d = domainById.get(id)
    void write([...recipe.board, { domainId: id, questionIds: d ? d.questions.map((m) => m.questionId) : [] }])
  }
  const toggleQuestion = (domainId: string, questionId: string, on: boolean) =>
    void write(
      recipe.board.map((b) =>
        b.domainId !== domainId
          ? b
          : { ...b, questionIds: on ? [...b.questionIds, questionId] : b.questionIds.filter((q) => q !== questionId) },
      ),
    )

  const applyDifficulty = async (scope: EditScope) => {
    if (!scopeFor) return
    await run('recipe_set_overlay', {
      id: recipe.id,
      target: { target: 'question', id: scopeFor.questionId, patch: { difficulty: scopeFor.difficulty } },
      scope,
    })
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
        <Text variant="studio-caption" tone="muted">
          {`${GAME.domainsCount(recipe.board.length)} · ${GAME.questionsCount(total)}`}
        </Text>
      </div>

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
        const members = d ? d.questions.map((m) => m.questionId) : b.questionIds
        const overlay = recipe.overlays.domains[b.domainId]
        return (
          <div key={b.domainId} className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Text variant="studio-label" truncate>
                  {overlay?.name ?? d?.name ?? b.domainId}
                </Text>
                <Text variant="studio-mono" tone="muted">
                  {overlay?.code ?? d?.code ?? ''}
                </Text>
                {overlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
              </div>
              <Text variant="studio-caption" tone="muted">
                {GAME.questionsOn(b.questionIds.length, members.length)}
              </Text>
              <IconButton
                icon="remove"
                label={GAME.removeDomain}
                size="sm"
                onPress={() => void write(recipe.board.filter((x) => x.domainId !== b.domainId))}
                isDisabled={pending}
                disabledReason={frozenReason}
              />
            </div>
            {members.length === 0 ? (
              <Text variant="studio-caption" tone="muted">
                {DOMAIN.questionCount(0)}
              </Text>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {members.map((qid) => {
                  const q = questionById.get(qid)
                  const qOverlay = recipe.overlays.questions[qid]
                  const difficulty = qOverlay?.difficulty ?? q?.difficulty ?? 0
                  const band = difficultyBand(difficulty)
                  return (
                    <li key={qid} className="flex h-9 items-center gap-3 rounded px-1.5 hover:bg-[var(--surface-secondary)]">
                      <CheckboxField
                        label={q?.stem ?? qid}
                        hideLabel
                        isSelected={b.questionIds.includes(qid)}
                        onChange={(on) => toggleQuestion(b.domainId, qid, on)}
                        isDisabled={pending}
                        disabledReason={frozenReason}
                      />
                      <Text variant="studio-body" truncate className="min-w-0 flex-1">
                        {qOverlay?.stem ?? q?.stem ?? qid}
                      </Text>
                      {qOverlay ? <MeaningChip meaning="overridden">{GAME.overridden}</MeaningChip> : null}
                      <button
                        type="button"
                        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                        title={QUESTION.difficulty}
                        disabled={frozenReason !== null}
                        onClick={() => {
                          const next = window.prompt(`${QUESTION.difficulty} (1–100)`, String(difficulty))
                          const n = next === null ? Number.NaN : Number(next)
                          if (Number.isInteger(n) && n >= 1 && n <= 100 && n !== difficulty) setScopeFor({ questionId: qid, difficulty: n })
                        }}
                      >
                        <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${difficulty}`}</MeaningChip>
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
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      <div className="flex items-end gap-2">
        <div className="w-72">
          <SelectField
            label={GAME.addDomain}
            hideLabel
            value={adding}
            onChange={setAdding}
            placeholder={GAME.addDomain}
            options={available.map((d) => ({ value: d.id, label: d.name, description: `${d.code} · ${DOMAIN.questionCount(d.questions.length)}` }))}
            isDisabled={available.length === 0}
            disabledReason={frozenReason}
          />
        </div>
        <Button
          variant="secondary"
          icon="add"
          onPress={() => {
            if (adding) addDomain(adding)
            setAdding(null)
          }}
          isDisabled={adding === null || pending}
          disabledReason={frozenReason}
        >
          {GAME.addDomain}
        </Button>
      </div>
      <Text variant="studio-caption" tone="muted">
        {GAME.shapeHint}
      </Text>
      <ScopeConfirm isOpen={scopeFor !== null} onOpenChange={(open) => !open && setScopeFor(null)} subject={QUESTION.difficulty} onChoose={applyDifficulty} />
    </Panel>
  )
}
