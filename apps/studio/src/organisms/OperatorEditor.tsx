import { useState } from 'react'
import { Panel, Text, TextField } from '@/atoms'
import { DirtyGuard, EditorFooter, InlineNotice, NavCrumbs, PageHeader } from '@/molecules'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { useNavStore } from '@/chrome/nav'
import { LIST, OPERATOR, TABS } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { useCatalogItem } from '@/host/queries'
import type { Operator } from '@/host/types'
import { useDirtyGuard, useDraft } from './useDraft'

export interface OperatorEditorProps {
  id: string | null
}

function emptyOperator(): Operator {
  return {
    id: `op-${crypto.randomUUID().slice(0, 8)}`,
    displayName: '',
    pinHash: null,
    lastActiveAt: null,
    playsRun: 0,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
  }
}

/** Display name only in P7; the pin is set in P10 (spec §2.15). */
export function OperatorEditor({ id }: OperatorEditorProps) {
  const source = useCatalogItem('operator', id)
  const draft = useDraft<Operator>(source.data, emptyOperator())
  const guard = useDirtyGuard(draft.isDirty)
  const run = useHostCommand()
  const go = useNavStore((s) => s.go)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [saving, setSaving] = useState(false)

  const path = `operator.${draft.value.id}`
  const inline = noticesAt(notices, path)
  const canSave = draft.value.displayName.trim().length > 0 && draft.isDirty

  const save = async (): Promise<boolean> => {
    setSaving(true)
    const item: Operator = { ...draft.value, displayName: draft.value.displayName.trim() }
    const result = await run('catalog_upsert', { item: { kind: 'operator', item } }, { targetPath: path })
    setSaving(false)
    if (result === null) return false
    draft.adopt(item)
    toast.success('Operator saved')
    return true
  }
  const saveAndView = async () => {
    if (await save()) void go({ tab: 'operators', id: draft.value.id, mode: 'view' })
  }
  const cancel = () => void go(id ? { tab: 'operators', id, mode: 'view' } : { tab: 'operators' })

  return (
    <>
      <PageHeader
        title={id ? draft.value.displayName || OPERATOR.one : LIST.new(OPERATOR.one)}
        isDirty={draft.isDirty}
        crumbs={
          <NavCrumbs
            crumbs={[
              { label: TABS.operators.label, onPress: () => void go({ tab: 'operators' }) },
              { label: id ? LIST.edit : LIST.new(OPERATOR.one) },
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
          label={OPERATOR.displayName}
          value={draft.value.displayName}
          onChange={(displayName) => draft.set({ displayName })}
          isRequired
          autoFocus={!id}
          error={inline.find((n) => n.targetPath === `${path}.name`)?.detail.message ?? null}
        />
        <Text variant="studio-caption" tone="muted">
          {OPERATOR.pinHint}
        </Text>
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
