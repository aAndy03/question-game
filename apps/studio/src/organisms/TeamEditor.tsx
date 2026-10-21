import { useState } from 'react'
import { Panel, Swatch, Text, TextAreaField, TextField } from '@/atoms'
import { DirtyGuard, EditorFooter, InlineNotice, NavCrumbs, PageHeader } from '@/molecules'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { useNavStore } from '@/chrome/nav'
import { CONFIRM, LIST, TABS, TEAM } from '@/copy'
import { toast } from '@/chrome/toast'
import { useCatalogItem, useCatalogList } from '@/host/queries'
import { isTwin } from '@/host/twins'
import type { Team } from '@/host/types'
import { useDirtyGuard, useDraft } from './useDraft'
import { usePropagatingSave } from './usePropagatingSave'

export interface TeamEditorProps {
  /** Null for a new team. */
  id: string | null
}

export const TEAM_PALETTE = ['#111827', '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']

function emptyTeam(): Team {
  return {
    id: `team-${crypto.randomUUID().slice(0, 8)}`,
    origin: 'operator',
    name: '',
    shortCode: '',
    color: TEAM_PALETTE[0] ?? '#111827',
    logoAssetId: null,
    notes: null,
    playCount: 0,
    lastPlayAt: null,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
  }
}

/** Name · short code · colour · notes. Writes `catalog_upsert`; refusals land inline. */
export function TeamEditor({ id }: TeamEditorProps) {
  const source = useCatalogItem('team', id)
  const teams = useCatalogList('team', 'active')
  const draft = useDraft<Team>(source.data, emptyTeam())
  const guard = useDirtyGuard(draft)
  const propagating = usePropagatingSave()
  const go = useNavStore((s) => s.go)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [saving, setSaving] = useState(false)

  const path = `team.${draft.value.id}`
  const inline = noticesAt(notices, path)
  const fieldError = (field: string) => inline.find((n) => n.targetPath === `${path}.${field}`)?.detail.message ?? null
  const canSave = draft.value.name.trim().length > 0 && draft.isDirty
  // A theme token (the Demo's teams), not something typed: a typed value,
  // with or without its #, stays in the field (review: every keystroke vanished).
  const themeColour = draft.value.color.trim().startsWith('var(')

  const save = async (): Promise<boolean> => {
    setSaving(true)
    const item: Team = {
      ...draft.value,
      name: draft.value.name.trim(),
      shortCode: draft.value.shortCode.trim() || draft.value.name.trim().slice(0, 5).toUpperCase(),
      notes: draft.value.notes?.trim() ? draft.value.notes : null,
    }
    const result = await propagating.upsert({ kind: 'team', item }, { targetPath: path })
    setSaving(false)
    if (result === null) return false
    draft.adopt(item)
    toast.success('Team saved')
    return true
  }

  const saveAndView = async () => {
    if (await save()) void go({ tab: 'teams', id: draft.value.id, mode: 'view' })
  }
  const cancel = () => void go(id ? { tab: 'teams', id, mode: 'view' } : { tab: 'teams' })

  return (
    <>
      {propagating.dialog}
      <PageHeader
        title={id ? draft.value.name || TEAM.one : LIST.new(TEAM.one)}
        isDirty={draft.isDirty}
        crumbs={
          <NavCrumbs
            crumbs={[
              { label: TABS.teams.label, onPress: () => void go({ tab: 'teams' }) },
              ...(id ? [{ label: source.data?.name ?? '…', onPress: () => void go({ tab: 'teams', id, mode: 'view' }) }] : []),
              { label: id ? LIST.edit : LIST.new(TEAM.one) },
            ]}
          />
        }
      />
      {inline
        .filter((n) => !n.targetPath?.startsWith(`${path}.`))
        .map((n) => (
          <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} />
        ))}
      <Panel className="flex flex-col gap-5">
        <TextField
          label={TEAM.name}
          value={draft.value.name}
          onChange={(name) => draft.set({ name })}
          isRequired
          autoFocus={!id}
          description={isTwin(draft.value.name, (teams.data ?? []).filter((t) => t.id !== draft.value.id)) ? CONFIRM.twinTeam(draft.value.name) : undefined}
          error={fieldError('name')}
        />
        <div className="grid grid-cols-[12rem_1fr] gap-5">
          <TextField
            label={TEAM.shortCode}
            value={draft.value.shortCode}
            onChange={(shortCode) => draft.set({ shortCode: shortCode.toUpperCase().slice(0, 8) })}
            font="mono"
            description={TEAM.shortCodeHint}
            error={fieldError('short_code')}
            placeholder="ALPHA"
          />
          <div className="flex flex-col gap-2">
            <Text variant="studio-label">{TEAM.color}</Text>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={TEAM.color}>
              {/* A theme colour (the Demo's teams) is a swatch, never raw text in the field (beta.3). */}
              {themeColour ? (
                <button type="button" role="radio" aria-checked aria-label={TEAM.themeColour} className="rounded-full p-0.5 ring-2 ring-[var(--accent)]">
                  <Swatch color={draft.value.color} size="lg" className="rounded-full" />
                </button>
              ) : null}
              {TEAM_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={draft.value.color === color}
                  aria-label={color}
                  onClick={() => draft.set({ color })}
                  className={[
                    'rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                    draft.value.color === color ? 'ring-2 ring-[var(--accent)]' : '',
                  ].join(' ')}
                >
                  <Swatch color={color} size="lg" className="rounded-full" />
                </button>
              ))}
              <TextField
                label={TEAM.colorCode}
                hideLabel
                value={themeColour ? '' : draft.value.color}
                onChange={(color) => draft.set({ color })}
                placeholder={TEAM.colorPlaceholder}
                font="mono"
                className="w-36"
              />
            </div>
            <Text variant="studio-caption" tone="muted">
              {TEAM.colorHint}
            </Text>
          </div>
        </div>
        <TextAreaField label={TEAM.notes} value={draft.value.notes ?? ''} onChange={(notes) => draft.set({ notes })} rows={3} />
      </Panel>
      <EditorFooter canSave={canSave} isSaving={saving} onSave={() => void saveAndView()} onCancel={cancel} />
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
