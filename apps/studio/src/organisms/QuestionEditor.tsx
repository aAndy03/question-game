import { useMemo, useState } from 'react'
import { Button, MeaningChip, Panel, Text, TextAreaField, SelectField } from '@/atoms'
import {
  DifficultyField,
  DirtyGuard,
  DomainPicker,
  EditorColumns,
  EditorActions,
  TagField,
  GapNotice,
  InlineNotice,
  NavCrumbs,
  OptionRow,
  SortableList,
  PageHeader,
  type DomainFormValue,
} from '@/molecules'
import { noticesAt, useNoticeStore, noticeText } from '@/chrome/notices'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useNavStore, type Route } from '@/chrome/nav'
import { LIST, QUESTION, TABS } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { acceptsQuestion, questionGaps } from '@/host/question'
import { useCatalogItem, useCatalogList, useTags } from '@/host/queries'
import { answerMode, type Domain, type Question, type QuestionOption } from '@/host/types'
import { useDirtyGuard, useDraft } from './useDraft'
import { usePropagatingSave } from './usePropagatingSave'
import { CopiesBlock } from './CopiesBlock'

export interface QuestionEditorProps {
  /** Null for a new question. */
  id: string | null
  /** The domain that was open when the editor opened (spec §12: the stack remembers). */
  domainId?: string | undefined
}

interface QuestionDraft {
  readonly question: Question
  /** Domain membership is on the domains, not the question (§4.1); the editor
   * carries it as a set and writes each changed domain. */
  readonly domainIds: readonly string[]
  /** Its group in each of those domains (P15), written with the memberships. */
  readonly groupIds: Readonly<Record<string, string | null>>
}

function newOption(index: number): QuestionOption {
  return { id: `opt-${crypto.randomUUID().slice(0, 6)}`, text: '', correct: index === 0 }
}

function emptyQuestion(): Question {
  return {
    id: `q-${crypto.randomUUID().slice(0, 8)}`,
    origin: 'operator',
    stem: '',
    mediaAssetId: null,
    options: [newOption(0), newOption(1)],
    difficulty: 50,
    explanation: null,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
  }
}

/**
 * Stem · options · difficulty · explanation · domains (`DomainPicker`, create
 * in place). Answer mode is derived from the ticks (spec §2.17). Writes the
 * question, then each domain whose membership changed; the host's
 * `catalog-changed` events refresh both lists.
 *
 * **It saves an incomplete question** (§2.32): the floor is question text or
 * one option, and a blank option row is dropped on save. What the question
 * lacks — two options, a correct tick, a difficulty, a domain — is listed at
 * the top as the draft changes and never disables Save, because the operator
 * who has the answer but not the difficulty must not lose the answer. A board
 * will not take it until the list is empty.
 */
/** The body a copy follows (stem, options, difficulty, explanation, media, tags) — not memberships. */
function sameBody(a: Question, b: Question): boolean {
  const body = (q: Question) =>
    JSON.stringify({ stem: q.stem, options: q.options, difficulty: q.difficulty, explanation: q.explanation ?? null, media: q.mediaAssetId ?? null, tags: q.tags ?? [] })
  return body(a) === body(b)
}

export function QuestionEditor({ id, domainId }: QuestionEditorProps) {
  const source = useCatalogItem('question', id)
  const domains = useCatalogList('domain', 'active')
  const tags = useTags()
  const run = useHostCommand()
  const propagating = usePropagatingSave()
  const go = useNavStore((s) => s.go)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [saving, setSaving] = useState(false)

  /**
   * A **new** question has no source: it is the operator's blank, and the
   * blank is minted once (`useState`, not `useMemo`) so it survives every
   * refetch. It used to be re-derived whenever `domains.data` changed, which
   * meant saving — a write that invalidates the domain list — handed the
   * editor a fresh empty question with a new id and wiped what had just been
   * typed. An existing question re-reads its row and its membership.
   */
  const [blank] = useState<QuestionDraft>(() => ({ question: emptyQuestion(), domainIds: domainId ? [domainId] : [], groupIds: {} }))
  const sourceDraft = useMemo<QuestionDraft | null>(() => {
    if (!id || !source.data) return null
    const question = source.data
    const memberOf = (domains.data ?? []).filter((d) => d.questions.some((m) => m.questionId === question.id))
    const groupIds: Record<string, string | null> = {}
    for (const d of memberOf) groupIds[d.id] = d.questions.find((m) => m.questionId === question.id)?.groupId ?? null
    return { question, domainIds: memberOf.map((d) => d.id), groupIds }
  }, [id, source.data, domains.data])

  const draft = useDraft<QuestionDraft>(sourceDraft, blank)
  const guard = useDirtyGuard(draft)
  const q = draft.value.question
  const setQ = (patch: Partial<Question>) => draft.set({ question: { ...q, ...patch } })

  const path = `question.${q.id}`
  const inline = noticesAt(notices, path)
  const fieldError = (field: string) => noticeText(inline.find((n) => n.targetPath === `${path}.${field}`))

  const correctCount = q.options.filter((o) => o.correct).length
  // A blank option row is not an option yet: it is dropped on save rather
  // than blocking it, since a new question opens with two of them and a row
  // cannot go below two. The §2.32 floor is the only thing that disables Save
  // — a gap never does.
  const filled = q.options.filter((o) => o.text.trim().length > 0)
  const canSave = draft.isDirty && acceptsQuestion(q)
  const gaps = questionGaps({ ...q, options: filled }, draft.value.domainIds.length > 0)

  const back: Route = { tab: 'library', ...(domainId ? { domainId } : {}) }

  const save = async (): Promise<boolean> => {
    // One save at a time: a second press while the copies are asked about
    // would cancel the first and clear its spinner (review).
    if (saving) return false
    setSaving(true)
    const item: Question = {
      ...q,
      stem: q.stem.trim(),
      explanation: q.explanation?.trim() ? q.explanation : null,
      options: filled.map((o) => ({ ...o, text: o.text.trim() })),
    }
    // Membership: add to chosen domains, drop from the rest (§4.1: sort_key
    // belongs to the membership; appending keeps the authored order).
    const before = new Set((domains.data ?? []).filter((d) => d.questions.some((m) => m.questionId === item.id)).map((d) => d.id))
    const after = new Set(draft.value.domainIds)
    const changed: Domain[] = []
    for (const d of domains.data ?? []) {
      const groupId = draft.value.groupIds[d.id] ?? null
      if (after.has(d.id) && !before.has(d.id)) {
        const sortKey = Math.max(0, ...d.questions.map((m) => m.sortKey)) + 1
        changed.push({ ...d, questions: [...d.questions, { questionId: item.id, sortKey, groupId }] })
      } else if (after.has(d.id) && (d.questions.find((m) => m.questionId === item.id)?.groupId ?? null) !== groupId) {
        // The same membership in another group: the other members as they are (P15).
        changed.push({ ...d, questions: d.questions.map((m) => (m.questionId === item.id ? { ...m, groupId } : m)) })
      } else if (!after.has(d.id) && before.has(d.id)) {
        changed.push({ ...d, questions: d.questions.filter((m) => m.questionId !== item.id) })
      }
    }
    // One write (beta.3): the question and the memberships it changes, so a
    // refused membership never leaves a saved question behind it — with its
    // copies too (`with`: the domains ride in the propagating transaction).
    // The copies are asked about only when the body changed: a domain or a
    // group is not theirs to follow.
    const bodyChanged = !source.data || !sameBody(source.data, item)
    const domainItems = changed.map((d) => ({ kind: 'domain', item: d }))
    const choice = bodyChanged ? await propagating.decide({ kind: 'question', item }, { targetPath: path }) : 'none'
    let ok: unknown
    if (choice === 'cancel') ok = null
    else if (choice === 'also') {
      ok = await run('catalog_upsert_propagating', { item: { kind: 'question', item }, with: domainItems }, { targetPath: path })
    } else {
      const items = [...(bodyChanged ? [{ kind: 'question', item }] : []), ...domainItems]
      ok = items.length === 0 ? true : await run('catalog_upsert_many', { items }, { targetPath: path })
    }
    setSaving(false)
    if (ok === null) return false
    draft.adopt({ question: item, domainIds: draft.value.domainIds, groupIds: draft.value.groupIds })
    toast.success(QUESTION.saved)
    return true
  }

  const saveAndView = async () => {
    if (await save()) void go({ tab: 'library', questionId: q.id, mode: 'view', ...(domainId ? { domainId } : {}) })
  }

  const createDomain = async (value: DomainFormValue): Promise<string | null> => {
    const domain: Domain = {
      id: `dom-${crypto.randomUUID().slice(0, 8)}`,
      origin: 'operator',
      name: value.name.trim(),
      code: value.code.trim(),
      description: value.description.trim() || null,
      questions: [],
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    }
    const result = await run('catalog_upsert', { item: { kind: 'domain', item: domain } })
    return result === null ? null : domain.id
  }

  const setOption = (i: number, patch: Partial<QuestionOption>) =>
    setQ({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })

  return (
    <>
      {propagating.dialog}
      <EditorColumns
        header={
          <PageHeader
            primaryAction={<EditorActions canSave={canSave} isSaving={saving} onSave={() => void saveAndView()} onCancel={() => void go(id ? { tab: 'library', questionId: id, mode: 'view', ...(domainId ? { domainId } : {}) } : back)} />}
            title={id ? q.stem.trim() || QUESTION.one : LIST.new(QUESTION.one)}
            isDirty={draft.isDirty}
            status={<MeaningChip meaning={answerMode(q)}>{answerMode(q) === 'single' ? QUESTION.single : QUESTION.multiple}</MeaningChip>}
            crumbs={
              <NavCrumbs
                crumbs={[
                  { label: TABS.library.label, onPress: () => void go(back) },
                  { label: id ? LIST.edit : LIST.new(QUESTION.one) },
                ]}
              />
            }
          />
        }
        sideLabel={QUESTION.filing}
        side={
          <>
            <Panel>
              <DomainPicker
                domains={(domains.data ?? []).map((d) => ({ id: d.id, name: d.name, code: d.code, questionCount: d.questions.length }))}
                selectedIds={draft.value.domainIds}
                // A domain taken off forgets its group: put back, the question starts in no group.
                onChange={(domainIds) => draft.set({ domainIds, groupIds: Object.fromEntries(Object.entries(draft.value.groupIds).filter(([d]) => domainIds.includes(d))) })}
                onCreate={createDomain}
              />
              {(domains.data ?? [])
                .filter((d) => draft.value.domainIds.includes(d.id) && (d.groups?.length ?? 0) > 0)
                .map((d) => (
                  <div key={d.id} className="pt-3" data-group-picker={d.id}>
                    <SelectField
                      label={GROUPS_TAGS.groupIn(d.name)}
                      value={draft.value.groupIds[d.id] ?? '~none'}
                      onChange={(v) => draft.set({ groupIds: { ...draft.value.groupIds, [d.id]: v === '~none' ? null : v } })}
                      options={[{ value: '~none', label: GROUPS_TAGS.noGroup }, ...(d.groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
                    />
                  </div>
                ))}
            </Panel>
            <Panel>
              <TagField value={q.tags ?? []} onChange={(tags) => setQ({ tags })} known={(tags.data ?? []).map((t) => t.tag)} error={fieldError('tags')} />
            </Panel>
            {id ? <CopiesBlock kind="question" id={q.id} /> : null}
          </>
        }
      >
        <GapNotice gaps={gaps} />
        {inline
          .filter((n) => !n.targetPath?.startsWith(`${path}.`))
          .map((n) => (
            <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} />
          ))}
        <Panel className="flex flex-col gap-5">
          <TextAreaField
            label={QUESTION.stem}
            value={q.stem}
            onChange={(stem) => setQ({ stem })}
            rows={3}
            autoFocus={!id}
            description={QUESTION.stemHint}
            error={fieldError('stem')}
          />
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <Text variant="studio-label">{QUESTION.options}</Text>
              <Text variant="studio-caption" tone="muted">
                {QUESTION.optionsHint}
              </Text>
              {fieldError('options') ? (
                <Text variant="studio-caption" tone="danger">
                  {fieldError('options')}
                </Text>
              ) : null}
            </div>
            {/* Dragged by a handle (P20): the order is the order Stage shows them in; the draft holds it until Save. */}
            <SortableList
              ids={q.options.map((o) => o.id)}
              label={QUESTION.options}
              onReorder={(next) => setQ({ options: next.flatMap((id) => q.options.filter((o) => o.id === id)) })}
              className="flex flex-col gap-3"
              renderRow={(id, handle) => {
                const i = q.options.findIndex((o) => o.id === id)
                const o = q.options[i]
                if (!o) return null
                return (
                  <OptionRow
                    handle={handle}
                    index={i}
                    text={o.text}
                    correct={o.correct}
                    onTextChange={(text) => setOption(i, { text })}
                    onCorrectChange={(correct) => setOption(i, { correct })}
                    onRemove={() => setQ({ options: q.options.filter((_, j) => j !== i) })}
                    isLastCorrect={o.correct && correctCount === 1}
                    isRequired={q.options.length <= 2}
                    autoFocus={i === q.options.length - 1 && i > 1 && o.text === ''}
                  />
                )
              }}
            />
            <div>
              <Button size="sm" variant="ghost" icon="add" onPress={() => setQ({ options: [...q.options, { ...newOption(q.options.length), correct: false }] })}>
                {QUESTION.addOption}
              </Button>
            </div>
          </div>
          <DifficultyField value={q.difficulty} onChange={(difficulty) => setQ({ difficulty })} error={fieldError('difficulty')} />
          <TextAreaField
            label={QUESTION.explanation}
            value={q.explanation ?? ''}
            onChange={(explanation) => setQ({ explanation })}
            rows={2}
            description={QUESTION.explanationHint}
          />
        </Panel>
      </EditorColumns>
      <DirtyGuard
        isOpen={guard.isOpen}
        isSaving={saving}
        onSave={() => guard.saveAndGo(save)}
        onDiscard={guard.discardAndGo}
        onKeepEditing={guard.keepEditing}
      />
    </>
  )
}
