import { useMemo, useState } from 'react'
import { Button, SegmentedField, SelectField, Text } from '@/atoms'
import { ConfirmDialog, DifficultyChip, EmptyState, ManagerDialog, MemberList, NameDialog, PaneList } from '@/molecules'
import { toast } from '@/chrome/toast'
import { useNavStore } from '@/chrome/nav'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { QUESTION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { foldTag } from '@/host/listSpecs'
import { useCatalogList, useTags } from '@/host/queries'
import { type BulkReport, type Question } from '@/host/types'

export interface QuestionTagsManagerProps {
  isOpen: boolean
  onClose: () => void
  /** Filter the Questions list to this tag (its folded value) and close. */
  onShowInList: (tag: string) => void
}

/**
 * Question tags (P20; *Manage tags* in P15): every tag on this workspace's
 * questions, with how many carry it, and the chosen tag's questions beside
 * it. Rename (to an existing tag merges them) · Merge into… · Show in list ·
 * Delete, each saying how many change; a tag written several ways offers to
 * use one spelling. The reads are all on the client (`tag_list`, the
 * questions); the writes are the host's (`tag_rename`, `tag_delete`).
 */
export function QuestionTagsManager({ isOpen, onClose, onShowInList }: QuestionTagsManagerProps) {
  const tags = useTags()
  const questions = useCatalogList('question', 'active')
  const run = useHostCommand()
  const go = useNavStore((s) => s.go)
  const [order, setOrder] = useState<'az' | 'used'>('az')
  const [picked, setPicked] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState(false)
  const [target, setTarget] = useState<string | null>(null)

  const list = useMemo(() => {
    const all = [...(tags.data ?? [])]
    return order === 'used' ? all.sort((a, b) => b.questions - a.questions || a.tag.localeCompare(b.tag)) : all
  }, [tags.data, order])
  const current = list.find((t) => t.tag === picked) ?? list[0] ?? null
  const carriers = useMemo(
    () => (current ? (questions.data ?? []).filter((q) => (q.tags ?? []).some((t) => foldTag(t) === foldTag(current.tag))) : []),
    [questions.data, current],
  )
  // How the chosen tag is written across its questions: more than one way is worth one press.
  const spellings = useMemo(() => {
    if (!current) return []
    const ways = new Set<string>()
    for (const q of carriers) for (const t of q.tags ?? []) if (foldTag(t) === foldTag(current.tag)) ways.add(t)
    return [...ways]
  }, [carriers, current])

  const chip = (q: Question) => <DifficultyChip difficulty={q.difficulty} />

  const detail = !current ? (
    <EmptyState kind="empty" what={GROUPS_TAGS.questionTagsWhat} detail={GROUPS_TAGS.noTagsYet} compact />
  ) : (
    <>
      <div className="flex flex-col gap-0.5">
        <Text as="h3" variant="studio-heading" truncate>
          {current.tag}
        </Text>
        <Text variant="studio-caption" tone="muted">
          {GROUPS_TAGS.carried(current.questions)}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon="edit" onPress={() => setRenaming(true)}>
          {GROUPS_TAGS.rename}
        </Button>
        <Button size="sm" variant="secondary" icon="duplicate" onPress={() => setMerging(true)} isDisabled={list.length < 2}>
          {GROUPS_TAGS.mergeInto}
        </Button>
        <Button size="sm" variant="secondary" icon="filter" onPress={() => onShowInList(foldTag(current.tag))}>
          {GROUPS_TAGS.showInList}
        </Button>
        <Button size="sm" variant="tertiary" icon="trash" onPress={() => setDeleting(true)}>
          {GROUPS_TAGS.deleteTag}
        </Button>
      </div>
      {spellings.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--separator)] p-2">
          <Text variant="studio-caption" tone="warning">
            {GROUPS_TAGS.spellings(spellings.length)}
          </Text>
          {spellings.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="ghost"
              onPress={() => void run.ok('tag_rename', { from: current.tag, to: s, preview: false })}
            >
              {GROUPS_TAGS.useSpelling(s)}
            </Button>
          ))}
        </div>
      ) : null}
      <MemberList
        label={GROUPS_TAGS.tagsOnQuestion}
        members={carriers.map((q) => ({ id: q.id, title: q.stem || QUESTION.noStem, chips: chip(q) }))}
        more={(n) => (
          <Button size="sm" variant="ghost" onPress={() => onShowInList(foldTag(current.tag))}>
            {GROUPS_TAGS.moreMembers(n)}
          </Button>
        )}
        onOpen={(id) => {
          onClose()
          void go({ tab: 'library', questionId: id, mode: 'view' })
        }}
      />
    </>
  )

  return (
    <>
      <ManagerDialog
        isOpen={isOpen}
        onClose={onClose}
        title={GROUPS_TAGS.manageTitle}
        description={GROUPS_TAGS.manageBody}
        hook="data-manage-tags"
        empty={list.length === 0 ? <EmptyState kind="empty" what={GROUPS_TAGS.questionTagsWhat} detail={GROUPS_TAGS.noTagsYet} /> : undefined}
        list={
          <PaneList
            what={GROUPS_TAGS.questionTagsWhat}
            entries={list.map((t) => ({ id: t.tag, label: t.tag, count: t.questions }))}
            selectedId={current?.tag ?? null}
            onSelect={setPicked}
            top={
              list.length > 1 ? (
                <SegmentedField
                  label={GROUPS_TAGS.sortLabel}
                  hideLabel
                  size="sm"
                  value={order}
                  onChange={(v) => setOrder(v === 'used' ? 'used' : 'az')}
                  options={[
                    { value: 'az', label: GROUPS_TAGS.sortAz },
                    { value: 'used', label: GROUPS_TAGS.sortUsed },
                  ]}
                />
              ) : null
            }
          />
        }
        detail={detail}
        footer={
          <Button variant="tertiary" onPress={onClose}>
            {GROUPS_TAGS.close}
          </Button>
        }
      />
      <NameDialog
        isOpen={renaming}
        onOpenChange={(o) => setRenaming(o)}
        title={current ? GROUPS_TAGS.renameTitle(current.tag) : ''}
        label={GROUPS_TAGS.renameTo}
        initial={current?.tag ?? ''}
        confirmLabel={GROUPS_TAGS.save}
        onSubmit={async (to) => {
          if (!current) return
          const done = await command<BulkReport>('tag_rename', { from: current.tag, to, preview: false })
          const into = list.find((t) => foldTag(t.tag) === foldTag(to) && t.tag !== current.tag)
          toast.success(into ? GROUPS_TAGS.mergeNote(into.tag, done.changed.length) : GROUPS_TAGS.done(done.changed.length))
          setPicked(into?.tag ?? to.trim())
        }}
      />
      <ConfirmDialog
        isOpen={merging}
        onOpenChange={(o) => {
          setMerging(o)
          if (!o) setTarget(null)
        }}
        severity="default"
        title={current ? GROUPS_TAGS.mergeTagTitle(current.tag) : ''}
        body={
          current ? (
            <div className="flex flex-col gap-3">
              <SelectField
                label={GROUPS_TAGS.mergeTarget}
                value={target}
                onChange={setTarget}
                options={list.filter((t) => t.tag !== current.tag).map((t) => ({ value: t.tag, label: t.tag, description: GROUPS_TAGS.carried(t.questions) }))}
              />
              <Text variant="studio-caption" tone="muted">
                {GROUPS_TAGS.mergeTagBody(current.questions)}
              </Text>
            </div>
          ) : undefined
        }
        confirmLabel={GROUPS_TAGS.merge}
        onConfirm={async () => {
          // Judged on press: the field may commit on the blur this press caused.
          if (!current || !target) return false
          // A refusal is a notice (`run`), and the dialog stays open.
          const done = await run<BulkReport>('tag_rename', { from: current.tag, to: target, preview: false })
          if (done === null) return false
          toast.success(GROUPS_TAGS.mergeNote(target, done.changed.length))
          setPicked(target)
          setTarget(null)
          return true
        }}
      />
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={current ? GROUPS_TAGS.deleteTagTitle(current.tag) : ''}
        body={current ? GROUPS_TAGS.deleteTagBody(current.questions) : undefined}
        confirmLabel={GROUPS_TAGS.deleteTag}
        onConfirm={async () => {
          if (!current) return true
          const ok = await run.ok('tag_delete', { tag: current.tag, preview: false })
          if (ok) setPicked(null)
          return ok
        }}
      />
    </>
  )
}
