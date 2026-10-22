import { useState } from 'react'
import { Button, CheckboxField, Panel, Text } from '@/atoms'
import { CONFIRM, DOMAIN } from '@/copy'
import { DomainForm, suggestDomainCode, type DomainFormValue } from './DomainForm'

export interface PickableDomain {
  readonly id: string
  readonly name: string
  readonly code: string
  readonly questionCount: number
}

export interface DomainPickerProps {
  domains: readonly PickableDomain[]
  selectedIds: readonly string[]
  onChange: (ids: readonly string[]) => void
  /** Create a domain in place (spec §2.22). Resolves to the new id. */
  onCreate?: ((value: DomainFormValue) => Promise<string | null>) | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

/**
 * Pick existing domains (a question may sit in several) or create one in
 * place with the embedded `DomainForm`. The same picker serves the question
 * editor and the Game board (spec §2.22).
 */
export function DomainPicker({ domains, selectedIds, onChange, onCreate, isDisabled, disabledReason }: DomainPickerProps) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<DomainFormValue>({ name: '', code: '', description: '' })
  const [pending, setPending] = useState(false)

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selectedIds, id] : selectedIds.filter((x) => x !== id))

  const create = async () => {
    if (!onCreate) return
    setPending(true)
    const id = await onCreate({ ...draft, code: draft.code || suggestDomainCode(draft.name) })
    setPending(false)
    if (id) {
      onChange([...selectedIds, id])
      setDraft({ name: '', code: '', description: '' })
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-label" tone="default">
          {DOMAIN.pick}
        </Text>
        <Text variant="studio-caption" tone="muted">
          {DOMAIN.pickHint}
        </Text>
      </div>
      {domains.length === 0 && !creating ? (
        <Text variant="studio-body" tone="muted">
          {DOMAIN.many}: 0
        </Text>
      ) : null}
      {/* One column in the editor's side, two where there is room (P20). */}
      <div className="@container/domain-picker">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 @[30rem]/domain-picker:grid-cols-2">
          {domains.map((d) => (
            <CheckboxField
              key={d.id}
              label={d.name}
              isSelected={selectedIds.includes(d.id)}
              onChange={(on) => toggle(d.id, on)}
              isDisabled={isDisabled}
              disabledReason={disabledReason}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Text variant="studio-body" tone="default" truncate>
                  {d.name}
                </Text>
                <Text variant="studio-mono" tone="muted">
                  {d.code}
                </Text>
                <Text variant="studio-caption" tone="muted">
                  {DOMAIN.questionCount(d.questionCount)}
                </Text>
              </span>
            </CheckboxField>
          ))}
        </div>
      </div>
      {onCreate ? (
        creating ? (
          <Panel variant="secondary" className="flex flex-col gap-3">
            <DomainForm others={domains} value={draft} onChange={setDraft} compact autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="tertiary" onPress={() => setCreating(false)} isDisabled={pending}>
                {CONFIRM.cancel}
              </Button>
              <Button size="sm" variant="primary" onPress={() => void create()} isPending={pending} isDisabled={!draft.name.trim()}>
                {DOMAIN.add}
              </Button>
            </div>
          </Panel>
        ) : (
          <div>
            <Button size="sm" variant="ghost" icon="add" onPress={() => setCreating(true)} isDisabled={isDisabled} disabledReason={disabledReason}>
              {DOMAIN.create}
            </Button>
          </div>
        )
      ) : null}
    </div>
  )
}
