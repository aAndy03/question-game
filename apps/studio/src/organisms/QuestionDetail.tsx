import { Button, Icon, MeaningChip, Panel, Skeleton, Text } from '@/atoms'
import { EmptyState, GapNotice, IncompleteMark, MetaList, NavCrumbs, PageHeader } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { DOMAIN, fmt, LIST, QUESTION, TABS } from '@/copy'
import { questionGaps } from '@/host/question'
import { useCatalogItem, useCatalogList } from '@/host/queries'
import { answerMode, difficultyBand, isArchived } from '@/host/types'
import { useArchive } from './useArchive'

export interface QuestionDetailProps {
  id: string
  domainId?: string | undefined
  compact?: boolean | undefined
}

/**
 * Stem, options with the correct marks, difficulty, domains, archive/restore —
 * and, while the question is incomplete (§2.32), what it still lacks.
 */
export function QuestionDetail({ id, domainId, compact }: QuestionDetailProps) {
  const question = useCatalogItem('question', id)
  const domains = useCatalogList('domain', 'active')
  const go = useNavStore((s) => s.go)
  const archive = useArchive()

  if (question.isLoading) return <Skeleton shape="card" count={2} />
  if (!question.data) return <EmptyState kind="error" what={QUESTION.many} detail={question.error?.message} compact />
  const q = question.data
  const archived = isArchived(q)
  const mode = answerMode(q)
  const band = q.difficulty === null ? null : difficultyBand(q.difficulty)
  const inDomains = (domains.data ?? []).filter((d) => d.questions.some((m) => m.questionId === q.id))
  const gaps = questionGaps(q, inDomains.length > 0)
  const title = q.stem || QUESTION.noStem
  const back = { tab: 'library' as const, ...(domainId ? { domainId } : {}) }
  const edit = () => void go({ tab: 'library', questionId: q.id, mode: 'edit', ...(domainId ? { domainId } : {}) })

  const status = (
    <span className="flex items-center gap-1.5">
      <IncompleteMark gaps={gaps} />
      <MeaningChip meaning={mode}>{mode === 'single' ? QUESTION.single : QUESTION.multiple}</MeaningChip>
      {band ? (
        <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${q.difficulty}`}</MeaningChip>
      ) : (
        <MeaningChip meaning="unset">{`${QUESTION.difficulty} · ${QUESTION.difficultyUnset}`}</MeaningChip>
      )}
      {archived ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
    </span>
  )
  const actions = archived ? (
    <Button variant="secondary" icon="restore" onPress={() => void archive.restore({ kind: 'question', ids: [q.id], what: QUESTION.one })}>
      {LIST.restore}
    </Button>
  ) : (
    <Button variant="ghost" icon="archive" onPress={() => archive.archive({ kind: 'question', ids: [q.id], what: QUESTION.one })}>
      {LIST.archive}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      {compact ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Text variant="studio-heading">{title}</Text>
            {status}
          </div>
          <Button size="sm" variant="secondary" icon="edit" onPress={edit} isDisabled={archived}>
            {LIST.edit}
          </Button>
        </div>
      ) : (
        <PageHeader
          title={title}
          status={status}
          crumbs={<NavCrumbs crumbs={[{ label: TABS.library.label, onPress: () => void go(back) }, { label: QUESTION.one }]} />}
          primaryAction={
            <Button variant="primary" icon="edit" onPress={edit} isDisabled={archived} disabledReason={archived ? LIST.archived : null}>
              {LIST.edit}
            </Button>
          }
          secondaryActions={actions}
        />
      )}
      <GapNotice gaps={gaps} />
      <Panel className="flex flex-col gap-2">
        <Text variant="studio-label">{QUESTION.options}</Text>
        <ol className="flex flex-col gap-1.5">
          {q.options.map((o, i) => (
            <li key={o.id} className="flex items-center gap-3 rounded-[calc(var(--radius)/2)] px-2 py-1.5" style={{ background: o.correct ? 'color-mix(in oklch, var(--success) 12%, transparent)' : 'var(--surface-secondary)' }}>
              <Text variant="studio-mono" tone={o.correct ? 'success' : 'muted'} className="w-4">
                {String.fromCharCode(65 + i)}
              </Text>
              <Text variant="studio-body" className="flex-1">
                {o.text}
              </Text>
              {o.correct ? <Icon name="correct" size="sm" style={{ color: 'var(--success)' }} label={QUESTION.correct} /> : null}
            </li>
          ))}
        </ol>
      </Panel>
      <Panel>
        <MetaList
          columns={compact ? 1 : 2}
          items={[
            {
              label: QUESTION.inDomains,
              value: inDomains.length > 0 ? inDomains.map((d) => d.name).join(', ') : QUESTION.noDomains,
            },
            { label: QUESTION.explanation, value: q.explanation ?? '—' },
            { label: LIST.updated, value: fmt.date(q.updatedAt) },
            { label: LIST.created, value: fmt.date(q.createdAt) },
            { label: 'id', value: q.id, mono: true },
            { label: DOMAIN.many, value: String(inDomains.length) },
          ]}
        />
      </Panel>
      {compact ? <div className="flex justify-end">{actions}</div> : null}
      {archive.dialog}
    </div>
  )
}
