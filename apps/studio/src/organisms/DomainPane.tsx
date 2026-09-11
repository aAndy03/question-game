import { useMemo, useState } from 'react'
import { Button, Icon, IconButton, MeaningChip, Panel, Skeleton, Text } from '@/atoms'
import { ActionMenu, ArchiveToggle, DomainForm, EmptyState, suggestDomainCode, type DomainFormValue } from '@/molecules'
import { CONFIRM, DOMAIN, LIST } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { activeMemberIds, bodyGaps, questionGaps } from '@/host/question'
import { useCatalogList } from '@/host/queries'
import type { ArchiveScope, Domain } from '@/host/types'
import { useArchive } from './useArchive'

export interface DomainPaneProps {
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const EMPTY: DomainFormValue = { name: '', code: '', description: '' }

/**
 * The domain pane of Domains + Questions: the list with its own archive
 * scope (spec §12: "two scopes in this tab"), Add domain, and edit in place.
 * An active domain holding incomplete questions says how many (§2.32), so the
 * operator knows which one to open; *All questions* counts every one,
 * domain-less ones included.
 */
export function DomainPane({ selectedId, onSelect }: DomainPaneProps) {
  const [scope, setScope] = useState<Exclude<ArchiveScope, 'all'>>('active')
  const domains = useCatalogList('domain', scope)
  const questions = useCatalogList('question', 'active')
  const run = useHostCommand()
  const incomplete = useMemo(() => {
    const byId = new Map((questions.data ?? []).map((q) => [q.id, q]))
    const inActive = activeMemberIds(domains.data ?? [])
    return {
      // A member of an active domain is in one, so only its body can lack anything.
      of: (d: Domain) =>
        d.questions.filter((m) => {
          const q = byId.get(m.questionId)
          return q !== undefined && bodyGaps(q).length > 0
        }).length,
      all: (questions.data ?? []).filter((q) => questionGaps(q, inActive.has(q.id)).length > 0).length,
    }
  }, [questions.data, domains.data])
  const archive = useArchive()
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [draft, setDraft] = useState<DomainFormValue>(EMPTY)
  const [saving, setSaving] = useState(false)

  const startNew = () => {
    setDraft(EMPTY)
    setEditing('new')
  }
  const startEdit = (d: Domain) => {
    setDraft({ name: d.name, code: d.code, description: d.description ?? '' })
    setEditing(d.id)
  }
  const save = async () => {
    setSaving(true)
    const existing = editing !== 'new' ? domains.data?.find((d) => d.id === editing) : undefined
    const item: Domain = existing
      ? { ...existing, name: draft.name.trim(), code: draft.code.trim() || existing.code, description: draft.description.trim() || null }
      : {
          id: `dom-${crypto.randomUUID().slice(0, 8)}`,
          origin: 'operator',
          name: draft.name.trim(),
          code: draft.code.trim() || suggestDomainCode(draft.name),
          description: draft.description.trim() || null,
          questions: [],
          createdAt: 0,
          updatedAt: 0,
          archivedAt: null,
        }
    const result = await run('catalog_upsert', { item: { kind: 'domain', item } })
    setSaving(false)
    if (result !== null) {
      setEditing(null)
      onSelect(item.id)
    }
  }

  const form = (
    <Panel variant="secondary" className="flex flex-col gap-3">
      <DomainForm value={draft} onChange={setDraft} autoFocus />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="tertiary" onPress={() => setEditing(null)} isDisabled={saving}>
          {CONFIRM.cancel}
        </Button>
        <Button size="sm" variant="primary" onPress={() => void save()} isPending={saving} isDisabled={!draft.name.trim()}>
          {CONFIRM.save}
        </Button>
      </div>
    </Panel>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text variant="studio-heading">{DOMAIN.heading}</Text>
        <IconButton icon="add" label={DOMAIN.add} size="sm" variant="secondary" onPress={startNew} isDisabled={editing === 'new'} />
      </div>
      <ArchiveToggle value={scope} onChange={setScope} />
      {editing === 'new' ? form : null}
      {domains.isLoading && !domains.data ? (
        <Skeleton shape="row" count={5} />
      ) : (domains.data ?? []).length === 0 ? (
        <EmptyState kind={scope === 'archived' ? 'archivedEmpty' : 'empty'} what={DOMAIN.many} compact />
      ) : (
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label={DOMAIN.many}>
          {scope === 'active' ? (
            <li>
              <DomainRow
                name={DOMAIN.all}
                code=""
                count={null}
                incomplete={incomplete.all}
                isSelected={selectedId === null}
                onSelect={() => onSelect(null)}
              />
            </li>
          ) : null}
          {(domains.data ?? []).map((d) =>
            editing === d.id ? (
              <li key={d.id}>{form}</li>
            ) : (
              <li key={d.id}>
                <DomainRow
                  name={d.name}
                  code={d.code}
                  count={d.questions.length}
                  incomplete={scope === 'active' ? incomplete.of(d) : undefined}
                  isSelected={selectedId === d.id}
                  isArchived={d.archivedAt !== null}
                  onSelect={() => onSelect(d.id)}
                  actions={
                    <ActionMenu
                      items={[
                        { id: 'edit', label: LIST.edit, icon: 'edit', isDisabled: d.archivedAt !== null },
                        d.archivedAt !== null
                          ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                          : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true },
                      ]}
                      onAction={(a) => {
                        if (a === 'edit') startEdit(d)
                        if (a === 'archive') archive.archive({ kind: 'domain', ids: [d.id], what: DOMAIN.one })
                        if (a === 'restore') void archive.restore({ kind: 'domain', ids: [d.id], what: DOMAIN.one })
                      }}
                    />
                  }
                />
              </li>
            ),
          )}
        </ul>
      )}
      {archive.dialog}
    </div>
  )
}

function DomainRow({
  name,
  code,
  count,
  incomplete,
  isSelected,
  isArchived,
  onSelect,
  actions,
}: {
  name: string
  code: string
  count: number | null
  /** Incomplete questions in it (§2.32). Nothing renders for none. */
  incomplete?: number | undefined
  isSelected: boolean
  isArchived?: boolean | undefined
  onSelect: () => void
  actions?: React.ReactNode
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={[
        'group flex h-10 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)/1.5)] px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
        isSelected ? 'bg-[var(--accent)]/12' : 'hover:bg-[var(--surface-secondary)]',
        isArchived ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <Text variant="studio-label" tone={isSelected ? 'accent' : 'default'} truncate>
          {name}
        </Text>
        {code ? (
          <Text variant="studio-mono" tone="muted">
            {code}
          </Text>
        ) : null}
      </div>
      {incomplete ? (
        <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--warning)' }}>
          <Icon name="warn" size="sm" label={DOMAIN.incompleteCount(incomplete)} />
          <Text variant="studio-caption" tabular>
            {incomplete}
          </Text>
        </span>
      ) : null}
      {count !== null ? <MeaningChip meaning="seed">{count}</MeaningChip> : null}
      {actions ? (
        <div className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}
