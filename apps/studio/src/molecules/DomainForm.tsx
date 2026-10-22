import { TextAreaField, TextField } from '@/atoms'
import { CONFIRM, DOMAIN } from '@/copy'
import { isTwin } from '@/host/twins'
import { suggestDomainCode } from '@/host/domain'

export { suggestDomainCode }

export interface DomainFormValue {
  readonly name: string
  readonly code: string
  readonly description: string
}

export interface DomainFormProps {
  value: DomainFormValue
  onChange: (value: DomainFormValue) => void
  errors?: Partial<Record<keyof DomainFormValue, string | null>> | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  /** Embedded inside `DomainPicker`'s create-in-place: no description. */
  compact?: boolean | undefined
  autoFocus?: boolean | undefined
  /** The other domains of this workspace: a name they already use is said (beta.3). */
  others?: readonly { readonly name: string }[] | undefined
}

/** Name · code · description. The same form in the Domains pane and inside `DomainPicker` (spec §2.22). */
export function DomainForm({ value, onChange, errors, isDisabled, disabledReason, compact, autoFocus, others }: DomainFormProps) {
  const set = (patch: Partial<DomainFormValue>) => onChange({ ...value, ...patch })
  return (
    <div className="@container/domain-form flex flex-col gap-4">
      {/* Name over code in a narrow box (the Domains pane, an editor's side); side by side from 24rem (P20). */}
      <div className="grid grid-cols-1 gap-4 @[24rem]/domain-form:grid-cols-[1fr_10rem]">
        <TextField
          label={DOMAIN.name}
          value={value.name}
          onChange={(name) => set({ name })}
          isRequired
          description={others && isTwin(value.name, others) ? CONFIRM.twinDomain(value.name) : undefined}
          error={errors?.name}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
          autoFocus={autoFocus}
        />
        <TextField
          label={DOMAIN.code}
          value={value.code}
          onChange={(code) => set({ code: code.toUpperCase() })}
          font="mono"
          placeholder="TEC_881"
          description={compact ? undefined : DOMAIN.codeHint}
          error={errors?.code}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
      </div>
      {compact ? null : (
        <TextAreaField
          label={DOMAIN.description}
          value={value.description}
          onChange={(description) => set({ description })}
          rows={2}
          error={errors?.description}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
      )}
    </div>
  )
}
